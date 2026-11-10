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
        // Soporte de login vía GET protegido con LockService y lectura en tiempo real
        const getLock = LockService.getScriptLock();
        let hasGetLock = false;
        try {
          hasGetLock = getLock.tryLock(10000);
        } catch (e) {
          hasGetLock = false;
        }
        try {
          responseData = handleLogin(params.usuario, params.password);
        } finally {
          if (hasGetLock) {
            try { getLock.releaseLock(); } catch (e) {}
          }
        }
        break;

      case "validateSession":
        responseData = handleValidateSession(params.usuario, params.password);
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
  // Manejo de concurrencia estricto con LockService
  const lock = LockService.getScriptLock();
  let hasLock = false;

  try {
    hasLock = lock.tryLock(15000);
  } catch (lockErr) {
    hasLock = false;
  }

  // Si no se obtiene el bloqueo en 15 segundos, devolver error y NO ejecutar escrituras
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
        responseData = handleValidateSession(payload.usuario, payload.password, true);
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
 * Función de autenticación de usuario
 * Valida USUARIO, CONTRASEÑA y ESTADO (debe ser 1) directamente en la pestaña 'Usuarios' en tiempo real
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
      // Usuario encontrado, verificar contraseña exacta en tiempo real
      if (sheetPass === inputPass) {
        // Verificar estado (debe ser 1 o ACTIVO)
        if (sheetState === "1" || sheetState === 1 || sheetState.toUpperCase() === "ACTIVO") {
          return {
            success: true,
            status: "success",
            message: "Inicio de sesión exitoso.",
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
 * Valida de forma ultra rápida si la sesión del usuario sigue vigente y si la contraseña coincide exactamente
 * con la registrada en la pestaña 'Usuarios' de Google Sheets.
 * Lee únicamente el rango de usuarios para máxima rapidez y utiliza LockService.
 */
function handleValidateSession(usuario, password, lockAlreadyAcquired) {
  const cleanUser = String(usuario || "").trim().toLowerCase();
  const cleanPass = String(password || "").trim();

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
        // Verificar si la contraseña cambió en Google Sheets
        if (sheetPass !== cleanPass) {
          return {
            success: false,
            sesionValida: false,
            code: "PASSWORD_CHANGED",
            message: "Tu contraseña ha cambiado. Por favor, inicia sesión de nuevo."
          };
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
 * Y actualiza la pestaña 'Stock_Actual' de forma síncrona con idempotencia estricta
 */
function handleAddMovement(payload) {
  Logger.log("[handleAddMovement] Payload recibido: " + JSON.stringify(payload));

  // 1. Validar autenticación obligatoria del usuario contra la pestaña 'Usuarios'
  const inputUsuario = String(payload.usuario || "").trim();
  const inputPassword = String(payload.password || "").trim();

  if (!inputUsuario) {
    return {
      success: false,
      status: "error",
      code: "AUTH_REQUIRED",
      message: "Credenciales requeridas: Debes iniciar sesión para registrar movimientos."
    };
  }

  // Validar usuario y estado activo contra la pestaña 'Usuarios' en tiempo real
  let authUser = null;
  if (inputPassword) {
    const authCheck = handleLogin(inputUsuario, inputPassword);
    if (!authCheck.success || !authCheck.user) {
      return {
        success: false,
        status: "error",
        code: authCheck.code || "UNAUTHORIZED",
        message: "Acceso no autorizado: " + (authCheck.message || "Usuario o contraseña inválidos, o usuario inactivo.")
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

  // 2. Validar identificador de idempotencia (requestId obligatorio)
  const requestId = String(payload.requestId || "").trim();
  if (!requestId) {
    return {
      success: false,
      status: "error",
      code: "MISSING_REQUEST_ID",
      message: "Identificador de solicitud (requestId) obligatorio para registrar movimientos."
    };
  }

  // 3. Validar parámetros básicos
  const usuario = authUser.usuario; // Usar el usuario verificado por la sesión
  const tipo = String(payload.tipo || "").trim().toUpperCase(); // 'ENTRADA' o 'SALIDA'
  const codigo = String(payload.codigo || "").trim().toUpperCase();
  const cantidad = parseInt(payload.cantidad, 10);
  const observacion = String(payload.observacion || "").trim();

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

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetMov = ss.getSheetByName(SHEETS.MOVEMENTS);
  let sheetStock = ss.getSheetByName(SHEETS.STOCK);

  // 3. Validar producto y stock ANTES de modificar cualquier hoja
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

  // 4. Asegurar existencia de pestaña Movimientos y columna REQUEST_ID sin alterar datos previos
  if (!sheetMov) {
    sheetMov = ss.insertSheet(SHEETS.MOVEMENTS);
    sheetMov.appendRow(["FECHA", "USUARIO", "TIPO", "CÓDIGO", "CANTIDAD", "PRECIO DE VENTA", "TIPO DE VENTA", "PRECIO SIN IGV", "OBSERVACIÓN", "REQUEST_ID"]);
  }

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

    // Si aún no existe la columna REQUEST_ID, crearla al final de la cabecera sin tocar columnas ni registros previos
    if (colReqId === -1) {
      colReqId = movHeaders.length;
      sheetMov.getRange(1, colReqId + 1).setValue("REQUEST_ID");
    }
  } else {
    sheetMov.appendRow(["FECHA", "USUARIO", "TIPO", "CÓDIGO", "CANTIDAD", "PRECIO DE VENTA", "TIPO DE VENTA", "PRECIO SIN IGV", "FORMA DE PAGO", "COMPROBANTE DE PAGO", "OBSERVACIÓN", "REQUEST_ID"]);
    colFormaPago = 8;
    colComprobantePago = 9;
    colObs = 10;
    colReqId = 11;
  }

  // 5. Comprobar idempotencia: ¿ya existe este requestId registrado?
  if (movValues.length > 1 && colReqId !== -1 && colReqId < movValues[0].length) {
    for (let i = 1; i < movValues.length; i++) {
      const existingReq = String(movValues[i][colReqId] || "").trim();
      if (existingReq && existingReq === requestId) {
        // Encontrado: movimiento previamente registrado. Retornar éxito SIN duplicar inserción ni modificar stock.
        let f = movValues[i][colFecha];
        if (f instanceof Date) {
          f = Utilities.formatDate(f, Session.getScriptTimeZone() || "GMT-5", "yyyy-MM-dd HH:mm:ss");
        }
        return {
          status: "success",
          idempotent: true,
          message: "El movimiento ya fue registrado previamente.",
          movement: {
            fechaHora: String(f || ""),
            usuario: colUser !== -1 ? String(movValues[i][colUser]) : usuario,
            tipo: colTipo !== -1 ? String(movValues[i][colTipo]) : tipo,
            codigo: colCod !== -1 ? String(movValues[i][colCod]) : codigo,
            articulo: articuloNombre || codigo,
            cantidad: colCant !== -1 ? (Number(movValues[i][colCant]) || cantidad) : cantidad,
            precioVenta: (colPrecioVenta !== -1 && movValues[i][colPrecioVenta] !== "") ? Number(movValues[i][colPrecioVenta]) : null,
            tipoVenta: (colTipoVenta !== -1 && movValues[i][colTipoVenta] !== "") ? String(movValues[i][colTipoVenta]) : "",
            precioSinIgv: (colPrecioSinIgv !== -1 && movValues[i][colPrecioSinIgv] !== "") ? Number(movValues[i][colPrecioSinIgv]) : null,
            formaPago: (colFormaPago !== -1 && movValues[i][colFormaPago] !== "") ? String(movValues[i][colFormaPago]) : "",
            comprobantePago: (colComprobantePago !== -1 && movValues[i][colComprobantePago] !== "") ? String(movValues[i][colComprobantePago]) : "",
            observacion: colObs !== -1 ? String(movValues[i][colObs]) : observacion,
            requestId: requestId
          }
        };
      }
    }
  }

  // 6. Registrar en 'Movimientos' respetando las nuevas columnas (F: PRECIO DE VENTA, G: TIPO DE VENTA, H: PRECIO SIN IGV, I: FORMA DE PAGO, J: COMPROBANTE DE PAGO, K: OBSERVACIÓN)
  const ahora = new Date();
  const fechaHoraStr = Utilities.formatDate(ahora, Session.getScriptTimeZone() || "GMT-5", "yyyy-MM-dd HH:mm:ss");

  let precioVenta = null;
  let tipoVenta = "";
  let precioSinIgv = null;
  let formaPago = "";
  let comprobantePago = "";

  if (tipo === "SALIDA") {
    const rawP = (payload.precioVenta !== undefined && payload.precioVenta !== null && payload.precioVenta !== "") ? Number(payload.precioVenta) : null;
    if (rawP !== null && !isNaN(rawP) && rawP > 0) {
      precioVenta = Math.round(rawP * 100) / 100;
      // Cálculo en el servidor de precioSinIgv: Precio de venta − (Precio de venta × 0.18), redondeado a 2 decimales
      const sinIgvCalc = precioVenta - (precioVenta * 0.18);
      precioSinIgv = parseFloat((Math.round(sinIgvCalc * 100) / 100).toFixed(2));
    }
    tipoVenta = String(payload.tipoVenta || "").trim();
    formaPago = String(payload.formaPago || "").trim();

    // Determinar formato de comprobante con DNI o RUC
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

  const totalCols = Math.max(
    movValues.length > 0 ? movValues[0].length : 11,
    colReqId + 1,
    colObs + 1,
    colComprobantePago + 1,
    colFormaPago + 1,
    colPrecioSinIgv + 1,
    11
  );
  const newRow = new Array(totalCols).fill("");

  if (colFecha !== -1) newRow[colFecha] = fechaHoraStr;
  if (colUser !== -1) newRow[colUser] = usuario;
  if (colTipo !== -1) newRow[colTipo] = tipo;
  if (colCod !== -1) newRow[colCod] = codigo;
  if (colCant !== -1) newRow[colCant] = cantidad;

  // Columnas F, G, H, Forma de Pago y Comprobante de Pago solo para SALIDA (en ENTRADA se dejan vacías "")
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

  sheetMov.appendRow(newRow);

  // 7. Actualizar 'Stock_Actual' de forma síncrona
  let nuevoStock = null;
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

  SpreadsheetApp.flush();

  return {
    status: "success",
    message: "Movimiento registrado exitosamente.",
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
      observacion: observacion,
      nuevoStock: nuevoStock,
      requestId: requestId
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
      requestId: colReqId !== -1 ? String(row[colReqId] || "").trim() : ""
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
  sheetMov.appendRow(["FECHA", "USUARIO", "TIPO", "CÓDIGO", "CANTIDAD", "PRECIO DE VENTA", "TIPO DE VENTA", "PRECIO SIN IGV", "FORMA DE PAGO", "COMPROBANTE DE PAGO", "OBSERVACIÓN", "REQUEST_ID"]);
  formatHeader(sheetMov, 12);
  
  const sampleMovs = [
    ["2026-11-08 09:30:00", "admin", "ENTRADA", "CAM-001-M", 20, "Llegada lote confección taller"],
    ["2026-11-08 10:15:20", "vendedor", "SALIDA", "CAM-002-M", 3, "Venta en tienda física cliente frecuente"],
    ["2026-11-08 11:45:00", "vendedor", "SALIDA", "CAM-003-M", 2, "Pedido por WhatsApp entrega mensajería"],
    ["2026-11-08 14:20:10", "inventario", "ENTRADA", "CAM-004-L", 15, "Reposición de bodega central"],
    ["2026-11-08 16:05:40", "vendedor", "SALIDA", "CAM-001-XL", 2, "Venta factura electrónica #1042"]
  ];

  sampleMovs.forEach(mov => sheetMov.appendRow(mov));
  formatHeader(sheetMov, 6);

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
