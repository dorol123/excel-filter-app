/*
 * Motor de Monitor Individuos (por ahora sólo la hoja "Corporativos").
 * Corre 100% en el navegador. Lee la lista de ONs y sus datos fijos desde
 * el libro Monitor_Individuos (misma plantilla que usa el Comparador/
 * Calculadora de ONs: "Corporativos" para el listado, una hoja por ticker
 * con el flujo de pagos y "Detalles" con la comisión), pero en vez de usar
 * el precio ya cacheado en el Excel, pisa el precio con la cotización en
 * vivo de data912.com y recalcula TIR/duration/paridad con la misma
 * matemática que la calculadora de cada hoja.
 *
 * Es un motor autocontenido (no importa nada de ons-motor.js) siguiendo la
 * convención del resto de las herramientas de este sitio: cada uno duplica
 * lo que necesita en vez de compartir código entre archivos -motor.js.
 */

// ---------- Recorte del .zip a sólo las hojas que hacen falta ----------
// (idéntico en espíritu a ons-motor.js: el libro tiene cientos de hojas y
// hay que evitar que ExcelJS intente parsear las que no hacen falta.)

async function recortarLibroMonitor(arrayBuffer, hojasAConservar, hojasOpcionales = new Set()) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookXmlPath = 'xl/workbook.xml';
  let workbookXml = await zip.file(workbookXmlPath).async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');

  const sheetRegex = /<sheet\b[^>]*\/>/g;
  const todasLasHojas = workbookXml.match(sheetRegex) || [];

  const buscadas = new Set(hojasAConservar);
  const targetsAConservar = new Set();
  const etiquetasAConservar = [];
  const encontradas = new Set();
  for (const etiqueta of todasLasHojas) {
    const nombreMatch = etiqueta.match(/name="([^"]*)"/);
    const ridMatch = etiqueta.match(/r:id="([^"]+)"/);
    const nombre = nombreMatch && nombreMatch[1];
    if (!buscadas.has(nombre)) continue;

    const rid = ridMatch && ridMatch[1];
    const relRegex = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`);
    const relMatch = relsXml.match(relRegex);
    const target = relMatch && relMatch[1];

    etiquetasAConservar.push(etiqueta);
    encontradas.add(nombre);
    if (target) targetsAConservar.add(target);
  }

  // Algunas hojas pedidas (p.ej. una hoja por ticker) pueden faltar sin que
  // eso sea un error: ese ticker simplemente queda sin datos de calculadora.
  // Sólo se corta la ejecución si falta una hoja no marcada como opcional.
  const faltantes = hojasAConservar.filter((h) => !encontradas.has(h) && !hojasOpcionales.has(h));
  if (faltantes.length > 0) {
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
    // Sólo hace falta el valor cacheado (<v>) de cada celda: se sacan las
    // fórmulas para que ExcelJS lea directo el resultado cacheado (ver nota
    // equivalente en ons-motor.js).
    sheetXml = sheetXml.replace(/<f\b[^>]*\/>/g, '').replace(/<f\b[^>]*>[\s\S]*?<\/f>/g, '');
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

async function cargarHojasMonitor(arrayBuffer, hojasAConservar, hojasOpcionales = new Set()) {
  const bufferRecortado = await recortarLibroMonitor(arrayBuffer, hojasAConservar, hojasOpcionales);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bufferRecortado);
  return workbook;
}

function valorCeldaMonitor(celda) {
  const v = celda.value;
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) return v.result;
  return v;
}

// ---------- Lectura de "Corporativos" (sólo el bloque consolidado final) ----------

const COL_CORP = {
  ticker: 2,
  emisor: 3,
  precio: 4,
  vencimiento: 5,
  tir: 6,
  duration: 7,
  amortizacion: 8,
  cupon: 9,
  mesCupon: 10,
  moneda: 11,
  ley: 12,
  calificacion: 13,
  laminaMinima: 14,
  sector: 15,
  paridad: 16,
};

/**
 * "Corporativos" trae varios bloques con título propio (p.ej. "Bonos AAA
 * Cable", "Bonos AAA MEP", "Bonos AA", "Bonos A", "Bonos <A"), cada uno con
 * su propio encabezado "Ticker" repetido, y al final un bloque sin título
 * con todas las ONs juntas (el mismo que usa el Comparador de ONs). Acá
 * interesa reproducir la hoja tal cual se ve al abrirla: se buscan todos
 * los bloques CON título (una fila con texto en la columna B y la
 * siguiente fila con encabezado "Ticker") y se ignora el bloque final sin
 * título, que sólo repite las mismas ONs ya agrupadas por bloque.
 *
 * El título de cada bloque está en una celda combinada (p.ej. B5:O5): no
 * sirve para distinguirlo de una fila de datos mirar si la columna
 * siguiente (Emisor) está vacía, porque ExcelJS devuelve el mismo valor de
 * la celda combinada en TODAS las columnas que abarca, no sólo en B. Por
 * eso alcanza con que la fila siguiente sea exactamente el encabezado
 * "Ticker": una fila de datos real nunca tiene esa fila justo debajo.
 */
function encontrarBloquesConTitulo(hojaCorp) {
  const bloques = [];
  for (let r = 1; r < hojaCorp.rowCount; r++) {
    const titulo = valorCeldaMonitor(hojaCorp.getRow(r).getCell(COL_CORP.ticker));
    const siguienteEsEncabezado = valorCeldaMonitor(hojaCorp.getRow(r + 1).getCell(COL_CORP.ticker)) === 'Ticker';
    if (!titulo || titulo === 'Ticker' || !siguienteEsEncabezado) continue;

    const filaEncabezado = r + 1;
    let filaFin = filaEncabezado;
    while (valorCeldaMonitor(hojaCorp.getRow(filaFin + 1).getCell(COL_CORP.ticker))) {
      filaFin += 1;
    }
    bloques.push({ titulo: String(titulo), inicio: filaEncabezado + 1, fin: filaFin });
  }

  if (bloques.length === 0) {
    throw new Error('No se encontraron bloques de ONs en la hoja "Corporativos".');
  }
  return bloques;
}

/** Lee el listado fijo de "Corporativos", agrupado por sección (sin precio/TIR/duration/paridad: eso se recalcula). */
async function leerCorporativosEstatico(arrayBuffer) {
  const workbook = await cargarHojasMonitor(arrayBuffer, ['Corporativos']);
  const hojaCorp = workbook.getWorksheet('Corporativos');
  if (!hojaCorp) throw new Error('Falta la hoja "Corporativos" en el archivo.');

  const bloques = encontrarBloquesConTitulo(hojaCorp);
  const bonos = [];
  for (const bloque of bloques) {
    for (let r = bloque.inicio; r <= bloque.fin; r++) {
      const fila = hojaCorp.getRow(r);
      const ticker = valorCeldaMonitor(fila.getCell(COL_CORP.ticker));
      if (!ticker) continue;
      bonos.push({
        ticker: String(ticker),
        seccion: bloque.titulo,
        emisor: valorCeldaMonitor(fila.getCell(COL_CORP.emisor)),
        vencimiento: valorCeldaMonitor(fila.getCell(COL_CORP.vencimiento)),
        amortizacion: valorCeldaMonitor(fila.getCell(COL_CORP.amortizacion)),
        cupon: valorCeldaMonitor(fila.getCell(COL_CORP.cupon)),
        mesCupon: valorCeldaMonitor(fila.getCell(COL_CORP.mesCupon)),
        moneda: valorCeldaMonitor(fila.getCell(COL_CORP.moneda)),
        ley: valorCeldaMonitor(fila.getCell(COL_CORP.ley)),
        calificacion: valorCeldaMonitor(fila.getCell(COL_CORP.calificacion)),
        laminaMinima: valorCeldaMonitor(fila.getCell(COL_CORP.laminaMinima)),
        sector: valorCeldaMonitor(fila.getCell(COL_CORP.sector)),
      });
    }
  }
  return bonos;
}

// ---------- Cotizaciones en vivo (data912.com) ----------

const DATA912_ARG_CORP_URL = 'https://data912.com/live/arg_corp';
const DATA912_MEP_URL = 'https://data912.com/live/mep';
const MEP_TICKER_REFERENCIA = 'AL30';

/**
 * Trae las cotizaciones en vivo de ONs corporativas y el dólar MEP (a partir
 * del bono AL30, ley Argentina vs. AL30D, ley Nueva York: es la referencia
 * más líquida para ese cálculo). Los tickers terminados en "O" (ley
 * Argentina) cotizan en pesos a una escala de miles/cientos de miles en
 * data912 y hay que pasarlos a dólares dividiendo por el MEP; los
 * terminados en "D" (ley Nueva York) o "C" (dólar cable) ya vienen
 * cotizados en dólares, en la misma escala "cada 100 de nominal" que usa la
 * calculadora.
 */
async function obtenerCotizacionesVivo() {
  const [corpResp, mepResp] = await Promise.all([
    fetch(DATA912_ARG_CORP_URL),
    fetch(DATA912_MEP_URL),
  ]);
  if (!corpResp.ok) throw new Error('No se pudieron obtener las cotizaciones de ONs (data912).');
  if (!mepResp.ok) throw new Error('No se pudo obtener el dólar MEP (data912).');

  const corpData = await corpResp.json();
  const mepData = await mepResp.json();

  const filaMep = mepData.find((r) => r.ticker === MEP_TICKER_REFERENCIA && r.panel === 'bonds');
  if (!filaMep || !Number.isFinite(filaMep.mark)) {
    throw new Error('No se pudo obtener el dólar MEP de referencia (AL30).');
  }
  const mep = filaMep.mark;

  const porTicker = new Map();
  for (const fila of corpData) {
    porTicker.set(fila.symbol, fila);
  }

  return { porTicker, mep, actualizadoA: new Date() };
}

/**
 * Precio limpio (sin comisión, "cada 100 de nominal") a partir de la
 * cotización en vivo de un ticker, o null si no hay cotización utilizable.
 */
function precioLimpioDesdeVivo(ticker, cotizaciones) {
  const fila = cotizaciones.porTicker.get(ticker);
  if (!fila) return null;
  const bid = fila.px_bid;
  if (!Number.isFinite(bid) || bid <= 0) return null;

  const esLeyArgentina = String(ticker).toUpperCase().endsWith('O');
  return esLeyArgentina ? bid / cotizaciones.mep : bid;
}

// ---------- Calculadora por ON (idéntica a ons-motor.js) ----------

function periodosPorAnioMonitor(frecuencia) {
  const mapa = { Anual: 1, Semestral: 2, Cuatrimestral: 3, Trimestral: 4 };
  return mapa[frecuencia] || 2;
}

function dias360ExcelMonitor(fechaA, fechaB) {
  let diaA = fechaA.getDate();
  let diaB = fechaB.getDate();
  if (diaA === 31) diaA = 30;
  if (diaB === 31 && diaA === 30) diaB = 30;
  return (
    (fechaB.getFullYear() - fechaA.getFullYear()) * 360 +
    (fechaB.getMonth() - fechaA.getMonth()) * 30 +
    (diaB - diaA)
  );
}

const MS_POR_DIA_MONITOR = 24 * 60 * 60 * 1000;

function fraccionAnioMonitor(fechaA, fechaB, baseCalculo) {
  if (baseCalculo === '30/360') return dias360ExcelMonitor(fechaA, fechaB) / 360;
  return (fechaB.getTime() - fechaA.getTime()) / MS_POR_DIA_MONITOR / 365;
}

function fraccionAnioXirrMonitor(fechaA, fechaB) {
  return (fechaB.getTime() - fechaA.getTime()) / MS_POR_DIA_MONITOR / 365;
}

function calcularXIRRMonitor(fechas, flujos) {
  const van = (tasa) =>
    flujos.reduce((suma, flujo, i) => suma + flujo / (1 + tasa) ** fraccionAnioXirrMonitor(fechas[0], fechas[i]), 0);
  const derivadaVan = (tasa) =>
    flujos.reduce((suma, flujo, i) => {
      const t = fraccionAnioXirrMonitor(fechas[0], fechas[i]);
      return t === 0 ? suma : suma + (-t * flujo) / (1 + tasa) ** (t + 1);
    }, 0);

  let tasa = 0.15;
  for (let iter = 0; iter < 100; iter++) {
    const valor = van(tasa);
    const derivada = derivadaVan(tasa);
    if (Math.abs(derivada) < 1e-12) break;
    const nuevaTasa = tasa - valor / derivada;
    if (!Number.isFinite(nuevaTasa) || nuevaTasa <= -0.999999) break;
    if (Math.abs(nuevaTasa - tasa) < 1e-9) return nuevaTasa;
    tasa = nuevaTasa;
  }

  let bajo = -0.9;
  let alto = 10;
  let vBajo = van(bajo);
  const vAlto = van(alto);
  if (Number.isFinite(vBajo) && Number.isFinite(vAlto) && vBajo * vAlto <= 0) {
    for (let iter = 0; iter < 200; iter++) {
      const medio = (bajo + alto) / 2;
      const vMedio = van(medio);
      if (Math.abs(vMedio) < 1e-6) return medio;
      if (vMedio > 0 === vBajo > 0) {
        bajo = medio;
        vBajo = vMedio;
      } else {
        alto = medio;
      }
    }
    return (bajo + alto) / 2;
  }

  throw new Error('No se pudo calcular la TIR para ese precio.');
}

/** Lee la "calculadora" de un ticker desde un workbook ya cargado (evita recortar/parsear el .zip por cada ON). */
function leerDatosTickerDesdeWorkbook(workbook, hojaDetalles, ticker) {
  const hoja = workbook.getWorksheet(ticker);
  if (!hoja) throw new Error(`No se encontró la hoja de "${ticker}".`);
  const leer = (coord) => valorCeldaMonitor(hoja.getCell(coord));

  const estatico = {
    frecuencia: leer('C9'),
    baseCalculo: leer('C10'),
  };

  const mercado = {
    valorResidual: leer('I3'),
    interesesCorridos: leer('I4'),
    convexity: leer('I11'),
  };

  const nominalesOriginal = leer('C20');
  const cambioYield = leer('C21');
  const fechaLiquidacion = leer('M9');
  const comision = valorCeldaMonitor(hojaDetalles.getCell('F3'));

  if (!(fechaLiquidacion instanceof Date)) {
    throw new Error(`No se pudo leer la fecha de liquidación de "${ticker}".`);
  }

  const flujos = [];
  let r = 18;
  while (true) {
    const fecha = leer(`E${r}`);
    if (!(fecha instanceof Date)) break;
    flujos.push({
      fecha,
      amortizacionUsd: leer(`H${r}`) || 0,
      interesUsd: leer(`I${r}`) || 0,
    });
    r++;
  }
  if (flujos.length === 0) {
    throw new Error(`No se encontró el flujo de pagos de "${ticker}".`);
  }

  return { ticker, estatico, mercado, nominalesOriginal, cambioYield, fechaLiquidacion, comision, flujos };
}

/** Igual a recalcularCalculadora de ons-motor.js: TIR/duration/paridad a un precio dado. */
function recalcularConPrecio(datos, precio) {
  const nominales = datos.nominalesOriginal;
  const precioTotal = -(precio / 100) * nominales * (1 + datos.comision);

  const fechas = [datos.fechaLiquidacion, ...datos.flujos.map((f) => f.fecha)];
  const montosFuturos = datos.flujos.map((f) => f.amortizacionUsd + f.interesUsd);
  const montos = [precioTotal, ...montosFuturos];

  const tir = calcularXIRRMonitor(fechas, montos);

  let sumaVP = 0;
  let sumaVPxT = 0;
  for (let i = 0; i < datos.flujos.length; i++) {
    const t = fraccionAnioMonitor(datos.fechaLiquidacion, datos.flujos[i].fecha, datos.estatico.baseCalculo);
    const vp = montosFuturos[i] / (1 + tir) ** t;
    sumaVP += vp;
    sumaVPxT += vp * t;
  }
  const duration = sumaVPxT / sumaVP;

  const valorTecnico = datos.mercado.valorResidual + datos.mercado.interesesCorridos;
  const paridad = -precioTotal / valorTecnico;

  return { precio, tir, duration, paridad };
}

// ---------- Orquestación ----------
//
// Separado en dos pasos para poder refrescar sólo la cotización (cada 20
// segundos, ver monitor-individuos.js) sin volver a recortar/parsear el
// .zip del Excel en cada vuelta: prepararMonitorCorporativos lee el
// listado fijo y deja el workbook de las hojas por ticker ya cargado en
// memoria; recalcularConVivo se puede llamar tantas veces como haga falta
// sobre ese mismo resultado.

/**
 * Lee el listado fijo de "Corporativos" y deja cargadas en memoria las
 * hojas por ticker + "Detalles" (necesarias para recalcular), sin todavía
 * pedir ninguna cotización.
 */
async function prepararMonitorCorporativos(arrayBuffer) {
  const bonosEstaticos = await leerCorporativosEstatico(arrayBuffer);

  const tickers = bonosEstaticos.map((b) => b.ticker);
  const workbook = await cargarHojasMonitor(arrayBuffer, ['Detalles', ...tickers], new Set(tickers));
  const hojaDetalles = workbook.getWorksheet('Detalles');
  if (!hojaDetalles) throw new Error('Falta la hoja "Detalles" en el archivo.');

  return { bonosEstaticos, workbook, hojaDetalles };
}

/**
 * Trae la cotización en vivo y recalcula precio/TIR/duration/paridad de
 * cada ON con cotización disponible, a partir de lo que dejó cargado
 * prepararMonitorCorporativos. Las ONs sin cotización en vivo, o cuya hoja
 * no se pudo leer, quedan marcadas con error y sin esos datos (se muestran
 * igual, con el resto de los campos fijos).
 */
async function recalcularConVivo({ bonosEstaticos, workbook, hojaDetalles }) {
  const cotizaciones = await obtenerCotizacionesVivo();

  const resultado = bonosEstaticos.map((base) => {
    const precioLimpio = precioLimpioDesdeVivo(base.ticker, cotizaciones);
    if (precioLimpio === null) {
      return { ...base, error: 'sin_cotizacion' };
    }

    try {
      const datos = leerDatosTickerDesdeWorkbook(workbook, hojaDetalles, base.ticker);
      const calc = recalcularConPrecio(datos, precioLimpio);
      return {
        ...base,
        precio: calc.precio,
        tir: calc.tir,
        duration: calc.duration,
        paridad: calc.paridad,
        error: null,
      };
    } catch (error) {
      return { ...base, error: error.message || 'error_calculo' };
    }
  });

  return { bonos: resultado, mep: cotizaciones.mep, actualizadoA: cotizaciones.actualizadoA };
}
