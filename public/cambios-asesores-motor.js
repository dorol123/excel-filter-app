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
 * Columnas de la hoja "Cambio de asesor" de Aperturas, en orden. De las que
 * no tienen "origen" (el reporte de gestiones no trae esos datos), MONTO,
 * MAIL, TELEFONO y REFERENCIAS quedan vacías; FECHA es la excepción: se
 * completa con la fecha de hoy (ver procesarGestiones), no con un dato del
 * reporte.
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

/** DD/MM/AAAA: formato pedido puntualmente para la columna FECHA. */
function formatFechaDDMMYYYY(fecha) {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getFullYear()}`;
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

  // FECHA no viene en el reporte: en la hoja de destino es la fecha en la
  // que se carga la gestión (hoy), no un dato de la gestión en sí — se pone
  // una sola vez acá para que todas las filas de esta tanda queden con el
  // mismo "hoy", sin importar cuánto tarde en tocar "Copiar". Va como texto
  // DD/MM/AAAA (pedido puntual), no como el resto de las fechas.
  const hoy = formatFechaDDMMYYYY(new Date());

  const filas = [];
  for (let numeroFila = 2; numeroFila <= hoja.rowCount; numeroFila++) {
    const filaExcel = hoja.getRow(numeroFila);
    const unidadOrigen = valorCeldaCambios(filaExcel.getCell(colUnidadOrigen));
    if (String(unidadOrigen || '').trim() !== UNIDAD_ORIGEN_INTERES) continue;

    const fila = {};
    COLUMNAS_DESTINO.forEach(({ destino, origen }) => {
      if (destino === 'FECHA') {
        fila[destino] = hoy;
        return;
      }
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

// ---------- Cruce con el archivo de cuentas para completar MONTO ----------
// El reporte de gestiones no trae el AUM de la cuenta; el archivo de cuentas
// (export tipo "Cuentas_BCVBCI") sí, por Comitente. El Comitente de cada
// gestión está adentro del texto de "Gestion" ("Cuenta: X | Comitente NNNN |
// Cuotapartista NNNN (RT)"), no en una columna aparte.

/** Saca el número de comitente de adentro del texto de "Gestion". */
function extraerComitenteDeGestion(gestion) {
  const match = String(gestion || '').match(/Comitente\s+([^\s|]+)/i);
  return match ? match[1].trim() : null;
}

// El archivo de cuentas (export tipo "Cuentas_BCVBCI") escribe todo su XML
// interno con un prefijo de namespace (<x:worksheet>, <x:row>, <x:c>...) que
// ExcelJS no reconoce (falla con "Cannot read properties of undefined
// (reading 'sheets')" al cargarlo), y además sus filas y celdas no traen el
// atributo r="..." (referencia de fila/columna) — mismo problema que ya
// resuelve acreditaciones-motor.js para otro reporte, sólo que acá además
// hay que sacar el prefijo primero. Se repara antes de pasárselo a ExcelJS.

function indiceAColumnaCambios(indice) {
  let letra = '';
  let n = indice;
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

function columnaAIndiceCambios(letra) {
  let n = 0;
  for (const ch of letra) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function repararCeldasDeFilaCambios(contenido, rowIndex) {
  let colIndex = 0;
  return contenido.replace(/<c(?=[\s/>])([^>]*?)(\/?)>/g, (match, atributos, autocierre) => {
    if (/\br="/.test(atributos)) {
      const m = atributos.match(/r="([A-Z]+)\d+"/);
      if (m) colIndex = columnaAIndiceCambios(m[1]);
      return match;
    }
    colIndex += 1;
    const letra = indiceAColumnaCambios(colIndex);
    return `<c r="${letra}${rowIndex}"${atributos}${autocierre}>`;
  });
}

/** Arregla filas/celdas sin r="..." en el XML de una hoja (ver comentario arriba). */
function repararSheetXmlCambios(xml) {
  // <row .../> autocerrada (fila vacía): si no se normaliza a <row ...></row>
  // primero, el regex de abajo (apertura y cierre por separado) la salta y
  // termina "comiéndose" el contenido de la fila siguiente entera.
  const xmlNormalizado = xml.replace(/<row([^>]*)\/>/g, '<row$1></row>');
  let rowIndex = 0;
  return xmlNormalizado.replace(/<row([^>]*)>([\s\S]*?)<\/row>/g, (match, atributos, contenido) => {
    rowIndex += 1;
    let nuevosAtributos = atributos;
    const m = atributos.match(/\br="(\d+)"/);
    if (m) {
      rowIndex = parseInt(m[1], 10);
    } else {
      nuevosAtributos = ` r="${rowIndex}"${atributos}`;
    }
    const contenidoReparado = repararCeldasDeFilaCambios(contenido, rowIndex);
    return `<row${nuevosAtributos}>${contenidoReparado}</row>`;
  });
}

/** Si el libro usa el prefijo x: (ver arriba), devuelve un buffer reparado; si no, lo deja igual. */
async function prepararBufferCuentasAUM(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  if (!/<x:workbook\b/.test(workbookXml)) return arrayBuffer;

  const archivos = Object.keys(zip.files).filter((nombre) => nombre.endsWith('.xml'));
  for (const nombre of archivos) {
    let contenido = await zip.file(nombre).async('string');
    if (!contenido.includes('<x:')) continue;
    contenido = contenido
      .replace(/xmlns:x="([^"]+)"/, 'xmlns="$1"')
      .replace(/<x:/g, '<')
      .replace(/<\/x:/g, '</');
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(nombre)) {
      contenido = repararSheetXmlCambios(contenido);
    }
    zip.file(nombre, contenido);
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

/**
 * Procesa el archivo de cuentas (100% en el navegador) y arma un mapa
 * Comitente -> AUM.
 */
async function procesarCuentasAUM(arrayBufferOriginal) {
  const arrayBuffer = await prepararBufferCuentasAUM(arrayBufferOriginal);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const hoja = workbook.worksheets[0];
  if (!hoja) throw new Error('El archivo de cuentas no tiene hojas.');

  const columnaPorNombre = new Map();
  hoja.getRow(1).eachCell((celda, numeroColumna) => {
    const nombre = valorCeldaCambios(celda);
    if (nombre) columnaPorNombre.set(String(nombre).trim(), numeroColumna);
  });

  const colComitente = columnaPorNombre.get('Comitente');
  const colAUM = columnaPorNombre.get('AUM');
  if (!colComitente || !colAUM) {
    throw new Error('No se encontraron las columnas "Comitente" y/o "AUM" en el archivo de cuentas.');
  }

  const mapaAUM = new Map();
  for (let numeroFila = 2; numeroFila <= hoja.rowCount; numeroFila++) {
    const filaExcel = hoja.getRow(numeroFila);
    const comitente = valorCeldaCambios(filaExcel.getCell(colComitente));
    if (comitente === null || comitente === undefined || comitente === '') continue;
    const aum = valorCeldaCambios(filaExcel.getCell(colAUM));
    mapaAUM.set(String(comitente).trim(), aum);
  }
  return mapaAUM;
}

/** Completa MONTO en cada fila cruzando el Comitente de Gestion contra el mapa de AUM. */
function aplicarAUM(filas, mapaAUM) {
  return filas.map((fila) => {
    const comitente = extraerComitenteDeGestion(fila.Gestion);
    const aum = comitente ? mapaAUM.get(comitente) : undefined;
    return { ...fila, MONTO: Number.isFinite(aum) ? aum : null };
  });
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
