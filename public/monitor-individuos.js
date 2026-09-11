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
const mensajeActualizar = document.getElementById('mensaje-actualizar');
const resultado = document.getElementById('resultado');
const infoResultado = document.getElementById('info-resultado');
const tablaWrap = document.getElementById('tabla-wrap-monitor');
const tabsMonitor = document.getElementById('tabs-monitor');
const tarjetaCarga = document.getElementById('tarjeta-carga');
const barraActualizacion = document.getElementById('barra-actualizacion');
const badgeActualizado = document.getElementById('badge-actualizado');

// ---------- Persistencia local (IndexedDB) ----------
//
// El Monitor pesa varios MB: no entra cómodo en localStorage (el mecanismo
// que usa el resto del sitio para "recordar" datos entre visitas), así que
// acá se guarda el archivo tal cual en IndexedDB y se recarga solo la
// próxima vez que se abre la página.

const DB_NOMBRE = 'monitor-individuos-db';
const OBJECT_STORE = 'archivo';
const CLAVE_ARCHIVO = 'actual';

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OBJECT_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function guardarArchivoGuardado(arrayBuffer, nombre) {
  try {
    const db = await abrirDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, 'readwrite');
      tx.objectStore(OBJECT_STORE).put({ arrayBuffer, nombre, guardadoEn: Date.now() }, CLAVE_ARCHIVO);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('No se pudo guardar el Monitor en este navegador:', error);
  }
}

async function leerArchivoGuardado() {
  try {
    const db = await abrirDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, 'readonly');
      const req = tx.objectStore(OBJECT_STORE).get(CLAVE_ARCHIVO);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('No se pudo leer el Monitor guardado:', error);
    return null;
  }
}

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

// ---------- "Última actualización" (de la cotización en vivo) ----------

let ultimaActualizacionTs = null;

function formatHaceTiempo(segundos) {
  if (segundos < 5) return 'hace instantes';
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `hace ${horas} h`;
}

function refrescarTextoBadge() {
  if (!ultimaActualizacionTs) return;
  const segundos = Math.floor((Date.now() - ultimaActualizacionTs) / 1000);
  badgeActualizado.textContent = `Última actualización: ${formatHaceTiempo(segundos)}`;
}

function actualizarBadge(actualizadoA) {
  ultimaActualizacionTs = actualizadoA.getTime();
  badgeActualizado.title = actualizadoA.toLocaleString('es-AR');
  refrescarTextoBadge();
}

setInterval(refrescarTextoBadge, 1000);

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

// ---------- "Actualizar Monitor": agrega/quita ONs contra el listado actual ----------

function formatListaTickers(tickers) {
  if (tickers.length <= 6) return tickers.join(', ');
  return `${tickers.slice(0, 6).join(', ')} y ${tickers.length - 6} más`;
}

function mostrarMensajeActualizar(texto, tipo) {
  mensajeActualizar.textContent = texto;
  mensajeActualizar.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
  mensajeActualizar.classList.toggle('oculto', !texto);
}

function informarDiferenciaListado(agregados, quitados) {
  if (agregados.length === 0 && quitados.length === 0) {
    mostrarMensajeActualizar('Monitor actualizado: sin cambios en el listado de ONs.', '');
    return;
  }
  const partes = [];
  if (agregados.length > 0) {
    partes.push(`+${agregados.length} nueva${agregados.length === 1 ? '' : 's'} (${formatListaTickers(agregados)})`);
  }
  if (quitados.length > 0) {
    partes.push(`−${quitados.length} dada${quitados.length === 1 ? '' : 's'} de baja (${formatListaTickers(quitados)})`);
  }
  mostrarMensajeActualizar(`Monitor actualizado: ${partes.join(' · ')}`, 'exito');
}

/**
 * Procesa un Monitor (recién subido o recuperado de IndexedDB) y lo deja
 * como el listado activo. Con esActualizacion=true (botón "Actualizar
 * Monitor") compara el listado de tickers contra el que había antes y
 * avisa qué ONs se agregaron o se dieron de baja, en vez de reemplazar todo
 * en silencio.
 */
async function procesarBuffer(arrayBuffer, nombreArchivo, { esActualizacion = false } = {}) {
  const tickersAnteriores = esActualizacion && preparado ? new Set(preparado.bonosEstaticos.map((b) => b.ticker)) : null;

  mostrarMensaje(esActualizacion ? 'Actualizando el listado de ONs…' : 'Leyendo "Corporativos"…');
  if (!esActualizacion) {
    resultado.classList.add('oculto');
    seccionActiva = null;
  }
  if (intervaloActualizacion) clearInterval(intervaloActualizacion);

  try {
    preparado = await prepararMonitorCorporativos(arrayBuffer);
    textoDropzone.textContent = nombreArchivo;
    dropzone.classList.add('con-archivo');
    mostrarVistaCargada();
    await refrescarCotizaciones();
    iniciarActualizacionAutomatica();
    mostrarMensaje('', '');
    await guardarArchivoGuardado(arrayBuffer, nombreArchivo);

    if (esActualizacion) {
      const tickersNuevos = new Set(preparado.bonosEstaticos.map((b) => b.ticker));
      const agregados = tickersAnteriores ? [...tickersNuevos].filter((t) => !tickersAnteriores.has(t)) : [];
      const quitados = tickersAnteriores ? [...tickersAnteriores].filter((t) => !tickersNuevos.has(t)) : [];
      informarDiferenciaListado(agregados, quitados);
    }
  } catch (error) {
    console.error(error);
    if (esActualizacion) {
      mostrarMensajeActualizar(error.message || 'No se pudo actualizar el Monitor.', 'error');
    } else {
      preparado = null;
      mostrarMensaje(error.message || 'No se pudo procesar el archivo.', 'error');
    }
  }
}

async function cargarArchivo(archivo, opciones) {
  if (!archivo) return;
  const arrayBuffer = await archivo.arrayBuffer();
  await procesarBuffer(arrayBuffer, archivo.name, opciones);
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
    cargarArchivo(archivo);
  }
});
inputArchivo.addEventListener('change', () => cargarArchivo(inputArchivo.files[0]));

inputArchivoActualizar.addEventListener('change', () => {
  const archivo = inputArchivoActualizar.files[0];
  if (!archivo) return;
  cargarArchivo(archivo, { esActualizacion: true });
});

// Recupera el Monitor guardado en este navegador, si hay uno, sin esperar
// a que el usuario lo vuelva a subir.
(async function restaurarGuardado() {
  const guardado = await leerArchivoGuardado();
  if (guardado && guardado.arrayBuffer) {
    await procesarBuffer(guardado.arrayBuffer, guardado.nombre || 'Monitor guardado');
  }
})();
