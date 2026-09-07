/*
 * Motor de Cambios de Asesores. Corre 100% en el navegador (usa ExcelJS
 * vendorizado en vendor/): el archivo nunca se sube a ningún servidor.
 *
 * Lee el reporte "Gestiones_CambiosDeAsesorEnCurso" (siempre el mismo
 * formato: una sola hoja, con encabezados en la fila 1) y arma las filas
 * listas para pegar en la hoja "Cambio de asesor" del libro Aperturas,
 * respetando su orden de columnas. Esa hoja hace seguimiento de las cuentas
 * que SALEN de un asesor de Individuos, así que sólo interesan las
 * gestiones cuya UnidadDeNegocioOrigen sea "Individuos"; las demás (que
 * entran a Individuos desde otra unidad, o no tocan Individuos) se
 * descartan.
 */

function valorCeldaCambios(celda) {
  const v = celda.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return v.result;
    // Celdas con hipervínculo (ExcelJS las devuelve como { text, hyperlink }).
    if ('text' in v) return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  }
  return v;
}

const UNIDAD_ORIGEN_INTERES = 'Individuos';

/**
 * Columnas de la hoja "Cambio de asesor" de Aperturas, en orden. Las que no
 * tienen "origen" (FECHA, MONTO, MAIL, TELEFONO, REFERENCIAS) quedan vacías:
 * el reporte de gestiones no trae esos datos.
 */
const COLUMNAS_DESTINO = [
  { destino: 'FECHA', origen: null },
  { destino: 'MONTO', origen: null },
  { destino: 'Gestion', origen: 'Gestion' },
  { destino: 'AsesorOrigen', origen: 'AsesorOrigen' },
  { destino: 'MAIL', origen: null },
  { destino: 'TELEFONO', origen: null },
  { destino: 'EquipoOrigen', origen: 'EquipoOrigen' },
  { destino: 'AsesorDestino', origen: 'AsesorDestino' },
  { destino: 'EquipoDestino', origen: 'EquipoDestino' },
  { destino: 'UnidadDeNegocioDestino', origen: 'UnidadDeNegocioDestino' },
  { destino: 'FechaCreacion', origen: 'FechaCreacion' },
  { destino: 'UsuarioCreacion', origen: 'UsuarioCreacion' },
  { destino: 'Estado', origen: 'Estado' },
  { destino: 'FechaUltimaActualizacion', origen: 'FechaUltimaActualizacion' },
  { destino: 'REFERENCIAS', origen: null },
];

/** Sólo la fecha (sin hora), para que coincida con cómo se ve en Aperturas. */
function soloFecha(valor) {
  if (!(valor instanceof Date)) return valor;
  return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
}

/**
 * Procesa el reporte de gestiones (100% en el navegador) y devuelve las
 * filas ya mapeadas a las columnas de destino, filtradas a
 * UnidadDeNegocioOrigen = "Individuos".
 */
async function procesarGestiones(arrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const hoja = workbook.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene hojas.');

  // Ubica cada columna de origen por su nombre en la fila de encabezados (no
  // por posición fija), para no romper si el reporte cambia el orden.
  const columnaPorNombre = new Map();
  hoja.getRow(1).eachCell((celda, numeroColumna) => {
    const nombre = valorCeldaCambios(celda);
    if (nombre) columnaPorNombre.set(String(nombre).trim(), numeroColumna);
  });

  const colUnidadOrigen = columnaPorNombre.get('UnidadDeNegocioOrigen');
  if (!colUnidadOrigen) {
    throw new Error('No se encontró la columna "UnidadDeNegocioOrigen" en el archivo.');
  }

  const filas = [];
  for (let numeroFila = 2; numeroFila <= hoja.rowCount; numeroFila++) {
    const filaExcel = hoja.getRow(numeroFila);
    const unidadOrigen = valorCeldaCambios(filaExcel.getCell(colUnidadOrigen));
    if (String(unidadOrigen || '').trim() !== UNIDAD_ORIGEN_INTERES) continue;

    const fila = {};
    COLUMNAS_DESTINO.forEach(({ destino, origen }) => {
      if (!origen) {
        fila[destino] = null;
        return;
      }
      const numeroColumnaOrigen = columnaPorNombre.get(origen);
      const valor = numeroColumnaOrigen ? valorCeldaCambios(filaExcel.getCell(numeroColumnaOrigen)) : null;
      fila[destino] = soloFecha(valor);
    });
    filas.push(fila);
  }

  return filas;
}

// ---------- Preparar filas para copiar (TSV + HTML) ----------

/** yyyy-mm-dd: formato de fecha que Excel reconoce sin ambigüedad al pegar, sea cual sea la configuración regional. */
function formatValorParaCopiar(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (valor instanceof Date) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(valor);
}

function filasATsv(filas) {
  return filas.map((fila) => COLUMNAS_DESTINO.map(({ destino }) => formatValorParaCopiar(fila[destino])).join('\t')).join('\n');
}

function escapeHtmlCambios(texto) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function filasAHtml(filas) {
  const filasHtml = filas
    .map(
      (fila) =>
        `<tr>${COLUMNAS_DESTINO.map(({ destino }) => `<td>${escapeHtmlCambios(formatValorParaCopiar(fila[destino]))}</td>`).join('')}</tr>`
    )
    .join('');
  return `<table>${filasHtml}</table>`;
}
