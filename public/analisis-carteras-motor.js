/*
 * Motor del Análisis de Carteras. Corre 100% en el navegador (usa pdf.js y
 * ExcelJS vendorizados en vendor/): el PDF nunca se sube a ningún servidor.
 *
 * Lee el resumen de cuenta (PDF) reconstruyendo, para cada página, las
 * "filas" de las tablas a partir de la posición (x, y) de cada fragmento de
 * texto que devuelve pdf.js: los fragmentos con la misma altura (y) forman
 * una fila, ordenados de izquierda a derecha (x). En este tipo de resumen
 * cada celda de la tabla ("Distribución por tipo de activos") es un
 * fragmento de texto propio, así que una fila de datos siempre tiene
 * exactamente 6 fragmentos: Especie, Descripción, Cantidad, Garantía,
 * Precio, Valor Actual.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

async function extraerFilasPdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const filas = [];

  for (let numeroPagina = 1; numeroPagina <= pdf.numPages; numeroPagina++) {
    const pagina = await pdf.getPage(numeroPagina);
    const contenido = await pagina.getTextContent();

    const porAltura = new Map();
    for (const item of contenido.items) {
      const texto = item.str.trim();
      if (!texto) continue;
      const y = Math.round(item.transform[5] * 2) / 2; // agrupa lo que está a la misma altura
      if (!porAltura.has(y)) porAltura.set(y, []);
      porAltura.get(y).push({ x: item.transform[4], texto });
    }

    const filasPagina = [...porAltura.entries()]
      .sort((a, b) => b[0] - a[0]) // de arriba hacia abajo
      .map(([, celdas]) => celdas.sort((a, b) => a.x - b.x).map((c) => c.texto));
    filas.push(...filasPagina);
  }

  return filas;
}

function buscarValorTrasEtiqueta(filas, etiqueta) {
  for (const fila of filas) {
    const indice = fila.indexOf(etiqueta);
    if (indice !== -1 && fila[indice + 1] !== undefined) return fila[indice + 1];
  }
  return null;
}

/** "1.768.137" -> 1768137, "807,00" -> 807, "3.698,54" -> 3698.54 (formato AR). */
function parseNumeroAr(texto) {
  return parseFloat(texto.replace(/\./g, '').replace(',', '.'));
}

function parseMonto(texto) {
  const coincidencia = texto.match(/^(?:\$|u\$s)\s*([\d.,]+)$/i);
  if (!coincidencia) return null;
  return parseNumeroAr(coincidencia[1]);
}

function esMontoEnDolares(texto) {
  return /^u\$s/i.test(texto.trim());
}

const ETIQUETA_ENCABEZADO_TABLA = 'Especie';

/**
 * Recorre las filas ya reconstruidas y arma la lista de activos de
 * "Distribución por tipo de activos": una fila de una sola celda antes del
 * encabezado de columnas ("Especie Descripción Cantidad ...") da el nombre
 * de la categoría (Acciones, Bonos, etc.); después vienen las filas de
 * datos (6 celdas) hasta la próxima categoría o el final de la tabla.
 */
function extraerActivos(filas) {
  const activos = [];
  let categoriaActual = null;
  let ultimaFilaSimple = null;
  let moneda = null;
  let notaValuacion = null;

  for (const fila of filas) {
    if (fila.length !== 6) {
      // fila "simple" (un título de categoría, una nota, etc.): a veces
      // viene como una única celda y a veces el PDF la parte en varias
      // (una por palabra), así que se reconstruye uniendo todo con espacios.
      const texto = fila.join(' ').trim();
      if (texto) ultimaFilaSimple = texto;
      if (/^\(.*\)$/.test(texto)) notaValuacion = texto;
      continue;
    }

    if (fila[0] === ETIQUETA_ENCABEZADO_TABLA) {
      categoriaActual = ultimaFilaSimple;
      continue;
    }

    if (!categoriaActual) continue;

    const [especie, descripcion, cantidadTexto, , precioTexto, valorTexto] = fila;
    const precio = parseMonto(precioTexto);
    const valorActual = parseMonto(valorTexto);
    if (precio === null || valorActual === null) continue;

    if (!moneda) moneda = esMontoEnDolares(precioTexto) ? 'USD' : 'ARS';

    activos.push({
      categoria: categoriaActual,
      especie,
      descripcion,
      cantidad: parseNumeroAr(cantidadTexto),
      precio,
      valorActual,
    });
  }

  return { activos, moneda, notaValuacion };
}

/**
 * Procesa el PDF (100% en el navegador) y devuelve los datos personales
 * mínimos (nombre de cuenta y comitente), la moneda detectada y la lista de
 * activos de "Distribución por tipo de activos", sin la columna Garantía.
 */
async function procesarCarteraPdf(arrayBuffer) {
  const filas = await extraerFilasPdf(arrayBuffer);
  const nombre = buscarValorTrasEtiqueta(filas, 'Cuenta');
  const comitente = buscarValorTrasEtiqueta(filas, 'N° Comitente');
  const { activos, moneda, notaValuacion } = extraerActivos(filas);

  if (activos.length === 0) {
    throw new Error('No se encontró la tabla "Distribución por tipo de activos" en el PDF.');
  }

  const totalCartera = activos.reduce((acc, a) => acc + a.valorActual, 0);

  const totalesPorCategoria = new Map();
  for (const activo of activos) {
    totalesPorCategoria.set(activo.categoria, (totalesPorCategoria.get(activo.categoria) || 0) + activo.valorActual);
  }

  return {
    nombre,
    comitente,
    moneda: moneda || 'ARS',
    notaValuacion,
    activos,
    totalCartera,
    categorias: [...totalesPorCategoria.entries()].map(([nombreCategoria, total]) => ({
      nombre: nombreCategoria,
      total,
    })),
  };
}

// Mismos colores que usa el visor en pantalla (ver .tabla-excel en style.css).
const COLOR_NAVY = 'FF171B6B';
const COLOR_BORDE = 'FFDFE2F0';
const COLOR_FILA_PAR = 'FFF7F8FD';
const COLOR_TEXTO = 'FF1B1F2B';
const COLOR_COPPER = 'FFE3A83E';

/**
 * Qué tan "caliente" (oscuro) se ve un activo según qué porción de la
 * cartera representa, relativo a la posición más grande de la tabla (0 a
 * 1). La usan tanto la tabla en pantalla como el Excel exportado, para que
 * el degradé de Valor Actual se vea igual en los dos lados.
 */
function calcularIntensidadCalor(porcentaje, porcentajeMaximo) {
  return porcentajeMaximo > 0 ? Math.sqrt(porcentaje / porcentajeMaximo) : 0;
}

function bordeFinoExcel() {
  const estilo = { style: 'thin', color: { argb: COLOR_BORDE } };
  return { top: estilo, left: estilo, bottom: estilo, right: estilo };
}

/** Mezcla el navy de la app con blanco según la intensidad, como si tuviera transparencia sobre fondo blanco. */
function colorCalorExcel(porcentaje, porcentajeMaximo) {
  const intensidad = calcularIntensidadCalor(porcentaje, porcentajeMaximo);
  const alpha = 0.06 + intensidad * 0.74;
  const mezclar = (canalNavy) =>
    Math.round(canalNavy * alpha + 255 * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  const argb = `FF${mezclar(23)}${mezclar(27)}${mezclar(107)}`.toUpperCase();
  return { argb, textoBlanco: intensidad > 0.55 };
}

/**
 * Arma el .xlsx (100% en el navegador) con un formato parecido al visor en
 * pantalla: encabezado azul marino, filas alternadas y el mismo degradé de
 * calor en Valor Actual. `categoriasSeleccionadas` (si se pasa) filtra qué
 * categorías se incluyen; el % Cartera y el degradé se siguen calculando
 * sobre el total y el máximo de la cartera completa, no sólo de lo
 * exportado, para que el color de cada especie sea el mismo que en
 * pantalla.
 */
async function exportarCarteraExcel(datos, categoriasSeleccionadas) {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Cartera');
  const simbolo = datos.moneda === 'USD' ? 'US$' : '$';

  const porcentajeMaximo = Math.max(...datos.activos.map((a) => a.valorActual / datos.totalCartera), 0);
  const activos = categoriasSeleccionadas
    ? datos.activos.filter((a) => categoriasSeleccionadas.includes(a.categoria))
    : datos.activos;
  if (activos.length === 0) {
    throw new Error('Elegí al menos una categoría para exportar.');
  }

  const encabezados = ['Categoría', 'Especie', 'Descripción', 'Cantidad', 'Precio', 'Valor Actual', '% Cartera'];
  const numColumnas = encabezados.length;

  // Portada del reporte: título + franja cobre (mismo acento de marca que
  // la app) + línea de datos de la cuenta, igual que arriba de la vista en
  // pantalla (ver renderCartera en analisis-carteras.js).
  const filaTitulo = hoja.addRow([datos.nombre ? `Cartera de ${datos.nombre}` : 'Cartera']);
  hoja.mergeCells(1, 1, 1, numColumnas);
  filaTitulo.height = 28;
  filaTitulo.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  filaTitulo.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
  filaTitulo.getCell(1).alignment = { vertical: 'middle', indent: 1 };

  const filaAcento = hoja.addRow([]);
  hoja.mergeCells(2, 1, 2, numColumnas);
  filaAcento.height = 4;
  filaAcento.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_COPPER } };

  const detalles = [
    datos.comitente ? `Comitente: ${datos.comitente}` : null,
    `Moneda: ${datos.moneda === 'USD' ? 'Dólares' : 'Pesos'}`,
    datos.notaValuacion,
  ]
    .filter(Boolean)
    .join('   ·   ');
  const filaMeta = hoja.addRow([detalles]);
  hoja.mergeCells(3, 1, 3, numColumnas);
  filaMeta.height = 20;
  filaMeta.getCell(1).font = { italic: true, color: { argb: COLOR_TEXTO } };
  filaMeta.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
  filaMeta.getCell(1).alignment = { vertical: 'middle', indent: 1 };

  hoja.addRow([]);

  const filaEncabezadoNum = 5;
  const filaEncabezado = hoja.addRow(encabezados);
  filaEncabezado.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    celda.border = bordeFinoExcel();
  });
  hoja.autoFilter = { from: { row: filaEncabezadoNum, column: 1 }, to: { row: filaEncabezadoNum, column: numColumnas } };
  hoja.views = [{ state: 'frozen', ySplit: filaEncabezadoNum }];

  activos.forEach((activo, indiceFila) => {
    const porcentaje = datos.totalCartera > 0 ? activo.valorActual / datos.totalCartera : 0;
    const fila = hoja.addRow([
      activo.categoria,
      activo.especie,
      activo.descripcion,
      activo.cantidad,
      activo.precio,
      activo.valorActual,
      porcentaje,
    ]);
    fila.getCell(5).numFmt = `"${simbolo}" #,##0.00`;
    fila.getCell(6).numFmt = `"${simbolo}" #,##0`;
    fila.getCell(7).numFmt = '0.00%';

    const esFilaPar = indiceFila % 2 === 1;
    const { argb: colorCalorArgb, textoBlanco } = colorCalorExcel(porcentaje, porcentajeMaximo);
    fila.eachCell((celda, numeroColumna) => {
      celda.border = bordeFinoExcel();
      celda.font = { color: { argb: COLOR_TEXTO } };
      if (numeroColumna === 6) {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorCalorArgb } };
        celda.font = { bold: true, color: { argb: textoBlanco ? 'FFFFFFFF' : COLOR_TEXTO } };
      } else if (esFilaPar) {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
      }
    });
  });

  encabezados.forEach((encabezado, i) => {
    hoja.getColumn(i + 1).width = Math.max(14, String(encabezado).length + 4);
  });
  hoja.getColumn(3).width = 45;

  return workbook.xlsx.writeBuffer();
}
