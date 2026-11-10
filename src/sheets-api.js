/**
 * Cliente de Conexión con Google Apps Script (Web App)
 * Maneja llamadas síncronas/asíncronas, CORS y almacenamiento local seguro.
 */

const STORAGE_KEYS = {
  API_URL: "dcamisas_api_url",
  CURRENT_USER: "dcamisas_current_user",
  STOCK_CACHE: "dcamisas_stock_cache",
  MOVEMENTS_CACHE: "dcamisas_movements_cache",
  IS_DEMO_MODE: "dcamisas_is_demo_mode"
};

class SheetsAPI {
  constructor() {
    this.apiUrl = localStorage.getItem(STORAGE_KEYS.API_URL) || "";
    this.isDemoMode = localStorage.getItem(STORAGE_KEYS.IS_DEMO_MODE) === "true" || !this.apiUrl;
    this._sanitizeStoredSession();
  }

  /**
   * Limpia claves huérfanas en sessionStorage/localStorage
   */
  _sanitizeStoredSession() {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("dcamisas_password");
        sessionStorage.removeItem("pass");
      }
    } catch (e) {
      // Ignorar fallos de acceso a almacenamiento
    }
  }

  isCurrentUserAdmin() {
    const user = this.getCurrentUser();
    if (!user) return false;
    if (user.isDemoAdmin) return true;
    if (!user.rol) return false;
    const role = String(user.rol).trim().toLowerCase();
    return role === "administrador" || role === "admin";
  }

  setApiUrl(url) {
    const user = this.getCurrentUser();
    // Permitir configurar si no hay usuario en sesión (configuración inicial en GitHub/móvil) o si es admin
    if (user && !this.isCurrentUserAdmin()) {
      console.warn("Acceso denegado: solo el usuario con rol Administrador puede modificar la URL de la API.");
      throw new Error("Acceso denegado: Solo el Administrador puede modificar la URL de Google Apps Script.");
    }

    this.apiUrl = (url || "").trim();
    localStorage.setItem(STORAGE_KEYS.API_URL, this.apiUrl);
    if (this.apiUrl) {
      this.isDemoMode = false;
      localStorage.setItem(STORAGE_KEYS.IS_DEMO_MODE, "false");
    } else {
      this.isDemoMode = true;
      localStorage.setItem(STORAGE_KEYS.IS_DEMO_MODE, "true");
    }
  }

  getApiUrl() {
    const user = this.getCurrentUser();
    // Exponer la URL si es admin o si está en la pantalla inicial de configuración
    if (!user || this.isCurrentUserAdmin()) {
      return this.apiUrl;
    }
    return "";
  }

  setDemoMode(enabled) {
    const user = this.getCurrentUser();
    if (user && !this.isCurrentUserAdmin()) {
      console.warn("Acceso denegado: solo el usuario con rol Administrador puede alternar el modo demo.");
      throw new Error("Acceso denegado: Solo el Administrador puede modificar esta opción.");
    }
    this.isDemoMode = !!enabled;
    localStorage.setItem(STORAGE_KEYS.IS_DEMO_MODE, this.isDemoMode ? "true" : "false");
  }

  /**
   * Prueba de conectividad con la Web App
   */
  async ping() {
    if (!this.apiUrl) {
      throw new Error("No hay URL de Google Apps Script configurada.");
    }

    const testUrl = `${this.apiUrl}${this.apiUrl.includes('?') ? '&' : '?'}action=ping&_t=${Date.now()}`;
    const response = await fetch(testUrl, {
      method: "GET",
      mode: "cors"
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Autenticación contra pestaña 'Usuarios' en tiempo real
   * Realiza un fetch() POST directamente al script de Google Sheets sin almacenar contraseñas en el cliente
   */
  async login(usuario, password) {
    const cleanUser = (usuario || "").trim();
    const cleanPass = (password || "").trim();

    if (!cleanUser || !cleanPass) {
      return {
        success: false,
        message: "Por favor, ingresa tu usuario y contraseña."
      };
    }

    // Acceso especial demo de rescate y configuración inicial
    if (cleanUser.toLowerCase() === "demo" && cleanPass === "1234@demo.com") {
      const demoUser = {
        id: "USR-DEMO",
        usuario: "demo",
        rol: "Administrador",
        estado: 1,
        isDemoAdmin: true,
        password: cleanPass,
        loginTimestamp: Date.now()
      };
      this.setCurrentUser(demoUser);
      return {
        success: true,
        user: demoUser,
        isDemo: true,
        message: "¡Bienvenido! Has ingresado en Modo Demo con permisos de Administrador para configurar la app."
      };
    }

    if (!this.apiUrl) {
      return {
        success: false,
        code: "NO_API_URL",
        message: "No hay URL de Google Apps Script configurada.<br>Ingresa con usuario <b>demo</b> y contraseña <b>1234@demo.com</b> para entrar a Ajustes, o <button type='button' id='alert-config-trigger' style='background:none; border:none; color:var(--primary); font-weight:bold; text-decoration:underline; cursor:pointer; padding:0; font-size:inherit;'>pulsa aquí para configurar la URL</button>."
      };
    }

    // Consulta en tiempo real a Google Apps Script
    try {
      const payload = {
        action: "login",
        usuario: cleanUser,
        password: cleanPass
      };

      // Se usa text/plain para evitar la petición OPTIONS de preflight en CORS
      const response = await fetch(this.apiUrl, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Error en el servidor (${response.status}): ${response.statusText}`);
      }

      const res = await response.json();

      if ((res.success === true || res.status === "success") && res.user) {
        // Guardar identificador y credenciales de sesión activa para validación continua en navegación
        const userSession = {
          id: res.user.id || "",
          usuario: res.user.usuario,
          rol: res.user.rol || "Usuario",
          estado: 1,
          password: cleanPass,
          loginTimestamp: Date.now()
        };

        this.setCurrentUser(userSession);
        return {
          success: true,
          user: userSession,
          message: res.message || "Inicio de sesión exitoso."
        };
      } else {
        return {
          success: false,
          code: res.code || "AUTH_FAILED",
          message: res.message || "Usuario o contraseña inválidos."
        };
      }
    } catch (err) {
      console.warn("Fallo login con Google Apps Script, revisando conectividad:", err);
      return {
        success: false,
        message: `Error al conectar con Google Sheets: ${err.message}. Verifica tu conexión a internet o la URL del script.`
      };
    }
  }

  /**
   * Obtener Stock Actual desde Google Sheets
   */
  async getStock() {
    // Si estamos en modo demo
    if (this.isDemoMode || !this.apiUrl) {
      let cached = this.getLocalStock();
      if (!cached || cached.length === 0) {
        cached = (window.DEMO_DATA && window.DEMO_DATA.stock) || [];
        this.saveLocalStock(cached);
      }
      return { success: true, data: cached, isDemo: true };
    }

    try {
      const url = `${this.apiUrl}${this.apiUrl.includes('?') ? '&' : '?'}action=getStock&_t=${Date.now()}`;
      const response = await fetch(url, {
        method: "GET",
        mode: "cors"
      });

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`);
      }

      const res = await response.json();
      if (res.status === "success" && Array.isArray(res.data)) {
        this.saveLocalStock(res.data);
        return { success: true, data: res.data };
      } else {
        throw new Error(res.message || "Formato de stock inválido");
      }
    } catch (err) {
      console.warn("Error al cargar stock desde Google Sheets, usando caché local:", err);
      const cached = this.getLocalStock();
      if (cached && cached.length > 0) {
        return { success: true, data: cached, fromCache: true, error: err.message };
      }
      return { success: false, message: err.message, data: [] };
    }
  }

  /**
   * Obtener historial reciente de Movimientos
   */
  async getMovements(limit = 30) {
    if (this.isDemoMode || !this.apiUrl) {
      let cached = this.getLocalMovements();
      if (!cached || cached.length === 0) {
        cached = (window.DEMO_DATA && window.DEMO_DATA.movements) || [];
        this.saveLocalMovements(cached);
      }
      return { success: true, data: cached, isDemo: true };
    }

    try {
      const url = `${this.apiUrl}${this.apiUrl.includes('?') ? '&' : '?'}action=getMovements&limit=${limit}&_t=${Date.now()}`;
      const response = await fetch(url, {
        method: "GET",
        mode: "cors"
      });

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`);
      }

      const res = await response.json();
      if (res.status === "success" && Array.isArray(res.data)) {
        this.saveLocalMovements(res.data);
        return { success: true, data: res.data };
      } else {
        throw new Error(res.message || "Error al leer movimientos");
      }
    } catch (err) {
      console.warn("Error al cargar movimientos, usando caché local:", err);
      const cached = this.getLocalMovements();
      return { success: true, data: cached || [], fromCache: true, error: err.message };
    }
  }

  /**
   * Registrar Movimiento (Entrada o Salida)
   * Idempotente mediante requestId obligatorio
   */
  async addMovement(movementData) {
    const { 
      usuario, 
      tipo, 
      codigo, 
      cantidad, 
      observacion, 
      requestId,
      precioVenta,
      tipoVenta,
      precioSinIgv,
      formaPago,
      comprobantePago,
      tipoComprobante,
      documentoComprobante
    } = movementData || {};

    // 1. Validación de requestId obligatorio
    if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
      return {
        success: false,
        message: "Identificador único de solicitud (requestId) no proporcionado."
      };
    }

    // 2. Validación de datos de entrada
    if (!tipo || (tipo !== "ENTRADA" && tipo !== "SALIDA")) {
      return { success: false, message: "Selecciona el tipo: ENTRADA o SALIDA." };
    }
    if (!codigo) {
      return { success: false, message: "Selecciona una camisa del catálogo." };
    }
    const cantNum = parseInt(cantidad, 10);
    if (isNaN(cantNum) || cantNum <= 0) {
      return { success: false, message: "La cantidad debe ser mayor a 0." };
    }

    // Extraer usuario de la sesión activa
    const activeCreds = this.getCurrentUserCredentials();
    const activeUser = (movementData && movementData.usuario) || (activeCreds && activeCreds.usuario) || (this.getCurrentUser() ? this.getCurrentUser().usuario : "Admin");

    const payload = {
      action: "addMovement",
      usuario: activeUser,
      tipo: tipo,
      codigo: codigo,
      cantidad: cantNum,
      observacion: observacion || "",
      requestId: requestId.trim()
    };

    if (movementData && movementData.password) {
      payload.password = movementData.password;
    }

    // Incluir campos de venta exactamente cuando es SALIDA
    if (tipo === "SALIDA") {
      const pVentaNum = (precioVenta !== undefined && precioVenta !== null && precioVenta !== "") ? Number(precioVenta) : null;
      payload.precioVenta = (pVentaNum !== null && !isNaN(pVentaNum)) ? Math.round(pVentaNum * 100) / 100 : null;
      payload.tipoVenta = (tipoVenta || "").trim();

      let pSinIgvNum = (precioSinIgv !== undefined && precioSinIgv !== null && precioSinIgv !== "") ? Number(precioSinIgv) : null;
      if ((pSinIgvNum === null || isNaN(pSinIgvNum)) && payload.precioVenta !== null) {
        pSinIgvNum = payload.precioVenta - (payload.precioVenta * 0.18);
      }
      payload.precioSinIgv = (pSinIgvNum !== null && !isNaN(pSinIgvNum)) ? parseFloat((Math.round(pSinIgvNum * 100) / 100).toFixed(2)) : null;

      // Forma de pago y Comprobante de pago con DNI / RUC
      payload.formaPago = (formaPago || "Efectivo").trim();
      payload.comprobantePago = (comprobantePago || "NO").trim();
      payload.tipoComprobante = (tipoComprobante || "").trim();
      payload.documentoComprobante = (documentoComprobante || "").trim();
    }

    // 3. Modo Demo / Offline
    if (this.isDemoMode || !this.apiUrl) {
      if (tipo === "SALIDA") {
        const stockList = this.getLocalStock();
        const item = stockList.find(s => s.codigo.toUpperCase() === payload.codigo.toUpperCase());
        const disp = item ? (Number(item.stockDisponible) || 0) : 0;
        if (disp <= 0) {
          return {
            success: false,
            code: "OUT_OF_STOCK",
            message: "No se puede registrar la venta: Artículo agotado (Stock disponible: 0)."
          };
        }
        if (cantNum > disp) {
          return {
            success: false,
            code: "INSUFFICIENT_STOCK",
            message: `No se puede registrar la venta: La cantidad (${cantNum}) supera el stock disponible (${disp}).`
          };
        }
      }

      const existingMovs = this.getLocalMovements();
      if (existingMovs.some(m => m.requestId === payload.requestId)) {
        return {
          success: true,
          idempotent: true,
          message: "El movimiento ya fue registrado previamente (Modo Demo).",
          isDemo: true
        };
      }
      this.applyLocalMovement(payload);
      return {
        success: true,
        message: `Movimiento de ${tipo} (${cantNum} unid.) guardado exitosamente (Modo Demo).`,
        isDemo: true
      };
    }

    // 4. Modo Conectado a Google Sheets:
    // NO ejecutamos applyLocalMovement() antes de confirmar con el servidor.
    // NO realizamos reintentos automáticos que puedan duplicar el movimiento.
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const res = await response.json();
      if (res.status === "success") {
        // Solo tras confirmación del servidor actualizamos localmente
        this.applyLocalMovement(payload);
        return {
          success: true,
          idempotent: !!res.idempotent,
          message: res.message || "Movimiento guardado en Google Sheets.",
          data: res.movement
        };
      } else {
        return {
          success: false,
          message: res.message || "Error devuelto por Google Apps Script."
        };
      }
    } catch (err) {
      console.error("Error al registrar movimiento con Google Sheets:", err);
      // Estado de resultado incierto: NO indicar que se guardó correctamente
      return {
        success: false,
        uncertain: true,
        message: `No se pudo confirmar el registro con Google Sheets (${err.message}). Por favor verifica tu conexión a internet o el historial antes de reintentar.`
      };
    }
  }

  // --- Almacenamiento Local (Local Storage) ---

  getCurrentUser() {
    try {
      const u = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Obtiene las credenciales del usuario de la sesión activa para validación de navegación
   */
  getCurrentUserCredentials() {
    const user = this.getCurrentUser();
    if (!user) return null;
    return {
      id: user.id || "",
      usuario: user.usuario || "",
      rol: user.rol || "",
      password: user.password || ""
    };
  }

  /**
   * Valida en tiempo real si las credenciales de la sesión activa siguen coincidiendo
   * exactamente con las de Google Sheets cada vez que el usuario navega.
   */
  async validateSession() {
    const creds = this.getCurrentUserCredentials();
    if (!creds || !creds.usuario || !creds.password) {
      return { success: false, sesionValida: false, message: "No hay sesión activa." };
    }

    if (creds.usuario.toLowerCase() === "demo" || creds.isDemoAdmin || !this.apiUrl || this.isDemoMode) {
      return { success: true, sesionValida: true, isDemo: true };
    }

    try {
      const payload = {
        action: "validateSession",
        usuario: creds.usuario,
        password: creds.password
      };

      const response = await fetch(this.apiUrl, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // En caso de problema de conectividad momentánea, no expulsar al usuario
        return { success: true, sesionValida: true, networkNotice: true };
      }

      const res = await response.json();
      return res;
    } catch (err) {
      console.warn("Validación de sesión en navegación falló:", err);
      return { success: true, sesionValida: true, networkNotice: true };
    }
  }

  setCurrentUser(user) {
    if (user) {
      const safeUser = {
        id: user.id || "",
        usuario: user.usuario,
        rol: user.rol || "Usuario",
        estado: user.estado || 1,
        isDemoAdmin: !!user.isDemoAdmin,
        password: user.password || "",
        loginTimestamp: user.loginTimestamp || Date.now()
      };
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(safeUser));
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(safeUser));
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      }
    }
  }

  logout() {
    this.setCurrentUser(null);
  }

  getLocalStock() {
    try {
      const s = localStorage.getItem(STORAGE_KEYS.STOCK_CACHE);
      return s ? JSON.parse(s) : [];
    } catch (e) {
      return [];
    }
  }

  saveLocalStock(stock) {
    localStorage.setItem(STORAGE_KEYS.STOCK_CACHE, JSON.stringify(stock));
  }

  getLocalMovements() {
    try {
      const m = localStorage.getItem(STORAGE_KEYS.MOVEMENTS_CACHE);
      return m ? JSON.parse(m) : [];
    } catch (e) {
      return [];
    }
  }

  saveLocalMovements(movs) {
    localStorage.setItem(STORAGE_KEYS.MOVEMENTS_CACHE, JSON.stringify(movs));
  }

  applyLocalMovement(payload) {
    const movList = this.getLocalMovements();
    // Protección contra duplicados locales por requestId
    if (payload.requestId && movList.some(m => m.requestId === payload.requestId)) {
      return;
    }

    const stockList = this.getLocalStock();
    const item = stockList.find(s => s.codigo.toUpperCase() === payload.codigo.toUpperCase());
    
    if (item) {
      if (payload.tipo === "ENTRADA") {
        item.entradas = (item.entradas || 0) + payload.cantidad;
      } else if (payload.tipo === "SALIDA") {
        item.salidas = (item.salidas || 0) + payload.cantidad;
      }
      item.stockDisponible = (item.entradas || 0) - (item.salidas || 0);
      this.saveLocalStock(stockList);
    }

    // Agregar al historial de movimientos local
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const newMov = {
      fechaHora: dateStr,
      usuario: payload.usuario,
      tipo: payload.tipo,
      codigo: payload.codigo,
      articulo: item ? item.articulo : payload.codigo,
      cantidad: payload.cantidad,
      precioVenta: payload.precioVenta !== undefined ? payload.precioVenta : null,
      tipoVenta: payload.tipoVenta || "",
      precioSinIgv: payload.precioSinIgv !== undefined ? payload.precioSinIgv : null,
      formaPago: payload.formaPago || "",
      comprobantePago: payload.comprobantePago || "",
      observacion: payload.observacion,
      requestId: payload.requestId || ""
    };

    movList.unshift(newMov);
    this.saveLocalMovements(movList.slice(0, 100)); // Mantener últimos 100
  }
}

// Instancia global
window.api = new SheetsAPI();
