/*
 * Motor de datos de mercado del Presentador de Carteras. Corre 100% en el
 * navegador (usa los ExcelJS y JSZip vendorizados en vendor/): el archivo
 * nunca se sube a ningún servidor.
 *
 * Lee, del Monitor_Individuos, una lista de instrumentos disponibles para
 * buscar por ticker o por emisor al armar una cartera:
 *  - "Corporativos": ONs.
 *  - "Soberanos": bonos soberanos.
 *  - "Letras-Bonos $": letras y bonos en pesos.
 *  - "OFFSHORE": la tabla de "Fondos Propios".
 *
 * El libro tiene cientos de hojas (una por ticker) que no hacen falta para
 * esto, así que antes de cargarlo con ExcelJS se recorta el .zip para
 * dejar sólo las 4 hojas necesarias — evita parsear el resto y esquiva un
 * par de estructuras (tablas de Excel) que rompen el parser si se las deja.
 */

// ---------- Recorte del libro a sólo las hojas que hacen falta ----------
// (mismo mecanismo que ons-motor.js, pero self-contained: cada herramienta
// de esta app lee su propio archivo con su propio motor, sin compartir
// código entre "familias" de herramientas.)

async function recortarLibroCarteras(arrayBuffer, hojasAConservar) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookXmlPath = 'xl/workbook.xml';
  let workbookXml = await zip.file(workbookXmlPath).async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');

  const sheetRegex = /<sheet\b[^>]*\/>/g;
  const todasLasHojas = workbookXml.match(sheetRegex) || [];

  const targetsAConservar = new Set();
  const etiquetasAConservar = [];
  for (const etiqueta of todasLasHojas) {
    const nombreMatch = etiqueta.match(/name="([^"]*)"/);
    const ridMatch = etiqueta.match(/r:id="([^"]+)"/);
    const nombre = nombreMatch && nombreMatch[1];
    if (!hojasAConservar.includes(nombre)) continue;

    const rid = ridMatch && ridMatch[1];
    const relRegex = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`);
    const relMatch = relsXml.match(relRegex);
    const target = relMatch && relMatch[1];

    etiquetasAConservar.push(etiqueta);
    if (target) targetsAConservar.add(target);
  }

  if (etiquetasAConservar.length !== hojasAConservar.length) {
    const encontradas = etiquetasAConservar.map((e) => e.match(/name="([^"]*)"/)[1]);
    const faltantes = hojasAConservar.filter((h) => !encontradas.includes(h));
    throw new Error(`El archivo no tiene la(s) hoja(s): ${faltantes.join(', ')}`);
  }

  const sheetsBlockRegex = /(<sheets>)([\s\S]*?)(<\/sheets>)/;
  workbookXml = workbookXml.replace(sheetsBlockRegex, (_full, open, _mid, close) => {
    return open + etiquetasAConservar.join('') + close;
  });
  zip.file(workbookXmlPath, workbookXml);

  for (const ruta of Object.keys(zip.files)) {
    const m = ruta.match(/^xl\/(worksheets\/sheet\d+\.xml)$/);
    if (!m) continue;
    if (!targetsAConservar.has(m[1])) {
      zip.remove(ruta);
      const nombreArchivo = m[1].split('/').pop();
      zip.remove(`xl/worksheets/_rels/${nombreArchivo}.rels`);
    }
  }

  for (const target of targetsAConservar) {
    const sheetPath = 'xl/' + target;
    const archivo = zip.file(sheetPath);
    if (!archivo) continue;
    let sheetXml = await archivo.async('string');
    sheetXml = sheetXml.replace(/<tableParts[\s\S]*?<\/tableParts>/, '');
    zip.file(sheetPath, sheetXml);

    const nombreArchivo = target.split('/').pop();
    const sheetRelsPath = `xl/worksheets/_rels/${nombreArchivo}.rels`;
    const sheetRelsFile = zip.file(sheetRelsPath);
    if (sheetRelsFile) {
      let sheetRelsXml = await sheetRelsFile.async('string');
      sheetRelsXml = sheetRelsXml.replace(
        /<Relationship[^>]*Type="[^"]*\/relationships\/table"[^>]*\/>/g,
        ''
      );
      zip.file(sheetRelsPath, sheetRelsXml);
    }
  }

  Object.keys(zip.files)
    .filter((nombre) => /^xl\/tables\/table\d+\.xml$/.test(nombre))
    .forEach((nombre) => zip.remove(nombre));

  return zip.generateAsync({ type: 'arraybuffer' });
}

async function cargarHojasCarteras(arrayBuffer, hojasAConservar) {
  const bufferRecortado = await recortarLibroCarteras(arrayBuffer, hojasAConservar);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bufferRecortado);
  return workbook;
}

function valorCeldaCarteras(celda) {
  const v = celda.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return v.result;
    // Celdas con hipervínculo (ExcelJS las devuelve como { text, hyperlink }).
    if ('text' in v) return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  }
  return v;
}

// ---------- Lectura de tablas "Ticker + bloques" (Corporativos, Soberanos, Letras-Bonos $) ----------

/**
 * Estas hojas repiten la misma tabla (mismas columnas) varias veces en
 * bloques verticales — por calificación en Corporativos, distintas vistas
 * en Letras-Bonos $. En vez de asumir en qué fila arranca cada bloque (eso
 * cambia de un archivo a otro), se buscan todos los encabezados "Ticker" de
 * la columna indicada y se leen los datos de cada bloque hasta que esa
 * columna queda en blanco. Como los bloques se solapan (un mismo ticker
 * puede aparecer en más de uno), se devuelve un ticker una sola vez, con
 * los datos de su primera aparición.
 */
/**
 * Estas hojas repiten bloques con el mismo layout de columnas (verificado):
 * en "Corporativos" son varios bloques por calificación más, al final, un
 * bloque consolidado con todos; en "Soberanos" y "Letras-Bonos $" son
 * categorías (Provinciales, Bopreales, Dollar Linked, Retornos reales...)
 * que se complementan entre sí en vez de resumirse en un único bloque final
 * — tomar sólo el último bloque pierde instrumentos que sólo aparecen en un
 * bloque anterior.
 *
 * Por eso se recorren TODOS los bloques y se arma la unión por ticker. Si un
 * ticker aparece en más de un bloque nos quedamos con la última aparición:
 * en "Corporativos" eso hace que el bloque consolidado (el último) pise a
 * los bloques por calificación, lo cual de paso esquiva alguna celda de
 * texto mal tipada por ExcelJS en un bloque temprano (p. ej. un emisor
 * leído como "Invalid Date" en vez de string) que sí viene bien en el
 * bloque consolidado.
 */
function leerFilasPorBloques(hoja, columnaTicker) {
  const porTicker = new Map();
  for (let r = 1; r <= hoja.rowCount; r++) {
    if (valorCeldaCarteras(hoja.getRow(r).getCell(columnaTicker)) !== 'Ticker') continue;
    let fin = r;
    while (valorCeldaCarteras(hoja.getRow(fin + 1).getCell(columnaTicker))) fin += 1;
    for (let f = r + 1; f <= fin; f++) {
      const fila = hoja.getRow(f);
      const ticker = valorCeldaCarteras(fila.getCell(columnaTicker));
      if (!ticker) continue;
      porTicker.set(ticker, fila);
    }
  }
  return [...porTicker.values()];
}

const ETIQUETA_MONEDA_ORIGEN = { MEP: 'DolarMEP', Cable: 'DolarCable' };

function extraerCorporativos(hoja) {
  const COL = { ticker: 2, emisor: 3, tir: 6, duration: 7, moneda: 11, calificacion: 13 };
  return leerFilasPorBloques(hoja, COL.ticker).map((fila) => ({
    ticker: String(valorCeldaCarteras(fila.getCell(COL.ticker))),
    nombre: valorCeldaCarteras(fila.getCell(COL.emisor)),
    categoria: 'ON',
    moneda: ETIQUETA_MONEDA_ORIGEN[valorCeldaCarteras(fila.getCell(COL.moneda))] || 'DolarCable',
    tir: valorCeldaCarteras(fila.getCell(COL.tir)),
    duration: valorCeldaCarteras(fila.getCell(COL.duration)),
    calificacion: valorCeldaCarteras(fila.getCell(COL.calificacion)),
  }));
}

function extraerSoberanos(hoja) {
  const COL = { ticker: 2, emisor: 3, tir: 6, duration: 7, moneda: 11, calificacion: 13 };
  return leerFilasPorBloques(hoja, COL.ticker).map((fila) => ({
    ticker: String(valorCeldaCarteras(fila.getCell(COL.ticker))),
    nombre: valorCeldaCarteras(fila.getCell(COL.emisor)),
    categoria: 'Soberano',
    moneda: ETIQUETA_MONEDA_ORIGEN[valorCeldaCarteras(fila.getCell(COL.moneda))] || 'DolarCable',
    tir: valorCeldaCarteras(fila.getCell(COL.tir)),
    duration: valorCeldaCarteras(fila.getCell(COL.duration)),
    calificacion: valorCeldaCarteras(fila.getCell(COL.calificacion)),
  }));
}

/** Letras y bonos en pesos: siempre Pesos, esta hoja no trae calificación por especie. */
function extraerLetrasBonos(hoja) {
  const COL = { ticker: 2, papel: 3, duration: 7, tir: 8 };
  return leerFilasPorBloques(hoja, COL.ticker).map((fila) => ({
    ticker: String(valorCeldaCarteras(fila.getCell(COL.ticker))),
    nombre: valorCeldaCarteras(fila.getCell(COL.papel)),
    categoria: 'Letra/Bono $',
    moneda: 'Pesos',
    tir: valorCeldaCarteras(fila.getCell(COL.tir)),
    duration: valorCeldaCarteras(fila.getCell(COL.duration)),
    calificacion: null,
  }));
}

/**
 * Tabla "Fondos Propios" dentro de la hoja OFFSHORE: no tiene ticker ni
 * duration/TIR como los bonos, así que se ubica por el texto del título y
 * se identifica cada fondo por su ISIN. No trae una columna de moneda
 * explícita: los fondos offshore se asumen en Dólar Cable.
 *
 * La hoja tiene más de una celda de texto que arranca con "Fondos" (hay,
 * por ejemplo, un índice/menú aparte llamado "Fondos OFF"), así que la
 * búsqueda del encabezado ("ISIN") se acota a un puñado de columnas cerca
 * del título: si se buscara sin límite a lo largo de toda la fila se puede
 * terminar enganchando, por error, el "ISIN" de otra tabla de más a la
 * derecha en esa misma fila.
 */
function extraerFondosPropios(hoja) {
  const VENTANA_COLUMNAS = 8;
  let filaTitulo = null;
  let colTitulo = null;
  for (let r = 1; r <= hoja.rowCount && filaTitulo === null; r++) {
    const fila = hoja.getRow(r);
    for (let c = 1; c <= fila.cellCount; c++) {
      const v = valorCeldaCarteras(fila.getCell(c));
      if (typeof v === 'string' && v.startsWith('Fondos Propios')) {
        filaTitulo = r;
        colTitulo = c;
        break;
      }
    }
  }
  if (filaTitulo === null) return [];

  const filaEncabezado = filaTitulo + 1;
  const encabezados = hoja.getRow(filaEncabezado);
  let colIsin = null;
  let colNombre = null;
  let colCategoria = null;
  for (let c = colTitulo; c <= colTitulo + VENTANA_COLUMNAS; c++) {
    const v = valorCeldaCarteras(encabezados.getCell(c));
    if (v === 'ISIN') colIsin = c;
    if (v === 'Nombre') colNombre = c;
    if (v === 'Categoría') colCategoria = c;
  }
  if (!colIsin || !colNombre) return [];

  const resultado = [];
  let r = filaEncabezado + 1;
  while (valorCeldaCarteras(hoja.getRow(r).getCell(colIsin))) {
    const fila = hoja.getRow(r);
    const nombre = valorCeldaCarteras(fila.getCell(colNombre));
    const categoriaFondo = colCategoria ? valorCeldaCarteras(fila.getCell(colCategoria)) : null;
    resultado.push({
      ticker: String(valorCeldaCarteras(fila.getCell(colIsin))),
      nombre: categoriaFondo ? `${nombre} (${categoriaFondo})` : nombre,
      categoria: 'Fondo propio',
      moneda: 'DolarCable',
      tir: null,
      duration: null,
      calificacion: null,
    });
    r += 1;
  }
  return resultado;
}

/**
 * Procesa el Monitor de instrumentos (100% en el navegador) y devuelve la
 * lista combinada de ONs, soberanos, letras/bonos en pesos y fondos
 * propios, lista para buscar por ticker o por emisor.
 */
async function procesarInstrumentosDisponibles(arrayBuffer) {
  const hojas = ['Corporativos', 'Soberanos', 'Letras-Bonos $', 'OFFSHORE'];
  const workbook = await cargarHojasCarteras(arrayBuffer, hojas);

  const hojaCorp = workbook.getWorksheet('Corporativos');
  const hojaSob = workbook.getWorksheet('Soberanos');
  const hojaLetras = workbook.getWorksheet('Letras-Bonos $');
  const hojaOff = workbook.getWorksheet('OFFSHORE');
  if (!hojaCorp || !hojaSob || !hojaLetras || !hojaOff) {
    throw new Error('Faltan hojas esperadas en el archivo (Corporativos, Soberanos, Letras-Bonos $, OFFSHORE).');
  }

  const instrumentos = [
    ...extraerCorporativos(hojaCorp),
    ...extraerSoberanos(hojaSob),
    ...extraerLetrasBonos(hojaLetras),
    ...extraerFondosPropios(hojaOff),
  ];

  return instrumentos;
}
