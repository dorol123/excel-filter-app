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

const DONA_VIEWBOX = 160;
const DONA_CENTRO = DONA_VIEWBOX / 2;
const DONA_RADIO_EXTERNO = 68;
const DONA_RADIO_INTERNO = 42;
const DONA_DISTANCIA_DESPRENDIDO = 9;

function puntoEnCirculo(radio, anguloRad) {
  return [DONA_CENTRO + radio * Math.sin(anguloRad), DONA_CENTRO - radio * Math.cos(anguloRad)];
}

/** Path de un sector de dona (anillo) entre dos ángulos, en radianes desde arriba, sentido horario. */
function pathSectorDona(anguloInicio, anguloFin) {
  const [x1, y1] = puntoEnCirculo(DONA_RADIO_EXTERNO, anguloInicio);
  const [x2, y2] = puntoEnCirculo(DONA_RADIO_EXTERNO, anguloFin);
  const [x3, y3] = puntoEnCirculo(DONA_RADIO_INTERNO, anguloFin);
  const [x4, y4] = puntoEnCirculo(DONA_RADIO_INTERNO, anguloInicio);
  const arcoGrande = anguloFin - anguloInicio > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${DONA_RADIO_EXTERNO} ${DONA_RADIO_EXTERNO} 0 ${arcoGrande} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${DONA_RADIO_INTERNO} ${DONA_RADIO_INTERNO} 0 ${arcoGrande} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

/**
 * Arma la dona como un sector <path> por categoría (no círculos apilados),
 * cada uno con su propio desplazamiento (--dx/--dy) hacia afuera para poder
 * "desprenderlo" un poco con CSS al pasar el mouse. Cada sector y su fila
 * en la leyenda comparten data-categoria para poder resaltarlos juntos.
 */
function construirDona(items, total) {
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(DONA_VIEWBOX));
  svg.setAttribute('height', String(DONA_VIEWBOX));
  svg.setAttribute('viewBox', `0 0 ${DONA_VIEWBOX} ${DONA_VIEWBOX}`);

  const fondo = document.createElementNS(svgNS, 'circle');
  fondo.setAttribute('cx', String(DONA_CENTRO));
  fondo.setAttribute('cy', String(DONA_CENTRO));
  fondo.setAttribute('r', String((DONA_RADIO_EXTERNO + DONA_RADIO_INTERNO) / 2));
  fondo.setAttribute('fill', 'none');
  fondo.setAttribute('stroke', '#e4e7f7');
  fondo.setAttribute('stroke-width', String(DONA_RADIO_EXTERNO - DONA_RADIO_INTERNO));
  svg.appendChild(fondo);

  let anguloAcumulado = 0;
  items.forEach((item) => {
    const fraccion = total > 0 ? item.total / total : 0;
    const anguloInicio = anguloAcumulado;
    const anguloFin = anguloAcumulado + fraccion * 2 * Math.PI;
    anguloAcumulado = anguloFin;
    if (fraccion <= 0) return;

    const anguloMedio = (anguloInicio + anguloFin) / 2;
    const dx = Math.sin(anguloMedio) * DONA_DISTANCIA_DESPRENDIDO;
    const dy = -Math.cos(anguloMedio) * DONA_DISTANCIA_DESPRENDIDO;

    const sector = document.createElementNS(svgNS, 'path');
    sector.setAttribute('d', pathSectorDona(anguloInicio, anguloFin));
    sector.setAttribute('fill', item.color);
    sector.setAttribute('class', 'analisis-torta-sector');
    sector.dataset.categoria = item.nombre;
    sector.style.setProperty('--dx', `${dx}px`);
    sector.style.setProperty('--dy', `${dy}px`);
    svg.appendChild(sector);
  });

  return svg;
}

function resaltarCategoria(nombreCategoria) {
  columnaTorta.querySelectorAll('.analisis-torta-sector').forEach((sector) => {
    const activo = sector.dataset.categoria === nombreCategoria;
    sector.classList.toggle('resaltado', activo);
    sector.classList.toggle('atenuado', !activo && Boolean(nombreCategoria));
  });
  columnaTorta.querySelectorAll('.analisis-leyenda-fila').forEach((fila) => {
    fila.classList.toggle('resaltado', fila.dataset.categoria === nombreCategoria);
  });
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

  envoltorio.querySelectorAll('.analisis-torta-sector').forEach((sector) => {
    sector.addEventListener('mouseenter', () => resaltarCategoria(sector.dataset.categoria));
    sector.addEventListener('mouseleave', () => resaltarCategoria(null));
  });

  tarjeta.appendChild(envoltorio);

  const leyenda = document.createElement('div');
  leyenda.className = 'analisis-leyenda';
  categoriasConColor.forEach((c) => {
    const fila = document.createElement('div');
    fila.className = 'analisis-leyenda-fila';
    fila.dataset.categoria = c.nombre;
    fila.addEventListener('mouseenter', () => resaltarCategoria(c.nombre));
    fila.addEventListener('mouseleave', () => resaltarCategoria(null));

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
  poblarChecksExportar(datos);
}

// ---------- Exportar a Excel ----------

const exportarMenu = document.getElementById('exportar-menu');
const exportarPanel = document.getElementById('exportar-panel');
const exportarChecks = document.getElementById('exportar-checks');
const btnExportarConfirmar = document.getElementById('btn-exportar-confirmar');
const exportarMensaje = document.getElementById('exportar-mensaje');

function nombreArchivoSlug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

function poblarChecksExportar(datos) {
  exportarChecks.innerHTML = '';
  const categoriasEnOrden = [...new Set(datos.activos.map((a) => a.categoria))];
  categoriasEnOrden.forEach((categoria) => {
    const label = document.createElement('label');
    label.className = 'exportar-panel-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = categoria;
    input.checked = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode(categoria));
    exportarChecks.appendChild(label);
  });
}

function categoriasSeleccionadas() {
  return [...exportarChecks.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
}

btnExportar.addEventListener('click', (e) => {
  e.stopPropagation();
  exportarPanel.classList.toggle('oculto');
});

document.addEventListener('click', (e) => {
  if (!exportarMenu.contains(e.target)) exportarPanel.classList.add('oculto');
});

btnExportarConfirmar.addEventListener('click', async () => {
  if (!datosCartera) return;

  const textoOriginal = btnExportarConfirmar.textContent;
  btnExportarConfirmar.disabled = true;
  btnExportarConfirmar.textContent = 'Generando\u2026';
  mostrarMensaje(exportarMensaje, '', '');

  try {
    const buffer = await exportarCarteraExcel(datosCartera, categoriasSeleccionadas());
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
    exportarPanel.classList.add('oculto');
  } catch (error) {
    console.error(error);
    mostrarMensaje(exportarMensaje, error.message || 'No se pudo exportar a Excel.', 'error');
  } finally {
    btnExportarConfirmar.disabled = false;
    btnExportarConfirmar.textContent = textoOriginal;
  }
});
