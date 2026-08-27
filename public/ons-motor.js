/*
 * Motor del Comparador de ONs (Obligaciones Negociables).
 * Corre 100% en el navegador (usa los ExcelJS y JSZip vendorizados en
 * vendor/): el archivo nunca se sube a ningún servidor.
 *
 * Lee únicamente las hojas "Corporativos" (listado consolidado de ONs, con
 * TIR/Duration/Calificación ya resueltos a la moneda en la que cotiza cada
 * bono) y "Precios" (feed de mercado en crudo, por RIC) del libro
 * Monitor_Individuos. El libro tiene cientos de hojas (una por ticker) que no
 * hacen falta para esto, así que antes de cargarlo con ExcelJS se recorta el
 * .zip para dejar sólo esas dos hojas: evita parsear el resto y esquiva un
 * par de estructuras (tablas de Excel, fórmulas de array) que rompen el
 * parser si se las deja.
 */

// ---------- Recorte del .xlsm a sólo las hojas que hacen falta ----------

async function recortarLibro(arrayBuffer, hojasAConservar, { quitarFormulas = false } = {}) {
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
    const target = relMatch && relMatch[1]; // ej: "worksheets/sheet18.xml"

    etiquetasAConservar.push(etiqueta);
    if (target) targetsAConservar.add(target);
  }

  if (etiquetasAConservar.length !== hojasAConservar.length) {
    const encontradas = etiquetasAConservar.map((e) => e.match(/name="([^"]*)"/)[1]);
    const faltantes = hojasAConservar.filter((h) => !encontradas.includes(h));
    throw new Error(`El archivo no tiene la(s) hoja(s): ${faltantes.join(', ')}`);
  }

  // 1) el <sheets> de workbook.xml sólo lista las hojas que nos importan
  const sheetsBlockRegex = /(<sheets>)([\s\S]*?)(<\/sheets>)/;
  workbookXml = workbookXml.replace(sheetsBlockRegex, (_full, open, _mid, close) => {
    return open + etiquetasAConservar.join('') + close;
  });
  zip.file(workbookXmlPath, workbookXml);

  // 2) se borran físicamente las demás hojas: ExcelJS recorre cada
  // xl/worksheets/sheetN.xml presente en el .zip sin importar si
  // workbook.xml lo referencia o no.
  for (const ruta of Object.keys(zip.files)) {
    const m = ruta.match(/^xl\/(worksheets\/sheet\d+\.xml)$/);
    if (!m) continue;
    if (!targetsAConservar.has(m[1])) {
      zip.remove(ruta);
      const nombreArchivo = m[1].split('/').pop();
      zip.remove(`xl/worksheets/_rels/${nombreArchivo}.rels`);
    }
  }

  // 3) se le quitan las Tablas de Excel a las hojas que quedan: sólo hace
  // falta leer valores de celdas, y ExcelJS no puede parsear la definición
  // de algunas de las tablas de este libro.
  for (const target of targetsAConservar) {
    const sheetPath = 'xl/' + target;
    const archivo = zip.file(sheetPath);
    if (!archivo) continue;
    let sheetXml = await archivo.async('string');
    sheetXml = sheetXml.replace(/<tableParts[\s\S]*?<\/tableParts>/, '');
    if (quitarFormulas) {
      // Sólo hace falta el valor cacheado (<v>) de cada celda, nunca la
      // fórmula: ExcelJS no lee bien el resultado cacheado de las celdas
      // con "fórmula compartida" (arrastradas hacia abajo en una columna,
      // muy usadas en la tabla de flujo de pagos de estas hojas) y devuelve
      // un objeto sin resultado en vez del valor. Sacando el <f>...</f> (o
      // <f .../> de las compartidas sin cuerpo) de encima, ExcelJS lee el
      // <v> directo como si fuera una celda de valor plano.
      sheetXml = sheetXml.replace(/<f\b[^>]*\/>/g, '').replace(/<f\b[^>]*>[\s\S]*?<\/f>/g, '');
    }
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

  // ExcelJS también recorre cada xl/tables/tableN.xml del .zip sin importar
  // si alguna hoja restante lo referencia.
  Object.keys(zip.files)
    .filter((nombre) => /^xl\/tables\/table\d+\.xml$/.test(nombre))
    .forEach((nombre) => zip.remove(nombre));

  return zip.generateAsync({ type: 'arraybuffer' });
}

async function cargarHojas(arrayBuffer, hojasAConservar, opciones = {}) {
  const bufferRecortado = await recortarLibro(arrayBuffer, hojasAConservar, opciones);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bufferRecortado);
  return workbook;
}

// ---------- Extracción de datos ----------

// Filas 219 a 411 de "Corporativos": listado consolidado (todas las
// calificaciones juntas), una fila por ON, ya resuelto a la moneda en la que
// efectivamente cotiza cada bono.
const FILA_INICIO_LISTADO = 219;
const FILA_FIN_LISTADO = 411;
const COL = {
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

const TEXTO_SIN_MERCADO = 'record could not be found';

// Brecha entre el precio de la última operación y la mejor punta de compra
// (Bid) a partir de la cual se considera que la TIR mostrada (calculada
// sobre la última operación) ya no es confiable — puede ser una operación
// vieja o fuera de mercado. El archivo no trae una punta de venta (Offer/
// Ask) para las ONs, sólo Bid y Last, así que esto es la mejor señal de
// "¿esta TIR se puede conseguir hoy?" que se puede armar con esos datos.
const UMBRAL_BRECHA_BID_DEFECTO = 0.03;

// Escala de calificación local (de mejor a peor). Lo que no está en esta
// lista se ordena al final, sin romper nada.
const ESCALA_CALIFICACION = [
  'AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-',
  'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-',
  'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-',
  'CC+', 'CC', 'CC-', 'C', 'D',
];

function indiceCalificacion(calificacion) {
  const i = ESCALA_CALIFICACION.indexOf(calificacion);
  return i === -1 ? ESCALA_CALIFICACION.length : i;
}

function valorCelda(celda) {
  const v = celda.value;
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) return v.result;
  return v;
}

function esValorSinMercado(valor) {
  if (typeof valor === 'string') return valor.toLowerCase().includes(TEXTO_SIN_MERCADO);
  // un precio o bid en 0 tampoco es una cotización real.
  return valor === 0;
}

/** RIC del feed en crudo a partir del ticker: p.ej. "RUCDO" -> "ARRUCDD1=BA". */
function ricDesdeTicker(ticker) {
  return 'AR' + String(ticker).slice(0, -1) + 'D' + '1=BA';
}

function indexarPrecios(hojaPrecios) {
  const porRic = new Map();
  hojaPrecios.eachRow((fila, numeroFila) => {
    if (numeroFila === 1) return;
    const ric = valorCelda(fila.getCell(1));
    if (ric) porRic.set(ric, fila);
  });
  return porRic;
}

function fechaActualizacionPrecios(hojaPrecios) {
  let encontrada = null;
  hojaPrecios.getRow(1).eachCell({ includeEmpty: false }, (celda) => {
    const v = valorCelda(celda);
    if (typeof v === 'string' && v.startsWith('Updated at')) encontrada = v;
  });
  return encontrada;
}

/**
 * Arma el listado de ONs a partir de "Corporativos", cruzando cada una con
 * el feed en crudo de "Precios" (vía el RIC derivado del ticker) para
 * detectar bonos sin operaciones reales: cuando no hay RIC en el feed, o el
 * feed devuelve el error de Bid/Last "record could not be found", la TIR
 * que muestra Corporativos no es confiable (no hay ofertas detrás), así que
 * se marca el bono como ilíquido en vez de usarlo para rankear/sugerir.
 */
function extraerBonos(workbook) {
  const hojaCorp = workbook.getWorksheet('Corporativos');
  const hojaPrecios = workbook.getWorksheet('Precios');
  if (!hojaCorp || !hojaPrecios) {
    throw new Error('Faltan las hojas "Corporativos" y/o "Precios" en el archivo.');
  }

  const preciosPorRic = indexarPrecios(hojaPrecios);
  const bonos = [];

  for (let r = FILA_INICIO_LISTADO; r <= FILA_FIN_LISTADO; r++) {
    const fila = hojaCorp.getRow(r);
    const ticker = valorCelda(fila.getCell(COL.ticker));
    if (!ticker) continue;

    const ric = ricDesdeTicker(ticker);
    const filaPrecio = preciosPorRic.get(ric);
    let liquido = false;
    let precioBid = null;
    let precioUltimo = null;
    let brechaBid = null;
    if (filaPrecio) {
      const bid = valorCelda(filaPrecio.getCell(9));
      const last = valorCelda(filaPrecio.getCell(3));
      liquido = !esValorSinMercado(bid) && !esValorSinMercado(last);
      if (liquido) {
        precioBid = bid;
        precioUltimo = last;
        brechaBid = (last - bid) / last;
      }
    }

    bonos.push({
      ticker: String(ticker),
      emisor: valorCelda(fila.getCell(COL.emisor)),
      precio: valorCelda(fila.getCell(COL.precio)),
      vencimiento: valorCelda(fila.getCell(COL.vencimiento)),
      tir: valorCelda(fila.getCell(COL.tir)),
      duration: valorCelda(fila.getCell(COL.duration)),
      amortizacion: valorCelda(fila.getCell(COL.amortizacion)),
      cupon: valorCelda(fila.getCell(COL.cupon)),
      moneda: valorCelda(fila.getCell(COL.moneda)),
      ley: valorCelda(fila.getCell(COL.ley)),
      calificacion: valorCelda(fila.getCell(COL.calificacion)),
      laminaMinima: valorCelda(fila.getCell(COL.laminaMinima)),
      sector: valorCelda(fila.getCell(COL.sector)),
      paridad: valorCelda(fila.getCell(COL.paridad)),
      ric,
      liquido,
      precioBid,
      precioUltimo,
      brechaBid,
    });
  }

  return { bonos, actualizadoA: fechaActualizacionPrecios(hojaPrecios) };
}

/** Procesa el archivo (100% en el navegador) y devuelve el listado de ONs. */
async function procesarOns(arrayBuffer) {
  const workbook = await cargarHojas(arrayBuffer, ['Corporativos', 'Precios']);
  return extraerBonos(workbook);
}

// ---------- Confiabilidad de la TIR mostrada ----------

/**
 * Por qué no usar la TIR de un bono tal cual la muestra Corporativos, o
 * null si no hay motivo (se puede confiar en ella):
 *  - "sin_liquidez": no hay ninguna oferta de mercado detrás (no está el
 *    RIC en el feed, o Bid/Last vienen sin dato) — la TIR mostrada es de
 *    fantasía.
 *  - "brecha_alta": hay una punta de compra (Bid), pero está lejos del
 *    precio de la última operación — señal de que esa última operación
 *    puede estar vieja o fuera de mercado, así que la TIR calculada sobre
 *    ella tampoco es del todo confiable.
 * El archivo no trae una punta de venta (Offer/Ask) para las ONs, sólo
 * Bid y Last, así que no se puede calcular una "TIR de compra" exacta;
 * esto es la aproximación más honesta posible con esos dos datos.
 */
function calcularMotivoExclusion(bono, umbralBrecha = UMBRAL_BRECHA_BID_DEFECTO) {
  if (!bono.liquido) return 'sin_liquidez';
  if (Math.abs(bono.brechaBid) > umbralBrecha) return 'brecha_alta';
  return null;
}

// ---------- Ranking por características ----------

/**
 * Filtra y ordena por TIR descendente. Los bonos sin liquidez o con una
 * brecha grande entre Bid y la última operación (ver calcularMotivoExclusion)
 * que cumplen el resto de los filtros se devuelven aparte (nunca mezclados
 * en el ranking), porque su TIR mostrada no es confiable.
 */
function rankearBonos(bonos, filtros = {}) {
  const { moneda, calificacionMinima, durationMin, durationMax, umbralBrecha } = filtros;
  const indiceMinimo = calificacionMinima ? indiceCalificacion(calificacionMinima) : Infinity;

  const cumpleFiltros = (bono) => {
    if (moneda && bono.moneda !== moneda) return false;
    if (calificacionMinima && indiceCalificacion(bono.calificacion) > indiceMinimo) return false;
    if (Number.isFinite(durationMin) && bono.duration < durationMin) return false;
    if (Number.isFinite(durationMax) && bono.duration > durationMax) return false;
    return true;
  };

  const candidatos = bonos
    .filter(cumpleFiltros)
    .map((b) => ({ ...b, motivoExclusion: calcularMotivoExclusion(b, umbralBrecha) }));
  const resultados = candidatos.filter((b) => !b.motivoExclusion).sort((a, b) => b.tir - a.tir);
  const excluidos = candidatos.filter((b) => b.motivoExclusion).sort((a, b) => b.tir - a.tir);

  return { resultados, excluidos };
}

// ---------- Sugerencias a partir de un ticker ----------

/** TIR por año de duration: una medida simple de "rendimiento por riesgo". */
function tirPorDuration(bono) {
  return Number.isFinite(bono.duration) && bono.duration > 0 ? bono.tir / bono.duration : null;
}

/**
 * A partir de una ON de referencia, busca alternativas de la misma moneda,
 * confiables (ver calcularMotivoExclusion), en cuatro modos:
 *  - "subirTir": misma calificación (o similar), TIR mayor a la de
 *    referencia, permitiendo algo más de duration (hasta toleranciaDuration
 *    años de más). Ordena por TIR descendente.
 *  - "bajarDuration": misma calificación (o similar), duration menor a la
 *    de referencia, resignando como máximo toleranciaTir puntos de TIR.
 *    Ordena por duration ascendente.
 *  - "subirCalificacion": calificación mejor a la de referencia (sin
 *    importar si "similar" está tildado), duration parecida (dentro de
 *    toleranciaDuration en cualquier sentido) y resignando como máximo
 *    toleranciaTir puntos de TIR. Ordena por TIR descendente.
 *  - "mejorRelacion": misma calificación (o similar), con mejor relación
 *    TIR/duration que la de referencia (más rendimiento por cada año de
 *    riesgo). Ordena por esa relación, descendente.
 */
function sugerirAlternativas(bonos, tickerReferencia, modo, opciones = {}) {
  const {
    toleranciaDuration = 1,
    toleranciaTir = 0.01,
    calificacionSimilar = false,
    umbralBrecha,
  } = opciones;

  const referenciaOriginal = bonos.find((b) => b.ticker === tickerReferencia);
  if (!referenciaOriginal) {
    throw new Error(`No se encontró la ON "${tickerReferencia}" en el archivo.`);
  }
  const referencia = {
    ...referenciaOriginal,
    motivoExclusion: calcularMotivoExclusion(referenciaOriginal, umbralBrecha),
  };

  const indiceRef = indiceCalificacion(referencia.calificacion);
  const mismaFamiliaDeRiesgo = (bono) => {
    const indice = indiceCalificacion(bono.calificacion);
    return calificacionSimilar ? Math.abs(indice - indiceRef) <= 1 : indice === indiceRef;
  };

  const base = bonos
    .filter((b) => b.ticker !== referencia.ticker && b.moneda === referencia.moneda)
    .filter((b) => !calcularMotivoExclusion(b, umbralBrecha));

  let candidatos;

  if (modo === 'subirTir') {
    candidatos = base.filter(
      (b) =>
        mismaFamiliaDeRiesgo(b) &&
        b.tir > referencia.tir &&
        b.duration <= referencia.duration + toleranciaDuration
    );
    candidatos.sort((a, b) => b.tir - a.tir);
  } else if (modo === 'bajarDuration') {
    candidatos = base.filter(
      (b) => mismaFamiliaDeRiesgo(b) && b.duration < referencia.duration && b.tir >= referencia.tir - toleranciaTir
    );
    candidatos.sort((a, b) => a.duration - b.duration);
  } else if (modo === 'subirCalificacion') {
    candidatos = base.filter(
      (b) =>
        indiceCalificacion(b.calificacion) < indiceRef &&
        Math.abs(b.duration - referencia.duration) <= toleranciaDuration &&
        b.tir >= referencia.tir - toleranciaTir
    );
    candidatos.sort((a, b) => b.tir - a.tir);
  } else if (modo === 'mejorRelacion') {
    const ratioRef = tirPorDuration(referencia);
    if (ratioRef === null) {
      throw new Error(`No se puede calcular TIR/duration para "${referencia.ticker}" (duration inválida).`);
    }
    candidatos = base
      .filter((b) => mismaFamiliaDeRiesgo(b))
      .map((b) => ({ ...b, tirPorDuration: tirPorDuration(b) }))
      .filter((b) => b.tirPorDuration !== null && b.tirPorDuration > ratioRef);
    candidatos.sort((a, b) => b.tirPorDuration - a.tirPorDuration);
  } else {
    throw new Error(`Modo desconocido: ${modo}`);
  }

  return { referencia, candidatos };
}

// ---------- Calculadora por ON ----------
//
// Cada ON tiene su propia hoja (con el nombre del ticker) dentro del libro,
// con la misma plantilla siempre: datos del bono, TIR/duration/paridad ya
// calculados al precio de mercado actual, y la tabla de flujo de pagos
// (fechas y montos de cada cupón/amortización futura). Esa plantilla es la
// "calculadora" del Excel. Acá se lee tal cual para mostrar los resultados
// al precio de mercado, y además se guarda lo necesario (flujo de pagos,
// comisión, base de cálculo) para poder recalcular todo a un precio o una
// cantidad de nominales distinta, sin tener que volver a tocar el archivo.

function periodosPorAnio(frecuencia) {
  const mapa = { Anual: 1, Semestral: 2, Cuatrimestral: 3, Trimestral: 4 };
  return mapa[frecuencia] || 2;
}

/** DAYS360 de Excel (método US/NASD). */
function dias360Excel(fechaA, fechaB) {
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

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Fracción de año entre dos fechas, con la base de cálculo del bono. */
function fraccionAnio(fechaA, fechaB, baseCalculo) {
  if (baseCalculo === '30/360') return dias360Excel(fechaA, fechaB) / 360;
  return (fechaB.getTime() - fechaA.getTime()) / MS_POR_DIA / 365;
}

/** XIRR de Excel siempre usa días reales / 365, sin importar la base del bono. */
function fraccionAnioXirr(fechaA, fechaB) {
  return (fechaB.getTime() - fechaA.getTime()) / MS_POR_DIA / 365;
}

/**
 * TIR efectiva (equivalente a XIRR de Excel): Newton-Raphson, con una
 * bisección como respaldo para los casos en los que no converge (bonos muy
 * castigados, con TIR negativa o extrema).
 */
function calcularXIRR(fechas, flujos) {
  const van = (tasa) =>
    flujos.reduce((suma, flujo, i) => suma + flujo / (1 + tasa) ** fraccionAnioXirr(fechas[0], fechas[i]), 0);
  const derivadaVan = (tasa) =>
    flujos.reduce((suma, flujo, i) => {
      const t = fraccionAnioXirr(fechas[0], fechas[i]);
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

/**
 * Lee la "calculadora" de una ON puntual: sus datos fijos, sus resultados
 * al precio de mercado actual (tal cual los cachea el Excel) y el flujo de
 * pagos futuro, necesario para recalcular todo a otro precio/nominales.
 */
async function cargarDatosCalculadora(arrayBuffer, ticker) {
  const workbook = await cargarHojas(arrayBuffer, [ticker, 'Detalles'], { quitarFormulas: true });
  const hoja = workbook.getWorksheet(ticker);
  const hojaDetalles = workbook.getWorksheet('Detalles');
  const leer = (coord) => valorCelda(hoja.getCell(coord));

  const estatico = {
    emisor: leer('C3'),
    sector: leer('C4'),
    calificacion: leer('C5'),
    monedaCobro: leer('C6'),
    tipoTasa: leer('C7'),
    interesAnual: leer('C8'),
    frecuencia: leer('C9'),
    baseCalculo: leer('C10'),
    amortizacionTexto: leer('C11'),
    fechaEmision: leer('C12'),
    fechaVencimiento: leer('C13'),
    fechasCobro: leer('C14'),
    ley: leer('C15'),
    nominalesMinimos: leer('C16'),
    multiplo: leer('C17'),
  };

  const mercado = {
    tirEfectiva: leer('F3'),
    tirNominal: leer('F4'),
    currentYield: leer('F5'),
    valorResidual: leer('I3'),
    interesesCorridos: leer('I4'),
    valorTecnico: leer('I5'),
    paridad: leer('I6'),
    duration: leer('I9'),
    modDuration: leer('I10'),
    convexity: leer('I11'),
    changeInPrice: leer('I12'),
  };

  const nominalesOriginal = leer('C20');
  const cambioYield = leer('C21');
  const fechaLiquidacion = leer('M9');
  const precioOriginalTotal = leer('J17'); // cash flow negativo (precio pagado)
  const comision = valorCelda(hojaDetalles.getCell('F3'));

  if (!(fechaLiquidacion instanceof Date) || !Number.isFinite(precioOriginalTotal)) {
    throw new Error(`No se pudo leer la calculadora de "${ticker}": faltan datos de precio o liquidación.`);
  }

  // precio "de pizarra" (por cada 100 de nominal), invirtiendo la fórmula
  // que arma el precio total: -precioTotal = (precio/100) * nominales * (1+comisión)
  const precioMercado = (-precioOriginalTotal * 100) / (nominalesOriginal * (1 + comision));

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

  return {
    ticker,
    estatico,
    mercado,
    nominalesOriginal,
    cambioYield,
    fechaLiquidacion,
    precioMercado,
    comision,
    flujos,
  };
}

/**
 * Recalcula TIR, duration, paridad, etc. a partir del flujo de pagos ya
 * leído, para un precio y una cantidad de nominales distintos a los de
 * mercado. La convexity y el "change in price" no se recalculan (dependen
 * de una columna auxiliar del Excel que no hace falta leer para lo demás):
 * quedan como referencia al precio de mercado original.
 */
function recalcularCalculadora(datos, opciones = {}) {
  const precio = Number.isFinite(opciones.precio) ? opciones.precio : datos.precioMercado;
  const nominales = Number.isFinite(opciones.nominales) ? opciones.nominales : datos.nominalesOriginal;
  const ratioNominales = nominales / datos.nominalesOriginal;

  const precioTotal = -(precio / 100) * nominales * (1 + datos.comision);

  const fechas = [datos.fechaLiquidacion, ...datos.flujos.map((f) => f.fecha)];
  const montosFuturos = datos.flujos.map((f) => (f.amortizacionUsd + f.interesUsd) * ratioNominales);
  const montos = [precioTotal, ...montosFuturos];

  const tir = calcularXIRR(fechas, montos);

  const periodos = periodosPorAnio(datos.estatico.frecuencia);
  const tirNominal = tir > 0 ? periodos * ((1 + tir) ** (1 / periodos) - 1) : null;

  let sumaVP = 0;
  let sumaVPxT = 0;
  for (let i = 0; i < datos.flujos.length; i++) {
    const t = fraccionAnio(datos.fechaLiquidacion, datos.flujos[i].fecha, datos.estatico.baseCalculo);
    const vp = montosFuturos[i] / (1 + tir) ** t;
    sumaVP += vp;
    sumaVPxT += vp * t;
  }
  const duration = sumaVPxT / sumaVP;
  const modDuration = duration / (1 + tir / periodos);

  const valorResidual = datos.mercado.valorResidual * ratioNominales;
  const interesesCorridos = datos.mercado.interesesCorridos * ratioNominales;
  const valorTecnico = valorResidual + interesesCorridos;
  const paridad = -precioTotal / valorTecnico;
  const currentYield = (datos.estatico.interesAnual * valorResidual) / (-precioTotal - interesesCorridos);
  const changeInPrice = -modDuration * datos.cambioYield + 0.5 * datos.mercado.convexity * datos.cambioYield ** 2;

  const sumaFlujosFuturos = montosFuturos.reduce((acc, m) => acc + m, 0);
  const aFinishPct = sumaFlujosFuturos / -precioTotal - 1;
  const aFinishUsd = sumaFlujosFuturos + precioTotal;

  return {
    precio,
    nominales,
    precioTotal,
    tir,
    tirNominal,
    currentYield,
    duration,
    modDuration,
    paridad,
    valorResidual,
    interesesCorridos,
    valorTecnico,
    changeInPrice,
    aFinishPct,
    aFinishUsd,
    flujos: datos.flujos.map((f, i) => ({
      fecha: f.fecha,
      amortizacionUsd: f.amortizacionUsd * ratioNominales,
      interesUsd: f.interesUsd * ratioNominales,
      total: montosFuturos[i],
    })),
  };
}
