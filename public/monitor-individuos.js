/*
 * UI de Monitor Individuos. La lectura del archivo, la consulta de
 * cotizaciones en vivo y el recálculo de TIR/duration/paridad pasan por
 * monitor-individuos-motor.js (100% en el navegador); acá sólo se muestra
 * la tabla y se dispara el refresco automático.
 */

const INTERVALO_ACTUALIZACION_MS = 20000;

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const inputArchivoActualizar = document.getElementById('archivo-actualizar');
const mensaje = document.getElementById('mensaje');
const resultado = document.getElementById('resultado');
const infoResultado = document.getElementById('info-resultado');
const tablaWrap = document.getElementById('tabla-wrap-monitor');
const tabsMonitor = document.getElementById('tabs-monitor');
const tarjetaCarga = document.getElementById('tarjeta-carga');
const barraActualizacion = document.getElementById('barra-actualizacion');
const badgeActualizado = document.getElementById('badge-actualizado');

const COLUMNAS = [
  { clave: 'ticker', titulo: 'Ticker' },
  { clave: 'emisor', titulo: 'Emisor' },
  { clave: 'precio', titulo: 'Precio' },
  { clave: 'vencimiento', titulo: 'Vencimiento' },
  { clave: 'tir', titulo: 'TIR' },
  { clave: 'duration', titulo: 'Duration' },
  { clave: 'amortizacion', titulo: 'Amortización' },
  { clave: 'cupon', titulo: 'Cupón' },
  { clave: 'mesCupon', titulo: 'Mes cupón' },
  { clave: 'moneda', titulo: 'Dólar' },
  { clave: 'ley', titulo: 'Ley' },
  { clave: 'calificacion', titulo: 'Calif.' },
  { clave: 'laminaMinima', titulo: 'Lámina mín.' },
  { clave: 'sector', titulo: 'Sector' },
  { clave: 'paridad', titulo: 'Paridad' },
];

let preparado = null; // { bonosEstaticos, workbook, hojaDetalles }, de prepararMonitorCorporativos
let intervaloActualizacion = null;
let actualizandoAhora = false;
let bonosActuales = [];
let seccionActiva = null;

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function formatValor(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (valor instanceof Date) return valor.toLocaleDateString('es-AR');
  if (clave === 'tir' || clave === 'paridad') {
    return Number.isFinite(valor) ? `${(valor * 100).toFixed(2)}%` : '—';
  }
  if (clave === 'duration') {
    return Number.isFinite(valor) ? `${valor.toFixed(2)} a.` : '—';
  }
  if (clave === 'precio') {
    return Number.isFinite(valor) ? valor.toFixed(2) : '—';
  }
  if (typeof valor === 'number') {
    return valor.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }
  return String(valor);
}

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Secciones únicas, en el orden en que aparecen (vienen agrupadas por bloque de la hoja). */
function seccionesDe(bonos) {
  const vistas = new Set();
  const orden = [];
  for (const bono of bonos) {
    if (!vistas.has(bono.seccion)) {
      vistas.add(bono.seccion);
      orden.push(bono.seccion);
    }
  }
  return orden;
}

function renderTabs(bonos) {
  const secciones = seccionesDe(bonos);
  if (!secciones.includes(seccionActiva)) seccionActiva = secciones[0] || null;

  tabsMonitor.innerHTML = secciones
    .map((seccion) => {
      const cantidad = bonos.filter((b) => b.seccion === seccion).length;
      const activa = seccion === seccionActiva ? ' aria-selected="true" class="tab-activa"' : ' aria-selected="false"';
      return `<button type="button" role="tab" data-seccion="${escapeHtml(seccion)}"${activa}>${escapeHtml(seccion)} <span class="tab-cantidad">${cantidad}</span></button>`;
    })
    .join('');
}

function renderTabla(bonos) {
  const bonosSeccion = bonos.filter((b) => b.seccion === seccionActiva);
  if (bonosSeccion.length === 0) {
    tablaWrap.innerHTML = '<p class="tabla-vacia">No se encontraron ONs en esta sección.</p>';
    return;
  }

  const filasHtml = bonosSeccion
    .map((bono) => {
      const celdas = COLUMNAS.map((col) => `<td tabindex="0">${escapeHtml(formatValor(col.clave, bono[col.clave]))}</td>`).join('');
      const filaSinCotizacion = bono.error ? ' class="fila-sin-cotizacion"' : '';
      return `<tr${filaSinCotizacion}>${celdas}</tr>`;
    })
    .join('');

  tablaWrap.innerHTML = `
    <table class="tabla-excel">
      <thead>
        <tr>${COLUMNAS.map((col) => `<th>${col.titulo}</th>`).join('')}</tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;
}

function renderResultado(bonos) {
  bonosActuales = bonos;
  renderTabs(bonos);
  renderTabla(bonos);
}

tabsMonitor.addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-seccion]');
  if (!boton) return;
  seccionActiva = boton.dataset.seccion;
  renderTabs(bonosActuales);
  renderTabla(bonosActuales);
});

function actualizarBadge(actualizadoA) {
  const hora = actualizadoA.toLocaleTimeString('es-AR');
  badgeActualizado.textContent = `Actualizado ${hora} · se refresca solo cada 20 s`;
  badgeActualizado.title = actualizadoA.toLocaleString('es-AR');
}

async function refrescarCotizaciones({ silencioso = false } = {}) {
  if (!preparado || actualizandoAhora) return;
  actualizandoAhora = true;
  if (!silencioso) mostrarMensaje('Actualizando cotizaciones…');

  try {
    const { bonos, mep, actualizadoA } = await recalcularConVivo(preparado);
    renderResultado(bonos);
    const conCotizacion = bonos.filter((b) => !b.error).length;
    infoResultado.textContent =
      `${conCotizacion} de ${bonos.length} ONs con cotización en vivo · ` +
      `MEP (AL30): ${mep.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
    actualizarBadge(actualizadoA);
    if (!silencioso) mostrarMensaje('', '');
  } catch (error) {
    console.error(error);
    mostrarMensaje(error.message || 'No se pudo actualizar la cotización. Reintento en 20 s.', 'error');
  } finally {
    actualizandoAhora = false;
  }
}

function iniciarActualizacionAutomatica() {
  if (intervaloActualizacion) clearInterval(intervaloActualizacion);
  intervaloActualizacion = setInterval(() => refrescarCotizaciones({ silencioso: true }), INTERVALO_ACTUALIZACION_MS);
}

function mostrarVistaCargada() {
  tarjetaCarga.classList.add('oculto');
  barraActualizacion.classList.remove('oculto');
  resultado.classList.remove('oculto');
}

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje('Leyendo "Corporativos"…');
  resultado.classList.add('oculto');
  if (intervaloActualizacion) clearInterval(intervaloActualizacion);
  preparado = null;
  seccionActiva = null;

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    preparado = await prepararMonitorCorporativos(arrayBuffer);
    mostrarVistaCargada();
    await refrescarCotizaciones();
    iniciarActualizacionAutomatica();
  } catch (error) {
    console.error(error);
    preparado = null;
    mostrarMensaje(error.message || 'No se pudo procesar el archivo.', 'error');
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

inputArchivoActualizar.addEventListener('change', () => {
  const archivo = inputArchivoActualizar.files[0];
  if (!archivo) return;
  tarjetaCarga.classList.remove('oculto');
  barraActualizacion.classList.add('oculto');
  manejarArchivo(archivo);
});
