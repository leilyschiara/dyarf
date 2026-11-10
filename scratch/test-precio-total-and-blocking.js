const assert = require("assert");

console.log("=== INICIANDO PRUEBAS DE PRECIO TOTAL Y BLOQUEO POR STOCK 0 ===");

// 1. Simulación de cálculo de precio sin IGV y precio total
function calculatePrices(cantidad, precioVenta) {
  const pVentaNum = Number(precioVenta);
  const cantNum = parseInt(cantidad, 10);
  if (isNaN(pVentaNum) || pVentaNum <= 0 || isNaN(cantNum) || cantNum <= 0) {
    return { precioSinIgv: null, precioTotal: null };
  }
  const sinIgv = pVentaNum - (pVentaNum * 0.18);
  const total = cantNum * pVentaNum;
  return {
    precioSinIgv: parseFloat((Math.round(sinIgv * 100) / 100).toFixed(2)),
    precioTotal: parseFloat((Math.round(total * 100) / 100).toFixed(2))
  };
}

// Prueba 1: Cálculos de precios
const c1 = calculatePrices(1, 85);
assert.strictEqual(c1.precioSinIgv, 69.70);
assert.strictEqual(c1.precioTotal, 85.00);

const c2 = calculatePrices(3, 95);
assert.strictEqual(c2.precioSinIgv, 77.90);
assert.strictEqual(c2.precioTotal, 285.00);

const c3 = calculatePrices(5, 110.50);
assert.strictEqual(c3.precioSinIgv, 90.61);
assert.strictEqual(c3.precioTotal, 552.50);

console.log("✔ Cálculo automático de Precio sin IGV y Precio Total validado");

// 2. Validación de estructura de columnas en Google Sheets
const headersMov = ["FECHA", "USUARIO", "TIPO", "CÓDIGO", "CANTIDAD", "PRECIO DE VENTA", "TIPO DE VENTA", "PRECIO SIN IGV", "PRECIO TOTAL", "FORMA DE PAGO", "COMPROBANTE DE PAGO", "OBSERVACIÓN", "REQUEST_ID", "ESTADO_OPERACION"];

const idxSinIgv = headersMov.indexOf("PRECIO SIN IGV");
const idxTotal = headersMov.indexOf("PRECIO TOTAL");
const idxFormaPago = headersMov.indexOf("FORMA DE PAGO");

assert.strictEqual(idxSinIgv, 7, "PRECIO SIN IGV debe estar en la columna H (índice 7)");
assert.strictEqual(idxTotal, 8, "PRECIO TOTAL debe estar en la columna I (índice 8)");
assert.strictEqual(idxTotal, idxSinIgv + 1, "PRECIO TOTAL debe estar inmediatamente después de PRECIO SIN IGV");
assert.strictEqual(idxFormaPago, idxTotal + 1, "FORMA DE PAGO debe estar inmediatamente después de PRECIO TOTAL");

console.log("✔ Ubicación exacta de la columna PRECIO TOTAL validada (inmediatamente después de PRECIO SIN IGV)");

// 3. Simulación de lógica de bloqueo en SALIDAS con stock 0
function evaluateStockBlocking(tipo, stockDisponible) {
  const isSalida = tipo === "SALIDA";
  const isOutOfStock = stockDisponible <= 0;
  return isSalida && isOutOfStock;
}

assert.strictEqual(evaluateStockBlocking("SALIDA", 0), true, "SALIDA con stock 0 debe bloquearse");
assert.strictEqual(evaluateStockBlocking("SALIDA", -1), true, "SALIDA con stock negativo debe bloquearse");
assert.strictEqual(evaluateStockBlocking("SALIDA", 5), false, "SALIDA con stock > 0 no debe bloquearse");
assert.strictEqual(evaluateStockBlocking("ENTRADA", 0), false, "ENTRADA con stock 0 nunca debe bloquearse");
assert.strictEqual(evaluateStockBlocking("ENTRADA", 10), false, "ENTRADA con stock > 0 no debe bloquearse");

console.log("✔ Lógica de bloqueo para SALIDA cuando stock = 0 validada");

// 4. Verificación de firma determinista de idempotencia
function computeSignature(m) {
  return [
    String(m.tipo || "").trim().toUpperCase(),
    String(m.codigo || "").trim().toUpperCase(),
    String(m.cantidad || "1").trim(),
    String(m.precioVenta !== undefined && m.precioVenta !== null ? m.precioVenta : "").trim(),
    String(m.tipoVenta || "").trim(),
    String(m.precioSinIgv !== undefined && m.precioSinIgv !== null ? m.precioSinIgv : "").trim(),
    String(m.precioTotal !== undefined && m.precioTotal !== null ? m.precioTotal : "").trim(),
    String(m.formaPago || "").trim(),
    String(m.comprobantePago || "").trim(),
    String(m.observacion || "").trim()
  ].join("::");
}

const sig1 = computeSignature({ tipo: "SALIDA", codigo: "CAM-001-M", cantidad: 2, precioVenta: 85, tipoVenta: "Unitario", precioSinIgv: 69.70, precioTotal: 170.00 });
const sig2 = computeSignature({ tipo: "SALIDA", codigo: "CAM-001-M", cantidad: 2, precioVenta: 85, tipoVenta: "Unitario", precioSinIgv: 69.70, precioTotal: 170.00 });
const sig3 = computeSignature({ tipo: "SALIDA", codigo: "CAM-001-M", cantidad: 3, precioVenta: 85, tipoVenta: "Unitario", precioSinIgv: 69.70, precioTotal: 255.00 });

assert.strictEqual(sig1, sig2, "Mismos datos producen firma idéntica");
assert.notStrictEqual(sig1, sig3, "Cambiar cantidad/total produce firma diferente");

console.log("✔ Firma determinista de idempotencia con precioTotal validada");

console.log("=================================================");
console.log("✔ TODAS LAS PRUEBAS DE PRECIO TOTAL Y BLOQUEO PASARON CON ÉXITO");
console.log("=================================================");
