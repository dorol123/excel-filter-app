/*
 * Motor de Conformidad: lee el reporte de Órdenes (Excel) y devuelve sólo
 * las que tienen RequiereConformidad = 1 (las que todavía necesitan
 * atención por falta de conformidad), con los datos mínimos para
 * resolverlas. Corre 100% en el navegador: el archivo nunca se sube a
 * ningún servidor.
 */

const COLUMNAS_ORIGEN = {
  descripcion: 'Descripcion',
  comitente: 'Comitente',
  operacion: 'Operacion',
  ticker: 'Ticker',
  asesor: 'Asesor',
  fecha: 'Fecha',
  hora: 'Hora',
  requiereConformidad: 'RequiereConformidad',
  fechaConformidad: 'FechaConformidad',
};

const COLUMNAS_OBLIGATORIAS = ['descripcion', 'comitente', 'operacion', 'ticker', 'asesor', 'requiereConformidad'];

function normalizar(valor) {
  return typeof valor === 'string' ? valor.trim() : valor;
}

/** true si la celda tiene algo cargado (una fecha, un texto no vacío, etc.). */
function tieneValor(valor) {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'string') return valor.trim() !== '';
  return true;
}

/**
 * Arma un Date a partir de "Fecha" ("DD/MM/AAAA") y "Hora" ("HH:MM:SS")
 * tal como los exporta este reporte (texto plano), aceptando también un
 * Date de Excel por si algún export los trae como fecha/hora real.
 * Devuelve null si no se puede interpretar.
 */
function parseFechaHora(fechaCelda, horaCelda) {
  let dia;
  let mes;
  let anio;
  if (fechaCelda instanceof Date) {
    dia = fechaCelda.getDate();
    mes = fechaCelda.getMonth() + 1;
    anio = fechaCelda.getFullYear();
  } else if (typeof fechaCelda === 'string') {
    const partes = fechaCelda.trim().split('/');
    if (partes.length !== 3) return null;
    [dia, mes, anio] = partes.map(Number);
  } else {
    return null;
  }
  if (![dia, mes, anio].every(Number.isFinite)) return null;

  let horas = 0;
  let minutos = 0;
  let segundos = 0;
  if (horaCelda instanceof Date) {
    horas = horaCelda.getHours();
    minutos = horaCelda.getMinutes();
    segundos = horaCelda.getSeconds();
  } else if (typeof horaCelda === 'string') {
    const [h, m, s] = horaCelda.trim().split(':').map(Number);
    horas = h || 0;
    minutos = m || 0;
    segundos = s || 0;
  }
  return new Date(anio, mes - 1, dia, horas, minutos, segundos);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "09:58 · 16/09/2026" — el tope de cobertura del reporte de Órdenes subido. */
function formatFechaHoraLimite(fecha) {
  const hora = `${pad2(fecha.getHours())}:${pad2(fecha.getMinutes())}`;
  const fechaStr = `${pad2(fecha.getDate())}/${pad2(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
  return `${hora} · ${fechaStr}`;
}

/**
 * Lee el reporte de Órdenes y devuelve las que requieren conformidad
 * (RequiereConformidad = 1), sólo con las columnas que hacen falta para
 * resolverlas. El "hasta" del banner sale de la Fecha+Hora más reciente de
 * TODO el archivo (no sólo de las filtradas): indica hasta qué momento
 * llega la extracción de Órdenes que se subió, esté o no completa esa orden
 * puntual.
 */
async function procesarConformidad(arrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const hoja = workbook.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene ninguna hoja.');

  const encabezados = [];
  hoja.getRow(1).eachCell({ includeEmpty: false }, (celda, colNumero) => {
    encabezados[colNumero] = String(celda.value ?? '').trim();
  });

  const idx = {};
  for (const [clave, nombre] of Object.entries(COLUMNAS_ORIGEN)) {
    idx[clave] = encabezados.indexOf(nombre);
  }

  const faltantes = COLUMNAS_OBLIGATORIAS.filter((clave) => idx[clave] === -1);
  if (faltantes.length > 0) {
    throw new Error(`El archivo debe tener las columnas: ${faltantes.map((c) => COLUMNAS_ORIGEN[c]).join(', ')}.`);
  }

  let maximoFechaHora = null;
  const filas = [];

  hoja.eachRow({ includeEmpty: false }, (fila, numeroFila) => {
    if (numeroFila === 1) return;

    if (idx.fecha !== -1) {
      const fechaHora = parseFechaHora(
        fila.getCell(idx.fecha).value,
        idx.hora !== -1 ? fila.getCell(idx.hora).value : null
      );
      if (fechaHora && (!maximoFechaHora || fechaHora > maximoFechaHora)) {
        maximoFechaHora = fechaHora;
      }
    }

    const requiere = fila.getCell(idx.requiereConformidad).value;
    if (Number(requiere) !== 1) return;

    // Una fecha en FechaConformidad significa que esa orden ya se confirmó,
    // aunque RequiereConformidad haya quedado en 1: no hace falta atenderla.
    if (idx.fechaConformidad !== -1 && tieneValor(fila.getCell(idx.fechaConformidad).value)) return;

    filas.push({
      descripcion: normalizar(fila.getCell(idx.descripcion).value),
      comitente: normalizar(fila.getCell(idx.comitente).value),
      operacion: normalizar(fila.getCell(idx.operacion).value),
      ticker: normalizar(fila.getCell(idx.ticker).value),
      asesor: normalizar(fila.getCell(idx.asesor).value),
    });
  });

  filas.sort((a, b) => String(a.asesor).localeCompare(String(b.asesor), 'es'));

  return {
    filas,
    textoHasta: maximoFechaHora ? formatFechaHoraLimite(maximoFechaHora) : null,
  };
}
