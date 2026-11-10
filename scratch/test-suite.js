/**
 * Test Suite para verificación de seguridad y minificación
 */

const fs = require('fs');
const assert = require('assert');

console.log("=== INICIANDO PRUEBAS DE SEGURIDAD Y FRONTEND ===");

// 1. Simulación de Backend Apps Script
function setupGasEnvironment() {
  const usersSheetData = [
    ["ID", "USUARIO", "CONTRASEÑA", "ROL", "ESTADO"],
    ["USR-1", "admin", "1111", "Administrador", 1],
    ["USR-2", "empleado", "2222", "Vendedor", 0], // Inactivo
    ["USR-3", "mayte", "3333", "Vendedor", "ACTIVO"]
  ];

  const stockSheetData = [
    ["CÓDIGO", "ARTÍCULO", "TALLA", "ENTRADAS", "SALIDAS", "STOCK DISPONIBLE", "PRECIO"],
    ["C001-M", "Camisa Blanca", "M", 20, 5, 15, 65]
  ];

  const movementsSheetData = [
    ["ID", "FECHA", "USUARIO", "TIPO", "CÓDIGO", "CANTIDAD", "OBSERVACIÓN", "REQUEST_ID", "PRECIO_VENTA", "TIPO_VENTA", "PRECIO_SIN_IGV", "FORMA_PAGO", "COMPROBANTE_PAGO"]
  ];

  const mockSheets = {
    "Usuarios": {
      getDataRange: () => ({
        getValues: () => usersSheetData
      })
    },
    "Stock_Actual": {
      getDataRange: () => ({
        getValues: () => stockSheetData
      }),
      appendRow: (row) => stockSheetData.push(row),
      getRange: () => ({
        setValue: () => {},
        getFormula: () => ""
      })
    },
    "Movimientos": {
      getDataRange: () => ({
        getValues: () => movementsSheetData
      }),
      appendRow: (row) => movementsSheetData.push(row)
    }
  };

  const mockSpreadsheet = {
    getSheetByName: (name) => mockSheets[name] || null
  };

  const mockLock = {
    tryLock: () => true,
    releaseLock: () => {}
  };

  // Global Mocks
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => mockSpreadsheet,
    flush: () => {}
  };
  global.LockService = {
    getScriptLock: () => mockLock
  };
  global.Logger = {
    log: () => {}
  };
  global.SHEETS = {
    USERS: "Usuarios",
    STOCK: "Stock_Actual",
    MOVEMENTS: "Movimientos"
  };
  global.Utilities = {
    formatDate: () => "09/11/2026 22:30:00"
  };
  global.Session = {
    getScriptTimeZone: () => "GMT-5"
  };

  // Cargar funciones de Codigo.gs en global
  const gsCode = fs.readFileSync('google-apps-script/Codigo.gs', 'utf8');
  (0, eval)(gsCode);
}

setupGasEnvironment();

// Prueba 1.1: Rechazo si no se envían credenciales
const resNoCreds = handleAddMovement({
  tipo: "ENTRADA",
  codigo: "C001-M",
  cantidad: 2,
  requestId: "REQ-001"
});
assert.strictEqual(resNoCreds.status, "error");
assert.strictEqual(resNoCreds.code, "AUTH_REQUIRED");
console.log("✔ Backend: Rechazo correcto cuando no hay credenciales (AUTH_REQUIRED)");

// Prueba 1.2: Rechazo si las credenciales son incorrectas
const resBadPass = handleAddMovement({
  usuario: "admin",
  password: "password_falsa",
  tipo: "ENTRADA",
  codigo: "C001-M",
  cantidad: 2,
  requestId: "REQ-002"
});
assert.strictEqual(resBadPass.status, "error");
assert.strictEqual(resBadPass.code, "INVALID_PASSWORD");
console.log("✔ Backend: Rechazo correcto con contraseña incorrecta (INVALID_PASSWORD)");

// Prueba 1.3: Rechazo si el usuario está inactivo (estado: 0)
const resInactive = handleAddMovement({
  usuario: "empleado",
  password: "2222",
  tipo: "ENTRADA",
  codigo: "C001-M",
  cantidad: 2,
  requestId: "REQ-003"
});
assert.strictEqual(resInactive.status, "error");
assert.strictEqual(resInactive.code, "USER_INACTIVE");
console.log("✔ Backend: Rechazo correcto con usuario inactivo (USER_INACTIVE)");

// Prueba 1.4: Éxito con credenciales válidas
const resSuccess = handleAddMovement({
  usuario: "admin",
  password: "1111",
  tipo: "ENTRADA",
  codigo: "C001-M",
  cantidad: 5,
  requestId: "REQ-004",
  observacion: "Ingreso de mercadería"
});
assert.strictEqual(resSuccess.status, "success");
console.log("✔ Backend: Éxito correcto con credenciales válidas de admin");

// 2. Verificación de sheets-api.js en Frontend
console.log("\n=== PRUEBAS DE SHEETS-API Y SESIÓN FRONTEND ===");

// Mock localStorage para Node.js
const storage = {};
global.window = global;
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { for (const k in storage) delete storage[k]; }
};

// Mock DEMO_DATA
const demoCode = fs.readFileSync('src/data-demo.js', 'utf8');
eval(demoCode);

// Cargar sheets-api.js
const apiCode = fs.readFileSync('src/sheets-api.js', 'utf8');
(0, eval)(apiCode + '; global.SheetsAPI = SheetsAPI;');

const api = new SheetsAPI();

// Prueba 2.1: Login guarda password en la sesión
(async () => {
  const loginRes = await api.login("admin", "1111");
  assert.strictEqual(loginRes.success, true);
  assert.strictEqual(loginRes.user.usuario, "admin");
  assert.strictEqual(loginRes.user.password, "1111");

  const creds = api.getCurrentUserCredentials();
  assert.strictEqual(creds.usuario, "admin");
  assert.strictEqual(creds.password, "1111");
  console.log("✔ Frontend: Login guarda password en la sesión y getCurrentUserCredentials() lo recupera");

  // Prueba 2.2: addMovement usa credenciales de la sesión activa
  let sentPayload = null;
  // Mock fetch para interceptar payload
  global.fetch = async (url, opts) => {
    sentPayload = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ status: "success", message: "Movimiento registrado" })
    };
  };

  // Simular modo conectado
  api.isDemoMode = false;
  api.apiUrl = "https://script.google.com/macros/s/TEST/exec";

  await api.addMovement({
    tipo: "SALIDA",
    codigo: "CAI-001-M",
    cantidad: 1,
    requestId: "REQ-TEST-001",
    precioVenta: 65,
    tipoVenta: "Unitario",
    formaPago: "Yape",
    comprobantePago: "SI",
    tipoComprobante: "Boleta",
    documentoComprobante: "12345678"
  });

  assert(sentPayload !== null, "El payload debe haber sido enviado a fetch");
  assert.strictEqual(sentPayload.usuario, "admin");
  assert.strictEqual(sentPayload.password, "1111");
  assert.strictEqual(sentPayload.formaPago, "Yape");
  assert.strictEqual(sentPayload.tipoComprobante, "Boleta");
  assert.strictEqual(sentPayload.documentoComprobante, "12345678");
  console.log("✔ Frontend: addMovement() envía siempre usuario y password validados en el payload POST");

  // Prueba 2.3: Verificación con archivos MINIFICADOS (public/ y src/)
  console.log("\n=== PRUEBAS DE ARCHIVOS MINIFICADOS (PRODUCCIÓN / APK) ===");
  const minApiCode = fs.readFileSync('src/sheets-api.min.js', 'utf8');
  (0, eval)(minApiCode + '; global.SheetsAPIMin = SheetsAPI;');
  const minApi = new SheetsAPIMin();
  minApi.isDemoMode = false;
  minApi.apiUrl = "https://script.google.com/macros/s/TEST/exec";

  let sentPayloadMin = null;
  global.fetch = async (url, opts) => {
    sentPayloadMin = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ status: "success", message: "OK" })
    };
  };

  await minApi.addMovement({
    tipo: "ENTRADA",
    codigo: "C001-M",
    cantidad: 10,
    requestId: "REQ-MIN-001"
  });

  assert(sentPayloadMin !== null, "El payload minificado debe enviarse a fetch");
  assert.strictEqual(sentPayloadMin.usuario, "admin");
  assert.strictEqual(sentPayloadMin.password, "1111");
  console.log("✔ Frontend Minificado: sheets-api.min.js ejecuta sin errores y preserva credenciales de sesión");

  console.log("\n=========================================");
  console.log("✔ TODAS LAS PRUEBAS PASARON EXITOSAMENTE!");
  console.log("=========================================");
})();
