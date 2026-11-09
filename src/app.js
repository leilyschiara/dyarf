/**
 * D'CAMISAS - Lógica de Aplicación Móvil
 */

// Estado global de la aplicación
const AppState = {
  user: null,
  activeTab: "dashboard",
  stock: [],
  movements: [],
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
    observacion: "Venta en tienda",
    observacionSalida: "Venta en tienda",
    observacionEntrada: "Reposición de taller"
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

  // Botón Demo Login
  const demoLoginBtn = document.getElementById("demo-login-btn");
  if (demoLoginBtn) {
    demoLoginBtn.addEventListener("click", () => {
      document.getElementById("login-user").value = "admin";
      document.getElementById("login-password").value = "1111";
      handleLoginSubmit(new Event("submit"));
    });
  }

  // Configuración de API desde Login
  const configBtnLogin = document.getElementById("config-btn-login");
  if (configBtnLogin) {
    configBtnLogin.addEventListener("click", () => openSettingsModal());
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

  // Botones de Observación en ENTRADA (Reposición de taller, Llegada lote confección, Ajuste de inventario)
  document.querySelectorAll("#entrada-obs-buttons .option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#entrada-obs-buttons .option-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const hidden = document.getElementById("mov-observacion");
      if (hidden) hidden.value = btn.dataset.value;
      AppState.movementForm.observacionEntrada = btn.dataset.value;
    });
  });

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
  if (!user || !user.rol) return false;
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
  const isUserAdmin = isAdmin();

  // Control de la sección de conexión en Ajustes
  if (adminSection) {
    if (isUserAdmin) {
      adminSection.classList.remove("hidden");
    } else {
      adminSection.classList.add("hidden");
    }
  }

  // Ocultar botón de login si existiera
  if (configBtnLogin) {
    configBtnLogin.classList.add("hidden");
  }

  // Si no es admin y el modal estaba abierto, forzar su cierre
  if (!isUserAdmin && modal) {
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

function updateUserHeader() {
  const user = AppState.user;
  const userNameEl = document.getElementById("header-user-name");
  const userRoleEl = document.getElementById("header-user-role");
  if (user) {
    if (userNameEl) userNameEl.textContent = user.usuario || "";
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

  // Refrescar contenido según tab
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

    if (result.success && result.user) {
      AppState.user = result.user;
      showToast(`¡Bienvenido, ${result.user.usuario}!`, "success");
      showMainApp();
      await loadAppData();
    } else {
      showLoginAlert(result.message || "Error al iniciar sesión.", "error");
    }
  } catch (err) {
    showLoginAlert(`Error de conexión: ${err.message}`, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Iniciar Sesión`;
  }
}

function showLoginAlert(msg, type = "error") {
  const alertEl = document.getElementById("login-alert");
  if (alertEl) {
    alertEl.textContent = msg;
    alertEl.className = `alert-box alert-${type}`;
    alertEl.classList.remove("hidden");
  }
}

function hideLoginAlert() {
  const alertEl = document.getElementById("login-alert");
  if (alertEl) alertEl.classList.add("hidden");
}

/**
 * Carga de Datos (Stock y Movimientos)
 */
async function loadAppData() {
  AppState.isLoading = true;
  updateSyncStatus("Sincronizando...", true);

  try {
    const [stockRes, movsRes] = await Promise.all([
      window.api.getStock(),
      window.api.getMovements(40)
    ]);

    if (stockRes.success && stockRes.data) {
      AppState.stock = stockRes.data;
    }
    if (movsRes.success && movsRes.data) {
      AppState.movements = movsRes.data;
    }

    renderDashboard();
    renderStockList();
    populateProductSelect();
    renderRecentMovements();

    const isDemo = window.api.isDemoMode;
    updateSyncStatus(isDemo ? "Modo Demo Activo" : "Conectado a Google Sheets", false);

  } catch (err) {
    console.error("Error al cargar datos:", err);
    updateSyncStatus("Modo Fuera de Línea", false);
  } finally {
    AppState.isLoading = false;
  }
}

async function syncAllData(manual = false) {
  const syncBtn = document.getElementById("sync-btn");
  if (syncBtn) syncBtn.classList.add("rotating");

  await loadAppData();

  if (syncBtn) syncBtn.classList.remove("rotating");
  if (manual) {
    showToast("Datos sincronizados con éxito", "success");
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

  // Inyectar en elementos KPI
  const kpiTotal = document.getElementById("kpi-total-unidades");
  const kpiModelos = document.getElementById("kpi-total-modelos");
  const kpiBajo = document.getElementById("kpi-bajo-stock");
  const kpiAgotados = document.getElementById("kpi-agotados");

  if (kpiTotal) kpiTotal.textContent = totalUnidades;
  if (kpiModelos) kpiModelos.textContent = productGroups.length;
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

    // 2. Filtro por Talla
    if (sizeFilter !== "ALL") {
      const hasSize = group.variants.some(v => String(v.talla || "").trim().toUpperCase() === sizeFilter.toUpperCase());
      if (!hasSize) return false;
    }

    // 3. Filtro por Disponibilidad
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
      const hasOut = group.variants.some(v => (Number(v.stockDisponible) || 0) === 0);
      if (!hasOut) return false;
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
    if (group.hasOutOfStock) {
      badgeHtml = `<span class="product-status-pill out-stock"><span style="font-weight:900;">✖</span> Agotado</span>`;
    } else if (group.hasLowStock) {
      badgeHtml = `<span class="product-status-pill low-stock"><span style="font-size:0.8rem;">⚠️</span> Stock Bajo</span>`;
    } else {
      badgeHtml = `<span class="product-status-pill in-stock"><span style="font-weight:900;">✓</span> En stock</span>`;
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

              return `
                <div class="size-col" onclick="event.stopPropagation(); quickMoveAction('${escapeHtml(v.codigo)}')">
                  <span class="col-size-name">${escapeHtml(v.talla)}</span>
                  <span class="col-size-qty ${qtyClass}">${disp}</span>
                  <span class="col-size-unit ${qtyClass}">unid.</span>
                </div>
              `;
            }).join("")}
          </div>
          <div class="strip-chevron">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"></polyline>
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
  const list = document.getElementById("critical-stock-list");
  const icon = document.getElementById("critical-chevron-icon");
  if (!list) return;
  const isHidden = list.style.display === "none";
  list.style.display = isHidden ? "block" : "none";
  if (icon) {
    icon.style.transform = isHidden ? "rotate(0deg)" : "rotate(180deg)";
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
 * Actualiza el indicador de stock bajo cada uno de los 4 botones de talla
 */
function updateSizeButtonsStock() {
  const selectedArticulo = AppState.movementForm.selectedArticulo;
  const isSalida = AppState.movementForm.tipo === "SALIDA";
  const sizes = ["S", "M", "L", "XL"];

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

  updateStockPreview();
}

/**
 * Acción rápida desde una tarjeta de producto
 */
window.quickMoveAction = function(codigo) {
  switchTab("movimientos");
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
};

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
    previewBox.innerHTML = `<span style="color:var(--text-muted);">Selecciona una talla (S, M, L, XL) para calcular el stock</span>`;
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
          Código: <b class="badge-code">${escapeHtml(codigo)}</b> | Stock actual: <b>${stockActual} unid.</b>
        </span>
        <span style="font-size:0.85rem; font-weight:800; color:${(isOutOfStock || isExceeded) ? 'var(--danger)' : 'var(--text-main)'}">
          ${isOutOfStock ? '❌ Venta bloqueada: Artículo agotado (0 unid.)' : (isExceeded ? `⚠️ Venta bloqueada: Cantidad supera stock disponible` : `Stock tras venta: <b>${stockFinal} unid.</b>`)}
        </span>
      </div>
      ${isOutOfStock ? `<span class="badge-stock badge-out-stock">🚫 Agotado (0)</span>` : (isExceeded ? `<span class="badge-stock badge-out-stock">⚠️ Excede stock</span>` : '')}
    `;

  } else {
    // Modo ENTRADA
    const stockFinal = stockActual + cant;

    previewBox.innerHTML = `
      <div>
        <span style="display:block; font-size:0.75rem; color:var(--text-muted);">
          Código: <b class="badge-code">${escapeHtml(codigo)}</b> | Stock actual: <b>${stockActual} unid.</b>
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

    // Observación de SALIDA (Columna I)
    const obsSelect = document.getElementById("mov-salida-observacion");
    observacion = (obsSelect && obsSelect.value.trim()) || AppState.movementForm.observacionSalida || "Venta en tienda";
    if (!observacion || (observacion !== "Venta en tienda" && observacion !== "Venta por whatsapp")) {
      showToast("Selecciona una observación para la venta.", "error");
      return;
    }

  } else {
    // Modo ENTRADA: Botones de observación de entrada (F, G, H quedan vacías)
    const obsInput = document.getElementById("mov-observacion");
    observacion = (obsInput && obsInput.value.trim()) || AppState.movementForm.observacionEntrada || "Reposición de taller";
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

  // Generar identificador de idempotencia único
  const requestId = (typeof crypto !== "undefined" && crypto.randomUUID) ?
    `MOV-${crypto.randomUUID()}` :
    `MOV-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  try {
    const payload = {
      usuario: AppState.user ? AppState.user.usuario : "Admin",
      tipo: tipo,
      codigo: codigo,
      cantidad: cantidad,
      observacion: observacion,
      requestId: requestId
    };

    if (tipo === "SALIDA") {
      payload.precioVenta = precioVenta;
      payload.tipoVenta = tipoVenta;
      payload.precioSinIgv = precioSinIgv;
    }

    const res = await window.api.addMovement(payload);

    if (res.success) {
      showToast(res.message || "Movimiento guardado con éxito", "success");

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

        // Reset Observación Salida a Venta en tienda (primer botón siempre seleccionado por defecto)
        document.querySelectorAll("#salida-obs-buttons .option-btn").forEach((b, idx) => {
          if (idx === 0 || b.dataset.value === "Venta en tienda") b.classList.add("active");
          else b.classList.remove("active");
        });
        const obsSalHidden = document.getElementById("mov-salida-observacion");
        if (obsSalHidden) obsSalHidden.value = "Venta en tienda";
        AppState.movementForm.observacionSalida = "Venta en tienda";

      } else {
        // Reset Observación Entrada a Reposición de taller (primer botón siempre seleccionado por defecto)
        document.querySelectorAll("#entrada-obs-buttons .option-btn").forEach((b, idx) => {
          if (idx === 0 || b.dataset.value === "Reposición de taller") b.classList.add("active");
          else b.classList.remove("active");
        });
        const obsEntHidden = document.getElementById("mov-observacion");
        if (obsEntHidden) obsEntHidden.value = "Reposición de taller";
        AppState.movementForm.observacionEntrada = "Reposición de taller";
      }

      // Sincronizar datos con Google Sheets
      await loadAppData();
      updateStockPreview();
      switchTab("movimientos");
    } else {
      showToast(res.message || "Error al registrar el movimiento.", "error");
    }

  } catch (err) {
    showToast(`Error de conexión al procesar: ${err.message}`, "error");
  } finally {
    AppState.isSubmittingMovement = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      if (originalText) submitBtn.innerHTML = originalText;
    }
  }
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

    return `
      <div class="movement-item">
        <div class="mov-left">
          <div class="mov-badge-icon ${isEntrada ? 'entrada' : 'salida'}">
            ${isEntrada ? '↓' : '↑'}
          </div>
          <div class="mov-info">
            <h4>${escapeHtml(m.articulo || m.codigo)}</h4>
            <p>${escapeHtml(m.fechaHora || '')}${saleTag} • <i>${escapeHtml(m.observacion || 'Sin observación')}</i></p>
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
    const username = user.usuario || "Usuario";
    if (profileInitial) profileInitial.textContent = username.charAt(0).toUpperCase();
    if (profileName) profileName.textContent = username;
    if (profileUser) profileUser.textContent = `@${username}`;
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
  if (!isAdmin()) {
    console.warn("Acceso denegado al modal: rol no autorizado.");
    return;
  }
  const modal = document.getElementById("settings-modal");
  if (modal) {
    renderSettingsView();
    modal.classList.remove("hidden");
  }
}

function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.classList.add("hidden");
}

async function handleTestApiConnection() {
  if (!isAdmin()) {
    showToast("Acceso denegado: Solo el Administrador puede probar la conexión.", "error");
    return;
  }

  const urlInput = document.getElementById("settings-api-url");
  const testBtn = document.getElementById("test-api-btn");
  const testUrl = (urlInput ? urlInput.value : "").trim();

  if (!testUrl) {
    showToast("Por favor ingresa la URL de Google Apps Script", "error");
    return;
  }

  testBtn.disabled = true;
  testBtn.innerHTML = `<span class="spinner spinner-dark"></span> Conectando...`;

  try {
    window.api.setApiUrl(testUrl);
    const pingRes = await window.api.ping();

    showToast(`✅ Conexión exitosa: ${pingRes.message}`, "success");
    renderSettingsView();
  } catch (err) {
    showToast(`❌ Error al conectar: ${err.message}`, "error");
  } finally {
    testBtn.disabled = false;
    testBtn.innerHTML = "Probar Conexión";
  }
}

function handleSaveApiSettings() {
  if (!isAdmin()) {
    showToast("Acceso denegado: Solo el Administrador puede modificar la configuración.", "error");
    return;
  }

  const urlInput = document.getElementById("settings-api-url");
  const demoToggle = document.getElementById("settings-demo-toggle");

  const newUrl = (urlInput ? urlInput.value : "").trim();
  const isDemo = demoToggle ? demoToggle.checked : false;

  try {
    window.api.setApiUrl(newUrl);
    window.api.setDemoMode(isDemo);

    showToast("Configuración guardada correctamente", "success");
    closeSettingsModal();
    loadAppData();
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
