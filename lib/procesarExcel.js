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

function fechaISOLocalDeHoy() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Calcula el rango de fecha/hora a partir de los filtros recibidos del
 * formulario (fechaDesde/fechaHasta en formato YYYY-MM-DD, horaDesde/horaHasta
 * en formato HH:MM). Si no se especifica algo, por defecto es "hoy" completo.
 */
function obtenerRangoFiltro({ fechaDesde, fechaHasta, horaDesde, horaHasta } = {}) {
  const hoyISO = fechaISOLocalDeHoy();
  const fDesde = fechaDesde || hoyISO;
  const fHasta = fechaHasta || hoyISO;
  const hDesde = horaDesde || '00:00';
  const hHasta = horaHasta || '23:59';

  const [yDesde, moDesde, dDesde] = fDesde.split('-').map(Number);
  const [yHasta, moHasta, dHasta] = fHasta.split('-').map(Number);
  const [hhDesde, mmDesde] = hDesde.split(':').map(Number);
  const [hhHasta, mmHasta] = hHasta.split(':').map(Number);

  const inicio = new Date(yDesde, moDesde - 1, dDesde, hhDesde || 0, mmDesde || 0, 0);
  const fin = new Date(yHasta, moHasta - 1, dHasta, hhHasta || 0, mmHasta || 0, 59);
  return { inicio, fin };
}

function parseFechaHoraCarga(fechaCarga, horaCarga) {
  let dia;
  let mes;
  let anio;
  if (fechaCarga instanceof Date) {
    dia = fechaCarga.getDate();
    mes = fechaCarga.getMonth() + 1;
    anio = fechaCarga.getFullYear();
  } else if (typeof fechaCarga === 'string') {
    const partes = fechaCarga.trim().split('/');
    if (partes.length !== 3) return null;
    [dia, mes, anio] = partes.map(Number);
  } else {
    return null;
  }
  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(anio)) return null;

  let horas = 0;
  let minutos = 0;
  let segundos = 0;
  if (horaCarga instanceof Date) {
    horas = horaCarga.getHours();
    minutos = horaCarga.getMinutes();
    segundos = horaCarga.getSeconds();
  } else if (typeof horaCarga === 'string') {
    const [h, m, s] = horaCarga.trim().split(':').map(Number);
    horas = h || 0;
    minutos = m || 0;
    segundos = s || 0;
  }
  return new Date(anio, mes - 1, dia, horas, minutos, segundos);
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

async function procesarExcel(buffer, filtros = {}) {
  const { inicio, fin } = obtenerRangoFiltro(filtros);
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
  const idxFechaCarga = encabezadosOrigen.indexOf('Fecha Carga');
  const idxHoraCarga = encabezadosOrigen.indexOf('Hora Carga');
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

    if (idxFechaCarga !== -1) {
      const fechaHoraFila = parseFechaHoraCarga(
        fila.getCell(idxFechaCarga).value,
        idxHoraCarga !== -1 ? fila.getCell(idxHoraCarga).value : null
      );
      if (fechaHoraFila && (fechaHoraFila < inicio || fechaHoraFila > fin)) return;
    }

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
