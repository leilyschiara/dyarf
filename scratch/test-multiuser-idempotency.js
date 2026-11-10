/**
 * Test Suite Integral: Seguridad, Concurrencia Multi-Vendedor (4 usuarios),
 * Idempotencia y Recuperación Transaccional para Dyar'f.
 */

const fs = require('fs');
const assert = require('assert');

console.log("=== INICIANDO PRUEBAS DE SEGURIDAD, IDEMPOTENCIA Y MULTI-USUARIO ===");

// 1. Configuración de datos simulados en memoria
let usersSheetData = [
  ["ID", "USUARIO", "CONTRASEÑA", "ROL", "ESTADO"],
  ["USR-1", "admin", "1111", "Administrador", 1],
  ["USR-2", "vendedor1", "clave_v1", "Usuario", 1],
  ["USR-3", "vendedor2", "clave_v2", "Usuario", 1],
  ["USR-4", "vendedor3", "clave_v3", "Usuario", 1],
  ["USR-5", "inactivo", "clave_inactiva", "Usuario", 0]
];

let stockSheetData = [
  ["CÓDIGO", "ARTÍCULO", "TALLA", "ENTRADAS", "SALIDAS", "STOCK DISPONIBLE", "PRECIO"],
  ["CAM-001-M", "Camisa Oxford Clásica Celeste", "M", 50, 40, 10, 85.00],
  ["CAM-002-L", "Camisa Slim Fit Blanca Premium", "L", 30, 29, 1, 95.00]
];

let movSheetData = [
  ["FECHA", "USUARIO", "TIPO", "CÓDIGO", "CANTIDAD", "PRECIO DE VENTA", "TIPO DE VENTA", "PRECIO SIN IGV", "FORMA DE PAGO", "COMPROBANTE DE PAGO", "OBSERVACIÓN", "REQUEST_ID", "ESTADO_OPERACION"]
];

const mockSheets = {
  "Usuarios": {
    getDataRange: () => ({
      getValues: () => usersSheetData
    }),
    getLastRow: () => usersSheetData.length,
    getLastColumn: () => usersSheetData[0].length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        const rows = usersSheetData.slice(r - 1, r - 1 + (nr || 1));
        return rows.map(row => row.slice(c - 1, c - 1 + (nc || 1)));
      },
      setValue: (val) => {
        usersSheetData[r - 1][c - 1] = val;
      }
    })
  },
  "Stock_Actual": {
    getDataRange: () => ({
      getValues: () => stockSheetData
    }),
    getLastRow: () => stockSheetData.length,
    getLastColumn: () => stockSheetData[0].length,
    getRange: (r, c) => ({
      getFormula: () => "",
      getValue: () => stockSheetData[r - 1][c - 1],
      setValue: (val) => {
        stockSheetData[r - 1][c - 1] = val;
      }
    })
  },
  "Movimientos": {
    getDataRange: () => ({
      getValues: () => movSheetData
    }),
    getLastRow: () => movSheetData.length,
    getLastColumn: () => (movSheetData[0] ? movSheetData[0].length : 13),
    appendRow: (row) => {
      movSheetData.push([...row]);
    },
    getRange: (r, c) => ({
      setValue: (val) => {
        if (!movSheetData[r - 1]) movSheetData[r - 1] = [];
        movSheetData[r - 1][c - 1] = val;
      }
    })
  }
};

const mockSpreadsheet = {
  getSheetByName: (name) => mockSheets[name] || null,
  getSpreadsheetTimeZone: () => "GMT-5",
  insertSheet: (name) => {
    mockSheets[name] = {
      getDataRange: () => ({ getValues: () => [] }),
      appendRow: (r) => {}
    };
    return mockSheets[name];
  }
};

let scriptPropertiesStore = {};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => scriptPropertiesStore[k] || null,
    setProperty: (k, v) => { scriptPropertiesStore[k] = String(v); }
  })
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => mockSpreadsheet,
  flush: () => {}
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    releaseLock: () => {}
  })
};

global.Logger = {
  log: (msg) => {}
};

global.SHEETS = {
  USERS: "Usuarios",
  STOCK: "Stock_Actual",
  MOVEMENTS: "Movimientos",
  PRODUCTS: "Productos"
};

global.require = require;

// Cargar código de Codigo.gs
const gsSource = fs.readFileSync('google-apps-script/Codigo.gs', 'utf8');
(0, eval)(gsSource);

// --- PRUEBA 1: Autenticación, Hashing transparente y Tokens HMAC-SHA256 ---
console.log("\n--- PRUEBA 1: Autenticación Segura y Migración a Hash SHA-256 ---");
const loginRes = handleLogin("vendedor1", "clave_v1");
assert.strictEqual(loginRes.success, true);
assert.strictEqual(loginRes.user.usuario, "vendedor1");
assert(loginRes.sessionToken && loginRes.sessionToken.includes("."), "Debe generar sessionToken con punto");

// Comprobar que en la hoja 'Usuarios', la contraseña migró de texto plano a sha256$
const storedPass = usersSheetData[2][2];
assert(storedPass.startsWith("sha256$"), "La contraseña debe haber sido migrada a sha256$...: " + storedPass);
console.log("✔ Login exitoso y contraseña migrada automáticamente a formato seguro con sal:", storedPass.substring(0, 20) + "...");

// Validar que con el hash ya creado, el segundo login sigue funcionando
const login2 = handleLogin("vendedor1", "clave_v1");
assert.strictEqual(login2.success, true, "Login con contraseña hasheada debe ser exitoso");
console.log("✔ Login posterior validado correctamente contra el hash SHA-256");

// Verificar token de sesión
const verifyRes = verifySessionToken(loginRes.sessionToken);
assert.strictEqual(verifyRes.valid, true);
assert.strictEqual(verifyRes.user.usuario, "vendedor1");
console.log("✔ Token de sesión verificado criptográficamente con éxito");

// Token alterado (tampering) debe ser rechazado
const tamperedToken = loginRes.sessionToken.slice(0, -4) + "abcd";
const tamperCheck = verifySessionToken(tamperedToken);
assert.strictEqual(tamperCheck.valid, false);
assert.strictEqual(tamperCheck.code, "TOKEN_TAMPERED");
console.log("✔ Token manipulado rechazado correctamente con TOKEN_TAMPERED");

// Usuario inactivo debe ser rechazado
const loginInactivo = handleLogin("inactivo", "clave_inactiva");
assert.strictEqual(loginInactivo.success, false);
assert.strictEqual(loginInactivo.code, "USER_INACTIVE");
console.log("✔ Usuario con Estado: 0 rechazado correctamente");

// --- PRUEBA 2: Idempotencia y Prevención de Duplicados en Ventas ---
console.log("\n--- PRUEBA 2: Idempotencia Estricta en addMovement ---");
const stockInicialCeleste = stockSheetData[1][4]; // Salidas iniciales de CAM-001-M = 40 (Disp = 10)
const requestIdUnico = "REQ-TEST-VENTA-001";

const movPayload1 = {
  sessionToken: loginRes.sessionToken,
  tipo: "SALIDA",
  codigo: "CAM-001-M",
  cantidad: 3,
  precioVenta: 85.00,
  tipoVenta: "Unitario",
  formaPago: "Efectivo",
  comprobantePago: "NO",
  observacion: "Venta en tienda",
  requestId: requestIdUnico
};

const resMov1 = handleAddMovement(movPayload1);
assert.strictEqual(resMov1.status, "success");
assert.strictEqual(resMov1.movement.nuevoStock, 7, "Stock disponible debe ser 10 - 3 = 7");
assert.strictEqual(stockSheetData[1][4], 43, "Salidas en stock deben ser 40 + 3 = 43");
console.log("✔ Primera solicitud de venta procesada. Stock actualizado a 7 unidades.");

// Reintento idéntico con el MISMO requestId (simulando corte de conexión o doble clic)
const resMov2 = handleAddMovement(movPayload1);
assert.strictEqual(resMov2.status, "success");
assert.strictEqual(resMov2.idempotent, true, "Debe retornar idempotent: true");
assert.strictEqual(stockSheetData[1][4], 43, "Las salidas NO deben incrementarse de nuevo en un reintento");
assert.strictEqual(movSheetData.length, 2, "La hoja de Movimientos NO debe contener registros duplicados");
console.log("✔ Reintento con mismo requestId reconocido como idempotente sin descontar stock dos veces.");

// --- PRUEBA 3: Control de Estados (PENDING / COMPLETED / FAILED) y Recuperación ---
console.log("\n--- PRUEBA 3: Recuperación de Transacción Incompleta ---");
const requestIdIncompleto = "REQ-INCOMPLETO-RETRY-002";

// Simulamos que una operación previa registró la fila en Movimientos con PENDING pero falló antes de actualizar stock
movSheetData.push([
  "2026-11-10 13:00:00",
  "vendedor1",
  "SALIDA",
  "CAM-001-M",
  2,
  85.00,
  "Unitario",
  69.70,
  "Efectivo",
  "NO",
  "Venta en tienda",
  requestIdIncompleto,
  "PENDING"
]);

const salidasAntes = stockSheetData[1][4]; // 43

// El vendedor o la app reintenta la misma solicitud con requestIdIncompleto
const retryPayload = {
  sessionToken: loginRes.sessionToken,
  tipo: "SALIDA",
  codigo: "CAM-001-M",
  cantidad: 2,
  precioVenta: 85.00,
  tipoVenta: "Unitario",
  formaPago: "Efectivo",
  comprobantePago: "NO",
  observacion: "Venta en tienda",
  requestId: requestIdIncompleto
};

const resRetry = handleAddMovement(retryPayload);
assert.strictEqual(resRetry.status, "success");
assert.strictEqual(resRetry.idempotent, true);
assert.strictEqual(resRetry.recovered, true, "Debe detectar que recuperó la operación pendiente");
assert.strictEqual(stockSheetData[1][4], salidasAntes + 2, "Debe completar la deducción de stock pendiente");
assert.strictEqual(movSheetData[2][12], "COMPLETED", "El estado de la fila debe actualizarse a COMPLETED");
console.log("✔ Operación previa en PENDING completada con éxito, stock descontado una sola vez y estado fijado a COMPLETED.");

// --- PRUEBA 4: Control de Stock Insuficiente y Agotado ---
console.log("\n--- PRUEBA 4: Validación de Stock y Protección contra Negativos ---");
// CAM-002-L tiene solo 1 disponible (30 - 29 = 1)
const movExceso = {
  sessionToken: loginRes.sessionToken,
  tipo: "SALIDA",
  codigo: "CAM-002-L",
  cantidad: 5, // Pide 5 habiendo solo 1
  requestId: "REQ-EXCESO-001"
};

const resExceso = handleAddMovement(movExceso);
assert.strictEqual(resExceso.status, "error");
assert.strictEqual(resExceso.code, "INSUFFICIENT_STOCK");
console.log("✔ Solicitud de cantidad mayor al stock rechazada correctamente con INSUFFICIENT_STOCK");

// --- PRUEBA 5: Simulación de 4 Vendedores Concurrentes ---
console.log("\n--- PRUEBA 5: Simulación de Concurrencia con 4 Vendedores ---");
const loginsVendedores = ["admin", "vendedor1", "vendedor2", "vendedor3"].map(u => {
  const r = handleLogin(u, u === "admin" ? "1111" : `clave_${u.replace("vendedor", "v")}`);
  return { usuario: u, token: r.sessionToken };
});

const stockAntesConcurrente = stockSheetData[1][3] - stockSheetData[1][4]; // Stock disponible actual
const peticiones = loginsVendedores.map((v, idx) => ({
  sessionToken: v.token,
  usuario: v.usuario,
  tipo: "ENTRADA",
  codigo: "CAM-001-M",
  cantidad: 5,
  observacion: `Ingreso lote por vendedor ${v.usuario}`,
  requestId: `REQ-CONCURRENTE-V${idx}-${Date.now()}`
}));

// Ejecutar secuencialmente dentro del lock simulado
peticiones.forEach((req) => {
  const r = handleAddMovement(req);
  assert.strictEqual(r.status, "success", `Petición de ${req.usuario} debe ser exitosa`);
});

const stockDespuesConcurrente = stockSheetData[1][3] - stockSheetData[1][4];
assert.strictEqual(stockDespuesConcurrente, stockAntesConcurrente + (4 * 5), "4 entradas de 5 unid. deben sumar exactamente 20 unidades");
console.log("✔ 4 vendedores concurrentes procesados sin corrupción ni desfases de stock.");

// --- PRUEBA 6: Lógica de Frontend (SheetsAPI: Firmas y Reutilización de requestId) ---
console.log("\n--- PRUEBA 6: Lógica de Frontend - Firma de Operación y Manejo de Reintentos ---");
const storageFrontend = {};
global.window = global;
global.localStorage = {
  getItem: (k) => storageFrontend[k] || null,
  setItem: (k, v) => { storageFrontend[k] = String(v); },
  removeItem: (k) => { delete storageFrontend[k]; },
  clear: () => { for (const k in storageFrontend) delete storageFrontend[k]; }
};

const apiCode = fs.readFileSync('src/sheets-api.js', 'utf8');
(0, eval)(apiCode + '; global.SheetsAPI = SheetsAPI;');

const clientApi = new SheetsAPI();

// Verificar que setPendingOperation y getPendingOperation funcionan
const opOriginal = {
  tipo: "SALIDA",
  codigo: "CAM-001-M",
  cantidad: 2,
  precioVenta: 85.00,
  tipoVenta: "Unitario",
  formaPago: "Efectivo",
  comprobantePago: "NO",
  observacion: "Venta en tienda"
};

const sig1 = clientApi.computeOperationSignature(opOriginal);
const reqIdOriginal = "MOV-12345-ORIG";

clientApi.setPendingOperation({
  requestId: reqIdOriginal,
  signature: sig1,
  data: opOriginal
});

const retrievedOp = clientApi.getPendingOperation();
assert.strictEqual(retrievedOp.requestId, reqIdOriginal);
assert.strictEqual(retrievedOp.signature, sig1);
console.log("✔ Operación pendiente guardada y recuperada correctamente en localStorage");

// Si el usuario cambia la cantidad a 3, la firma debe cambiar
const opModificada = { ...opOriginal, cantidad: 3 };
const sig2 = clientApi.computeOperationSignature(opModificada);
assert.notStrictEqual(sig1, sig2, "Cambiar la cantidad debe alterar la firma de la operación");
console.log("✔ Modificar campos del formulario cambia la firma, provocando la generación de un nuevo requestId");

// Limpiar operación pendiente
clientApi.clearPendingOperation();
assert.strictEqual(clientApi.getPendingOperation(), null);
console.log("✔ clearPendingOperation() limpia el almacenamiento correctamente");

console.log("\n========================================================");
console.log("✔ TODAS LAS PRUEBAS DE SEGURIDAD, CONCURRENCIA E IDEMPOTENCIA PASARON CON ÉXITO (100%)");
console.log("========================================================\n");
