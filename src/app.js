/**
 * D'CAMISAS - Lógica de Aplicación Móvil
 */

// Estado global de la aplicación
const AppState = {
  user: null,
  activeTab: "dashboard",
  stock: [],
  movements: [],
  statsPeriod: "HOY",
  statsFilter: {
    dia: String(new Date().getDate()).padStart(2, "0"),
    mes: String(new Date().getMonth()),
    anio: String(new Date().getFullYear())
  },
  lastSyncTime: 0,
  filterSize: "ALL",
  filterAvailability: "ALL",
  searchQuery: "",
  isLoading: false,
  isSubmittingMovement: false,
  movementForm: {
    tipo: "SALIDA",
    codigo: "",
    selectedArticulo: "",
    selectedSize: "",
    cantidad: 1,
    precioVenta: "",
    tipoVenta: "Unitario",
    precioSinIgv: "",
    formaPago: "Efectivo",
    comprobantePago: "NO",
    tipoComprobante: "Boleta",
    documentoComprobante: "",
    observacion: "Venta en tienda",
    observacionSalida: "Venta en tienda",
    observacionEntrada: "Ingreso de mercadería"
  }
};

// Inicialización cuando el DOM está listo
document.addEventListener("DOMContentLoaded", () => {
  initLogo();
  initAuth();
  bindGlobalEvents();
});

/**
 * Carga e inyecta el logo en alta resolución
 */
function initLogo() {
  const logoSrc = window.BRAND_LOGO || "assets/logo.jpg";
  const loginLogoEl = document.getElementById("login-logo-img");
  const headerLogoEl = document.getElementById("header-logo-img");

  if (loginLogoEl) loginLogoEl.src = logoSrc;
  if (headerLogoEl) headerLogoEl.src = logoSrc;
}

/**
 * Manejo de sesión y arranque
 */
function initAuth() {
  const savedUser = window.api.getCurrentUser();
  if (savedUser) {
    AppState.user = savedUser;
    showMainApp();
    loadAppData();
  } else {
    showLoginView();
  }
}

/**
 * Enlazar eventos de botones e inputs
 */
function bindGlobalEvents() {
  // Formulario Login
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  // Toggle visibilidad contraseña
  const togglePassBtn = document.getElementById("toggle-password-btn");
  if (togglePassBtn) {
    togglePassBtn.addEventListener("click", () => {
      const passInput = document.getElementById("login-password");
      const isPass = passInput.type === "password";
      passInput.type = isPass ? "text" : "password";
      togglePassBtn.innerHTML = isPass ? getEyeOffIcon() : getEyeIcon();
    });
  }

  // Configuración de API desde Login
  const configBtnLogin = document.getElementById("config-btn-login");
  if (configBtnLogin) {
    configBtnLogin.addEventListener("click", () => openSettingsModal());
  }
  const configLinkLogin = document.getElementById("config-link-login");
  if (configLinkLogin) {
    configLinkLogin.addEventListener("click", () => openSettingsModal());
  }

  // Tabs de navegación inferior
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Botón Cerrar Sesión
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (confirm("¿Deseas cerrar la sesión actual?")) {
        window.api.logout();
        AppState.user = null;
        showLoginView();
      }
    });
  }

  // Botón Sincronizar Header
  const syncBtn = document.getElementById("sync-btn");
  if (syncBtn) {
    syncBtn.addEventListener("click", () => syncAllData(true));
  }

  // Buscador de stock
  const searchInput = document.getElementById("stock-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      AppState.searchQuery = e.target.value.toLowerCase().trim();
      renderStockList();
    });
  }

  // Filtros de Talla
  document.querySelectorAll("[data-filter-size]").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("[data-filter-size]").forEach(p => p.classList.remove("active", "pink"));
      pill.classList.add("active", "pink");
      AppState.filterSize = pill.dataset.filterSize;
      renderStockList();
    });
  });

  // Filtros de Disponibilidad
  document.querySelectorAll("[data-filter-avail]").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("[data-filter-avail]").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      AppState.filterAvailability = pill.dataset.filterAvail;
      renderStockList();
    });
  });

  // Selector de Ordenamiento en Stock
  const sortSelect = document.getElementById("stock-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      AppState.stockSort = e.target.value;
      renderStockList();
    });
  }

  // Formulario de Movimiento
  const movForm = document.getElementById("movement-form");
  if (movForm) {
    movForm.addEventListener("submit", handleMovementSubmit);
  }

  // Selector Tipo Movimiento (Entrada / Salida)
  const btnEntrada = document.getElementById("btn-tipo-entrada");
  const btnSalida = document.getElementById("btn-tipo-salida");
  if (btnEntrada && btnSalida) {
    btnEntrada.addEventListener("click", () => setMovementType("ENTRADA"));
    btnSalida.addEventListener("click", () => setMovementType("SALIDA"));
  }

  // Stepper de Cantidad
  const btnMinus = document.getElementById("qty-minus");
  const btnPlus = document.getElementById("qty-plus");
  const qtyInput = document.getElementById("mov-cantidad");

  if (btnMinus && btnPlus && qtyInput) {
    btnMinus.addEventListener("click", () => {
      let val = parseInt(qtyInput.value, 10) || 1;
      if (val > 1) qtyInput.value = val - 1;
      updateStockPreview();
    });
    btnPlus.addEventListener("click", () => {
      let val = parseInt(qtyInput.value, 10) || 1;
      qtyInput.value = val + 1;
      updateStockPreview();
    });
    qtyInput.addEventListener("input", updateStockPreview);
  }

  // Chips de cantidad rápida (+1, +5, +10)
  document.querySelectorAll(".quick-qty-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const addVal = parseInt(chip.dataset.qty, 10);
      if (addVal && qtyInput) {
        qtyInput.value = addVal;
        updateStockPreview();
      }
    });
  });

  // Selector único de producto / modelo para ENTRADA y SALIDA
  const prodSelect = document.getElementById("mov-producto-select");
  if (prodSelect) {
    prodSelect.addEventListener("change", (e) => {
      handleProductChange(e.target.value);
    });
  }

  // 4 Botones de Talla (S, M, L, XL) compartidos para ENTRADA y SALIDA
  document.querySelectorAll("#mov-size-buttons .size-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const size = btn.dataset.size;
      handleSizeSelect(size);
    });
  });

  // Cálculo en tiempo real de Precio sin IGV para SALIDA
  const precioVentaInput = document.getElementById("mov-precio-venta");
  if (precioVentaInput) {
    const handlePrecioInput = () => {
      const valStr = precioVentaInput.value.trim();
      const sinIgvEl = document.getElementById("mov-precio-sin-igv");
      if (!sinIgvEl) return;
      if (valStr === "" || isNaN(Number(valStr)) || Number(valStr) < 0) {
        sinIgvEl.value = "";
      } else {
        const val = parseFloat(valStr);
        // Fórmula: Precio de venta − (Precio de venta × 0.18), redondeado a 2 decimales
        const sinIgv = val - (val * 0.18);
        sinIgvEl.value = (Math.round(sinIgv * 100) / 100).toFixed(2);
      }
    };
    precioVentaInput.addEventListener("input", handlePrecioInput);
    precioVentaInput.addEventListener("change", handlePrecioInput);
  }

  // Botones de Tipo de Venta (Unitario y Por Mayor - primer botón seleccionado por defecto)
  document.querySelectorAll("#mov-tipo-venta-buttons .option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mov-tipo-venta-buttons .option-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const hidden = document.getElementById("mov-tipo-venta");
      if (hidden) hidden.value = btn.dataset.value;
      AppState.movementForm.tipoVenta = btn.dataset.value;
    });
  });

  // Botones de Forma de Pago (Efectivo, Transferencia, Yape - Efectivo por defecto)
  document.querySelectorAll("#mov-forma-pago-buttons .option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mov-forma-pago-buttons .option-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const hidden = document.getElementById("mov-forma-pago");
      if (hidden) hidden.value = btn.dataset.value;
      AppState.movementForm.formaPago = btn.dataset.value;
    });
  });

  // Botones de Comprobante de Pago (SI y NO - NO por defecto)
  document.querySelectorAll("#mov-comprobante-pago-buttons .option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mov-comprobante-pago-buttons .option-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const val = btn.dataset.value;
      const hidden = document.getElementById("mov-comprobante-pago");
      if (hidden) hidden.value = val;
      AppState.movementForm.comprobantePago = val;

      const compGroup = document.getElementById("comprobante-detalles-group");
      if (compGroup) {
        if (val === "SI") {
          compGroup.classList.remove("hidden");
          updateComprobanteCampos();
        } else {
          compGroup.classList.add("hidden");
        }
      }
    });
  });

  // Botones de Tipo de Comprobante (Boleta o Factura - Boleta por defecto)
  document.querySelectorAll("#mov-tipo-comprobante-buttons .option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mov-tipo-comprobante-buttons .option-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const val = btn.dataset.value;
      const hidden = document.getElementById("mov-tipo-comprobante");
      if (hidden) hidden.value = val;
      AppState.movementForm.tipoComprobante = val;
      updateComprobanteCampos();
    });
  });

  // Validación exclusivamente numérica para DNI (8 dígitos) y RUC (11 dígitos)
  const dniInput = document.getElementById("mov-doc-dni");
  if (dniInput) {
    dniInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 8);
      AppState.movementForm.documentoComprobante = e.target.value;
    });
  }
  const rucInput = document.getElementById("mov-doc-ruc");
  if (rucInput) {
    rucInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 11);
      AppState.movementForm.documentoComprobante = e.target.value;
    });
  }

  // Botones de Observación en SALIDA (Venta en tienda y Venta por whatsapp)
  document.querySelectorAll("#salida-obs-buttons .option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#salida-obs-buttons .option-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const hidden = document.getElementById("mov-salida-observacion");
      if (hidden) hidden.value = btn.dataset.value;
      AppState.movementForm.observacionSalida = btn.dataset.value;
    });
  });

  // Botones de Observación en ENTRADA (Ingreso de mercadería y Devoluciones)
  document.querySelectorAll("#entrada-obs-buttons .option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#entrada-obs-buttons .option-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const hidden = document.getElementById("mov-observacion");
      if (hidden) hidden.value = btn.dataset.value;
      AppState.movementForm.observacionEntrada = btn.dataset.value;
    });
  });

  // Inicializar selector de fecha con 3 desplegables (Día, Mes, Año) en Dashboard Estadístico
  initStatsDateFilters();

  // Modal Settings
  const saveApiBtn = document.getElementById("save-api-btn");
  if (saveApiBtn) {
    saveApiBtn.addEventListener("click", handleSaveApiSettings);
  }
  const testApiBtn = document.getElementById("test-api-btn");
  if (testApiBtn) {
    testApiBtn.addEventListener("click", handleTestApiConnection);
  }
  const closeModalBtn = document.getElementById("close-settings-modal");
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => closeSettingsModal());
  }
}

/**
 * Helper para verificar si la sesión activa tiene rol Administrador
 * La validación se realiza mediante el rol real del usuario autenticado devuelto por la sesión
 */
function isAdmin() {
  const user = AppState.user || (window.api && window.api.getCurrentUser());
  if (!user) return false;
  if (user.isDemoAdmin) return true;
  if (!user.rol) return false;
  const role = String(user.rol).trim().toLowerCase();
  return role === "administrador" || role === "admin";
}

/**
 * Aplica permisos dinámicos en la interfaz según el rol real de la sesión
 */
function applyRolePermissions() {
  const adminSection = document.getElementById("admin-connection-section");
  const modal = document.getElementById("settings-modal");
  const configBtnLogin = document.getElementById("config-btn-login");
  const configLinkLogin = document.getElementById("config-link-login");
  const isUserAdmin = isAdmin();

  // Control de la sección de conexión en Ajustes
  if (adminSection) {
    if (isUserAdmin) {
      adminSection.classList.remove("hidden");
    } else {
      adminSection.classList.add("hidden");
    }
  }

  // En la pantalla de login, los accesos para configurar URL deben estar visibles
  const loginScreen = document.getElementById("login-screen");
  const isLoginVisible = loginScreen && !loginScreen.classList.contains("hidden");

  if (configBtnLogin) {
    if (isLoginVisible) {
      configBtnLogin.classList.remove("hidden");
    } else {
      configBtnLogin.classList.add("hidden");
    }
  }

  if (configLinkLogin) {
    if (isLoginVisible) {
      configLinkLogin.classList.remove("hidden");
    } else {
      configLinkLogin.classList.add("hidden");
    }
  }

  // Si no es admin y está en la app principal y el modal estaba abierto, forzar su cierre
  if (AppState.user && !isUserAdmin && modal) {
    modal.classList.add("hidden");
  }
}

/**
 * Cambio de Vistas Principales (Login vs App)
 */
function showLoginView() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("main-app-screen").classList.add("hidden");
  hideLoginAlert();
  applyRolePermissions();

  // Limpiar campos sensibles de la interfaz al cerrar sesión
  const urlInput = document.getElementById("settings-api-url");
  if (urlInput) urlInput.value = "";
  const modalUrl = document.getElementById("modal-api-url");
  if (modalUrl) modalUrl.value = "";
}

function showMainApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-app-screen").classList.remove("hidden");
  updateUserHeader();
  applyRolePermissions();
  switchTab("dashboard");
}

/**
 * Formatea el nombre de usuario para que siempre inicie con mayúscula (ej: "mati" -> "Mati")
 */
function formatUserName(name) {
  if (!name) return "";
  const str = String(name).trim();
  if (!str) return "";
  return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function updateUserHeader() {
  const user = AppState.user;
  const userNameEl = document.getElementById("header-user-name");
  const userRoleEl = document.getElementById("header-user-role");
  if (user) {
    if (userNameEl) userNameEl.textContent = formatUserName(user.usuario) || "Usuario";
    if (userRoleEl) userRoleEl.textContent = (user.rol || "Usuario").toUpperCase();
  }
}

/**
 * Cambio de Tabs en la App
 */
function switchTab(tabId) {
  AppState.activeTab = tabId;

  // Actualizar botones de tab
  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.dataset.tab === tabId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Ocultar todas las secciones
  document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));

  // Mostrar la sección activa
  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) {
    targetPane.classList.remove("hidden");
  }

  // 1. Refrescar contenido inmediatamente con datos en memoria (cero latencia visual)
  if (tabId === "dashboard") {
    renderDashboard();
  } else if (tabId === "stock") {
    renderStockList();
  } else if (tabId === "movimientos") {
    populateProductSelect();
    renderRecentMovements();
    updateStockPreview();
  } else if (tabId === "settings") {
    renderSettingsView();
  }

  // 2. Validación asíncrona de sesión con Google Apps Script en cada evento de navegación (sin timers/setInterval)
  checkSessionOnNavigation();

  // 3. Carga automática en segundo plano al entrar en Inicio ("dashboard") o "stock"
  if (tabId === "dashboard" || tabId === "stock") {
    triggerBackgroundSync(tabId);
  }
}

let _isCheckingSession = false;
/**
 * Valida de forma asíncrona en cada evento de navegación si la contraseña del usuario en Google Sheets
 * sigue siendo válida o fue modificada.
 * NO utiliza temporizador ni setInterval.
 */
async function checkSessionOnNavigation() {
  if (!AppState.user || _isCheckingSession) return;
  if (AppState.user.isDemoAdmin || AppState.user.usuario === "demo") return;
  if (!window.api || !window.api.apiUrl) return;

  _isCheckingSession = true;
  try {
    const res = await window.api.validateSession();

    // Si la respuesta indica que la contraseña cambió o la sesión ya no es válida
    if (res && (res.sesionValida === false || res.success === false)) {
      console.warn("Sesión inválida detectada al navegar:", res);

      // 1. Borrar datos de la sesión actual (sessionStorage y localStorage)
      window.api.logout();
      try {
        localStorage.removeItem("dyarf_current_user");
        localStorage.removeItem("dcamisas_current_user");
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.clear();
        }
      } catch (e) {}
      AppState.user = null;

      // 2. Redirigir inmediatamente a la pantalla de login
      showLoginView();

      // 3. Mostrar la alerta requerida
      const errorMsg = res.message || "Tu contraseña ha cambiado. Por favor, inicia sesión de nuevo.";
      showLoginAlert(errorMsg, "error");
      showToast(errorMsg, "error");
      alert(errorMsg);
    }
  } catch (err) {
    console.warn("Aviso en validación de sesión durante navegación:", err);
  } finally {
    _isCheckingSession = false;
  }
}

let _bgSyncTimer = null;
/**
 * Dispara la descarga de datos desde Google Sheets en segundo plano
 * de manera transparente con indicador sutil de carga.
 */
function triggerBackgroundSync(tabId) {
  // Si ya hay una descarga en proceso, no duplicar la llamada
  if (AppState.isLoading) return;

  // Umbral de 2 segundos para evitar descargas consecutivas innecesarias al alternar rápido
  const now = Date.now();
  if (AppState.lastSyncTime && (now - AppState.lastSyncTime < 2000)) {
    return;
  }

  clearTimeout(_bgSyncTimer);
  _bgSyncTimer = setTimeout(() => {
    loadAppData({ background: true });
  }, 120);
}

/**
 * Autenticación de Usuario
 */
async function handleLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const userVal = document.getElementById("login-user").value.trim();
  const passVal = document.getElementById("login-password").value.trim();
  const submitBtn = document.getElementById("login-submit-btn");

  if (!userVal || !passVal) {
    showLoginAlert("Por favor, ingresa tu usuario y contraseña.", "error");
    return;
  }

  // Estado de carga
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner"></span> Verificando credenciales...`;
  hideLoginAlert();

  try {
    const result = await window.api.login(userVal, passVal);

    // Limpiar inmediatamente el campo de contraseña del formulario por seguridad
    const passInput = document.getElementById("login-password");
    if (passInput) passInput.value = "";

    if (result.success && result.user) {
      AppState.user = result.user;
      showToast(result.message || `¡Bienvenido, ${formatUserName(result.user.usuario)}!`, "success");
      showMainApp();
      await loadAppData();
    } else {
      showLoginAlert(result.message || "Usuario o contraseña incorrectos.", "error");
    }
  } catch (err) {
    const passInput = document.getElementById("login-password");
    if (passInput) passInput.value = "";
    showLoginAlert(`Error de conexión: ${err.message}`, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Iniciar Sesión`;
  }
}

function showLoginAlert(msg, type = "error") {
  const alertEl = document.getElementById("login-alert");
  if (alertEl) {
    alertEl.innerHTML = msg;
    alertEl.className = `alert-box alert-${type}`;
    alertEl.classList.remove("hidden");

    const trigger = document.getElementById("alert-config-trigger");
    if (trigger) {
      trigger.addEventListener("click", (e) => {
        e.preventDefault();
        openSettingsModal();
      });
    }
  }
}

function hideLoginAlert() {
  const alertEl = document.getElementById("login-alert");
  if (alertEl) alertEl.classList.add("hidden");
}

/**
 * Controla los indicadores de sincronización:
 * - Botón de sincronización con animación de giro (.rotating)
 * - Barra sutil de carga bajo el header (#subtle-sync-bar)
 * - Etiqueta de estado en Inicio (#dashboard-sync-tag)
 */
function setSyncIndicators(isActive, isBackground = false) {
  const syncBtn = document.getElementById("sync-btn");
  const subtleBar = document.getElementById("subtle-sync-bar");

  if (syncBtn) {
    if (isActive) {
      syncBtn.classList.add("rotating");
      syncBtn.setAttribute("aria-busy", "true");
      syncBtn.title = isBackground ? "Actualizando en segundo plano..." : "Sincronizando con Google Sheets...";
    } else {
      syncBtn.classList.remove("rotating");
      syncBtn.removeAttribute("aria-busy");
      syncBtn.title = "Sincronizar con Google Sheets";
    }
  }

  if (subtleBar) {
    if (isActive) {
      subtleBar.classList.remove("hidden");
    } else {
      subtleBar.classList.add("hidden");
    }
  }

  if (isActive) {
    updateSyncStatus(isBackground ? "Actualizando en segundo plano..." : "Sincronizando...", true);
  }
}

/**
 * Carga de Datos (Stock y Movimientos) desde Google Sheets
 * Permite ejecución transparente en segundo plano o forzada manual
 */
async function loadAppData(options = {}) {
  const isBackground = !!options.background;
  const isForce = !!options.force;

  if (AppState.isLoading && !isForce) {
    return { success: true, alreadyRunning: true };
  }

  AppState.isLoading = true;
  setSyncIndicators(true, isBackground);

  try {
    const [stockRes, movsRes] = await Promise.all([
      window.api.getStock(),
      window.api.getMovements(200)
    ]);

    if (stockRes.success && stockRes.data) {
      AppState.stock = stockRes.data;
    }
    if (movsRes.success && movsRes.data) {
      AppState.movements = movsRes.data;
    }

    // Refrescar las vistas activas con los nuevos datos recibidos
    if (AppState.activeTab === "dashboard") {
      renderDashboard();
    } else if (AppState.activeTab === "stock") {
      renderStockList();
    } else if (AppState.activeTab === "movimientos") {
      populateProductSelect();
      renderRecentMovements();
      updateStockPreview();
    }

    AppState.lastSyncTime = Date.now();
    const isDemo = window.api.isDemoMode;
    updateSyncStatus(isDemo ? "Modo Demo Activo" : "Conectado a Google Sheets", false);

    return { success: true };

  } catch (err) {
    console.error("Error al cargar datos:", err);
    updateSyncStatus("Modo Fuera de Línea", false);
    return { success: false, error: err };
  } finally {
    AppState.isLoading = false;
    setSyncIndicators(false, isBackground);
  }
}

/**
 * Sincronización manual forzada desde el botón de la barra superior
 */
async function syncAllData(manual = false) {
  const res = await loadAppData({ force: manual, background: !manual });

  if (manual) {
    if (res && res.success) {
      showToast("Datos sincronizados con éxito", "success");
    } else {
      showToast("Modo Fuera de Línea: usando datos en memoria", "warning");
    }
  }
}

function updateSyncStatus(text, isSyncing) {
  const badge = document.getElementById("dashboard-sync-tag");
  if (badge) {
    badge.innerHTML = `${isSyncing ? '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span>' : '●'} ${text}`;
  }
}

/**
 * Agrupa los artículos del inventario por modelo / producto
 */
function groupStockByProduct(stockList) {
  const groups = new Map();
  const sizeOrder = { "S": 1, "M": 2, "L": 3, "XL": 4, "XXL": 5 };

  (stockList || []).forEach(item => {
    const art = (item.articulo || "").trim();
    if (!art) return;
    const key = art.toLowerCase();

    if (!groups.has(key)) {
      // Extraer código base (ej: de "CAM-001-S" a "CAM-001")
      let baseCode = String(item.codigo || "").trim();
      const lastDash = baseCode.lastIndexOf("-");
      if (lastDash > 0) {
        baseCode = baseCode.substring(0, lastDash);
      }

      groups.set(key, {
        articulo: art,
        baseCode: baseCode,
        precio: item.precio || 0,
        variants: []
      });
    }

    const group = groups.get(key);
    group.variants.push(item);
  });

  // Ordenar tallas y calcular métricas consolidadas
  groups.forEach(group => {
    group.variants.sort((a, b) => {
      const ordA = sizeOrder[String(a.talla || "").trim().toUpperCase()] || 99;
      const ordB = sizeOrder[String(b.talla || "").trim().toUpperCase()] || 99;
      return ordA - ordB;
    });

    let totalStock = 0;
    let hasOutOfStock = false;
    let hasLowStock = false;
    let minStock = Infinity;
    let criticalVariant = null;

    group.variants.forEach(v => {
      const disp = Number(v.stockDisponible) || 0;
      totalStock += disp;
      if (disp < minStock) {
        minStock = disp;
        criticalVariant = v;
      }
      if (disp === 0) {
        hasOutOfStock = true;
      } else if (disp > 0 && disp <= 5) {
        hasLowStock = true;
      }
    });

    group.totalStock = totalStock;
    group.hasOutOfStock = hasOutOfStock;
    group.hasLowStock = hasLowStock;
    group.minStock = minStock === Infinity ? 0 : minStock;
    group.criticalVariant = criticalVariant || group.variants[0];
    group.isCritical = hasOutOfStock || hasLowStock;
  });

  return Array.from(groups.values());
}

/**
 * Renderizado de Dashboard (Alertas de Stock Crítico Agrupado por Producto - Ref. Imagen 1)
 */
function renderDashboard() {
  const stock = AppState.stock || [];
  const movs = AppState.movements || [];

  // Agrupación por producto
  const productGroups = groupStockByProduct(stock);

  // KPIs
  let totalUnidades = 0;
  let bajoStock = 0;
  let agotados = 0;

  stock.forEach(item => {
    const disp = Number(item.stockDisponible) || 0;
    totalUnidades += disp;
    if (disp === 0) {
      agotados++;
    } else if (disp > 0 && disp <= 5) {
      bajoStock++;
    }
  });

  // Inyectar en elementos KPI (Camisas en Stock, Bajo Stock, Agotados)
  const kpiTotal = document.getElementById("kpi-total-unidades");
  const kpiBajo = document.getElementById("kpi-bajo-stock");
  const kpiAgotados = document.getElementById("kpi-agotados");

  if (kpiTotal) kpiTotal.textContent = totalUnidades;
  if (kpiBajo) kpiBajo.textContent = bajoStock;
  if (kpiAgotados) kpiAgotados.textContent = agotados;

  // Alerta de stock crítico (Agrupado por Producto según Imagen 1)
  const criticalContainer = document.getElementById("critical-stock-list");
  const countText = document.getElementById("critical-count-text");

  if (criticalContainer) {
    const criticalProducts = productGroups.filter(g => g.isCritical);

    if (countText) {
      countText.textContent = `${criticalProducts.length} productos`;
    }

    if (criticalProducts.length === 0) {
      criticalContainer.innerHTML = `
        <div style="text-align:center; padding: 22px 10px; color:var(--success); font-weight:700; font-size:0.85rem;">
          ✨ ¡Excelente! Todo el stock está en niveles óptimos.
        </div>
      `;
    } else {
      criticalContainer.innerHTML = criticalProducts.map(prod => {
        const minStock = prod.minStock;
        const targetVariant = prod.criticalVariant || prod.variants[0];
        const targetCode = targetVariant ? targetVariant.codigo : "";

        return `
          <div class="critical-item-row">
            <div class="critical-item-left">
              <h4 class="critical-item-name">${escapeHtml(prod.articulo)}</h4>
              <div class="critical-sizes-row">
                ${prod.variants.map(v => {
                  const disp = Number(v.stockDisponible) || 0;
                  let badgeClass = "critical-size-normal";
                  if (disp === 0) {
                    badgeClass = "critical-size-out";
                  } else if (disp <= 5) {
                    badgeClass = "critical-size-low";
                  }
                  return `<span class="critical-size-badge ${badgeClass}">${escapeHtml(v.talla)}</span>`;
                }).join("")}
              </div>
            </div>
            <div class="critical-item-right">
              <span class="critical-stock-qty">
                ${minStock === 0 ? "Agotado (0 unid.)" : `Solo ${minStock} unid.`}
              </span>
              <button type="button" class="btn-reponer-pill" onclick="quickReponerAction('${escapeHtml(targetCode)}')">
                Reponer
              </button>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // Sincronizar años disponibles y renderizar Dashboard Estadístico
  populateStatsYears();
  renderStatsDashboard();
}

/**
 * Renderizado del Catálogo de Stock (Agrupado por Producto según Imagen 2)
 */
function renderStockList() {
  const container = document.getElementById("stock-items-container");
  if (!container) return;

  const stock = AppState.stock || [];
  const productGroups = groupStockByProduct(stock);
  const query = (AppState.searchQuery || "").toLowerCase().trim();
  const sizeFilter = AppState.filterSize || "ALL";
  const availFilter = AppState.filterAvailability || "ALL";

  // Filtrado de grupos de producto
  const filtered = productGroups.filter(group => {
    // 1. Filtro búsqueda texto
    if (query) {
      const matchName = group.articulo.toLowerCase().includes(query);
      const matchCode = group.baseCode.toLowerCase().includes(query) ||
                        group.variants.some(v => String(v.codigo || "").toLowerCase().includes(query));
      if (!matchName && !matchCode) return false;
    }

    // 2. Filtro por Talla y Disponibilidad combinados
    if (sizeFilter !== "ALL") {
      // Buscar la variante específica para la talla seleccionada
      const targetVariant = group.variants.find(v => 
        String(v.talla || "").trim().toUpperCase() === sizeFilter.toUpperCase()
      );

      // Si el modelo ni siquiera tiene esta talla, se descarta
      if (!targetVariant) return false;

      const targetStock = Number(targetVariant.stockDisponible) || 0;

      // Evaluar la disponibilidad EXCLUSIVAMENTE sobre esa talla seleccionada
      if (availFilter === "IN_STOCK") {
        if (targetStock <= 5) return false;
      } else if (availFilter === "LOW_STOCK") {
        if (targetStock <= 0 || targetStock > 5) return false;
      } else if (availFilter === "OUT_OF_STOCK") {
        if (targetStock > 0) return false;
      }
    } else {
      // Si sizeFilter === "ALL", evaluar la disponibilidad a nivel global del modelo
      if (availFilter === "IN_STOCK") {
        const allIn = group.variants.every(v => (Number(v.stockDisponible) || 0) > 5);
        if (!allIn) return false;
      } else if (availFilter === "LOW_STOCK") {
        const hasLow = group.variants.some(v => {
          const d = Number(v.stockDisponible) || 0;
          return d > 0 && d <= 5;
        });
        if (!hasLow) return false;
      } else if (availFilter === "OUT_OF_STOCK") {
        const hasOut = group.variants.some(v => (Number(v.stockDisponible) || 0) <= 0);
        if (!hasOut) return false;
      }
    }

    return true;
  });

  // Ordenamiento
  const sortSelect = document.getElementById("stock-sort-select");
  const sortMode = (sortSelect && sortSelect.value) || AppState.stockSort || "name_asc";
  AppState.stockSort = sortMode;

  if (sortMode === "name_asc") {
    filtered.sort((a, b) => a.articulo.localeCompare(b.articulo));
  } else if (sortMode === "stock_asc") {
    filtered.sort((a, b) => a.totalStock - b.totalStock);
  } else if (sortMode === "stock_desc") {
    filtered.sort((a, b) => b.totalStock - a.totalStock);
  }

  // Contador de resultados
  const countBadge = document.getElementById("stock-result-count");
  if (countBadge) {
    countBadge.textContent = `${filtered.length} modelos`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">🔍</div>
        <p style="font-weight: 700;">No se encontraron camisas con estos filtros</p>
        <small>Intenta cambiar la talla o el término de búsqueda</small>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(group => {
    let badgeHtml = "";
    if (sizeFilter !== "ALL") {
      const targetVar = group.variants.find(v => String(v.talla || "").trim().toUpperCase() === sizeFilter.toUpperCase());
      const d = targetVar ? (Number(targetVar.stockDisponible) || 0) : 0;
      if (d <= 0) {
        badgeHtml = `<span class="product-status-pill out-stock"><span style="font-weight:900;">✖</span> Agotado</span>`;
      } else if (d <= 5) {
        badgeHtml = `<span class="product-status-pill low-stock"><span style="font-size:0.8rem;">⚠️</span> Stock Bajo</span>`;
      } else {
        badgeHtml = `<span class="product-status-pill in-stock"><span style="font-weight:900;">✓</span> En stock</span>`;
      }
    } else {
      if (group.hasOutOfStock) {
        badgeHtml = `<span class="product-status-pill out-stock"><span style="font-weight:900;">✖</span> Agotado</span>`;
      } else if (group.hasLowStock) {
        badgeHtml = `<span class="product-status-pill low-stock"><span style="font-size:0.8rem;">⚠️</span> Stock Bajo</span>`;
      } else {
        badgeHtml = `<span class="product-status-pill in-stock"><span style="font-weight:900;">✓</span> En stock</span>`;
      }
    }

    const tallasStr = group.variants.map(v => escapeHtml(v.talla)).join(", ");
    const firstCode = group.variants[0]?.codigo || group.baseCode;

    return `
      <div class="product-group-card" onclick="quickMoveAction('${escapeHtml(firstCode)}')">
        <div class="product-group-top">
          <h3 class="product-group-title">${escapeHtml(group.articulo)}</h3>
          ${badgeHtml}
        </div>

        <div class="product-meta-pills">
          <span class="meta-pill">Código: <b>${escapeHtml(group.baseCode)}</b></span>
          <span class="meta-pill">Tallas: <b>${tallasStr}</b></span>
        </div>

        <div class="product-sizes-strip">
          <div class="sizes-columns">
            ${group.variants.map(v => {
              const disp = Number(v.stockDisponible) || 0;
              let qtyClass = "";
              if (disp === 0) qtyClass = "qty-out";
              else if (disp <= 5) qtyClass = "qty-low";

              // Resaltado exclusivo si hay un filtro de talla activo
              const isTargetSize = sizeFilter !== "ALL" && String(v.talla || "").trim().toUpperCase() === sizeFilter.toUpperCase();
              let isHighlightRed = false;

              if (isTargetSize) {
                if (disp === 0 || availFilter === "OUT_OF_STOCK") {
                  isHighlightRed = true;
                } else if (availFilter === "LOW_STOCK" && disp > 0 && disp <= 5) {
                  isHighlightRed = true;
                } else if (availFilter === "IN_STOCK" && disp > 5) {
                  isHighlightRed = true;
                }
              }

              const highlightClass = isHighlightRed ? "highlight-target-size" : "";

              return `
                <div class="size-col ${highlightClass}" onclick="event.stopPropagation(); quickMoveAction('${escapeHtml(v.codigo)}')">
                  <span class="col-size-name">${escapeHtml(v.talla)}</span>
                  <span class="col-size-qty ${qtyClass}">${disp}</span>
                  <span class="col-size-unit ${qtyClass}">unid.</span>
                </div>
              `;
            }).join("")}
          </div>
          <div class="strip-chevron">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Acción rápida para reponer un artículo desde la alerta de stock crítico (abre ENTRADA)
 */
window.quickReponerAction = function(codigo) {
  switchTab("movimientos");
  setMovementType("ENTRADA");

  const item = AppState.stock.find(s => s.codigo === codigo);
  if (item) {
    const select = document.getElementById("mov-producto-select");
    if (select) {
      select.value = item.articulo;
      handleProductChange(item.articulo);
    }
    if (item.talla) {
      handleSizeSelect(item.talla.toUpperCase());
    }
    AppState.movementForm.codigo = codigo;
  }
  updateStockPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

/**
 * Colapsar o expandir la tarjeta de Stock Crítico
 */
window.toggleCriticalList = function() {
  const container = document.querySelector(".critical-card-container");
  const list = document.getElementById("critical-stock-list");
  const icon = document.getElementById("critical-chevron-icon");
  if (!list) return;
  const isHidden = list.style.display === "none";
  list.style.display = isHidden ? "block" : "none";
  if (container) {
    if (isHidden) {
      container.classList.remove("is-collapsed");
    } else {
      container.classList.add("is-collapsed");
    }
  }
  if (icon) {
    icon.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
  }
};

/**
 * Población del selector de productos en Movimientos (ENTRADA y SALIDA)
 * Muestra el nombre del producto en un solo campo para ambos formularios
 */
function populateProductSelect() {
  const select = document.getElementById("mov-producto-select");
  if (!select) return;

  const stock = AppState.stock || [];
  const currentVal = select.value || AppState.movementForm.selectedArticulo;
  const uniqueProducts = [];
  const seen = new Set();

  stock.forEach(item => {
    const art = (item.articulo || "").trim();
    if (art && !seen.has(art.toLowerCase())) {
      seen.add(art.toLowerCase());
      uniqueProducts.push(art);
    }
  });

  select.innerHTML = '<option value="">-- Selecciona un producto --</option>' +
    uniqueProducts.map(art => `<option value="${escapeHtml(art)}">${escapeHtml(art)}</option>`).join("");

  if (currentVal && uniqueProducts.some(a => a.toLowerCase() === currentVal.toLowerCase())) {
    select.value = currentVal;
    AppState.movementForm.selectedArticulo = currentVal;
  }
  updateSizeButtonsStock();
}

/**
 * Actualiza el indicador de stock bajo cada uno de los botones de talla (S, M, L, XL, XXL)
 */
function updateSizeButtonsStock() {
  const selectedArticulo = AppState.movementForm.selectedArticulo;
  const isSalida = AppState.movementForm.tipo === "SALIDA";
  const sizes = ["S", "M", "L", "XL", "XXL"];

  sizes.forEach(size => {
    const subEl = document.getElementById(`size-stock-${size}`);
    const btn = document.querySelector(`#mov-size-buttons .size-btn[data-size="${size}"]`);
    if (!subEl || !btn) return;

    if (!selectedArticulo) {
      subEl.textContent = "-";
      btn.classList.remove("out-of-stock");
      return;
    }

    const item = AppState.stock.find(s => 
      (s.articulo || "").trim().toLowerCase() === selectedArticulo.toLowerCase() &&
      String(s.talla || "").trim().toUpperCase() === size
    );

    if (item) {
      const disp = Number(item.stockDisponible) || 0;
      if (disp <= 0) {
        subEl.textContent = "0 unid.";
        if (isSalida) {
          btn.classList.add("out-of-stock");
        } else {
          btn.classList.remove("out-of-stock");
        }
      } else {
        subEl.textContent = `${disp} disp.`;
        btn.classList.remove("out-of-stock");
      }
    } else {
      subEl.textContent = "0 disp.";
      if (isSalida) {
        btn.classList.add("out-of-stock");
      } else {
        btn.classList.remove("out-of-stock");
      }
    }
  });
}

/**
 * Resuelve el código exacto de un producto y talla (ej. C001-XL = código del producto + talla)
 */
function resolveMovCodigo(articulo, size) {
  if (!articulo || !size) return "";
  const cleanArt = articulo.trim().toLowerCase();
  const cleanSize = size.trim().toUpperCase();

  // Búsqueda directa en catálogo
  const exact = AppState.stock.find(s => 
    (s.articulo || "").trim().toLowerCase() === cleanArt &&
    String(s.talla || "").trim().toUpperCase() === cleanSize
  );
  if (exact && exact.codigo) return exact.codigo;

  // Fallback: extraer base del código de cualquier variante de este artículo (ej. CAM-001 de CAM-001-S)
  const anyVariant = AppState.stock.find(s => (s.articulo || "").trim().toLowerCase() === cleanArt);
  if (anyVariant && anyVariant.codigo) {
    const lastDash = anyVariant.codigo.lastIndexOf("-");
    const base = lastDash !== -1 ? anyVariant.codigo.substring(0, lastDash) : anyVariant.codigo;
    return `${base}-${cleanSize}`;
  }

  return `${articulo}-${cleanSize}`;
}

/**
 * Manejador del cambio de producto (compartido para ENTRADA y SALIDA)
 */
function handleProductChange(articulo) {
  AppState.movementForm.selectedArticulo = (articulo || "").trim();
  updateSizeButtonsStock();

  // En SALIDA: sugerir precio si está vacío
  if (AppState.movementForm.tipo === "SALIDA") {
    const precioInput = document.getElementById("mov-precio-venta");
    if (precioInput && !precioInput.value) {
      const anyItem = AppState.stock.find(s => (s.articulo || "").trim().toLowerCase() === AppState.movementForm.selectedArticulo.toLowerCase());
      if (anyItem && anyItem.precio > 0) {
        precioInput.value = Number(anyItem.precio).toFixed(2);
        precioInput.dispatchEvent(new Event("input"));
      }
    }
  }

  // Si ya había una talla seleccionada, recalcular código
  if (AppState.movementForm.selectedSize) {
    AppState.movementForm.codigo = resolveMovCodigo(AppState.movementForm.selectedArticulo, AppState.movementForm.selectedSize);
  } else {
    AppState.movementForm.codigo = "";
  }

  const submitBtn = document.getElementById("mov-submit-btn");
  if (submitBtn && submitBtn.innerHTML.includes("Reintentar")) {
    setMovementType(AppState.movementForm.tipo);
  }

  updateStockPreview();
}

/**
 * Selección de talla obligatoria y única (compartida para ENTRADA y SALIDA)
 */
function handleSizeSelect(size) {
  const cleanSize = (size || "").trim().toUpperCase();

  // Destacar únicamente el botón elegido
  document.querySelectorAll("#mov-size-buttons .size-btn").forEach(btn => {
    if (btn.dataset.size === cleanSize) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  AppState.movementForm.selectedSize = cleanSize;

  if (AppState.movementForm.selectedArticulo) {
    AppState.movementForm.codigo = resolveMovCodigo(AppState.movementForm.selectedArticulo, cleanSize);
  }

  const submitBtn = document.getElementById("mov-submit-btn");
  if (submitBtn && submitBtn.innerHTML.includes("Reintentar")) {
    setMovementType(AppState.movementForm.tipo);
  }

  updateStockPreview();
}

/**
 * Acción rápida desde una tarjeta de producto
 */
window.quickMoveAction = function(codigo) {
  switchTab("movimientos");
  const item = AppState.stock.find(s => s.codigo === codigo);

  if (item) {
    const disp = Number(item.stockDisponible) || 0;
    // Si la talla o producto no tiene stock (0), enviar obligatoriamente a ENTRADA
    if (disp <= 0) {
      setMovementType("ENTRADA");
    }

    const select = document.getElementById("mov-producto-select");
    if (select) {
      select.value = item.articulo;
      handleProductChange(item.articulo);
    }
    if (item.talla) {
      handleSizeSelect(item.talla.toUpperCase());
    }
    AppState.movementForm.codigo = codigo;
  }
  updateStockPreview();
};

/**
 * Alterna entre el campo de DNI y RUC según el tipo de comprobante seleccionado
 */
function updateComprobanteCampos() {
  const tipo = AppState.movementForm.tipoComprobante || "Boleta";
  const dniGroup = document.getElementById("campo-dni-group");
  const rucGroup = document.getElementById("campo-ruc-group");
  if (tipo === "Factura") {
    if (dniGroup) dniGroup.classList.add("hidden");
    if (rucGroup) rucGroup.classList.remove("hidden");
  } else {
    // Boleta por defecto
    if (dniGroup) dniGroup.classList.remove("hidden");
    if (rucGroup) rucGroup.classList.add("hidden");
  }
}

/**
 * Selector de Tipo de Movimiento (ENTRADA vs SALIDA)
 */
function setMovementType(tipo) {
  AppState.movementForm.tipo = tipo;

  const btnEntrada = document.getElementById("btn-tipo-entrada");
  const btnSalida = document.getElementById("btn-tipo-salida");
  const submitBtn = document.getElementById("mov-submit-btn");

  const salidaSaleDetails = document.getElementById("salida-sale-details");
  const salidaObsGroup = document.getElementById("salida-obs-group");
  const entradaObsGroup = document.getElementById("entrada-obs-group");

  if (tipo === "ENTRADA") {
    // Modo ENTRADA: Oculta campos de venta y muestra observación de entrada
    btnEntrada.classList.add("active", "entrada");
    btnSalida.classList.remove("active", "salida");

    if (salidaSaleDetails) salidaSaleDetails.classList.add("hidden");
    if (salidaObsGroup) salidaObsGroup.classList.add("hidden");
    if (entradaObsGroup) entradaObsGroup.classList.remove("hidden");

    // Asegurar que el primer botón de observación de entrada esté activo
    const activeEnt = document.querySelector("#entrada-obs-buttons .option-btn.active");
    if (!activeEnt) {
      const firstEnt = document.querySelector("#entrada-obs-buttons .option-btn");
      if (firstEnt) {
        firstEnt.classList.add("active");
        const hidden = document.getElementById("mov-observacion");
        if (hidden) hidden.value = firstEnt.dataset.value;
        AppState.movementForm.observacionEntrada = firstEnt.dataset.value;
      }
    }

    if (submitBtn) {
      submitBtn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      submitBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg> Registrar Entrada de Stock`;
    }
  } else {
    // Modo SALIDA: Muestra campos de venta y observación de salida
    btnSalida.classList.add("active", "salida");
    btnEntrada.classList.remove("active", "entrada");

    if (salidaSaleDetails) salidaSaleDetails.classList.remove("hidden");
    if (salidaObsGroup) salidaObsGroup.classList.remove("hidden");
    if (entradaObsGroup) entradaObsGroup.classList.add("hidden");

    // Asegurar que el primer botón de tipo de venta esté activo
    const activeTv = document.querySelector("#mov-tipo-venta-buttons .option-btn.active");
    if (!activeTv) {
      const firstTv = document.querySelector("#mov-tipo-venta-buttons .option-btn");
      if (firstTv) {
        firstTv.classList.add("active");
        const hidden = document.getElementById("mov-tipo-venta");
        if (hidden) hidden.value = firstTv.dataset.value;
        AppState.movementForm.tipoVenta = firstTv.dataset.value;
      }
    }

    // Asegurar que el primer botón de forma de pago esté activo
    const activeFp = document.querySelector("#mov-forma-pago-buttons .option-btn.active");
    if (!activeFp) {
      const firstFp = document.querySelector("#mov-forma-pago-buttons .option-btn");
      if (firstFp) {
        firstFp.classList.add("active");
        const hiddenFp = document.getElementById("mov-forma-pago");
        if (hiddenFp) hiddenFp.value = firstFp.dataset.value;
        AppState.movementForm.formaPago = firstFp.dataset.value;
      }
    }

    // Asegurar estado de comprobante de pago
    const activeCp = document.querySelector("#mov-comprobante-pago-buttons .option-btn.active");
    if (!activeCp) {
      const noBtn = document.querySelector("#mov-comprobante-pago-buttons .option-btn[data-value='NO']") ||
                    document.querySelector("#mov-comprobante-pago-buttons .option-btn");
      if (noBtn) {
        noBtn.classList.add("active");
        const hiddenCp = document.getElementById("mov-comprobante-pago");
        if (hiddenCp) hiddenCp.value = noBtn.dataset.value;
        AppState.movementForm.comprobantePago = noBtn.dataset.value;
      }
    }
    const compGroup = document.getElementById("comprobante-detalles-group");
    if (compGroup) {
      if (AppState.movementForm.comprobantePago === "SI") {
        compGroup.classList.remove("hidden");
        updateComprobanteCampos();
      } else {
        compGroup.classList.add("hidden");
      }
    }

    // Asegurar que el primer botón de observación de salida esté activo
    const activeObsSal = document.querySelector("#salida-obs-buttons .option-btn.active");
    if (!activeObsSal) {
      const firstObsSal = document.querySelector("#salida-obs-buttons .option-btn");
      if (firstObsSal) {
        firstObsSal.classList.add("active");
        const hidden = document.getElementById("mov-salida-observacion");
        if (hidden) hidden.value = firstObsSal.dataset.value;
        AppState.movementForm.observacionSalida = firstObsSal.dataset.value;
      }
    }

    if (submitBtn) {
      submitBtn.style.background = "linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)";
      submitBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7-7"/></svg> Registrar Salida / Venta`;
    }
  }

  updateSizeButtonsStock();
  updateStockPreview();
}

/**
 * Vista previa reactiva del stock resultante (compartida para ENTRADA y SALIDA)
 */
function updateStockPreview() {
  const previewBox = document.getElementById("stock-preview-box");
  const qtyInput = document.getElementById("mov-cantidad");
  if (!previewBox) return;

  const cant = parseInt(qtyInput ? qtyInput.value : 1, 10) || 1;
  const tipo = AppState.movementForm.tipo;
  const selectedArticulo = AppState.movementForm.selectedArticulo;
  const selectedSize = AppState.movementForm.selectedSize;

  if (!selectedArticulo) {
    previewBox.innerHTML = `<span style="color:var(--text-muted);">Selecciona un producto para calcular el stock</span>`;
    return;
  }

  if (!selectedSize) {
    previewBox.innerHTML = `<span style="color:var(--text-muted);">Selecciona una talla para calcular el stock</span>`;
    return;
  }

  const codigo = AppState.movementForm.codigo || resolveMovCodigo(selectedArticulo, selectedSize);
  const item = AppState.stock.find(s => s.codigo.toUpperCase() === codigo.toUpperCase()) ||
               AppState.stock.find(s => (s.articulo || "").trim().toLowerCase() === selectedArticulo.toLowerCase() && String(s.talla || "").trim().toUpperCase() === selectedSize);

  const stockActual = item ? (Number(item.stockDisponible) || 0) : 0;

  if (tipo === "SALIDA") {
    const stockFinal = stockActual - cant;
    const isOutOfStock = stockActual <= 0;
    const isExceeded = cant > stockActual;

    previewBox.innerHTML = `
      <div>
        <span style="display:block; font-size:0.75rem; color:var(--text-muted);">
          Código: <b class="badge-code">${escapeHtml(codigo)}</b>
        </span>
        <span style="font-size:0.85rem; font-weight:800; color:${(isOutOfStock || isExceeded) ? 'var(--danger)' : 'var(--text-main)'}">
          ${isOutOfStock ? '❌ Venta bloqueada' : (isExceeded ? `⚠️ Venta bloqueada: Cantidad supera stock disponible` : `Stock tras venta: <b>${stockFinal} unid.</b>`)}
        </span>
      </div>
      ${isOutOfStock ? `<span class="badge-stock badge-out-stock">🚫 Agotado</span>` : (isExceeded ? `<span class="badge-stock badge-out-stock">⚠️ Excede stock</span>` : '')}
    `;

  } else {
    // Modo ENTRADA
    const stockFinal = stockActual + cant;

    previewBox.innerHTML = `
      <div>
        <span style="display:block; font-size:0.75rem; color:var(--text-muted);">
          Código: <b class="badge-code">${escapeHtml(codigo)}</b>
        </span>
        <span style="font-size:0.85rem; font-weight:800; color:var(--success)">
          Stock tras entrada: <b>${stockFinal} unid.</b> (+${cant} unid.)
        </span>
      </div>
    `;
  }
}

/**
 * Envío de Registro de Movimiento con protección estricta anti-duplicación y validaciones
 */
async function handleMovementSubmit(e) {
  if (e) e.preventDefault();

  // 1. Protección contra envíos simultáneos o doble clic
  if (AppState.isSubmittingMovement) {
    return;
  }

  const tipo = AppState.movementForm.tipo;
  const qtyInput = document.getElementById("mov-cantidad");
  const cantidad = parseInt(qtyInput ? qtyInput.value : 1, 10);
  const submitBtn = document.getElementById("mov-submit-btn");

  // Validación común 1: Producto obligatorio
  const selectedArticulo = AppState.movementForm.selectedArticulo;
  if (!selectedArticulo) {
    showToast("Selecciona un producto del catálogo.", "error");
    return;
  }

  // Validación común 2: Talla OBLIGATORIA (S, M, L, XL)
  const selectedSize = AppState.movementForm.selectedSize;
  if (!selectedSize) {
    showToast("Selecciona una talla", "error");
    return;
  }

  // Resolución del código (código del producto + talla, ej. C001-XL)
  const codigo = AppState.movementForm.codigo || resolveMovCodigo(selectedArticulo, selectedSize);
  if (!codigo) {
    showToast("No se pudo identificar el código del artículo.", "error");
    return;
  }

  // Validación común 3: Cantidad positiva
  if (isNaN(cantidad) || cantidad <= 0) {
    showToast("Ingresa una cantidad válida mayor a 0.", "error");
    return;
  }

  let observacion = "";
  let precioVenta = null;
  let tipoVenta = "";
  let precioSinIgv = null;
  let formaPago = "Efectivo";
  let comprobanteFinal = "NO";
  let tipoComprobanteFinal = "";
  let docComprobanteFinal = "";

  if (tipo === "SALIDA") {
    // Validaciones exclusivas de SALIDA
    const item = AppState.stock.find(s => s.codigo.toUpperCase() === codigo.toUpperCase()) ||
                 AppState.stock.find(s => (s.articulo || "").trim().toLowerCase() === selectedArticulo.toLowerCase() && String(s.talla || "").trim().toUpperCase() === selectedSize);
    const stockActual = item ? (Number(item.stockDisponible) || 0) : 0;

    if (stockActual <= 0) {
      showToast("No se puede registrar la venta: Artículo agotado (Stock disponible: 0).", "error");
      return;
    }
    if (cantidad > stockActual) {
      showToast(`No se puede registrar la venta: La cantidad solicitada (${cantidad}) supera el stock disponible (${stockActual}).`, "error");
      return;
    }

    // Precio de venta (Columna F)
    const precioVentaInput = document.getElementById("mov-precio-venta");
    const precioVentaRaw = precioVentaInput ? precioVentaInput.value.trim() : "";
    const parsedPrecio = parseFloat(precioVentaRaw);
    if (!precioVentaRaw || isNaN(parsedPrecio) || parsedPrecio <= 0) {
      showToast("Ingresa un precio de venta válido mayor a 0.", "error");
      return;
    }
    precioVenta = Math.round(parsedPrecio * 100) / 100;

    // Tipo de venta (Columna G)
    const tipoVentaEl = document.getElementById("mov-tipo-venta");
    tipoVenta = (tipoVentaEl && tipoVentaEl.value.trim()) || AppState.movementForm.tipoVenta || "Unitario";
    if (!tipoVenta || (tipoVenta !== "Por Mayor" && tipoVenta !== "Unitario")) {
      showToast("Selecciona el tipo de venta (Unitario o Por Mayor).", "error");
      return;
    }

    // Precio sin IGV (Columna H)
    const sinIgvVal = precioVenta - (precioVenta * 0.18);
    precioSinIgv = parseFloat((Math.round(sinIgvVal * 100) / 100).toFixed(2));

    // Forma de Pago (Efectivo, Transferencia, Yape)
    const formaPagoEl = document.getElementById("mov-forma-pago");
    formaPago = (formaPagoEl && formaPagoEl.value.trim()) || AppState.movementForm.formaPago || "Efectivo";
    if (!formaPago) {
      showToast("Selecciona la forma de pago (Efectivo, Transferencia o Yape).", "error");
      return;
    }

    // Comprobante de Pago (SI / NO)
    const compEl = document.getElementById("mov-comprobante-pago");
    const compChoice = (compEl && compEl.value.trim().toUpperCase()) || (AppState.movementForm.comprobantePago || "NO").toUpperCase();

    comprobanteFinal = "NO";
    tipoComprobanteFinal = "";
    docComprobanteFinal = "";

    if (compChoice === "SI") {
      const tcEl = document.getElementById("mov-tipo-comprobante");
      tipoComprobanteFinal = (tcEl && tcEl.value.trim()) || AppState.movementForm.tipoComprobante || "Boleta";

      if (tipoComprobanteFinal === "Boleta") {
        const dniInput = document.getElementById("mov-doc-dni");
        const dni = dniInput ? dniInput.value.trim() : "";
        if (!dni || !/^\d{8}$/.test(dni)) {
          showToast("Para Boleta, ingresa un número de DNI válido (8 dígitos numéricos).", "error");
          if (dniInput) dniInput.focus();
          return;
        }
        docComprobanteFinal = dni;
        comprobanteFinal = `Boleta - DNI: ${dni}`;
      } else if (tipoComprobanteFinal === "Factura") {
        const rucInput = document.getElementById("mov-doc-ruc");
        const ruc = rucInput ? rucInput.value.trim() : "";
        if (!ruc || !/^\d{11}$/.test(ruc)) {
          showToast("Para Factura, ingresa un número de RUC válido (11 dígitos numéricos).", "error");
          if (rucInput) rucInput.focus();
          return;
        }
        docComprobanteFinal = ruc;
        comprobanteFinal = `Factura - RUC: ${ruc}`;
      } else {
        showToast("Selecciona el tipo de comprobante (Boleta o Factura).", "error");
        return;
      }
    }

    // Observación de SALIDA (Columna I)
    const obsSelect = document.getElementById("mov-salida-observacion");
    observacion = (obsSelect && obsSelect.value.trim()) || AppState.movementForm.observacionSalida || "Venta en tienda";
    if (!observacion || (observacion !== "Venta en tienda" && observacion !== "Venta por whatsapp")) {
      showToast("Selecciona una observación para la venta.", "error");
      return;
    }

  } else {
    // Modo ENTRADA: Botones de observación de entrada (Ingreso de mercadería y Devoluciones)
    const obsInput = document.getElementById("mov-observacion");
    observacion = (obsInput && obsInput.value.trim()) || AppState.movementForm.observacionEntrada || "Ingreso de mercadería";
    if (!observacion) {
      showToast("Selecciona una observación para la entrada.", "error");
      return;
    }
  }

  // Bloquear inmediatamente para impedir doble clic o ejecuciones concurrentes
  AppState.isSubmittingMovement = true;
  let originalText = "";
  if (submitBtn) {
    submitBtn.disabled = true;
    originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = `<span class="spinner"></span> Guardando en Google Sheets...`;
  }

  // Generar o recuperar identificador de idempotencia según la firma determinista del movimiento
  const movementOpData = {
    tipo,
    codigo,
    cantidad,
    precioVenta: (tipo === "SALIDA" ? precioVenta : null),
    tipoVenta: (tipo === "SALIDA" ? tipoVenta : ""),
    precioSinIgv: (tipo === "SALIDA" ? precioSinIgv : null),
    formaPago: (tipo === "SALIDA" ? formaPago : ""),
    comprobantePago: (tipo === "SALIDA" ? comprobanteFinal : ""),
    observacion
  };

  const signature = (window.api && window.api.computeOperationSignature)
    ? window.api.computeOperationSignature(movementOpData)
    : [tipo, codigo, cantidad, precioVenta, tipoVenta, formaPago, comprobanteFinal, observacion].join("::");

  let pendingOp = (window.api && window.api.getPendingOperation) ? window.api.getPendingOperation() : null;
  let requestId = "";

  if (pendingOp && pendingOp.signature === signature && pendingOp.requestId) {
    // Reutilizar exactamente el mismo requestId para reintentar operación idéntica (garantía de idempotencia)
    requestId = pendingOp.requestId;
    console.log("[Idempotencia] Reutilizando requestId existente para reintento:", requestId);
  } else {
    // Operación nueva o el vendedor modificó algún campo: generar nuevo identificador único
    requestId = (typeof crypto !== "undefined" && crypto.randomUUID) ?
      `MOV-${crypto.randomUUID()}` :
      `MOV-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (window.api && window.api.setPendingOperation) {
      window.api.setPendingOperation({
        requestId: requestId,
        signature: signature,
        timestamp: Date.now(),
        data: movementOpData
      });
    }
  }

  try {
    const activeCreds = (window.api && window.api.getCurrentUserCredentials) ? window.api.getCurrentUserCredentials() : null;
    const activeUsuario = (AppState.user && AppState.user.usuario) || (activeCreds && activeCreds.usuario) || "Admin";

    const payload = {
      usuario: activeUsuario,
      tipo: tipo,
      codigo: codigo,
      articulo: selectedArticulo || "",
      cantidad: cantidad,
      observacion: observacion,
      requestId: requestId
    };

    if (activeCreds && activeCreds.sessionToken) {
      payload.sessionToken = activeCreds.sessionToken;
    }

    if (tipo === "SALIDA") {
      payload.precioVenta = precioVenta;
      payload.tipoVenta = tipoVenta;
      payload.precioSinIgv = precioSinIgv;
      payload.formaPago = formaPago;
      payload.comprobantePago = comprobanteFinal;
      payload.tipoComprobante = tipoComprobanteFinal;
      payload.documentoComprobante = docComprobanteFinal;
    }

    const res = await window.api.addMovement(payload);

    if (res.success) {
      // Limpiar operación pendiente de almacenamiento local tras confirmación
      if (window.api && window.api.clearPendingOperation) {
        window.api.clearPendingOperation();
      }

      if (res.idempotent) {
        showToast(res.message || "Movimiento ya procesado anteriormente en el servidor.", "info");
      } else {
        showToast(res.message || "Movimiento guardado con éxito", "success");
      }

      // Limpiar campos del formulario
      if (qtyInput) qtyInput.value = 1;

      // Desmarcar tallas en el selector reutilizable
      document.querySelectorAll("#mov-size-buttons .size-btn").forEach(b => b.classList.remove("active"));
      AppState.movementForm.selectedSize = "";
      AppState.movementForm.codigo = "";

      if (tipo === "SALIDA") {
        const pInput = document.getElementById("mov-precio-venta");
        if (pInput) pInput.value = "";
        const psiInput = document.getElementById("mov-precio-sin-igv");
        if (psiInput) psiInput.value = "";

        // Reset Tipo de Venta a Unitario (primer botón siempre seleccionado por defecto)
        document.querySelectorAll("#mov-tipo-venta-buttons .option-btn").forEach((b, idx) => {
          if (idx === 0 || b.dataset.value === "Unitario") b.classList.add("active");
          else b.classList.remove("active");
        });
        const tvHidden = document.getElementById("mov-tipo-venta");
        if (tvHidden) tvHidden.value = "Unitario";
        AppState.movementForm.tipoVenta = "Unitario";

        // Reset Forma de Pago a Efectivo (primer botón siempre seleccionado por defecto)
        document.querySelectorAll("#mov-forma-pago-buttons .option-btn").forEach((b, idx) => {
          if (idx === 0 || b.dataset.value === "Efectivo") b.classList.add("active");
          else b.classList.remove("active");
        });
        const fpHidden = document.getElementById("mov-forma-pago");
        if (fpHidden) fpHidden.value = "Efectivo";
        AppState.movementForm.formaPago = "Efectivo";

        // Reset Comprobante de Pago a NO
        document.querySelectorAll("#mov-comprobante-pago-buttons .option-btn").forEach(b => {
          if (b.dataset.value === "NO") b.classList.add("active");
          else b.classList.remove("active");
        });
        const cpHidden = document.getElementById("mov-comprobante-pago");
        if (cpHidden) cpHidden.value = "NO";
        AppState.movementForm.comprobantePago = "NO";

        const compGroup = document.getElementById("comprobante-detalles-group");
        if (compGroup) compGroup.classList.add("hidden");

        // Reset Tipo de Comprobante a Boleta
        document.querySelectorAll("#mov-tipo-comprobante-buttons .option-btn").forEach((b, idx) => {
          if (idx === 0 || b.dataset.value === "Boleta") b.classList.add("active");
          else b.classList.remove("active");
        });
        const tcHidden = document.getElementById("mov-tipo-comprobante");
        if (tcHidden) tcHidden.value = "Boleta";
        AppState.movementForm.tipoComprobante = "Boleta";

        const dniInp = document.getElementById("mov-doc-dni");
        if (dniInp) dniInp.value = "";
        const rucInp = document.getElementById("mov-doc-ruc");
        if (rucInp) rucInp.value = "";
        AppState.movementForm.documentoComprobante = "";
        updateComprobanteCampos();

        // Reset Observación Salida a Venta en tienda (primer botón siempre seleccionado por defecto)
        document.querySelectorAll("#salida-obs-buttons .option-btn").forEach((b, idx) => {
          if (idx === 0 || b.dataset.value === "Venta en tienda") b.classList.add("active");
          else b.classList.remove("active");
        });
        const obsSalHidden = document.getElementById("mov-salida-observacion");
        if (obsSalHidden) obsSalHidden.value = "Venta en tienda";
        AppState.movementForm.observacionSalida = "Venta en tienda";

      } else {
        // Reset Observación Entrada a Ingreso de mercadería (primer botón siempre seleccionado por defecto)
        document.querySelectorAll("#entrada-obs-buttons .option-btn").forEach((b, idx) => {
          if (idx === 0 || b.dataset.value === "Ingreso de mercadería") b.classList.add("active");
          else b.classList.remove("active");
        });
        const obsEntHidden = document.getElementById("mov-observacion");
        if (obsEntHidden) obsEntHidden.value = "Ingreso de mercadería";
        AppState.movementForm.observacionEntrada = "Ingreso de mercadería";
      }

      // Sincronizar datos con Google Sheets
      await loadAppData();
      updateStockPreview();
      switchTab("movimientos");
    } else {
      if (res.uncertain || res.busy || res.canRetry) {
        // En caso de corte de red, timeout o concurrencia de servidor:
        // Mantener la operación pendiente para que el vendedor pueda reintentar de forma segura sin duplicar
        showToast(res.message || "No se pudo confirmar la operación. Puedes pulsar 'Reintentar' de manera segura sin duplicar el registro.", "warning");
        if (submitBtn) {
          submitBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Reintentar ${tipo === "SALIDA" ? "Salida / Venta" : "Entrada"}`;
          submitBtn.disabled = false;
        }
      } else {
        // Error de validación de negocio o stock insuficiente: limpiar operación pendiente
        if (window.api && window.api.clearPendingOperation) {
          window.api.clearPendingOperation();
        }
        showToast(res.message || "Error al registrar el movimiento.", "error");
        if (submitBtn && originalText) {
          submitBtn.innerHTML = originalText;
        }
      }
    }

  } catch (err) {
    console.error("Error en handleMovementSubmit:", err);
    showToast(`Problema de conexión al procesar: ${err.message}. Los datos están intactos, pulsa 'Reintentar' de forma segura.`, "warning");
    if (submitBtn) {
      submitBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Reintentar ${tipo === "SALIDA" ? "Salida / Venta" : "Entrada"}`;
      submitBtn.disabled = false;
    }
  } finally {
    AppState.isSubmittingMovement = false;
    if (submitBtn && !submitBtn.innerHTML.includes("Reintentar")) {
      submitBtn.disabled = false;
      if (originalText) submitBtn.innerHTML = originalText;
    }
  }
}

/**
 * Extrae los componentes numéricos exactos de una fecha (año, mes base 0, día, hora, minuto, segundo)
 * de forma independiente de la zona horaria del navegador, evitando desfases por UTC.
 */
function parseMovementDateParts(raw) {
  if (raw === null || raw === undefined || raw === "") return null;

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return {
      year: parseInt(raw.getFullYear(), 10),
      month: parseInt(raw.getMonth(), 10), // Base 0: 0 = Enero, 11 = Diciembre
      day: parseInt(raw.getDate(), 10),
      hour: parseInt(raw.getHours(), 10),
      minute: parseInt(raw.getMinutes(), 10),
      second: parseInt(raw.getSeconds(), 10),
      dateObj: raw
    };
  }

  const str = String(raw).trim();
  if (!str) return null;

  // 1. Formato YYYY-MM-DD o YYYY/MM/DD con o sin hora (ej: "2025-12-08", "2025-12-08 19:33:42")
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1; // Base 0: Diciembre = 11
    const day = parseInt(isoMatch[3], 10);
    const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
    const minute = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const second = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      dateObj: new Date(year, month, day, hour, minute, second)
    };
  }

  // 2. Formato latino DD/MM/YYYY o DD-MM-YYYY (ej: "08/12/2025", "08/12/2025 19:33:42")
  const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ddmmyyyy) {
    const year = parseInt(ddmmyyyy[3], 10);
    const month = parseInt(ddmmyyyy[2], 10) - 1; // Base 0: Diciembre = 11
    const day = parseInt(ddmmyyyy[1], 10);
    const hour = ddmmyyyy[4] ? parseInt(ddmmyyyy[4], 10) : 0;
    const minute = ddmmyyyy[5] ? parseInt(ddmmyyyy[5], 10) : 0;
    const second = ddmmyyyy[6] ? parseInt(ddmmyyyy[6], 10) : 0;
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      dateObj: new Date(year, month, day, hour, minute, second)
    };
  }

  // 3. Fallback genérico si no coincide con formatos estándar
  const fallback = new Date(str);
  if (isNaN(fallback.getTime())) return null;
  return {
    year: parseInt(fallback.getFullYear(), 10),
    month: parseInt(fallback.getMonth(), 10),
    day: parseInt(fallback.getDate(), 10),
    hour: parseInt(fallback.getHours(), 10),
    minute: parseInt(fallback.getMinutes(), 10),
    second: parseInt(fallback.getSeconds(), 10),
    dateObj: fallback
  };
}

/**
 * Parsea de manera robusta cualquier formato de fecha de Google Sheets o JS
 */
function parseMovementDate(raw) {
  const parts = parseMovementDateParts(raw);
  return parts ? parts.dateObj : null;
}

/**
 * Convierte cualquier fecha u hora (incluyendo cadenas como "Mon Nov 09 2026 19:36:30 GMT-0500 (hora estándar de Colombia)"
 * o "2026-11-09 19:36:30") en un formato amigable y de fácil lectura:
 * "Lunes 09 de Noviembre, 2026 a las 07:36:30 P.M."
 */
function formatFechaHora(fechaRaw) {
  if (!fechaRaw) return "";
  const d = parseMovementDate(fechaRaw);
  if (!d || isNaN(d.getTime())) return String(fechaRaw);

  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const diaNombre = dias[d.getDay()];
  const diaNum = String(d.getDate()).padStart(2, "0");
  const mesNombre = meses[d.getMonth()];
  const anio = d.getFullYear();

  let horas = d.getHours();
  const ampm = horas >= 12 ? "P.M." : "A.M.";
  horas = horas % 12;
  horas = horas ? horas : 12;
  const horasStr = String(horas).padStart(2, "0");
  const minutos = String(d.getMinutes()).padStart(2, "0");
  const segundos = String(d.getSeconds()).padStart(2, "0");

  return `${diaNombre} ${diaNum} de ${mesNombre}, ${anio} a las ${horasStr}:${minutos}:${segundos} ${ampm}`;
}

/**
 * Renderizado de Movimientos Recientes
 */
function renderRecentMovements() {
  const container = document.getElementById("recent-movements-container");
  if (!container) return;

  const movs = AppState.movements || [];

  if (movs.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
        No hay movimientos registrados recientemente.
      </div>
    `;
    return;
  }

  container.innerHTML = movs.slice(0, 15).map(m => {
    const isEntrada = m.tipo === "ENTRADA";
    const hasSaleData = !isEntrada && m.precioVenta !== null && m.precioVenta !== undefined && m.precioVenta !== "";
    const saleTag = hasSaleData ? ` • <b>S/ ${Number(m.precioVenta).toFixed(2)}</b> (${escapeHtml(m.tipoVenta || 'Venta')})` : '';
    const pagoTag = (!isEntrada && m.formaPago) ? ` • <span style="color:var(--primary); font-weight:600;">${escapeHtml(m.formaPago)}</span>` : '';
    const compTag = (!isEntrada && m.comprobantePago && m.comprobantePago !== 'NO') ? ` • <span style="font-weight:600;">[${escapeHtml(m.comprobantePago)}]</span>` : '';
    const fechaLegible = formatFechaHora(m.fechaHora);
    const nombreArticulo = getProductName(m.codigo, m.articulo);

    return `
      <div class="movement-item">
        <div class="mov-left">
          <div class="mov-badge-icon ${isEntrada ? 'entrada' : 'salida'}">
            ${isEntrada ? '↓' : '↑'}
          </div>
          <div class="mov-info">
            <h4>${escapeHtml(nombreArticulo)}</h4>
            <p>${escapeHtml(fechaLegible || '')}${saleTag}${pagoTag}${compTag} • <i>${escapeHtml(m.observacion || 'Sin observación')}</i></p>
          </div>
        </div>
        <div class="mov-qty">
          <span class="num ${isEntrada ? 'entrada' : 'salida'}">
            ${isEntrada ? '+' : '-'}${m.cantidad}
          </span>
          <span class="user-tag">por @${escapeHtml(m.usuario || 'user')}</span>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Vista de Ajustes / Configuración de Google Sheets
 */
function renderSettingsView() {
  const isUserAdmin = isAdmin();
  applyRolePermissions();

  // Actualizar tarjeta de perfil del usuario activo (visible para todos)
  const user = AppState.user || (window.api && window.api.getCurrentUser());
  const profileInitial = document.getElementById("profile-avatar-initial");
  const profileName = document.getElementById("profile-full-name");
  const profileUser = document.getElementById("profile-username");
  const profileRoleBadge = document.getElementById("profile-role-badge");

  if (user) {
    const formattedName = formatUserName(user.usuario) || "Usuario";
    const rawUser = String(user.usuario || "usuario").toLowerCase();
    if (profileInitial) profileInitial.textContent = formattedName.charAt(0).toUpperCase();
    if (profileName) profileName.textContent = formattedName;
    if (profileUser) profileUser.textContent = `@${rawUser}`;
    if (profileRoleBadge) {
      profileRoleBadge.textContent = `Rol: ${user.rol || 'Usuario'}`;
      if (isUserAdmin) {
        profileRoleBadge.className = "badge-stock badge-in-stock";
      } else {
        profileRoleBadge.className = "badge-stock badge-low-stock";
      }
    }
  }

  // Configuración de URL: Exclusiva para Administrador
  if (isUserAdmin) {
    const urlInput = document.getElementById("settings-api-url");
    const demoToggle = document.getElementById("settings-demo-toggle");
    const statusBadge = document.getElementById("settings-status-badge");

    if (urlInput) urlInput.value = window.api.getApiUrl();
    if (demoToggle) demoToggle.checked = window.api.isDemoMode;

    if (statusBadge) {
      if (window.api.isDemoMode) {
        statusBadge.textContent = "Modo Demo Local";
        statusBadge.className = "badge-stock badge-low-stock";
      } else {
        statusBadge.textContent = "Conectado a Google Sheets";
        statusBadge.className = "badge-stock badge-in-stock";
      }
    }
  } else {
    // Si no es administrador, asegurarse de que no quede ningún valor de URL en el DOM
    const urlInput = document.getElementById("settings-api-url");
    if (urlInput) urlInput.value = "";
    const modalUrl = document.getElementById("modal-api-url");
    if (modalUrl) modalUrl.value = "";
  }
}

function openSettingsModal() {
  const currentUser = AppState.user || (window.api && window.api.getCurrentUser());
  if (currentUser && !isAdmin()) {
    showToast("Solo el Administrador puede modificar la configuración de Google Sheets.", "error");
    return;
  }
  const modal = document.getElementById("settings-modal");
  if (modal) {
    const modalUrl = document.getElementById("modal-api-url");
    const settingsUrl = document.getElementById("settings-api-url");
    const currentUrl = (window.api && window.api.getApiUrl()) || "";
    if (modalUrl) {
      modalUrl.value = currentUrl;
    }
    if (settingsUrl) {
      settingsUrl.value = currentUrl;
    }
    modal.classList.remove("hidden");
  }
}

function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.classList.add("hidden");
}

async function handleTestApiConnection() {
  const currentUser = AppState.user || (window.api && window.api.getCurrentUser());
  if (currentUser && !isAdmin()) {
    showToast("Acceso denegado: Solo el Administrador puede probar la conexión.", "error");
    return;
  }

  const modalInput = document.getElementById("modal-api-url");
  const settingsInput = document.getElementById("settings-api-url");
  const testBtn = document.getElementById("test-api-btn");
  const modalTestBtn = document.getElementById("modal-test-btn");

  let testUrl = "";
  if (modalInput && modalInput.value.trim()) {
    testUrl = modalInput.value.trim();
  } else if (settingsInput && settingsInput.value.trim()) {
    testUrl = settingsInput.value.trim();
  }

  if (!testUrl) {
    showToast("Por favor ingresa la URL de Google Apps Script", "error");
    return;
  }

  if (testBtn) {
    testBtn.disabled = true;
    testBtn.innerHTML = `<span class="spinner spinner-dark"></span> Conectando...`;
  }
  if (modalTestBtn) {
    modalTestBtn.disabled = true;
    modalTestBtn.innerHTML = `<span class="spinner spinner-dark"></span> Conectando...`;
  }

  try {
    const pingUrl = `${testUrl}${testUrl.includes('?') ? '&' : '?'}action=ping&_t=${Date.now()}`;
    const resp = await fetch(pingUrl, { method: "GET", mode: "cors" });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    const data = await resp.json();
    showToast(`✅ Conexión exitosa con Google Sheets: ${data.message || 'OK'}`, "success");
  } catch (err) {
    showToast(`❌ Error al conectar: ${err.message}`, "error");
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.innerHTML = "Probar Conexión";
    }
    if (modalTestBtn) {
      modalTestBtn.disabled = false;
      modalTestBtn.innerHTML = "Probar Conexión";
    }
  }
}

function handleSaveApiSettings() {
  const currentUser = AppState.user || (window.api && window.api.getCurrentUser());
  if (currentUser && !isAdmin()) {
    showToast("Acceso denegado: Solo el Administrador puede modificar la configuración.", "error");
    return;
  }

  const modalInput = document.getElementById("modal-api-url");
  const settingsInput = document.getElementById("settings-api-url");
  const demoToggle = document.getElementById("settings-demo-toggle");

  let newUrl = "";
  if (modalInput && modalInput.value.trim()) {
    newUrl = modalInput.value.trim();
  } else if (settingsInput && settingsInput.value.trim()) {
    newUrl = settingsInput.value.trim();
  }

  const isDemo = demoToggle ? demoToggle.checked : false;

  try {
    window.api.setApiUrl(newUrl);
    if (settingsInput) settingsInput.value = newUrl;
    if (modalInput) modalInput.value = newUrl;
    window.api.setDemoMode(isDemo);

    showToast("Configuración guardada correctamente.", "success");
    closeSettingsModal();
    if (AppState.user) {
      loadAppData();
    } else {
      hideLoginAlert();
      showToast("URL configurada. Ya puedes iniciar sesión.", "success");
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

/**
 * Toast flotante
 */
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `alert-box alert-${type}`;
  toast.style.position = "fixed";
  toast.style.bottom = "80px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.zIndex = "9999";
  toast.style.boxShadow = "0 10px 25px rgba(0,0,0,0.2)";
  toast.style.maxWidth = "90%";
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.4s ease";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

/**
 * Utilidades
 */
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getEyeIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function getEyeOffIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

/**
 * ===================================================
 * DASHBOARD ESTADÍSTICO DE VENTAS (Métricas y Gráficos)
 * Procesado 100% en memoria del cliente sin peticiones adicionales
 * ===================================================
 */

/**
 * Resuelve el nombre del artículo a partir de su código o descripción,
 * buscando en el catálogo de stock en memoria para evitar mostrar códigos tipo "C002-S".
 */
function getProductName(codigo, fallbackArticulo) {
  if (fallbackArticulo && fallbackArticulo.trim() && fallbackArticulo.trim() !== String(codigo || '').trim()) {
    return fallbackArticulo.trim();
  }
  const cleanCode = String(codigo || '').trim().toUpperCase();
  if (!cleanCode) return fallbackArticulo || "Producto sin nombre";

  const stock = AppState.stock || [];

  // 1. Coincidencia exacta de código en el inventario de stock
  const exact = stock.find(s => String(s.codigo || '').trim().toUpperCase() === cleanCode);
  if (exact && exact.articulo && exact.articulo.trim()) {
    return exact.articulo.trim();
  }

  // 2. Coincidencia por prefijo base (ej: si código es C002-S o C002-XL, el base es C002)
  const lastDash = cleanCode.lastIndexOf('-');
  const baseCode = lastDash > 0 ? cleanCode.substring(0, lastDash) : cleanCode;
  
  const baseMatch = stock.find(s => {
    const sCod = String(s.codigo || '').trim().toUpperCase();
    if (sCod === baseCode) return true;
    const sDash = sCod.lastIndexOf('-');
    const sBase = sDash > 0 ? sCod.substring(0, sDash) : sCod;
    return sBase === baseCode;
  });
  if (baseMatch && baseMatch.articulo && baseMatch.articulo.trim()) {
    return baseMatch.articulo.trim();
  }

  // 3. Coincidencia flexible donde el código empiece por baseCode
  const startsMatch = stock.find(s => String(s.codigo || '').trim().toUpperCase().startsWith(baseCode));
  if (startsMatch && startsMatch.articulo && startsMatch.articulo.trim()) {
    return startsMatch.articulo.trim();
  }

  return fallbackArticulo || codigo || "Producto sin nombre";
}

/**
 * ==========================================================================
 * FILTRADO DINÁMICO Y MÉTRICAS DEL DASHBOARD ESTADÍSTICO
 * ==========================================================================
 */

/**
 * Inicializa y puebla los desplegables de fecha en el Dashboard Estadístico
 */
function initStatsDateFilters() {
  const diaSelect = document.getElementById("stats-filter-dia");
  const mesSelect = document.getElementById("stats-filter-mes");
  const anioSelect = document.getElementById("stats-filter-anio");
  const resetBtn = document.getElementById("stats-filter-reset-btn");
  const toggleBtn = document.getElementById("stats-filter-toggle-btn");
  const container = document.getElementById("stats-date-filters");

  const now = new Date();
  const currentDia = String(now.getDate()).padStart(2, "0");
  const currentMes = String(now.getMonth());
  const currentAnio = String(now.getFullYear());

  if (!AppState.statsFilter) {
    AppState.statsFilter = { dia: currentDia, mes: currentMes, anio: currentAnio };
  }

  // 1. Poblar días del 01 al 31 si no están ya poblados
  if (diaSelect && diaSelect.options.length <= 1) {
    diaSelect.innerHTML = `<option value="ALL">Todos los días</option>`;
    for (let i = 1; i <= 31; i++) {
      const val = String(i).padStart(2, "0");
      diaSelect.innerHTML += `<option value="${val}">${val}</option>`;
    }
  }

  // 2. Establecer valor inicial de día
  if (diaSelect) {
    diaSelect.value = AppState.statsFilter.dia || currentDia;
  }

  // 3. Establecer valor inicial de mes
  if (mesSelect) {
    mesSelect.value = AppState.statsFilter.mes !== undefined ? String(AppState.statsFilter.mes) : currentMes;
  }

  // 4. Poblar años disponibles
  populateStatsYears();

  // 5. Conectar eventos change a cada select
  if (diaSelect && !diaSelect._boundChange) {
    diaSelect._boundChange = true;
    diaSelect.addEventListener("change", handleDateFilterChange);
  }
  if (mesSelect && !mesSelect._boundChange) {
    mesSelect._boundChange = true;
    mesSelect.addEventListener("change", handleDateFilterChange);
  }
  if (anioSelect && !anioSelect._boundChange) {
    anioSelect._boundChange = true;
    anioSelect.addEventListener("change", handleDateFilterChange);
  }

  // 6. Botón reset
  if (resetBtn && !resetBtn._boundClick) {
    resetBtn._boundClick = true;
    resetBtn.addEventListener("click", () => resetStatsDateFilter());
  }

  // 7. Botón lápiz para toggle del contenedor
  if (toggleBtn && container && !toggleBtn._boundClick) {
    toggleBtn._boundClick = true;
    toggleBtn.addEventListener("click", () => {
      const isHidden = container.classList.contains("hidden");
      if (isHidden) {
        container.classList.remove("hidden");
        toggleBtn.classList.add("active");
      } else {
        container.classList.add("hidden");
        updateStatsFilterToggleBtnState();
      }
    });
  }

  updateStatsFilterSummaryText();
  updateStatsFilterToggleBtnState();
}

/**
 * Puebla el selector de años dinámicamente con los años presentes en movimientos
 */
function populateStatsYears() {
  const anioSelect = document.getElementById("stats-filter-anio");
  if (!anioSelect) return;

  const nowYear = new Date().getFullYear();
  const yearsSet = new Set([nowYear, 2026, 2025, 2024]);

  const movs = AppState.movements || [];
  movs.forEach(m => {
    const parts = parseMovementDateParts(m.fechaHora);
    if (parts && !isNaN(parts.year)) {
      yearsSet.add(parseInt(parts.year, 10));
    }
  });

  const years = Array.from(yearsSet).sort((a, b) => b - a);
  const currentVal = AppState.statsFilter ? String(AppState.statsFilter.anio) : String(nowYear);

  anioSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
  anioSelect.value = years.includes(parseInt(currentVal, 10)) ? currentVal : String(nowYear);
}

/**
 * Maneja el cambio de selección en cualquiera de los desplegables de fecha
 */
function handleDateFilterChange() {
  const diaSelect = document.getElementById("stats-filter-dia");
  const mesSelect = document.getElementById("stats-filter-mes");
  const anioSelect = document.getElementById("stats-filter-anio");

  if (!AppState.statsFilter) AppState.statsFilter = {};
  if (diaSelect) AppState.statsFilter.dia = diaSelect.value;
  if (mesSelect) AppState.statsFilter.mes = mesSelect.value;
  if (anioSelect) AppState.statsFilter.anio = anioSelect.value;

  updateStatsFilterSummaryText();
  updateStatsFilterToggleBtnState();
  renderStatsDashboard();
}

/**
 * Restablece los filtros de fecha a la fecha actual (Día actual, Mes actual y Año actual)
 */
window.resetStatsDateFilter = function() {
  const now = new Date();
  const currentDia = String(now.getDate()).padStart(2, "0");
  const currentMes = String(now.getMonth());
  const currentAnio = String(now.getFullYear());

  AppState.statsFilter = {
    dia: currentDia,
    mes: currentMes,
    anio: currentAnio
  };

  const diaSelect = document.getElementById("stats-filter-dia");
  const mesSelect = document.getElementById("stats-filter-mes");
  const anioSelect = document.getElementById("stats-filter-anio");

  if (diaSelect) diaSelect.value = currentDia;
  if (mesSelect) mesSelect.value = currentMes;
  if (anioSelect) anioSelect.value = currentAnio;

  updateStatsFilterSummaryText();
  updateStatsFilterToggleBtnState();
  renderStatsDashboard();
};

/**
 * Verifica si el filtro actual coincide exactamente con el día de hoy
 */
function isStatsFilterToday() {
  if (!AppState.statsFilter) return true;
  const now = new Date();
  const currentDia = parseInt(now.getDate(), 10);
  const currentMes = parseInt(now.getMonth(), 10);
  const currentAnio = parseInt(now.getFullYear(), 10);

  const filterDia = AppState.statsFilter.dia === "ALL" ? null : parseInt(AppState.statsFilter.dia, 10);
  const filterMes = parseInt(AppState.statsFilter.mes, 10);
  const filterAnio = parseInt(AppState.statsFilter.anio, 10);

  return filterDia === currentDia && filterMes === currentMes && filterAnio === currentAnio;
}

/**
 * Actualiza el estado visual del botón del lápiz (resaltado si está abierto o si hay un filtro personalizado)
 */
function updateStatsFilterToggleBtnState() {
  const toggleBtn = document.getElementById("stats-filter-toggle-btn");
  const container = document.getElementById("stats-date-filters");
  if (!toggleBtn) return;

  const isOpen = container && !container.classList.contains("hidden");
  const isCustom = !isStatsFilterToday();

  if (isOpen || isCustom) {
    toggleBtn.classList.add("active");
  } else {
    toggleBtn.classList.remove("active");
  }
}

/**
 * Actualiza el texto de resumen del filtro activo
 */
function updateStatsFilterSummaryText() {
  const summaryEl = document.getElementById("stats-filter-summary-text");
  if (!summaryEl || !AppState.statsFilter) return;

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const { dia, mes, anio } = AppState.statsFilter;
  const mesName = monthNames[parseInt(mes, 10)] || "Mes";

  if (isStatsFilterToday()) {
    summaryEl.textContent = `Filtrando: Hoy (${dia}/${parseInt(mes, 10) + 1}/${anio})`;
  } else if (dia === "ALL") {
    summaryEl.textContent = `Filtrando: Todo ${mesName} ${anio}`;
  } else {
    summaryEl.textContent = `Filtrando: ${dia} de ${mesName} de ${anio}`;
  }
}

/**
 * Renderizado principal de las métricas del Dashboard Estadístico
 */
function renderStatsDashboard() {
  const now = new Date();
  if (!AppState.statsFilter) {
    AppState.statsFilter = {
      dia: String(now.getDate()).padStart(2, "0"),
      mes: String(now.getMonth()),
      anio: String(now.getFullYear())
    };
  }

  const { dia, mes, anio } = AppState.statsFilter;
  const filterAnio = parseInt(anio, 10);
  const filterMes = parseInt(mes, 10);
  const filterDia = dia === "ALL" ? null : parseInt(dia, 10);

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const mesName = monthNames[filterMes] || "Mes";

  // Filtrar exclusivamente ventas (SALIDA) de forma insensible a mayúsculas/minúsculas y espacios
  const movs = AppState.movements || [];
  const salesMovements = movs.filter(m => String(m.tipo || "").trim().toUpperCase() === "SALIDA");

  // Filtrar según combinación Día/Mes/Año seleccionada comparando valores numéricos con parseInt
  const periodSales = salesMovements.filter(m => {
    const parts = parseMovementDateParts(m.fechaHora);
    if (!parts) return false;

    const movYear = parseInt(parts.year, 10);
    const movMonth = parseInt(parts.month, 10); // Base 0: 0 = Enero, 11 = Diciembre
    const movDay = parseInt(parts.day, 10);

    if (movYear !== filterAnio) return false;
    if (movMonth !== filterMes) return false;
    if (filterDia !== null && movDay !== filterDia) return false;
    return true;
  });

  let totalVentasPeriodo = 0;
  let totalProductosVendidos = 0;
  periodSales.forEach(m => {
    const amt = parseFloat(String(m.precioVenta !== undefined && m.precioVenta !== null ? m.precioVenta : "0").replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
    const qty = parseInt(String(m.cantidad || "1").replace(/[^0-9-]/g, ""), 10) || 1;
    totalVentasPeriodo += amt;
    totalProductosVendidos += qty;
  });

  const txPeriodoCount = periodSales.length;
  const ticketPromedio = txPeriodoCount > 0 ? (totalVentasPeriodo / txPeriodoCount) : 0;
  const hasRecords = txPeriodoCount > 0;

  // 1. Tarjetas de Resumen (KPIs)
  const statVentasLabel = document.getElementById("stat-ventas-label");
  const statVentasVal = document.getElementById("stat-ventas-val");
  const statVentasHint = document.getElementById("stat-ventas-hint");
  const statTicketVal = document.getElementById("stat-ticket-val");
  const statTicketHint = document.getElementById("stat-ticket-hint");
  const statAlertasVal = document.getElementById("stat-alertas-val");
  const statAlertasHint = document.getElementById("stat-alertas-hint");

  // Título dinámico del card 1: "Ventas del [Día/Mes/Año]"
  if (statVentasLabel) {
    if (filterDia !== null) {
      statVentasLabel.innerHTML = "Ventas<br>del Día";
    } else {
      statVentasLabel.innerHTML = "Ventas<br>del Mes";
    }
  }

  if (statVentasVal) {
    statVentasVal.textContent = `S/ ${totalVentasPeriodo.toFixed(2)}`;
  }
  if (statVentasHint) {
    if (hasRecords) {
      if (filterDia !== null) {
        statVentasHint.textContent = `${txPeriodoCount} transaccione${txPeriodoCount === 1 ? '' : 's'} (${String(filterDia).padStart(2, '0')}/${String(filterMes + 1).padStart(2, '0')})`;
      } else {
        statVentasHint.textContent = `${txPeriodoCount} transaccione${txPeriodoCount === 1 ? '' : 's'} en ${mesName}`;
      }
    } else {
      statVentasHint.textContent = "No se encontraron registros para esta fecha";
    }
  }

  if (statTicketVal) {
    statTicketVal.textContent = `S/ ${ticketPromedio.toFixed(2)}`;
  }
  if (statTicketHint) {
    statTicketHint.textContent = hasRecords
      ? `Promedio por transacción (${txPeriodoCount})`
      : "No se encontraron registros para esta fecha";
  }

  if (statAlertasVal) {
    statAlertasVal.textContent = totalProductosVendidos;
  }
  if (statAlertasHint) {
    statAlertasHint.textContent = hasRecords
      ? `${totalProductosVendidos} unid. vendidas`
      : "No se encontraron registros para esta fecha";
  }

  // 2. Gráfico Estadístico de Ventas (SVG Ligero)
  const chartTitleEl = document.getElementById("stats-chart-title");
  const chartTotalEl = document.getElementById("stats-chart-period-total");
  const chartContainer = document.getElementById("stats-chart-container");

  let chartTitleText = "Tendencia de Ventas";
  if (isStatsFilterToday()) {
    chartTitleText = "Tendencia de Ventas (Hoy)";
  } else if (filterDia !== null) {
    chartTitleText = `Tendencia de Ventas (${String(filterDia).padStart(2, '0')}/${String(filterMes + 1).padStart(2, '0')}/${filterAnio})`;
  } else {
    chartTitleText = `Tendencia de Ventas (${mesName} ${filterAnio})`;
  }

  if (chartTitleEl) chartTitleEl.textContent = chartTitleText;
  if (chartTotalEl) chartTotalEl.textContent = `Ingresos: S/ ${totalVentasPeriodo.toFixed(2)}`;

  if (chartContainer) {
    chartContainer.innerHTML = generateSalesChartSvg(AppState.statsFilter, periodSales, totalVentasPeriodo);
  }

  // 3. Top 3 Productos Más Vendidos
  const topPeriodLabel = document.getElementById("stats-top-period-label");
  if (topPeriodLabel) {
    if (isStatsFilterToday()) {
      topPeriodLabel.textContent = "En el día de hoy";
    } else if (filterDia !== null) {
      topPeriodLabel.textContent = `Para el ${String(filterDia).padStart(2, '0')}/${String(filterMes + 1).padStart(2, '0')}/${filterAnio}`;
    } else {
      topPeriodLabel.textContent = `Para ${mesName} ${filterAnio}`;
    }
  }

  const prodMap = new Map();
  periodSales.forEach(m => {
    const name = getProductName(m.codigo, m.articulo);
    if (!prodMap.has(name)) {
      prodMap.set(name, { name, units: 0, totalMoney: 0 });
    }
    const r = prodMap.get(name);
    const amt = parseFloat(String(m.precioVenta !== undefined && m.precioVenta !== null ? m.precioVenta : "0").replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
    const qty = parseInt(String(m.cantidad || "1").replace(/[^0-9-]/g, ""), 10) || 1;
    r.units += qty;
    r.totalMoney += amt;
  });

  const top3 = Array.from(prodMap.values())
    .sort((a, b) => b.units - a.units || b.totalMoney - a.totalMoney)
    .slice(0, 3);

  renderTopProducts(top3, hasRecords);
  updateStatsFilterToggleBtnState();
}

/**
 * Genera un gráfico de barras vectorial SVG ultraligero y responsivo
 */
function generateSalesChartSvg(filter, periodSales, totalPeriodSales) {
  const width = 360;
  const height = 150;
  const padLeft = 38;
  const padRight = 14;
  const padTop = 22;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const isAllDays = filter && filter.dia === "ALL";
  let buckets = [];

  if (!isAllDays) {
    // 7 intervalos de horas en el día comercial
    buckets = [
      { label: "8-10h", total: 0, minHour: 8, maxHour: 10 },
      { label: "10-12h", total: 0, minHour: 10, maxHour: 12 },
      { label: "12-14h", total: 0, minHour: 12, maxHour: 14 },
      { label: "14-16h", total: 0, minHour: 14, maxHour: 16 },
      { label: "16-18h", total: 0, minHour: 16, maxHour: 18 },
      { label: "18-20h", total: 0, minHour: 18, maxHour: 20 },
      { label: "20h+", total: 0, minHour: 20, maxHour: 24 }
    ];

    (periodSales || []).forEach(m => {
      const parts = parseMovementDateParts(m.fechaHora);
      if (parts) {
        const h = parseInt(parts.hour, 10);
        const amt = parseFloat(String(m.precioVenta !== undefined && m.precioVenta !== null ? m.precioVenta : "0").replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
        const target = buckets.find(b => h >= b.minHour && h < b.maxHour) || (h < 8 ? buckets[0] : buckets[buckets.length - 1]);
        if (target) target.total += amt;
      }
    });
  } else {
    // 5 semanas del mes
    buckets = [
      { label: "Sem 1", total: 0, minDay: 1, maxDay: 7 },
      { label: "Sem 2", total: 0, minDay: 8, maxDay: 14 },
      { label: "Sem 3", total: 0, minDay: 15, maxDay: 21 },
      { label: "Sem 4", total: 0, minDay: 22, maxDay: 28 },
      { label: "Sem 5", total: 0, minDay: 29, maxDay: 31 }
    ];

    (periodSales || []).forEach(m => {
      const parts = parseMovementDateParts(m.fechaHora);
      if (parts) {
        const day = parseInt(parts.day, 10);
        const amt = parseFloat(String(m.precioVenta !== undefined && m.precioVenta !== null ? m.precioVenta : "0").replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
        const target = buckets.find(b => day >= b.minDay && day <= b.maxDay) || buckets[buckets.length - 1];
        if (target) target.total += amt;
      }
    });
  }

  const maxVal = Math.max(...buckets.map(b => b.total), 80);
  const numBuckets = buckets.length;
  const barGap = numBuckets > 8 ? 6 : 10;
  const totalGaps = barGap * (numBuckets + 1);
  const barWidth = Math.max(8, Math.floor((plotW - totalGaps) / numBuckets));

  let barsSvg = "";
  buckets.forEach((b, i) => {
    const x = padLeft + barGap + i * (barWidth + barGap);
    const barH = b.total > 0 ? Math.max(6, Math.round((b.total / maxVal) * plotH)) : 3;
    const y = padTop + plotH - barH;
    const isZero = b.total === 0;

    if (!isZero) {
      barsSvg += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="4" fill="url(#statsBarGrad)" class="stats-svg-bar">
          <title>${b.label}: S/ ${b.total.toFixed(2)}</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${Math.max(12, y - 4)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#be185d">S/${Math.round(b.total)}</text>
      `;
    } else {
      barsSvg += `
        <rect x="${x}" y="${padTop + plotH - 3}" width="${barWidth}" height="3" rx="1.5" fill="#e2e8f0" class="stats-svg-empty-bar">
          <title>${b.label}: S/ 0.00</title>
        </rect>
      `;
    }

    barsSvg += `
      <text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle" font-size="${numBuckets > 8 ? '8' : '9.5'}" font-weight="600" fill="#64748b">${b.label}</text>
    `;
  });

  const gridYMid = padTop + plotH / 2;
  const gridYTop = padTop;
  const gridYBottom = padTop + plotH;

  const hasAnySales = buckets.some(b => b.total > 0);

  return `
    <svg viewBox="0 0 ${width} ${height}" class="stats-svg-chart" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="statsBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#db2777" />
          <stop offset="100%" stop-color="#be185d" />
        </linearGradient>
      </defs>
      <!-- Guías horizontales de escala -->
      <line x1="${padLeft}" y1="${gridYTop}" x2="${width - padRight}" y2="${gridYTop}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="${padLeft - 4}" y="${gridYTop + 4}" text-anchor="end" font-size="8" fill="#94a3b8" font-weight="600">S/${Math.round(maxVal)}</text>

      <line x1="${padLeft}" y1="${gridYMid}" x2="${width - padRight}" y2="${gridYMid}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="${padLeft - 4}" y="${gridYMid + 3}" text-anchor="end" font-size="8" fill="#94a3b8" font-weight="600">S/${Math.round(maxVal / 2)}</text>

      <line x1="${padLeft}" y1="${gridYBottom}" x2="${width - padRight}" y2="${gridYBottom}" stroke="#cbd5e1" stroke-width="1.2"/>
      <text x="${padLeft - 4}" y="${gridYBottom + 3}" text-anchor="end" font-size="8" fill="#94a3b8" font-weight="600">S/0</text>

      <!-- Barras y etiquetas -->
      ${barsSvg}

      ${!hasAnySales ? `
        <rect x="${padLeft + 8}" y="${padTop + 14}" width="${plotW - 16}" height="${plotH - 28}" rx="8" fill="rgba(255,255,255,0.92)" stroke="#fbcfe8" stroke-width="1"/>
        <text x="${width / 2}" y="${padTop + plotH / 2 - 2}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#831843">No se encontraron registros para esta fecha</text>
        <text x="${width / 2}" y="${padTop + plotH / 2 + 13}" text-anchor="middle" font-size="8.5" font-weight="500" fill="#9d174d">Modifica los filtros o presiona Restablecer</text>
      ` : ''}
    </svg>
  `;
}

/**
 * Renderiza la lista corta del Top 3 Productos Más Vendidos
 */
function renderTopProducts(top3, hasRecords) {
  const container = document.getElementById("stats-top-products-list");
  if (!container) return;

  if (!hasRecords || !top3 || top3.length === 0) {
    container.innerHTML = `
      <div class="stats-empty-view">
        <div style="font-size:1.6rem; margin-bottom:4px;">🔍</div>
        <div style="font-weight:700; color:#831843; font-size:0.85rem; margin-bottom:2px;">No se encontraron registros para esta fecha</div>
        <span style="font-size:0.72rem; color:#94a3b8;">No se registraron ventas para la fecha seleccionada.</span>
        <div style="margin-top:10px;">
          <button type="button" class="stats-filter-reset-btn" onclick="resetStatsDateFilter()">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Restablecer a Hoy
          </button>
        </div>
      </div>
    `;
    return;
  }

  const maxUnits = top3[0].units || 1;

  container.innerHTML = top3.map((prod, idx) => {
    const rankNum = idx + 1;
    const rankClass = rankNum === 1 ? "stats-rank-1" : (rankNum === 2 ? "stats-rank-2" : "stats-rank-3");
    const pct = Math.max(15, Math.round((prod.units / maxUnits) * 100));

    return `
      <div class="stats-top-item">
        <div class="stats-top-row">
          <div class="stats-top-left">
            <span class="stats-rank-badge ${rankClass}">#${rankNum}</span>
            <span class="stats-top-name" title="${escapeHtml(prod.name)}">${escapeHtml(prod.name)}</span>
          </div>
          <div class="stats-top-right">
            <span class="stats-top-money">S/ ${prod.totalMoney.toFixed(2)}</span>
            <span class="stats-top-units">${prod.units} unid. vendida${prod.units === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="stats-progress-track">
          <div class="stats-progress-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join("");
}
