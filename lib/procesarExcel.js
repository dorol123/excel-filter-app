const ExcelJS = require('exceljs');
const { repararBuffer } = require('./repararXlsx');

// Columnas que se descartan del archivo original.
const COLUMNAS_A_QUITAR = [
  'Fecha Carga',
  'Hora Carga',
  'Recibo',
  'Usuario Alta',
  'Equipo',
  'UnidadDeNegocio',
];

const MONEDAS_DOLAR = ['Dólar MEP', 'Dólar Cable'];

const UMBRAL_PESOS_ELIMINAR = 999999; // se eliminan filas con importe <= a esto
const UMBRAL_DOLARES_ELIMINAR = 999;

const UMBRAL_PESOS_DESTACAR = 5000000; // rojo+negrita si importe >= a esto
const UMBRAL_DOLARES_DESTACAR = 5000;

const FORMATO_MONEDA = '"$" #,##0';
const ROJO_NEGRITA = { color: { argb: 'FFFF0000' }, bold: true };

function normalizar(valor) {
  return typeof valor === 'string' ? valor.trim() : valor;
}

/**
 * Ordena por asesor: primero los asesores con mayor importe total en su
 * conjunto, y dentro de cada asesor sus filas de mayor a menor importe.
 */
function ordenarPorAsesor(filas) {
  const totalesPorAsesor = new Map();
  for (const fila of filas) {
    const acumulado = totalesPorAsesor.get(fila.asesor) || 0;
    totalesPorAsesor.set(fila.asesor, acumulado + fila.importe);
  }
  return [...filas].sort((a, b) => {
    const totalA = totalesPorAsesor.get(a.asesor);
    const totalB = totalesPorAsesor.get(b.asesor);
    if (totalB !== totalA) return totalB - totalA;
    return b.importe - a.importe;
  });
}

function construirHoja(workbook, nombre, filas, encabezados, colImporte, colAsesor, umbralDestacar) {
  const hoja = workbook.addWorksheet(nombre);
  hoja.addRow(encabezados);
  hoja.getRow(1).font = { bold: true };
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: encabezados.length } };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];

  for (const fila of filas) {
    const filaExcel = hoja.addRow(fila.valores);
    const celdaImporte = filaExcel.getCell(colImporte + 1);
    celdaImporte.numFmt = FORMATO_MONEDA;
    if (fila.importe >= umbralDestacar) {
      celdaImporte.font = ROJO_NEGRITA;
      filaExcel.getCell(colAsesor + 1).font = ROJO_NEGRITA;
    }
  }

  encabezados.forEach((encabezado, i) => {
    hoja.getColumn(i + 1).width = Math.max(14, String(encabezado).length + 4);
  });
  hoja.getColumn(colImporte + 1).width = 16;

  return hoja;
}

async function procesarExcel(buffer) {
  const bufferReparado = await repararBuffer(buffer);
  const workbookOrigen = new ExcelJS.Workbook();
  await workbookOrigen.xlsx.load(bufferReparado);
  const hojaOrigen = workbookOrigen.worksheets[0];
  if (!hojaOrigen) {
    throw new Error('El archivo no tiene ninguna hoja.');
  }

  const encabezadosOrigen = [];
  hojaOrigen.getRow(1).eachCell({ includeEmpty: false }, (celda, colNumero) => {
    encabezadosOrigen[colNumero] = String(celda.value ?? '').trim();
  });

  const columnasAConservar = [];
  encabezadosOrigen.forEach((nombre, colNumero) => {
    if (nombre && !COLUMNAS_A_QUITAR.includes(nombre)) {
      columnasAConservar.push({ colNumero, nombre });
    }
  });

  const idxMoneda = encabezadosOrigen.indexOf('Moneda');
  const idxImporte = encabezadosOrigen.indexOf('Importe');
  const idxAsesor = encabezadosOrigen.indexOf('Asesor');
  if (idxMoneda === -1 || idxImporte === -1 || idxAsesor === -1) {
    throw new Error('El archivo debe tener las columnas "Moneda", "Importe" y "Asesor".');
  }

  const encabezadosSalida = columnasAConservar.map((c) => c.nombre);
  const colImporteSalida = columnasAConservar.findIndex((c) => c.colNumero === idxImporte);
  const colAsesorSalida = columnasAConservar.findIndex((c) => c.colNumero === idxAsesor);

  const filasPesos = [];
  const filasDolares = [];

  hojaOrigen.eachRow({ includeEmpty: false }, (fila, numeroFila) => {
    if (numeroFila === 1) return;

    const moneda = normalizar(fila.getCell(idxMoneda).value);
    const importeCrudo = fila.getCell(idxImporte).value;
    const importe = typeof importeCrudo === 'number' ? importeCrudo : parseFloat(importeCrudo);
    if (!Number.isFinite(importe)) return;

    const asesor = normalizar(fila.getCell(idxAsesor).value);
    const valores = columnasAConservar.map((c) => fila.getCell(c.colNumero).value);
    const filaProcesada = { valores, importe, asesor };

    if (moneda === 'Pesos' && importe > UMBRAL_PESOS_ELIMINAR) {
      filasPesos.push(filaProcesada);
    } else if (MONEDAS_DOLAR.includes(moneda) && importe > UMBRAL_DOLARES_ELIMINAR) {
      filasDolares.push(filaProcesada);
    }
  });

  const pesosOrdenados = ordenarPorAsesor(filasPesos);
  const dolaresOrdenados = ordenarPorAsesor(filasDolares);

  const workbookSalida = new ExcelJS.Workbook();
  construirHoja(workbookSalida, 'Pesos', pesosOrdenados, encabezadosSalida, colImporteSalida, colAsesorSalida, UMBRAL_PESOS_DESTACAR);
  construirHoja(workbookSalida, 'Dolares', dolaresOrdenados, encabezadosSalida, colImporteSalida, colAsesorSalida, UMBRAL_DOLARES_DESTACAR);

  return workbookSalida.xlsx.writeBuffer();
}

module.exports = { procesarExcel };
