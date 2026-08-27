/*
 * UI del Análisis de Carteras. La lectura del PDF y la exportación a Excel
 * pasan por analisis-carteras-motor.js (100% en el navegador); acá sólo se
 * muestran los datos.
 */

let datosCartera = null;

// Misma paleta categórica que el Presentador de Carteras.
const PALETA_CATEGORIAS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const mensaje = document.getElementById('mensaje');
const tarjetaCarga = document.getElementById('tarjeta-carga');
const resultado = document.getElementById('resultado');
const tituloCartera = document.getElementById('titulo-cartera');
const infoCartera = document.getElementById('info-cartera');
const columnaTablas = document.getElementById('columna-tablas');
const columnaTorta = document.getElementById('columna-torta');
const btnExportar = document.getElementById('btn-exportar');

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function simboloMoneda(moneda) {
  return moneda === 'USD' ? 'US$' : '$';
}

function formatMonto(valor, moneda, decimales) {
  const texto = valor.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${simboloMoneda(moneda)} ${texto}`;
}

function formatPorcentaje(valor) {
  return `${(valor * 100).toFixed(2)}%`;
}

function colorCategoria(indice) {
  return PALETA_CATEGORIAS[indice % PALETA_CATEGORIAS.length];
}

/** Fondo cada vez más oscuro cuanto mayor es la porción de la cartera. */
function colorCalor(porcentaje, porcentajeMaximo) {
  const intensidad = porcentajeMaximo > 0 ? Math.sqrt(porcentaje / porcentajeMaximo) : 0;
  const alpha = 0.06 + intensidad * 0.74;
  return { fondo: `rgba(23, 27, 107, ${alpha.toFixed(3)})`, textoClaro: intensidad > 0.55 };
}

// ---------- Carga del PDF ----------

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje('Procesando…');
  resultado.classList.add('oculto');

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    datosCartera = await procesarCarteraPdf(arrayBuffer);
    renderCartera(datosCartera);
    tarjetaCarga.classList.add('oculto');
    resultado.classList.remove('oculto');
    mostrarMensaje(`${datosCartera.activos.length} activos cargados.`, 'exito');
  } catch (error) {
    console.error(error);
    mostrarMensaje(error.message || 'No se pudo procesar el PDF.', 'error');
  }
}

dropzone.addEventListener('click', () => inputArchivo.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const archivo = e.dataTransfer.files[0];
  if (archivo) {
    inputArchivo.files = e.dataTransfer.files;
    manejarArchivo(archivo);
  }
});
inputArchivo.addEventListener('change', () => manejarArchivo(inputArchivo.files[0]));

// ---------- Donut de clasificación ----------

function construirDona(items, total) {
  const RADIO = 49;
  const CIRC = 2 * Math.PI * RADIO;
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '150');
  svg.setAttribute('height', '150');
  svg.setAttribute('viewBox', '0 0 120 120');

  const fondo = document.createElementNS(svgNS, 'circle');
  fondo.setAttribute('cx', '60');
  fondo.setAttribute('cy', '60');
  fondo.setAttribute('r', String(RADIO));
  fondo.setAttribute('fill', 'none');
  fondo.setAttribute('stroke', '#e4e7f7');
  fondo.setAttribute('stroke-width', '14');
  svg.appendChild(fondo);

  let acumulado = 0;
  items.forEach((item) => {
    const fraccion = total > 0 ? item.total / total : 0;
    const largo = fraccion * CIRC;
    const arco = document.createElementNS(svgNS, 'circle');
    arco.setAttribute('cx', '60');
    arco.setAttribute('cy', '60');
    arco.setAttribute('r', String(RADIO));
    arco.setAttribute('fill', 'none');
    arco.setAttribute('stroke', item.color);
    arco.setAttribute('stroke-width', '14');
    arco.setAttribute('stroke-dasharray', `${largo} ${CIRC}`);
    arco.setAttribute('stroke-dashoffset', String(-acumulado));
    arco.setAttribute('transform', 'rotate(-90 60 60)');
    svg.appendChild(arco);
    acumulado += largo;
  });

  return svg;
}

function renderTorta(datos) {
  columnaTorta.innerHTML = '';

  const categoriasConColor = datos.categorias.map((c, i) => ({ ...c, color: colorCategoria(i) }));

  const tarjeta = document.createElement('div');
  tarjeta.className = 'analisis-torta-tarjeta';

  const titulo = document.createElement('span');
  titulo.className = 'dona-titulo';
  titulo.textContent = 'Clasificación';
  tarjeta.appendChild(titulo);

  const envoltorio = document.createElement('div');
  envoltorio.className = 'dona-envoltorio';
  envoltorio.appendChild(construirDona(categoriasConColor, datos.totalCartera));

  const centro = document.createElement('span');
  centro.className = 'dona-centro';
  centro.textContent = formatMonto(datos.totalCartera, datos.moneda, 0);
  envoltorio.appendChild(centro);

  tarjeta.appendChild(envoltorio);

  const leyenda = document.createElement('div');
  leyenda.className = 'analisis-leyenda';
  categoriasConColor.forEach((c) => {
    const fila = document.createElement('div');
    fila.className = 'analisis-leyenda-fila';

    const nombre = document.createElement('span');
    nombre.className = 'analisis-leyenda-nombre';
    const dot = document.createElement('span');
    dot.className = 'fila-instrumento-dot';
    dot.style.background = c.color;
    nombre.appendChild(dot);
    nombre.appendChild(document.createTextNode(c.nombre));

    const valor = document.createElement('span');
    valor.className = 'analisis-leyenda-valor';
    const porcentaje = datos.totalCartera > 0 ? c.total / datos.totalCartera : 0;
    valor.textContent = `${formatMonto(c.total, datos.moneda, 0)} (${formatPorcentaje(porcentaje)})`;

    fila.appendChild(nombre);
    fila.appendChild(valor);
    leyenda.appendChild(fila);
  });
  tarjeta.appendChild(leyenda);

  columnaTorta.appendChild(tarjeta);
}

// ---------- Tablas por categoría ----------

function renderTablas(datos) {
  columnaTablas.innerHTML = '';
  const porcentajeMaximo = Math.max(...datos.activos.map((a) => a.valorActual / datos.totalCartera), 0);

  const categoriasEnOrden = [...new Set(datos.activos.map((a) => a.categoria))];

  categoriasEnOrden.forEach((categoria) => {
    const activosCategoria = datos.activos.filter((a) => a.categoria === categoria);

    const seccion = document.createElement('div');
    seccion.className = 'seccion-moneda';

    const titulo = document.createElement('h3');
    titulo.textContent = categoria;
    seccion.appendChild(titulo);

    const wrap = document.createElement('div');
    wrap.className = 'tabla-wrap';

    const tabla = document.createElement('table');
    tabla.className = 'tabla-excel';
    tabla.innerHTML = `
      <thead>
        <tr><th>Especie</th><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Valor Actual</th><th>% Cartera</th></tr>
      </thead>
      <tbody></tbody>`;
    const tbody = tabla.querySelector('tbody');

    activosCategoria.forEach((activo) => {
      const porcentaje = datos.totalCartera > 0 ? activo.valorActual / datos.totalCartera : 0;
      const { fondo, textoClaro } = colorCalor(porcentaje, porcentajeMaximo);
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${activo.especie}</td>
        <td>${activo.descripcion}</td>
        <td class="columna-importe">${activo.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
        <td class="columna-importe">${formatMonto(activo.precio, datos.moneda, 2)}</td>
        <td class="columna-importe"></td>
        <td class="columna-importe">${formatPorcentaje(porcentaje)}</td>
      `;
      const celdaValor = fila.children[4];
      celdaValor.textContent = formatMonto(activo.valorActual, datos.moneda, 0);
      celdaValor.style.background = fondo;
      celdaValor.style.color = textoClaro ? '#ffffff' : 'inherit';
      celdaValor.style.fontWeight = '600';
      tbody.appendChild(fila);
    });

    wrap.appendChild(tabla);
    seccion.appendChild(wrap);
    columnaTablas.appendChild(seccion);
  });
}

function renderCartera(datos) {
  const detalles = [
    datos.nombre ? `Cuenta: ${datos.nombre}` : null,
    datos.comitente ? `Comitente: ${datos.comitente}` : null,
    `Moneda: ${datos.moneda === 'USD' ? 'Dólares' : 'Pesos'}`,
    datos.notaValuacion,
  ].filter(Boolean);

  tituloCartera.textContent = datos.nombre ? `Cartera de ${datos.nombre}` : 'Cartera';
  infoCartera.textContent = detalles.join(' · ');

  renderTablas(datos);
  renderTorta(datos);
}

// ---------- Exportar a Excel ----------

function nombreArchivoSlug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

btnExportar.addEventListener('click', async () => {
  if (!datosCartera) return;

  const textoOriginal = btnExportar.textContent;
  btnExportar.disabled = true;
  btnExportar.textContent = 'Generando…';

  try {
    const buffer = await exportarCarteraExcel(datosCartera);
    const nombreArchivo = datosCartera.nombre
      ? `cartera-${nombreArchivoSlug(datosCartera.nombre)}.xlsx`
      : 'cartera.xlsx';

    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    mostrarMensaje('No se pudo exportar a Excel: ' + error.message, 'error');
  } finally {
    btnExportar.disabled = false;
    btnExportar.textContent = textoOriginal;
  }
});
