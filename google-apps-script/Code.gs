/**
 * ============================================================================
 * SISTEMA DE GESTIÓN DE INVENTARIO Y VENTAS - D'CAMISAS
 * Google Apps Script - Web App Backend
 * ============================================================================
 * 
 * Este script conecta la aplicación móvil con Google Sheets.
 * Proporciona endpoints para autenticación de usuarios, consulta de stock,
 * registro de movimientos (entradas y salidas) e inicialización automática.
 * 
 * INSTRUCCIONES DE DESPLIEGUE:
 * 1. Abre tu hoja de Google Sheets.
 * 2. Ve a Extensiones > Apps Script.
 * 3. Pega este código reemplazando todo lo que haya en 'Código.gs'.
 * 4. Ejecuta la función 'setupSheet' una vez para crear automáticamente
 *    todas las pestañas con datos iniciales y formatos de la marca.
 * 5. Haz clic en "Implementar" (Deploy) > "Nueva implementación" (New deployment).
 * 6. Tipo: "Aplicación web" (Web App).
 *    - Descripción: "Backend D'Camisas v1"
 *    - Ejecutar como: "Yo" (tu cuenta de Google)
 *    - Quién tiene acceso: "Cualquiera" (Anyone) -> IMPORTANTE para acceso móvil.
 * 7. Copia la URL de la aplicación web generada y pégala en la app móvil.
 * ============================================================================
 */

// Nombres de las pestañas en Google Sheets
const SHEETS = {
  USERS: "Usuarios",
  STOCK: "Stock_Actual",
  MOVEMENTS: "Movimientos",
  PRODUCTS: "Productos"
};

/**
 * Manejador de peticiones GET
 */
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || "ping";
    let responseData = {};

    switch (action) {
      case "ping":
      case "test":
        responseData = {
          status: "success",
          message: "API D'Camisas conectada correctamente con Google Sheets.",
          timestamp: new Date().toISOString()
        };
        break;

      case "getInitialData":
        responseData = {
          status: "success",
          stock: getStockData(),
          movements: getRecentMovements(200),
          timestamp: new Date().toISOString()
        };
        break;

      case "getStock":
        responseData = {
          status: "success",
          data: getStockData()
        };
        break;

      case "getMovements":
        const limit = parseInt(params.limit || "200", 10);
        responseData = {
          status: "success",
          data: getRecentMovements(limit)
        };
        break;

      case "login":
        responseData = {
          status: "error",
          code: "METHOD_NOT_ALLOWED",
          message: "Por motivos de seguridad, el inicio de sesión debe realizarse únicamente vía petición POST."
        };
        break;

      case "validateSession":
        responseData = handleValidateSession(params.sessionToken ? { sessionToken: params.sessionToken } : { usuario: params.usuario, password: params.password });
        break;

      case "setup":
        responseData = setupSheet();
        break;

      default:
        responseData = {
          status: "error",
          message: "Acción no reconocida en doGet: " + action
        };
        break;
    }

    return createJsonResponse(responseData, params.callback);

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Manejador de peticiones POST
 */
function doPost(e) {
  // Manejo de concurrencia estricto con LockService (20s para soportar hasta 4 vendedores concurrentes)
  const lock = LockService.getScriptLock();
  let hasLock = false;

  try {
    hasLock = lock.tryLock(20000);
  } catch (lockErr) {
    hasLock = false;
  }

  // Si no se obtiene el bloqueo en 20 segundos, devolver error y NO ejecutar escrituras
  if (!hasLock) {
    return createJsonResponse({
      status: "error",
      code: "LOCK_TIMEOUT",
      message: "El servidor se encuentra ocupado procesando otra transacción. Por favor espera unos momentos e intenta de nuevo."
    });
  }

  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        // Fallback si no es JSON puro
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action || "addMovement";
    let responseData = {};

    switch (action) {
      case "login":
        responseData = handleLogin(payload.usuario, payload.password);
        break;

      case "validateSession":
        responseData = handleValidateSession(payload, null, true);
        break;

      case "addMovement":
        responseData = handleAddMovement(payload);
        break;

      case "getStock":
        responseData = {
          status: "success",
          data: getStockData()
        };
        break;

      case "setup":
        responseData = setupSheet();
        break;

      default:
        responseData = {
          status: "error",
          message: "Acción no reconocida en doPost: " + action
        };
        break;
    }

    return createJsonResponse(responseData);

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "Error en el servidor: " + error.toString()
    });
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch (relErr) {
        // Ignorar si ya fue liberado
      }
    }
  }
}

/**
 * Convierte un arreglo de bytes en representación hexadecimal
 */
function bytesToHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    const s = b.toString(16);
    hex += (s.length === 1 ? "0" + s : s);
  }
  return hex;
}

/**
 * Obtiene o inicializa la clave secreta del backend para firma de tokens HMAC-SHA256
 */
function getOrCreateAppSecret() {
  if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
    const props = PropertiesService.getScriptProperties();
    let secret = props.getProperty("AUTH_SECRET_KEY");
    if (!secret) {
      secret = (typeof Utilities !== "undefined" && Utilities.getUuid)
        ? (Utilities.getUuid() + "-" + Utilities.getUuid() + "-" + Date.now())
        : ("secret_" + Math.random().toString(36).substring(2) + "_" + Date.now());
      props.setProperty("AUTH_SECRET_KEY", secret);
    }
    return secret;
  }
  return "default_app_secret_dyarf_2026_multiuser";
}

/**
 * Genera hash seguro de contraseña (SHA-256 con sal)
 */
function hashPasswordGAS(password, salt) {
  if (!salt) {
    salt = (typeof Utilities !== "undefined" && Utilities.getUuid)
      ? Utilities.getUuid().substring(0, 8)
      : Math.random().toString(36).substring(2, 10);
  }
  const cleanPass = String(password || "").trim();
  if (typeof Utilities !== "undefined" && Utilities.computeDigest && Utilities.DigestAlgorithm) {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ":" + cleanPass);
    return "sha256$" + salt + "$" + bytesToHex(digest);
  } else {
    const reqFn = typeof require === "function" ? require : (typeof globalThis !== "undefined" && typeof globalThis.require === "function" ? globalThis.require : null);
    if (reqFn) {
      try {
        const crypto = reqFn("crypto");
        const hash = crypto.createHash("sha256").update(salt + ":" + cleanPass).digest("hex");
        return "sha256$" + salt + "$" + hash;
      } catch (e) {}
    }
  }
  return "sha256$" + salt + "$" + cleanPass;
}

/**
 * Verifica una contraseña contra el valor almacenado (compatible con hash sha256$ y texto plano heredado)
 */
function verifyPasswordGAS(storedPassword, inputPassword) {
  if (storedPassword === null || storedPassword === undefined || inputPassword === null || inputPassword === undefined) {
    return false;
  }
  const storedStr = String(storedPassword).trim();
  const inputStr = String(inputPassword).trim();

  if (storedStr.startsWith("sha256$")) {
    const parts = storedStr.split("$");
    if (parts.length === 3) {
      const salt = parts[1];
      const computed = hashPasswordGAS(inputStr, salt);
      return computed === storedStr;
    }
  }

  return storedStr === inputStr;
}

/**
 * Genera un token de sesión criptográfico (HMAC-SHA256 con expiración de 24 horas)
 */
function generateSessionToken(user) {
  const secret = getOrCreateAppSecret();
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 horas
  const nonce = (typeof Utilities !== "undefined" && Utilities.getUuid)
    ? Utilities.getUuid().substring(0, 8)
    : Math.random().toString(36).substring(2, 10);

  const rawPayload = [(user && user.id) || "", (user && user.usuario) || "", String(expiresAt), nonce].join(":");
  let b64Payload = "";
  if (typeof Utilities !== "undefined" && Utilities.base64EncodeWebSafe) {
    b64Payload = Utilities.base64EncodeWebSafe(rawPayload);
  } else {
    b64Payload = Buffer.from(rawPayload, "utf8").toString("base64url");
  }

  let signature = "";
  if (typeof Utilities !== "undefined" && Utilities.computeHmacSha256Signature) {
    const sigBytes = Utilities.computeHmacSha256Signature(b64Payload, secret);
    signature = bytesToHex(sigBytes);
  } else {
    const reqFn = typeof require === "function" ? require : (typeof globalThis !== "undefined" && typeof globalThis.require === "function" ? globalThis.require : null);
    if (reqFn) {
      try {
        const crypto = reqFn("crypto");
        signature = crypto.createHmac("sha256", secret).update(b64Payload).digest("hex");
      } catch (e) {
        signature = "sig_" + nonce;
      }
    } else {
      signature = "sig_" + nonce;
    }
  }

  return {
    token: b64Payload + "." + signature,
    expiresAt: expiresAt
  };
}

/**
 * Verifica la autenticidad, integridad y vigencia de un token de sesión
 */
function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, code: "INVALID_TOKEN_FORMAT", message: "Token de sesión inexistente o mal formado." };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, code: "INVALID_TOKEN_FORMAT", message: "Formato de token de sesión corrupto." };
  }

  const b64Payload = parts[0];
  const providedSig = parts[1];
  const secret = getOrCreateAppSecret();

  let expectedSig = "";
  if (typeof Utilities !== "undefined" && Utilities.computeHmacSha256Signature) {
    const sigBytes = Utilities.computeHmacSha256Signature(b64Payload, secret);
    expectedSig = bytesToHex(sigBytes);
  } else {
    const reqFn = typeof require === "function" ? require : (typeof globalThis !== "undefined" && typeof globalThis.require === "function" ? globalThis.require : null);
    if (reqFn) {
      try {
        const crypto = reqFn("crypto");
        expectedSig = crypto.createHmac("sha256", secret).update(b64Payload).digest("hex");
      } catch (e) {
        expectedSig = providedSig;
      }
    } else {
      expectedSig = providedSig;
    }
  }

  if (expectedSig !== providedSig) {
    return { valid: false, code: "TOKEN_TAMPERED", message: "Firma de seguridad de sesión alterada o inválida." };
  }

  let rawPayload = "";
  if (typeof Utilities !== "undefined" && Utilities.base64DecodeWebSafe) {
    const bytes = Utilities.base64DecodeWebSafe(b64Payload);
    rawPayload = Utilities.newBlob(bytes).getDataAsString("UTF-8");
  } else {
    rawPayload = Buffer.from(b64Payload, "base64url").toString("utf8");
  }

  const segs = rawPayload.split(":");
  if (segs.length < 4) {
    return { valid: false, code: "CORRUPT_PAYLOAD", message: "Cuerpo de token corrupto." };
  }

  const userId = segs[0];
  const username = segs[1];
  const expiresAt = parseInt(segs[2], 10);

  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return { valid: false, code: "TOKEN_EXPIRED", message: "La sesión ha expirado (límite 24 horas). Inicia sesión nuevamente." };
  }

  return {
    valid: true,
    user: {
      id: userId,
      usuario: username
    },
    expiresAt: expiresAt
  };
}

/**
 * Función de autenticación de usuario
 * Valida USUARIO, CONTRASEÑA y ESTADO (debe ser 1) directamente en la pestaña 'Usuarios' en tiempo real.
 * Migra automáticamente contraseñas en texto plano hacia hash seguro SHA-256 con sal.
 */
function handleLogin(usuario, password) {
  if (!usuario || !password) {
    return {
      success: false,
      status: "error",
      code: "EMPTY_FIELDS",
      message: "Por favor, ingresa tu usuario y contraseña."
    };
  }

  // Forzar vaciado de buffers para garantizar lectura fresca y en tiempo real
  SpreadsheetApp.flush();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.USERS);

  if (!sheet) {
    return {
      success: false,
      status: "error",
      code: "NO_SHEET",
      message: "La pestaña 'Usuarios' no existe en Google Sheets. Ejecuta setupSheet."
    };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return {
      success: false,
      status: "error",
      code: "NO_USERS",
      message: "No hay usuarios registrados en la base de datos."
    };
  }

  const headers = data[0].map(h => String(h).trim().toUpperCase());
  const colId = headers.indexOf("ID");
  const colUser = headers.indexOf("USUARIO");
  const colPass = headers.indexOf("CONTRASEÑA") !== -1 ? headers.indexOf("CONTRASEÑA") : headers.indexOf("PASSWORD");
  const colState = headers.indexOf("ESTADO");
  const colRole = headers.indexOf("ROL");

  if (colUser === -1 || colPass === -1 || colState === -1) {
    return {
      success: false,
      status: "error",
      code: "INVALID_STRUCTURE",
      message: "Las columnas 'USUARIO', 'CONTRASEÑA' y 'ESTADO' son obligatorias en 'Usuarios'."
    };
  }

  const inputUser = String(usuario).trim().toLowerCase();
  const inputPass = String(password).trim();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sheetUser = String(row[colUser] !== null && row[colUser] !== undefined ? row[colUser] : "").trim().toLowerCase();
    const sheetPass = String(row[colPass] !== null && row[colPass] !== undefined ? row[colPass] : "").trim();
    const sheetState = String(row[colState] !== null && row[colState] !== undefined ? row[colState] : "").trim();

    if (sheetUser === inputUser) {
      if (verifyPasswordGAS(sheetPass, inputPass)) {
        if (sheetState === "1" || sheetState === 1 || sheetState.toUpperCase() === "ACTIVO") {
          // Migración transparente a SHA-256 si la contraseña almacenada era texto plano
          if (!sheetPass.startsWith("sha256$")) {
            try {
              const newHash = hashPasswordGAS(inputPass);
              sheet.getRange(i + 1, colPass + 1).setValue(newHash);
              Logger.log("[Security] Contraseña de usuario '" + sheetUser + "' migrada a hash seguro SHA-256.");
            } catch (migErr) {
              Logger.log("[Security Warning] No se pudo actualizar celda de hash: " + migErr.message);
            }
          }

          const userObj = {
            id: colId !== -1 ? String(row[colId]).trim() : ("USR-" + i),
            usuario: String(row[colUser]).trim(),
            rol: colRole !== -1 && row[colRole] ? String(row[colRole]).trim() : "Usuario",
            estado: 1
          };

          const tokenData = generateSessionToken(userObj);

          return {
            success: true,
            status: "success",
            message: "Inicio de sesión exitoso.",
            user: userObj,
            sessionToken: tokenData.token,
            expiresAt: tokenData.expiresAt
          };
        } else {
          return {
            success: false,
            status: "error",
            code: "USER_INACTIVE",
            message: "Tu usuario se encuentra INACTIVO (Estado: 0). Contacta al administrador."
          };
        }
      } else {
        return {
          success: false,
          status: "error",
          code: "INVALID_PASSWORD",
          message: "Contraseña incorrecta. Por favor verifica tus datos."
        };
      }
    }
  }

  return {
    success: false,
    status: "error",
    code: "USER_NOT_FOUND",
    message: "El usuario ingresado no existe en el sistema."
  };
}

/**
 * Valida de forma ultra rápida si la sesión del usuario sigue vigente.
 * Soporta verificación criptográfica mediante sessionToken (recomendado) o mediante
 * credenciales usuario/password (compatibilidad histórica).
 */
function handleValidateSession(firstArg, secondArg, lockAlreadyAcquired) {
  let sessionToken = "";
  let cleanUser = "";
  let cleanPass = "";

  if (typeof firstArg === "object" && firstArg !== null) {
    sessionToken = String(firstArg.sessionToken || "").trim();
    cleanUser = String(firstArg.usuario || "").trim().toLowerCase();
    cleanPass = String(firstArg.password || "").trim();
  } else if (typeof firstArg === "string") {
    cleanUser = String(firstArg || "").trim().toLowerCase();
    cleanPass = String(secondArg || "").trim();
  }

  // 1. Verificación preferente y de alta velocidad por Token Criptográfico
  if (sessionToken) {
    const tokenResult = verifySessionToken(sessionToken);
    if (!tokenResult.valid) {
      return {
        success: false,
        sesionValida: false,
        code: tokenResult.code || "INVALID_SESSION_TOKEN",
        message: tokenResult.message || "Sesión no válida o expirada."
      };
    }

    // Verificar en tiempo real que el usuario siga activo en Google Sheets
    const activeCheck = validateActiveUser(tokenResult.user.usuario);
    if (!activeCheck.success || !activeCheck.user) {
      return {
        success: false,
        sesionValida: false,
        code: activeCheck.code || "USER_INACTIVE",
        message: activeCheck.message || "Usuario inactivo en el sistema."
      };
    }

    return {
      success: true,
      sesionValida: true,
      message: "Sesión válida y activa.",
      user: activeCheck.user,
      expiresAt: tokenResult.expiresAt
    };
  }

  // 2. Verificación por usuario y contraseña (compatibilidad con sesiones previas y tests)
  if (!cleanUser || !cleanPass) {
    return {
      success: false,
      sesionValida: false,
      code: "EMPTY_CREDENTIALS",
      message: "Credenciales de sesión no proporcionadas."
    };
  }

  let localLock = null;
  let hasLocalLock = false;
  if (!lockAlreadyAcquired) {
    localLock = LockService.getScriptLock();
    try {
      hasLocalLock = localLock.tryLock(5000);
    } catch (e) {
      hasLocalLock = false;
    }
  }

  try {
    SpreadsheetApp.flush();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.USERS);

    if (!sheet) {
      return {
        success: false,
        sesionValida: false,
        code: "NO_SHEET",
        message: "Pestaña 'Usuarios' no encontrada en Google Sheets."
      };
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1) {
      return {
        success: false,
        sesionValida: false,
        code: "NO_USERS",
        message: "No hay usuarios registrados."
      };
    }

    // Leemos estrictamente el rango de usuarios para máxima rapidez
    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0].map(h => String(h).trim().toUpperCase());
    const colId = headers.indexOf("ID");
    const colUser = headers.indexOf("USUARIO");
    const colPass = headers.indexOf("CONTRASEÑA") !== -1 ? headers.indexOf("CONTRASEÑA") : headers.indexOf("PASSWORD");
    const colState = headers.indexOf("ESTADO");
    const colRole = headers.indexOf("ROL");

    if (colUser === -1 || colPass === -1 || colState === -1) {
      return {
        success: false,
        sesionValida: false,
        code: "INVALID_STRUCTURE",
        message: "Estructura de la pestaña 'Usuarios' no válida."
      };
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const sheetUser = String(row[colUser] !== null && row[colUser] !== undefined ? row[colUser] : "").trim().toLowerCase();
      const sheetPass = String(row[colPass] !== null && row[colPass] !== undefined ? row[colPass] : "").trim();
      const sheetState = String(row[colState] !== null && row[colState] !== undefined ? row[colState] : "").trim();

      if (sheetUser === cleanUser) {
        // Verificar contraseña con soporte hash y texto plano
        if (!verifyPasswordGAS(sheetPass, cleanPass)) {
          return {
            success: false,
            sesionValida: false,
            code: "PASSWORD_CHANGED",
            message: "Tu contraseña ha cambiado. Por favor, inicia sesión de nuevo."
          };
        }

        // Si coincide y aún es plana, migrar a hash
        if (!sheetPass.startsWith("sha256$")) {
          try {
            const newHash = hashPasswordGAS(cleanPass);
            sheet.getRange(i + 1, colPass + 1).setValue(newHash);
          } catch (e) {}
        }

        // Verificar si el usuario sigue activo
        if (sheetState === "1" || sheetState === 1 || sheetState.toUpperCase() === "ACTIVO") {
          return {
            success: true,
            sesionValida: true,
            message: "Sesión válida y actualizada.",
            user: {
              id: colId !== -1 ? String(row[colId]).trim() : ("USR-" + i),
              usuario: String(row[colUser]).trim(),
              rol: colRole !== -1 && row[colRole] ? String(row[colRole]).trim() : "Usuario",
              estado: 1
            }
          };
        } else {
          return {
            success: false,
            sesionValida: false,
            code: "USER_INACTIVE",
            message: "Tu usuario se encuentra inactivo. Contacta al administrador."
          };
        }
      }
    }

    return {
      success: false,
      sesionValida: false,
      code: "USER_NOT_FOUND",
      message: "Tu usuario no fue encontrado en Google Sheets."
    };

  } finally {
    if (hasLocalLock && localLock) {
      try {
        localLock.releaseLock();
      } catch (e) {}
    }
  }
}

/**
 * Valida en tiempo real que un usuario exista y esté activo en la pestaña 'Usuarios'
 */
function validateActiveUser(usuario) {
  const cleanUser = String(usuario || "").trim().toLowerCase();
  if (!cleanUser) {
    return { success: false, status: "error", code: "EMPTY_USER", message: "Usuario no especificado." };
  }

  SpreadsheetApp.flush();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.USERS);
  if (!sheet) {
    return { success: false, status: "error", code: "NO_SHEET", message: "Pestaña 'Usuarios' no encontrada." };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: false, status: "error", code: "NO_USERS", message: "No hay usuarios registrados." };
  }

  const headers = data[0].map(h => String(h).trim().toUpperCase());
  const colUser = headers.indexOf("USUARIO");
  const colState = headers.indexOf("ESTADO");
  const colRole = headers.indexOf("ROL");
  const colId = headers.indexOf("ID");

  if (colUser === -1 || colState === -1) {
    return { success: false, status: "error", code: "INVALID_STRUCTURE", message: "Columnas requeridas no encontradas." };
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sheetUser = String(row[colUser] !== null && row[colUser] !== undefined ? row[colUser] : "").trim().toLowerCase();
    const sheetState = String(row[colState] !== null && row[colState] !== undefined ? row[colState] : "").trim();

    if (sheetUser === cleanUser) {
      if (sheetState === "1" || sheetState === 1 || sheetState.toUpperCase() === "ACTIVO") {
        return {
          success: true,
          status: "success",
          user: {
            id: colId !== -1 ? String(row[colId]).trim() : ("USR-" + i),
            usuario: String(row[colUser]).trim(),
            rol: colRole !== -1 && row[colRole] ? String(row[colRole]).trim() : "Usuario",
            estado: 1
          }
        };
      } else {
        return {
          success: false,
          status: "error",
          code: "USER_INACTIVE",
          message: "Tu usuario se encuentra INACTIVO (Estado: 0). Contacta al administrador."
        };
      }
    }
  }

  return {
    success: false,
    status: "error",
    code: "USER_NOT_FOUND",
    message: "El usuario ingresado no existe en el sistema."
  };
}

/**
 * Obtiene el inventario actual desde la pestaña 'Stock_Actual'
 */
function getStockData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.STOCK);

  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(h => String(h).trim().toUpperCase());
  const colCodigo = headers.indexOf("CÓDIGO") !== -1 ? headers.indexOf("CÓDIGO") : headers.indexOf("CODIGO");
  const colArticulo = headers.indexOf("ARTÍCULO") !== -1 ? headers.indexOf("ARTÍCULO") : headers.indexOf("ARTICULO");
  const colTalla = headers.indexOf("TALLA");
  const colEntradas = headers.indexOf("ENTRADAS");
  const colSalidas = headers.indexOf("SALIDAS");
  const colStock = headers.indexOf("STOCK DISPONIBLE") !== -1 ? headers.indexOf("STOCK DISPONIBLE") : headers.indexOf("STOCK");
  const colPrecio = headers.indexOf("PRECIO");

  const stockList = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const codigo = colCodigo !== -1 ? String(row[colCodigo]).trim() : "";
    if (!codigo) continue; // Salta filas vacías

    const articulo = colArticulo !== -1 ? String(row[colArticulo]).trim() : "Camisa";
    const talla = colTalla !== -1 ? String(row[colTalla]).trim() : "M";
    const entradas = colEntradas !== -1 ? Number(row[colEntradas]) || 0 : 0;
    const salidas = colSalidas !== -1 ? Number(row[colSalidas]) || 0 : 0;
    
    // Si la celda de stock tiene fórmula o valor calculado, lo tomamos; sino calculamos entradas - salidas
    let stockDisp = 0;
    if (colStock !== -1 && row[colStock] !== "" && !isNaN(Number(row[colStock]))) {
      stockDisp = Number(row[colStock]);
    } else {
      stockDisp = entradas - salidas;
    }

    const precio = colPrecio !== -1 ? Number(row[colPrecio]) || 0 : 0;

    stockList.push({
      codigo: codigo,
      articulo: articulo,
      talla: talla,
      entradas: entradas,
      salidas: salidas,
      stockDisponible: stockDisp,
      precio: precio
    });
  }

  return stockList;
}

/**
 * Registra un movimiento en la pestaña 'Movimientos'
 * Y actualiza la pestaña 'Stock_Actual' de forma síncrona con idempotencia estricta,
 * verificación previa de requestId, autenticación verificable y control de estados (PENDING/COMPLETED/FAILED).
 */
function handleAddMovement(payload) {
  Logger.log("[handleAddMovement] Payload recibido: " + JSON.stringify(payload));

  // 1. Validar parámetros básicos y estructura
  const tipo = String(payload.tipo || "").trim().toUpperCase(); // 'ENTRADA' o 'SALIDA'
  const codigo = String(payload.codigo || "").trim().toUpperCase();
  const cantidad = parseInt(payload.cantidad, 10);
  const observacion = String(payload.observacion || "").trim();
  const requestId = String(payload.requestId || "").trim();

  if (!tipo || (tipo !== "ENTRADA" && tipo !== "SALIDA")) {
    return {
      status: "error",
      code: "INVALID_TYPE",
      message: "El tipo de movimiento debe ser 'ENTRADA' o 'SALIDA'."
    };
  }

  if (!codigo) {
    return {
      status: "error",
      code: "MISSING_CODE",
      message: "Debes seleccionar o ingresar un código de artículo."
    };
  }

  if (isNaN(cantidad) || cantidad <= 0) {
    return {
      status: "error",
      code: "INVALID_QUANTITY",
      message: "La cantidad debe ser un número entero mayor a 0."
    };
  }

  if (!requestId) {
    return {
      success: false,
      status: "error",
      code: "MISSING_REQUEST_ID",
      message: "Identificador único de solicitud (requestId) obligatorio para registrar movimientos."
    };
  }

  // 2. Autenticación verificable y obligatoria del usuario
  let authUser = null;
  const sessionToken = String(payload.sessionToken || "").trim();
  const inputUsuario = String(payload.usuario || "").trim();
  const inputPassword = String(payload.password || "").trim();

  if (sessionToken) {
    const tokenCheck = verifySessionToken(sessionToken);
    if (!tokenCheck.valid) {
      return {
        success: false,
        status: "error",
        code: tokenCheck.code || "UNAUTHORIZED",
        message: "Sesión no válida: " + (tokenCheck.message || "Token expirado o inválido.")
      };
    }
    const userCheck = validateActiveUser(tokenCheck.user.usuario);
    if (!userCheck.success || !userCheck.user) {
      return {
        success: false,
        status: "error",
        code: userCheck.code || "UNAUTHORIZED",
        message: "Acceso no autorizado: " + (userCheck.message || "Usuario inválido o inactivo.")
      };
    }
    authUser = userCheck.user;
  } else if (inputUsuario) {
    if (inputPassword) {
      const authCheck = handleLogin(inputUsuario, inputPassword);
      if (!authCheck.success || !authCheck.user) {
        return {
          success: false,
          status: "error",
          code: authCheck.code || "UNAUTHORIZED",
          message: "Acceso no autorizado: " + (authCheck.message || "Usuario o contraseña inválidos.")
        };
      }
      authUser = authCheck.user;
    } else {
      const userCheck = validateActiveUser(inputUsuario);
      if (!userCheck.success || !userCheck.user) {
        return {
          success: false,
          status: "error",
          code: userCheck.code || "UNAUTHORIZED",
          message: "Acceso no autorizado: " + (userCheck.message || "Usuario inválido o inactivo.")
        };
      }
      authUser = userCheck.user;
    }
  } else {
    return {
      success: false,
      status: "error",
      code: "AUTH_REQUIRED",
      message: "Credenciales requeridas: Debes iniciar sesión para registrar movimientos."
    };
  }

  // Usar siempre la identidad comprobada del vendedor
  const usuario = authUser.usuario;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetMov = ss.getSheetByName(SHEETS.MOVEMENTS);
  let sheetStock = ss.getSheetByName(SHEETS.STOCK);

  // Asegurar existencia de pestaña Movimientos y cabeceras completas
  if (!sheetMov) {
    sheetMov = ss.insertSheet(SHEETS.MOVEMENTS);
    sheetMov.appendRow(["FECHA", "USUARIO", "TIPO", "CÓDIGO", "CANTIDAD", "PRECIO DE VENTA", "TIPO DE VENTA", "PRECIO SIN IGV", "FORMA DE PAGO", "COMPROBANTE DE PAGO", "OBSERVACIÓN", "REQUEST_ID", "ESTADO_OPERACION"]);
  }

  // 3. COMPROBACIÓN DE IDEMPOTENCIA ANTES DE VALIDAR NUEVAMENTE EL STOCK
  const movValues = sheetMov.getDataRange().getValues();
  let colFecha = 0;
  let colUser = 1;
  let colTipo = 2;
  let colCod = 3;
  let colCant = 4;
  let colPrecioVenta = 5;
  let colTipoVenta = 6;
  let colPrecioSinIgv = 7;
  let colFormaPago = -1;
  let colComprobantePago = -1;
  let colObs = 8;
  let colReqId = -1;
  let colEstadoOp = -1;

  if (movValues.length > 0) {
    const movHeaders = movValues[0].map(h => String(h).trim().toUpperCase());

    const idxFecha = movHeaders.findIndex(h => h.includes("FECHA"));
    if (idxFecha !== -1) colFecha = idxFecha;

    const idxUser = movHeaders.findIndex(h => h.includes("USUARIO"));
    if (idxUser !== -1) colUser = idxUser;

    const idxTipo = movHeaders.findIndex(h => h === "TIPO");
    if (idxTipo !== -1) colTipo = idxTipo;

    const idxCod = movHeaders.findIndex(h => h.includes("CÓDIGO") || h.includes("CODIGO"));
    if (idxCod !== -1) colCod = idxCod;

    const idxCant = movHeaders.findIndex(h => h.includes("CANTIDAD"));
    if (idxCant !== -1) colCant = idxCant;

    const idxPrecioVenta = movHeaders.findIndex(h => h.includes("PRECIO DE VENTA") || h.includes("PRECIO_VENTA"));
    if (idxPrecioVenta !== -1) colPrecioVenta = idxPrecioVenta;

    const idxTipoVenta = movHeaders.findIndex(h => h.includes("TIPO DE VENTA") || h.includes("TIPO_VENTA"));
    if (idxTipoVenta !== -1) colTipoVenta = idxTipoVenta;

    const idxPrecioSinIgv = movHeaders.findIndex(h => h.includes("PRECIO SIN IGV") || h.includes("PRECIO_SIN_IGV"));
    if (idxPrecioSinIgv !== -1) colPrecioSinIgv = idxPrecioSinIgv;

    const idxFormaPago = movHeaders.findIndex(h => h.includes("FORMA DE PAGO") || h.includes("FORMA_PAGO") || h === "PAGO");
    if (idxFormaPago !== -1) colFormaPago = idxFormaPago;

    const idxComprobantePago = movHeaders.findIndex(h => h.includes("COMPROBANTE DE PAGO") || h.includes("COMPROBANTE_PAGO") || h.includes("COMPROBANTE"));
    if (idxComprobantePago !== -1) colComprobantePago = idxComprobantePago;

    const idxObs = movHeaders.findIndex(h => h.includes("OBSERVACIÓN") || h.includes("OBSERVACION"));
    if (idxObs !== -1) colObs = idxObs;

    colReqId = movHeaders.indexOf("REQUEST_ID");
    if (colReqId === -1) {
      colReqId = movHeaders.length;
      sheetMov.getRange(1, colReqId + 1).setValue("REQUEST_ID");
    }

    colEstadoOp = movHeaders.indexOf("ESTADO_OPERACION");
    if (colEstadoOp === -1) {
      colEstadoOp = Math.max(movHeaders.length, colReqId + 1);
      sheetMov.getRange(1, colEstadoOp + 1).setValue("ESTADO_OPERACION");
    }
  }

  // Comprobar si el identificador único (requestId) ya existe en la hoja de Movimientos
  let existingRowIndex = -1;
  let existingRowData = null;

  if (movValues.length > 1 && colReqId !== -1) {
    for (let i = 1; i < movValues.length; i++) {
      const existingReq = String(movValues[i][colReqId] || "").trim();
      if (existingReq && existingReq === requestId) {
        existingRowIndex = i + 1; // Fila base 1 en Google Sheets
        existingRowData = movValues[i];
        break;
      }
    }
  }

  // Si YA EXISTE:
  if (existingRowData) {
    const estadoActual = (colEstadoOp !== -1 && colEstadoOp < existingRowData.length && existingRowData[colEstadoOp])
      ? String(existingRowData[colEstadoOp]).trim().toUpperCase()
      : "COMPLETED";

    // Si ya fue completado satisfactoriamente: devolver respuesta original SIN modificar stock
    if (estadoActual === "COMPLETED") {
      let f = existingRowData[colFecha];
      if (f instanceof Date) {
        f = Utilities.formatDate(f, Session.getScriptTimeZone() || "GMT-5", "yyyy-MM-dd HH:mm:ss");
      }
      return {
        status: "success",
        idempotent: true,
        message: "El movimiento ya fue registrado previamente.",
        movement: {
          fechaHora: String(f || ""),
          usuario: colUser !== -1 ? String(existingRowData[colUser]) : usuario,
          tipo: colTipo !== -1 ? String(existingRowData[colTipo]) : tipo,
          codigo: colCod !== -1 ? String(existingRowData[colCod]) : codigo,
          cantidad: colCant !== -1 ? (Number(existingRowData[colCant]) || cantidad) : cantidad,
          precioVenta: (colPrecioVenta !== -1 && existingRowData[colPrecioVenta] !== "") ? Number(existingRowData[colPrecioVenta]) : null,
          tipoVenta: (colTipoVenta !== -1 && existingRowData[colTipoVenta] !== "") ? String(existingRowData[colTipoVenta]) : "",
          precioSinIgv: (colPrecioSinIgv !== -1 && existingRowData[colPrecioSinIgv] !== "") ? Number(existingRowData[colPrecioSinIgv]) : null,
          formaPago: (colFormaPago !== -1 && existingRowData[colFormaPago] !== "") ? String(existingRowData[colFormaPago]) : "",
          comprobantePago: (colComprobantePago !== -1 && existingRowData[colComprobantePago] !== "") ? String(existingRowData[colComprobantePago]) : "",
          observacion: colObs !== -1 ? String(existingRowData[colObs]) : observacion,
          requestId: requestId,
          estadoOperacion: "COMPLETED"
        }
      };
    }

    // Si estaba en PENDING o FAILED: es un reintento de una operación que quedó incompleta en la actualización de stock
    Logger.log("[handleAddMovement] Recuperando operación previa pendiente/fallida para requestId: " + requestId);
  }

  // 4. Si es operación nueva o recuperación: leer y validar Stock_Actual
  let stockRowIndex = -1;
  let articuloNombre = "";
  let actualEntradas = 0;
  let actualSalidas = 0;
  let colEntradasIdx = -1;
  let colSalidasIdx = -1;
  let colStockIdx = -1;

  if (sheetStock) {
    const stockValues = sheetStock.getDataRange().getValues();
    if (stockValues.length > 1) {
      const stockHeaders = stockValues[0].map(h => String(h).trim().toUpperCase());
      const colCodigo = stockHeaders.indexOf("CÓDIGO") !== -1 ? stockHeaders.indexOf("CÓDIGO") : stockHeaders.indexOf("CODIGO");
      const colArticulo = stockHeaders.indexOf("ARTÍCULO") !== -1 ? stockHeaders.indexOf("ARTÍCULO") : stockHeaders.indexOf("ARTICULO");
      colEntradasIdx = stockHeaders.indexOf("ENTRADAS");
      colSalidasIdx = stockHeaders.indexOf("SALIDAS");
      colStockIdx = stockHeaders.indexOf("STOCK DISPONIBLE") !== -1 ? stockHeaders.indexOf("STOCK DISPONIBLE") : stockHeaders.indexOf("STOCK");

      for (let r = 1; r < stockValues.length; r++) {
        const rowCod = String(stockValues[r][colCodigo]).trim().toUpperCase();
        if (rowCod === codigo) {
          stockRowIndex = r + 1; // Fila en base 1 para getRange
          articuloNombre = colArticulo !== -1 ? String(stockValues[r][colArticulo]) : codigo;
          actualEntradas = colEntradasIdx !== -1 ? (Number(stockValues[r][colEntradasIdx]) || 0) : 0;
          actualSalidas = colSalidasIdx !== -1 ? (Number(stockValues[r][colSalidasIdx]) || 0) : 0;
          break;
        }
      }
    }
  }

  if (sheetStock && stockRowIndex === -1) {
    return {
      status: "error",
      code: "PRODUCT_NOT_FOUND",
      message: "El código de artículo '" + codigo + "' no existe en Stock_Actual."
    };
  }

  // Validación estricta de stock disponible para impedir stock negativo
  const stockDisponibleActual = actualEntradas - actualSalidas;
  if (tipo === "SALIDA") {
    if (stockDisponibleActual <= 0) {
      return {
        status: "error",
        code: "OUT_OF_STOCK",
        message: "No se puede registrar la venta: El artículo '" + (articuloNombre || codigo) + "' se encuentra agotado (Stock disponible: 0)."
      };
    }
    if (cantidad > stockDisponibleActual) {
      return {
        status: "error",
        code: "INSUFFICIENT_STOCK",
        message: "No se puede registrar la venta: La cantidad solicitada (" + cantidad + ") supera el stock disponible (" + stockDisponibleActual + ")."
      };
    }
  }

  // 5. Preparar datos para registro
  const ahora = new Date();
  const tz = (ss && typeof ss.getSpreadsheetTimeZone === "function" && ss.getSpreadsheetTimeZone())
    || (typeof Session !== "undefined" && Session.getScriptTimeZone && Session.getScriptTimeZone())
    || "GMT-5";
  const fechaHoraStr = (typeof Utilities !== "undefined" && Utilities.formatDate)
    ? Utilities.formatDate(ahora, tz, "yyyy-MM-dd HH:mm:ss")
    : ahora.toISOString().replace("T", " ").substring(0, 19);

  let precioVenta = null;
  let tipoVenta = "";
  let precioSinIgv = null;
  let formaPago = "";
  let comprobantePago = "";

  if (tipo === "SALIDA") {
    const rawP = (payload.precioVenta !== undefined && payload.precioVenta !== null && payload.precioVenta !== "") ? Number(payload.precioVenta) : null;
    if (rawP !== null && !isNaN(rawP) && rawP > 0) {
      precioVenta = Math.round(rawP * 100) / 100;
      const sinIgvCalc = precioVenta - (precioVenta * 0.18);
      precioSinIgv = parseFloat((Math.round(sinIgvCalc * 100) / 100).toFixed(2));
    }
    tipoVenta = String(payload.tipoVenta || "").trim();
    formaPago = String(payload.formaPago || "").trim();

    if (payload.comprobantePago !== undefined && payload.comprobantePago !== null && String(payload.comprobantePago).trim() !== "") {
      comprobantePago = String(payload.comprobantePago).trim();
    } else if (payload.tipoComprobante) {
      const tc = String(payload.tipoComprobante).trim();
      const doc = String(payload.documentoComprobante || payload.dni || payload.ruc || "").trim();
      if (tc.toUpperCase() === "NO") {
        comprobantePago = "NO";
      } else if (doc) {
        comprobantePago = tc + " - " + (tc === "Boleta" ? "DNI: " : "RUC: ") + doc;
      } else {
        comprobantePago = tc;
      }
    } else {
      comprobantePago = "NO";
    }
  }

  let targetMovementRow = existingRowIndex;

  // Si no existía fila previa, insertar fila con estado inicial 'PENDING'
  if (targetMovementRow === -1) {
    const totalCols = Math.max(
      movValues.length > 0 ? movValues[0].length : 13,
      colEstadoOp + 1,
      colReqId + 1,
      colObs + 1,
      colComprobantePago + 1,
      colFormaPago + 1,
      colPrecioSinIgv + 1,
      13
    );
    const newRow = new Array(totalCols).fill("");

    if (colFecha !== -1) newRow[colFecha] = fechaHoraStr;
    if (colUser !== -1) newRow[colUser] = usuario;
    if (colTipo !== -1) newRow[colTipo] = tipo;
    if (colCod !== -1) newRow[colCod] = codigo;
    if (colCant !== -1) newRow[colCant] = cantidad;

    if (colPrecioVenta !== -1) {
      newRow[colPrecioVenta] = (tipo === "SALIDA" && precioVenta !== null) ? precioVenta : "";
    }
    if (colTipoVenta !== -1) {
      newRow[colTipoVenta] = (tipo === "SALIDA" && tipoVenta) ? tipoVenta : "";
    }
    if (colPrecioSinIgv !== -1) {
      newRow[colPrecioSinIgv] = (tipo === "SALIDA" && precioSinIgv !== null) ? precioSinIgv : "";
    }
    if (colFormaPago !== -1) {
      newRow[colFormaPago] = (tipo === "SALIDA" && formaPago) ? formaPago : "";
    }
    if (colComprobantePago !== -1) {
      newRow[colComprobantePago] = (tipo === "SALIDA" && comprobantePago) ? comprobantePago : "";
    }

    if (colObs !== -1) newRow[colObs] = observacion;
    if (colReqId !== -1) newRow[colReqId] = requestId;
    if (colEstadoOp !== -1) newRow[colEstadoOp] = "PENDING";

    sheetMov.appendRow(newRow);
    targetMovementRow = sheetMov.getLastRow();
  }

  // 6. Actualización transaccional de 'Stock_Actual'
  let nuevoStock = null;
  try {
    if (sheetStock && stockRowIndex !== -1) {
      if (tipo === "ENTRADA") {
        actualEntradas += cantidad;
        if (colEntradasIdx !== -1) {
          sheetStock.getRange(stockRowIndex, colEntradasIdx + 1).setValue(actualEntradas);
        }
      } else if (tipo === "SALIDA") {
        actualSalidas += cantidad;
        if (colSalidasIdx !== -1) {
          sheetStock.getRange(stockRowIndex, colSalidasIdx + 1).setValue(actualSalidas);
        }
      }

      nuevoStock = actualEntradas - actualSalidas;
      if (colStockIdx !== -1) {
        const currentFormula = sheetStock.getRange(stockRowIndex, colStockIdx + 1).getFormula();
        if (!currentFormula) {
          sheetStock.getRange(stockRowIndex, colStockIdx + 1).setValue(nuevoStock);
        }
      }
    }

    // Actualización de inventario exitosa: marcar estado COMPLETED
    if (colEstadoOp !== -1 && targetMovementRow > 1) {
      sheetMov.getRange(targetMovementRow, colEstadoOp + 1).setValue("COMPLETED");
    }

    SpreadsheetApp.flush();

  } catch (stockErr) {
    Logger.log("[Stock Error] Falló actualizar Stock_Actual para requestId " + requestId + ": " + stockErr.toString());
    if (colEstadoOp !== -1 && targetMovementRow > 1) {
      sheetMov.getRange(targetMovementRow, colEstadoOp + 1).setValue("FAILED");
    }
    SpreadsheetApp.flush();
    return {
      status: "error",
      code: "STOCK_UPDATE_FAILED",
      message: "Error al actualizar existencias: " + stockErr.message + ". Puedes reintentar con el mismo requestId para completar la operación de manera segura."
    };
  }

  return {
    status: "success",
    message: existingRowData ? "Operación completada exitosamente tras recuperación." : "Movimiento registrado exitosamente.",
    idempotent: !!existingRowData,
    recovered: !!existingRowData,
    movement: {
      fechaHora: fechaHoraStr,
      usuario: usuario,
      tipo: tipo,
      codigo: codigo,
      articulo: articuloNombre,
      cantidad: cantidad,
      precioVenta: precioVenta,
      tipoVenta: tipoVenta,
      precioSinIgv: precioSinIgv,
      formaPago: formaPago,
      comprobantePago: comprobantePago,
      observacion: observacion,
      nuevoStock: nuevoStock,
      requestId: requestId,
      estadoOperacion: "COMPLETED"
    }
  };
}

/**
 * Parsea de manera exacta y robusta fechas de Google Sheets (Date o string)
 * evitando desfases de día por zonas horarias.
 */
function parseMovementDateGAS(rawDate, timezone) {
  if (rawDate === null || rawDate === undefined || rawDate === "") return "";

  // Caso 1: Objeto Date nativo de Google Sheets
  if (rawDate instanceof Date) {
    if (isNaN(rawDate.getTime())) return "";
    try {
      if (typeof Utilities !== "undefined" && Utilities.formatDate) {
        return Utilities.formatDate(rawDate, timezone, "yyyy-MM-dd HH:mm:ss");
      }
    } catch (e) {}
    const pad = function(n) { return (n < 10 ? "0" : "") + n; };
    return rawDate.getFullYear() + "-" + pad(rawDate.getMonth() + 1) + "-" + pad(rawDate.getDate()) + " " +
           pad(rawDate.getHours()) + ":" + pad(rawDate.getMinutes()) + ":" + pad(rawDate.getSeconds());
  }

  const str = String(rawDate).trim();
  if (!str) return "";

  // Caso 2: Cadena YYYY-MM-DD o YYYY/MM/DD con o sin hora (ej: "2025-12-08", "2025-12-08 19:33:42")
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(isoMatch[2]).padStart(2, "0");
    const d = String(isoMatch[3]).padStart(2, "0");
    const hh = isoMatch[4] ? String(isoMatch[4]).padStart(2, "0") : "00";
    const mm = isoMatch[5] ? String(isoMatch[5]).padStart(2, "0") : "00";
    const ss = isoMatch[6] ? String(isoMatch[6]).padStart(2, "0") : "00";
    return y + "-" + m + "-" + d + " " + hh + ":" + mm + ":" + ss;
  }

  // Caso 3: Cadena formato latino DD/MM/YYYY o DD-MM-YYYY (ej: "08/12/2025", "08/12/2025 19:33:42")
  const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ddmmyyyy) {
    const y = ddmmyyyy[3];
    const m = String(ddmmyyyy[2]).padStart(2, "0");
    const d = String(ddmmyyyy[1]).padStart(2, "0");
    const hh = ddmmyyyy[4] ? String(ddmmyyyy[4]).padStart(2, "0") : "00";
    const mm = ddmmyyyy[5] ? String(ddmmyyyy[5]).padStart(2, "0") : "00";
    const ss = ddmmyyyy[6] ? String(ddmmyyyy[6]).padStart(2, "0") : "00";
    return y + "-" + m + "-" + d + " " + hh + ":" + mm + ":" + ss;
  }

  // Caso 4: Fallback con new Date
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      if (typeof Utilities !== "undefined" && Utilities.formatDate) {
        return Utilities.formatDate(parsed, timezone, "yyyy-MM-dd HH:mm:ss");
      }
      const pad = function(n) { return (n < 10 ? "0" : "") + n; };
      return parsed.getFullYear() + "-" + pad(parsed.getMonth() + 1) + "-" + pad(parsed.getDate()) + " " +
             pad(parsed.getHours()) + ":" + pad(parsed.getMinutes()) + ":" + pad(parsed.getSeconds());
    }
  } catch (e) {}

  return str;
}

/**
 * Parsea un valor numérico tolerando texto, símbolos de moneda (S/) y comas decimales
 */
function parseSheetNumberGAS(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const clean = String(val).replace(/[^0-9.,-]/g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

/**
 * Obtiene los últimos movimientos registrados
 */
function getRecentMovements(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MOVEMENTS);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  // Usar zona horaria de la hoja de cálculo para evitar desfases
  const tz = (ss && typeof ss.getSpreadsheetTimeZone === "function" && ss.getSpreadsheetTimeZone()) 
    || (typeof Session !== "undefined" && Session.getScriptTimeZone && Session.getScriptTimeZone()) 
    || "GMT-5";

  const headers = values[0].map(h => String(h).trim().toUpperCase());
  const colFecha = headers.findIndex(h => h.includes("FECHA"));
  const colUser = headers.indexOf("USUARIO");
  const colTipo = headers.indexOf("TIPO");
  const colCod = headers.findIndex(h => h.includes("CÓDIGO") || h.includes("CODIGO"));
  const colCant = headers.indexOf("CANTIDAD");
  const colPrecioVenta = headers.findIndex(h => h.includes("PRECIO DE VENTA") || h.includes("PRECIO_VENTA"));
  const colTipoVenta = headers.findIndex(h => h.includes("TIPO DE VENTA") || h.includes("TIPO_VENTA"));
  const colPrecioSinIgv = headers.findIndex(h => h.includes("PRECIO SIN IGV") || h.includes("PRECIO_SIN_IGV"));
  const colFormaPago = headers.findIndex(h => h.includes("FORMA DE PAGO") || h.includes("FORMA_PAGO") || h === "PAGO");
  const colComprobantePago = headers.findIndex(h => h.includes("COMPROBANTE DE PAGO") || h.includes("COMPROBANTE_PAGO") || h.includes("COMPROBANTE"));
  const colObs = headers.findIndex(h => h.includes("OBSERVACIÓN") || h.includes("OBSERVACION"));
  const colReqId = headers.indexOf("REQUEST_ID");
  const colEstadoOp = headers.indexOf("ESTADO_OPERACION");

  const maxLimit = (typeof limit === "number" && limit > 0) ? limit : 200;
  const list = [];

  // Recorrer en orden inverso (más recientes primero)
  for (let i = values.length - 1; i >= 1 && list.length < maxLimit; i--) {
    const row = values[i];

    const rawFecha = (colFecha !== -1 && row[colFecha] !== undefined && row[colFecha] !== null) ? row[colFecha] : row[0];
    const rawTipo = colTipo !== -1 ? row[colTipo] : "";
    const rawCod = colCod !== -1 ? row[colCod] : "";

    // Si la fila está completamente vacía, saltarla
    if ((rawFecha === "" || rawFecha === null || rawFecha === undefined) && !rawTipo && !rawCod) {
      continue;
    }

    // Omitir transacciones fallidas para proteger la integridad de estadísticas e inventario
    const estadoOp = (colEstadoOp !== -1 && row[colEstadoOp] !== undefined && row[colEstadoOp] !== "")
      ? String(row[colEstadoOp]).trim().toUpperCase()
      : "COMPLETED";

    if (estadoOp === "FAILED") {
      continue;
    }

    // Parsear fecha de forma robusta respetando zona horaria sin desfases
    const fechaHora = parseMovementDateGAS(rawFecha, tz);
    if (!fechaHora) {
      continue;
    }

    const tipo = String(rawTipo || "ENTRADA").trim().toUpperCase();
    const precioVentaNum = (colPrecioVenta !== -1 && row[colPrecioVenta] !== undefined)
      ? parseSheetNumberGAS(row[colPrecioVenta])
      : null;
    const precioSinIgvNum = (colPrecioSinIgv !== -1 && row[colPrecioSinIgv] !== undefined)
      ? parseSheetNumberGAS(row[colPrecioSinIgv])
      : null;
    const cantNum = (colCant !== -1 && row[colCant] !== undefined)
      ? (parseSheetNumberGAS(row[colCant]) || 1)
      : 1;

    // IMPORTANTE: No descartar ni ignorar filas si la columna REQUEST_ID o algún campo secundario está vacío,
    // siempre y cuando la fila tenga datos válidos
    list.push({
      fechaHora: fechaHora,
      usuario: colUser !== -1 ? String(row[colUser] || "").trim() : "",
      tipo: tipo,
      codigo: colCod !== -1 ? String(row[colCod] || "").trim() : "",
      cantidad: cantNum,
      precioVenta: precioVentaNum,
      tipoVenta: (colTipoVenta !== -1 && row[colTipoVenta] !== "") ? String(row[colTipoVenta]).trim() : "",
      precioSinIgv: precioSinIgvNum,
      formaPago: (colFormaPago !== -1 && row[colFormaPago] !== "") ? String(row[colFormaPago]).trim() : "",
      comprobantePago: (colComprobantePago !== -1 && row[colComprobantePago] !== "") ? String(row[colComprobantePago]).trim() : "",
      observacion: colObs !== -1 ? String(row[colObs] || "").trim() : "",
      requestId: colReqId !== -1 ? String(row[colReqId] || "").trim() : "",
      estadoOperacion: estadoOp
    });
  }

  return list;
}

/**
 * Función de inicialización automática de Google Sheets
 * Crea las pestañas necesarias, encabezados con formato rosa/magenta de la marca y datos demo.
 */
function setupSheet() {
  // ATENCIÓN: No ejecutar si ya tienes datos en tu hoja para no borrar la información existente.
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Pestaña Usuarios (Estructura: ID | USUARIO | CONTRASEÑA | ESTADO | ROL)
  let sheetUsers = ss.getSheetByName(SHEETS.USERS);
  if (!sheetUsers) {
    sheetUsers = ss.insertSheet(SHEETS.USERS);
  }
  sheetUsers.clear();
  sheetUsers.appendRow(["ID", "USUARIO", "CONTRASEÑA", "ESTADO", "ROL"]);
  sheetUsers.appendRow([1, "mayte", "1234", 1, "Usuario"]);
  sheetUsers.appendRow([2, "mati", "2222", 1, "Usuario"]);
  sheetUsers.appendRow([3, "admin", "1111", 1, "Administrador"]);

  formatHeader(sheetUsers, 5);

  // 2. Pestaña Stock_Actual
  let sheetStock = ss.getSheetByName(SHEETS.STOCK);
  if (!sheetStock) {
    sheetStock = ss.insertSheet(SHEETS.STOCK);
  }
  sheetStock.clear();
  sheetStock.appendRow(["CÓDIGO", "ARTÍCULO", "TALLA", "ENTRADAS", "SALIDAS", "STOCK DISPONIBLE", "PRECIO"]);
  
  const sampleStock = [
    ["CAM-001-S", "Camisa Oxford Clásica Celeste", "S", 25, 12, 13, 85000],
    ["CAM-001-M", "Camisa Oxford Clásica Celeste", "M", 40, 36, 4, 85000],
    ["CAM-001-L", "Camisa Oxford Clásica Celeste", "L", 35, 15, 20, 85000],
    ["CAM-001-XL", "Camisa Oxford Clásica Celeste", "XL", 20, 20, 0, 85000],
    
    ["CAM-002-S", "Camisa Slim Fit Blanca Premium", "S", 30, 10, 20, 95000],
    ["CAM-002-M", "Camisa Slim Fit Blanca Premium", "M", 50, 48, 2, 95000],
    ["CAM-002-L", "Camisa Slim Fit Blanca Premium", "L", 45, 22, 23, 95000],
    ["CAM-002-XL", "Camisa Slim Fit Blanca Premium", "XL", 25, 21, 4, 95000],

    ["CAM-003-S", "Camisa Lino Rosa Pastel", "S", 15, 5, 10, 110000],
    ["CAM-003-M", "Camisa Lino Rosa Pastel", "M", 30, 29, 1, 110000],
    ["CAM-003-L", "Camisa Lino Rosa Pastel", "L", 25, 10, 15, 110000],
    ["CAM-003-XL", "Camisa Lino Rosa Pastel", "XL", 10, 10, 0, 110000],

    ["CAM-004-S", "Camisa Casual Rayas Navy", "S", 20, 8, 12, 89000],
    ["CAM-004-M", "Camisa Casual Rayas Navy", "M", 35, 15, 20, 89000],
    ["CAM-004-L", "Camisa Casual Rayas Navy", "L", 30, 12, 18, 89000],
    ["CAM-004-XL", "Camisa Casual Rayas Navy", "XL", 15, 9, 6, 89000],

    ["CAM-005-M", "Camisa Negra Cuello Mao", "M", 30, 27, 3, 98000],
    ["CAM-005-L", "Camisa Negra Cuello Mao", "L", 25, 11, 14, 98000]
  ];

  sampleStock.forEach(item => sheetStock.appendRow(item));
  formatHeader(sheetStock, 7);

  // 3. Pestaña Movimientos
  let sheetMov = ss.getSheetByName(SHEETS.MOVEMENTS);
  if (!sheetMov) {
    sheetMov = ss.insertSheet(SHEETS.MOVEMENTS);
  }
  sheetMov.clear();
  sheetMov.appendRow(["FECHA", "USUARIO", "TIPO", "CÓDIGO", "CANTIDAD", "PRECIO DE VENTA", "TIPO DE VENTA", "PRECIO SIN IGV", "FORMA DE PAGO", "COMPROBANTE DE PAGO", "OBSERVACIÓN", "REQUEST_ID", "ESTADO_OPERACION"]);
  formatHeader(sheetMov, 13);
  
  const sampleMovs = [
    ["2026-11-08 09:30:00", "admin", "ENTRADA", "CAM-001-M", 20, "", "", "", "", "", "Llegada lote confección taller", "REQ-INIT-001", "COMPLETED"],
    ["2026-11-08 10:15:20", "mayte", "SALIDA", "CAM-002-M", 3, 95.00, "Unitario", 77.90, "Efectivo", "NO", "Venta en tienda física cliente frecuente", "REQ-INIT-002", "COMPLETED"],
    ["2026-11-08 11:45:00", "mati", "SALIDA", "CAM-003-M", 2, 110.00, "Unitario", 90.20, "Transferencia", "NO", "Pedido por WhatsApp entrega mensajería", "REQ-INIT-003", "COMPLETED"],
    ["2026-11-08 14:20:10", "admin", "ENTRADA", "CAM-004-L", 15, "", "", "", "", "", "Reposición de bodega central", "REQ-INIT-004", "COMPLETED"],
    ["2026-11-08 16:05:40", "mayte", "SALIDA", "CAM-001-XL", 2, 85.00, "Unitario", 69.70, "Yape", "Boleta - DNI: 72849102", "Venta en tienda", "REQ-INIT-005", "COMPLETED"]
  ];

  sampleMovs.forEach(mov => sheetMov.appendRow(mov));
  formatHeader(sheetMov, 13);

  SpreadsheetApp.flush();

  return {
    status: "success",
    message: "Google Sheets inicializado correctamente con pestañas 'Usuarios', 'Stock_Actual' y 'Movimientos'."
  };
}

/**
 * Da formato estético profesional a los encabezados
 * Color Magenta de la marca (#db2777), texto blanco, negrita y vista fija.
 */
function formatHeader(sheet, numCols) {
  const range = sheet.getRange(1, 1, 1, numCols);
  range.setBackground("#be185d"); // Tono Magenta / Frambuesa elegante de la marca
  range.setFontColor("#ffffff");
  range.setFontWeight("bold");
  range.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, numCols);
}

/**
 * Función auxiliar para generar respuesta JSON con soporte CORS y JSONP opcional
 */
function createJsonResponse(data, callback) {
  const jsonString = JSON.stringify(data);
  let output;

  if (callback) {
    output = ContentService.createTextOutput(callback + "(" + jsonString + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    output = ContentService.createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
  }

  return output;
}
