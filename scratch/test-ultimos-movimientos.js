const assert = require("assert");

console.log("=== INICIANDO PRUEBAS DE ÚLTIMOS MOVIMIENTOS ===");

// 1. Simulación de getProductName y getMovementProductWithTalla
const mockStock = [
  { codigo: "CAM-001-S", articulo: "Camisa Oxford Clásica Celeste", talla: "S" },
  { codigo: "CAM-001-M", articulo: "Camisa Oxford Clásica Celeste", talla: "M" },
  { codigo: "CAM-001-L", articulo: "Camisa Oxford Clásica Celeste", talla: "L" },
  { codigo: "CAM-001-XL", articulo: "Camisa Oxford Clásica Celeste", talla: "XL" },
  { codigo: "CAM-002-M", articulo: "CAMISA AIR - CHALIS", talla: "M" }
];

function getProductName(codigo, fallbackArticulo) {
  if (fallbackArticulo && fallbackArticulo.trim() && fallbackArticulo.trim() !== String(codigo || '').trim()) {
    return fallbackArticulo.trim();
  }
  const cleanCode = String(codigo || '').trim().toUpperCase();
  const exact = mockStock.find(s => s.codigo.toUpperCase() === cleanCode);
  if (exact) return exact.articulo;
  return fallbackArticulo || codigo || "Producto";
}

function getMovementProductWithTalla(m) {
  if (!m) return "Producto sin nombre";
  let baseName = getProductName(m.codigo, m.articulo) || "Producto sin nombre";

  let talla = "";
  if (m.talla && typeof m.talla === "string" && m.talla.trim()) {
    talla = m.talla.trim().toUpperCase();
  } else if (m.codigo && mockStock.length > 0) {
    const cleanCod = String(m.codigo).trim().toUpperCase();
    const item = mockStock.find(s => String(s.codigo || '').trim().toUpperCase() === cleanCod);
    if (item && item.talla && String(item.talla).trim()) {
      talla = String(item.talla).trim().toUpperCase();
    }
  }

  if (!talla && m.codigo) {
    const cleanCod = String(m.codigo).trim().toUpperCase();
    const match = cleanCod.match(/-(XXL|XL|XS|XXXL|[SML])$/i);
    if (match) {
      talla = match[1].toUpperCase();
    }
  }

  if (talla) {
    const regexTalla = new RegExp(`\\(${talla}\\)`, 'i');
    if (!regexTalla.test(baseName)) {
      return `${baseName.trim()} (${talla})`;
    }
  }
  return baseName;
}

// Pruebas de extracción de talla
const m1 = { codigo: "CAM-002-M", articulo: "CAMISA AIR - CHALIS" };
assert.strictEqual(getMovementProductWithTalla(m1), "CAMISA AIR - CHALIS (M)");

const m2 = { codigo: "CAM-001-XL", articulo: "Camisa Oxford Clásica Celeste" };
assert.strictEqual(getMovementProductWithTalla(m2), "Camisa Oxford Clásica Celeste (XL)");

const m3 = { codigo: "CAM-099-S", articulo: "Camisa Lino Azul" }; // No está en mockStock pero el código termina en -S
assert.strictEqual(getMovementProductWithTalla(m3), "Camisa Lino Azul (S)");

const m4 = { codigo: "CAM-001-M", articulo: "Camisa Oxford Clásica Celeste (M)" }; // Ya tiene (M)
assert.strictEqual(getMovementProductWithTalla(m4), "Camisa Oxford Clásica Celeste (M)");

console.log("✔ Extracción e inclusión de talla en el nombre del producto validada con éxito");

// 2. Simulación de filtrado por Mes y Año
const mockMovements = [
  { fechaHora: "2026-11-08 09:30:00", codigo: "CAM-001-M", tipo: "ENTRADA", cantidad: 20 },
  { fechaHora: "2026-11-08 10:15:20", codigo: "CAM-002-M", tipo: "SALIDA", cantidad: 3 },
  { fechaHora: "2026-11-08 11:45:00", codigo: "CAM-003-M", tipo: "SALIDA", cantidad: 1 },
  { fechaHora: "2026-11-08 14:20:10", codigo: "CAM-004-L", tipo: "ENTRADA", cantidad: 15 },
  { fechaHora: "2026-11-08 16:05:40", codigo: "CAM-001-M", tipo: "SALIDA", cantidad: 2 },
  { fechaHora: "2026-10-15 10:00:00", codigo: "CAM-001-S", tipo: "SALIDA", cantidad: 1 },
  { fechaHora: "2025-12-08 19:33:42", codigo: "CAM-001-L", tipo: "SALIDA", cantidad: 2 },
  { fechaHora: "2026-11-09 10:30:00", codigo: "CAM-001-M", tipo: "SALIDA", cantidad: 2 },
  { fechaHora: "2026-11-09 13:45:00", codigo: "CAM-002-M", tipo: "SALIDA", cantidad: 1 },
  { fechaHora: "2026-11-09 16:20:00", codigo: "CAM-004-M", tipo: "SALIDA", cantidad: 3 },
  { fechaHora: "2026-11-10 11:00:00", codigo: "CAM-001-XL", tipo: "SALIDA", cantidad: 1 },
  { fechaHora: "2026-11-10 14:00:00", codigo: "CAM-002-L", tipo: "SALIDA", cantidad: 2 }
];

function parseDateParts(raw) {
  const m = String(raw).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10) - 1, // Base 0
    day: parseInt(m[3], 10)
  };
}

function filterMovs(movs, filter) {
  const filterMes = filter.mes === "ALL" ? null : parseInt(filter.mes, 10);
  const filterAnio = filter.anio === "ALL" ? null : parseInt(filter.anio, 10);

  return movs.filter(m => {
    const parts = parseDateParts(m.fechaHora);
    if (!parts) return false;
    if (filterAnio !== null && parts.year !== filterAnio) return false;
    if (filterMes !== null && parts.month !== filterMes) return false;
    return true;
  });
}

// Filtrar por Noviembre 2026 (mes 10)
const nov2026 = filterMovs(mockMovements, { mes: "10", anio: "2026" });
assert.strictEqual(nov2026.length, 10, "Noviembre 2026 debe tener exactamente 10 movimientos");

// Filtrar por Octubre 2026 (mes 9)
const oct2026 = filterMovs(mockMovements, { mes: "9", anio: "2026" });
assert.strictEqual(oct2026.length, 1, "Octubre 2026 debe tener 1 movimiento");

// Filtrar por Diciembre 2025 (mes 11)
const dic2025 = filterMovs(mockMovements, { mes: "11", anio: "2025" });
assert.strictEqual(dic2025.length, 1, "Diciembre 2025 debe tener 1 movimiento");

// Filtrar por Todos los meses de 2026
const all2026 = filterMovs(mockMovements, { mes: "ALL", anio: "2026" });
assert.strictEqual(all2026.length, 11, "Año 2026 completo debe tener 11 movimientos");

console.log("✔ Filtrado de movimientos por Mes y Año validado con éxito");

// 3. Simulación de Paginación Visual (Top 10 + Ver todos)
function paginate(items, showAll) {
  if (showAll) {
    return { items: items, hasMore: false, showButton: items.length > 10 };
  } else {
    return { items: items.slice(0, 10), hasMore: items.length > 10, showButton: items.length > 10 };
  }
}

const p1 = paginate(all2026, false); // Top 10
assert.strictEqual(p1.items.length, 10);
assert.strictEqual(p1.hasMore, true);
assert.strictEqual(p1.showButton, true);

const p2 = paginate(all2026, true); // Ver todos
assert.strictEqual(p2.items.length, 11);
assert.strictEqual(p2.hasMore, false);
assert.strictEqual(p2.showButton, true);

const p3 = paginate(nov2026, false); // Exactamente 10
assert.strictEqual(p3.items.length, 10);
assert.strictEqual(p3.hasMore, false);
assert.strictEqual(p3.showButton, false); // No requiere botón si es <= 10

console.log("✔ Lógica de paginación visual (Top 10 y Ver todos) validada con éxito");

console.log("=================================================");
console.log("✔ TODAS LAS PRUEBAS DE ÚLTIMOS MOVIMIENTOS PASARON (100%)");
console.log("=================================================");
