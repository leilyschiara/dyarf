/**
 * Test Suite para verificación de validación de sesión en eventos de navegación
 */

const fs = require('fs');
const assert = require('assert');

console.log("=== INICIANDO PRUEBAS DE VALIDACIÓN DE SESIÓN (GAS) ===");

let usersSheetData = [
  ["ID", "USUARIO", "CONTRASEÑA", "ROL", "ESTADO"],
  ["USR-1", "admin", "clave_original", "Administrador", 1],
  ["USR-2", "empleado", "2222", "Vendedor", 0]
];

const mockSheets = {
  "Usuarios": {
    getDataRange: () => ({
      getValues: () => usersSheetData
    }),
    getLastRow: () => usersSheetData.length,
    getLastColumn: () => usersSheetData[0].length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => usersSheetData.slice(r - 1, r - 1 + nr)
    })
  }
};

const mockSpreadsheet = {
  getSheetByName: (name) => mockSheets[name] || null
};

const mockLock = {
  tryLock: () => true,
  releaseLock: () => {}
};

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
  USERS: "Usuarios"
};

// Cargar funciones de Codigo.gs
const gsCode = fs.readFileSync('google-apps-script/Codigo.gs', 'utf8');
(0, eval)(gsCode);

// Prueba 1.1: Sesión válida mientras la contraseña coincida
const resValido = handleValidateSession("admin", "clave_original");
assert.strictEqual(resValido.success, true);
assert.strictEqual(resValido.sesionValida, true);
console.log("✔ Backend: Sesión validada exitosamente con contraseña actual");

// Prueba 1.2: Cambio de contraseña en Google Sheets a 'clave_nueva_2026'
console.log("\nSimulando cambio de contraseña en Google Sheets a 'clave_nueva_2026'...");
usersSheetData[1][2] = "clave_nueva_2026";

// Validación con la clave antigua en sesión -> DEBE FALLAR con PASSWORD_CHANGED
const resInvalido = handleValidateSession("admin", "clave_original");
assert.strictEqual(resInvalido.success, false);
assert.strictEqual(resInvalido.sesionValida, false);
assert.strictEqual(resInvalido.code, "PASSWORD_CHANGED");
assert.strictEqual(resInvalido.message, "Tu contraseña ha cambiado. Por favor, inicia sesión de nuevo.");
console.log("✔ Backend: Contraseña cambiada detectada al instante con PASSWORD_CHANGED y sesionValida: false");

// Prueba 1.3: Con la nueva clave -> vuelve a ser válida
const resConNueva = handleValidateSession("admin", "clave_nueva_2026");
assert.strictEqual(resConNueva.success, true);
assert.strictEqual(resConNueva.sesionValida, true);
console.log("✔ Backend: Nueva contraseña validada correctamente");

// Prueba 2: Frontend (SheetsAPI.validateSession)
console.log("\n=== PRUEBAS DE FRONTEND (VALIDATE SESSION EN NAVEGACIÓN) ===");

const storage = {};
global.window = global;
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { for (const k in storage) delete storage[k]; }
};

const apiCode = fs.readFileSync('src/sheets-api.js', 'utf8');
(0, eval)(apiCode + '; global.SheetsAPI = SheetsAPI;');

const api = new SheetsAPI();
api.apiUrl = "https://script.google.com/macros/s/TEST/exec";
api.isDemoMode = false;

// Mock login previo
api.setCurrentUser({
  id: "USR-1",
  usuario: "admin",
  rol: "Administrador",
  estado: 1,
  password: "clave_original"
});

// Mock fetch respondiendo cambio de contraseña
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  if (body.action === "validateSession") {
    if (body.password === "clave_original") {
      // Simula que en Google Sheets cambió
      return {
        ok: true,
        json: async () => ({
          success: false,
          sesionValida: false,
          code: "PASSWORD_CHANGED",
          message: "Tu contraseña ha cambiado. Por favor, inicia sesión de nuevo."
        })
      };
    }
  }
  return { ok: true, json: async () => ({ success: true, sesionValida: true }) };
};

(async () => {
  const check = await api.validateSession();
  assert.strictEqual(check.success, false);
  assert.strictEqual(check.sesionValida, false);
  assert.strictEqual(check.message, "Tu contraseña ha cambiado. Por favor, inicia sesión de nuevo.");
  console.log("✔ Frontend: validateSession() detecta cambio de contraseña y retorna sesionValida: false");

  console.log("\n=========================================");
  console.log("✔ TODAS LAS PRUEBAS PASARON EXITOSAMENTE!");
  console.log("=========================================");
})();
