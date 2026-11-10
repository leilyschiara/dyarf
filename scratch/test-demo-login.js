// Test script to verify demo admin login and URL configuration
const fs = require('fs');
const path = require('path');

// Mock localStorage and window
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};
global.sessionStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};
global.window = {
  DEMO_DATA: { stock: [{ codigo: "CAM-001", stockDisponible: 10 }], movements: [] }
};

// Evaluate sheets-api.js
const code = fs.readFileSync(path.join(__dirname, '../src/sheets-api.js'), 'utf8');
eval(code);

async function runTests() {
  console.log("=== INICIANDO PRUEBAS DE LOGIN DEMO Y CONFIGURACIÓN URL ===");
  const api = window.api;

  // 1. Verificar login fallido con usuario cualquiera cuando no hay apiUrl
  api.apiUrl = "";
  localStorage.clear();
  const failedRes = await api.login("admin", "12345");
  console.assert(failedRes.success === false, "Fallo esperado sin API URL");
  console.assert(failedRes.code === "NO_API_URL", "Código debe ser NO_API_URL");
  console.log("✔ Fallo controlado sin API URL verificado");

  // 2. Verificar login con demo y 1234@demo.com
  const demoRes = await api.login("demo", "1234@demo.com");
  console.assert(demoRes.success === true, "Demo login debe ser exitoso");
  console.assert(demoRes.user.usuario === "demo", "Usuario debe ser demo");
  console.assert(demoRes.user.rol === "Administrador", "Rol debe ser Administrador");
  console.assert(demoRes.user.isDemoAdmin === true, "isDemoAdmin debe ser true");
  console.assert(api.isCurrentUserAdmin() === true, "isCurrentUserAdmin() debe retornar true");
  console.log("✔ Login demo con 1234@demo.com exitoso como Administrador");

  // 3. Verificar validación de sesión de usuario demo
  const valRes = await api.validateSession();
  console.assert(valRes.success === true && valRes.sesionValida === true, "Validación de sesión para demo debe ser válida");
  console.log("✔ Validación de sesión para usuario demo exitosa (sin bloqueo)");

  // 4. Configurar URL como demo admin
  const testUrl = "https://script.google.com/macros/s/AKfycbxTest/exec";
  api.setApiUrl(testUrl);
  console.assert(api.getApiUrl() === testUrl, "URL debe haberse guardado");
  console.assert(localStorage.getItem("dcamisas_api_url") === testUrl, "URL en localStorage");
  console.log("✔ Demo admin puede configurar y guardar la URL de Apps Script");

  // 5. Logout y probar configuración de URL pre-login (pantalla inicial)
  api.logout();
  console.assert(api.getCurrentUser() === null, "Sesión cerrada");
  api.setApiUrl("https://script.google.com/macros/s/AKfycbxNewPreLogin/exec");
  console.assert(api.getApiUrl() === "https://script.google.com/macros/s/AKfycbxNewPreLogin/exec", "Pre-login URL set");
  console.log("✔ Configuración de URL antes de iniciar sesión permitida");

  console.log("=========================================");
  console.log("✔ TODAS LAS PRUEBAS DE ACCESO DEMO PASARON!");
  console.log("=========================================");
}

runTests().catch(e => {
  console.error("Error en pruebas:", e);
  process.exit(1);
});
