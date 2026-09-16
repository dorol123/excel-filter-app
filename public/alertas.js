/*
 * UI de Alertas. La lectura del Excel, la consulta de cotizaciones en vivo
 * y el recálculo de TIR/duration/paridad pasan por monitor-individuos-motor.js
 * (se comparte tal cual con Monitor Individuos: es el mismo cálculo de
 * bonos, no tiene sentido duplicar esa matemática acá). Este archivo sólo
 * guarda el historial de precios de las últimas 3 horas, detecta
 * variaciones grandes y muestra las alertas.
 */

const INTERVALO_ACTUALIZACION_MS = 20000; // cada cuánto se pide cotización y se guarda un punto nuevo
const VENTANA_HISTORIAL_MS = 3 * 60 * 60 * 1000; // 3 horas
const UMBRAL_ALERTA = 0.02; // 2%, subas y caídas

// "Corporativos" agrupa las ONs en bloques por calificación: "Bonos AAA
// Cable", "Bonos AAA MEP", "Bonos AA", "Bonos A", "Bonos <A" (ver
// encontrarBloquesConTitulo en monitor-individuos-motor.js). Alertas no
// vigila los bonos A o peores: el prefijo "Bonos AA" alcanza para quedarse
// con los dos bloques AAA (ambos empiezan con "Bonos AAA...") y el de AA,
// y descarta "Bonos A" y "Bonos <A".
const PREFIJO_CALIFICACION_A_VIGILAR = 'Bonos AA';

function filtrarPorCalificacion(bonosEstaticos) {
  return bonosEstaticos.filter(
    (bono) => typeof bono.seccion === 'string' && bono.seccion.startsWith(PREFIJO_CALIFICACION_A_VIGILAR)
  );
}

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const inputArchivoActualizar = document.getElementById('archivo-actualizar');
const mensaje = document.getElementById('mensaje');
const resultado = document.getElementById('resultado');
const infoResultado = document.getElementById('info-resultado');
const alertasVacio = document.getElementById('alertas-vacio');
const alertasLista = document.getElementById('alertas-lista');
const tarjetaCarga = document.getElementById('tarjeta-carga');
const barraActualizacion = document.getElementById('barra-actualizacion');
const badgeActualizado = document.getElementById('badge-actualizado');

// ---------- Persistencia del archivo (IndexedDB, compartida con Monitor Individuos) ----------
//
// Mismo nombre de base/store/clave que monitor-individuos.js a propósito:
// así el Monitor que se subió ahí (o acá) queda disponible para las dos
// herramientas sin tener que subirlo dos veces.

const DB_NOMBRE = 'monitor-individuos-db';
const DB_VERSION = 2; // v2 agrega el object store "historial" (ver más abajo)
const OBJECT_STORE = 'archivo';
const CLAVE_ARCHIVO = 'actual';
const HISTORIAL_STORE = 'historial';

// Crea los object stores que falten sin importar si la base ya existía (v1,
// sólo con "archivo") o es nueva: así da lo mismo qué herramienta —Monitor
// Individuos o Alertas— abra la base primero.
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OBJECT_STORE)) db.createObjectStore(OBJECT_STORE);
      if (!db.objectStoreNames.contains(HISTORIAL_STORE)) db.createObjectStore(HISTORIAL_STORE);
    };
    // Sin esto, una conexión vieja dejada abierta en otra pestaña (Monitor
    // Individuos o esta misma herramienta, de antes de un cambio de
    // versión) bloquea el upgrade acá para siempre: el archivo o el
    // historial "cargan" en la UI pero la escritura a IndexedDB nunca llega
    // a completarse, así que en la próxima visita parece que no quedó
    // guardado. Al cerrar la conexión vieja apenas otra pestaña la
    // necesita, el upgrade puede seguir.
    req.onblocked = () => console.warn('Apertura de IndexedDB bloqueada por otra pestaña con el Monitor abierto.');
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function guardarArchivoGuardado(arrayBuffer, nombre) {
  let db;
  try {
    db = await abrirDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, 'readwrite');
      tx.objectStore(OBJECT_STORE).put({ arrayBuffer, nombre, guardadoEn: Date.now() }, CLAVE_ARCHIVO);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('No se pudo guardar el Monitor en este navegador:', error);
  } finally {
    if (db) db.close();
  }
}

async function leerArchivoGuardado() {
  let db;
  try {
    db = await abrirDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, 'readonly');
      const req = tx.objectStore(OBJECT_STORE).get(CLAVE_ARCHIVO);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('No se pudo leer el Monitor guardado:', error);
    return null;
  } finally {
    if (db) db.close();
  }
}

// ---------- Historial de precios (últimas 3 horas, en IndexedDB) ----------
//
// Sólo se acumula mientras esta página está abierta (no hay nada corriendo
// en segundo plano): cada vuelta de refresco (cada 20 s) agrega un punto
// por ticker y se descartan los más viejos que la ventana. A 20 s por
// punto, 3 horas son ~540 puntos por ticker — con ~200 ONs no entra cómodo
// en localStorage (arriesga el límite de 5 MB del navegador), así que se
// guarda en IndexedDB (un registro por ticker) igual que el archivo del
// Monitor. Un hueco grande (la pestaña cerrada un rato largo) simplemente
// deja menos puntos dentro de la ventana, no rompe nada.

async function cargarHistorial() {
  let db;
  try {
    db = await abrirDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORIAL_STORE, 'readonly');
      const mapa = new Map();
      const req = tx.objectStore(HISTORIAL_STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(mapa);
          return;
        }
        mapa.set(cursor.key, cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('No se pudo leer el historial de precios:', error);
    return new Map();
  } finally {
    if (db) db.close();
  }
}

async function guardarHistorial(mapaHistorial) {
  let db;
  try {
    db = await abrirDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORIAL_STORE, 'readwrite');
      const store = tx.objectStore(HISTORIAL_STORE);
      for (const [ticker, puntos] of mapaHistorial) store.put(puntos, ticker);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('No se pudo guardar el historial de precios:', error);
  } finally {
    if (db) db.close();
  }
}

let historial = new Map(); // se carga de IndexedDB en el arranque, ver restaurarGuardado()

/** Agrega el precio actual de cada bono al historial y descarta lo que quedó fuera de la ventana. */
function registrarPrecios(bonos, ahora) {
  for (const bono of bonos) {
    if (!Number.isFinite(bono.precio)) continue;
    const puntos = historial.get(bono.ticker) || [];
    puntos.push({ ts: ahora, precio: bono.precio });
    const desde = ahora - VENTANA_HISTORIAL_MS;
    historial.set(
      bono.ticker,
      puntos.filter((p) => p.ts >= desde)
    );
  }
}

/**
 * Para cada bono, compara el precio actual contra el punto más viejo que
 * todavía queda en la ventana de 3 horas. Avisa tanto subas como caídas de
 * al menos UMBRAL_ALERTA.
 */
function detectarAlertas(bonos) {
  const alertas = [];
  for (const bono of bonos) {
    if (!Number.isFinite(bono.precio)) continue;
    const puntos = historial.get(bono.ticker);
    if (!puntos || puntos.length < 2) continue;

    const masViejo = puntos[0];
    const variacion = (bono.precio - masViejo.precio) / masViejo.precio;
    if (Math.abs(variacion) < UMBRAL_ALERTA) continue;

    alertas.push({
      bono,
      variacion,
      minutos: Math.round((puntos[puntos.length - 1].ts - masViejo.ts) / 60000),
    });
  }
  alertas.sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion));
  return alertas;
}

// Desde cuándo está activa cada alerta, sin cortes: no es la ventana de 3h
// que usa detectarAlertas para calcular la variación (esa se recorta cuando
// el punto más viejo se sale de la ventana), sino la primera vez que ese
// ticker apareció como alerta y no dejó de estarlo en ningún refresco desde
// entonces. Se resetea solo si la alerta deja de cumplirse (aunque sea en
// un único refresco) y vuelve a aparecer más tarde.
let activasDesde = new Map(); // ticker -> timestamp (ms) de cuando empezó

function actualizarActivasDesde(alertas, ahora) {
  const tickersActivos = new Set(alertas.map((a) => a.bono.ticker));
  for (const ticker of activasDesde.keys()) {
    if (!tickersActivos.has(ticker)) activasDesde.delete(ticker);
  }
  for (const alerta of alertas) {
    const ticker = alerta.bono.ticker;
    if (!activasDesde.has(ticker)) activasDesde.set(ticker, ahora);
    alerta.activaDesdeTs = activasDesde.get(ticker);
  }
}

// ---------- Formato y render (mismas columnas que Monitor Individuos) ----------

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

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function formatVariacion(variacion) {
  const signo = variacion > 0 ? '+' : '';
  return `${signo}${(variacion * 100).toFixed(2)}%`;
}

// ---------- Escala de color de TIR (igual a Monitor Individuos y al Excel original) ----------

const COLOR_TIR_MIN = [0xf8, 0x69, 0x6b]; // #F8696B
const COLOR_TIR_MEDIANA = [0xff, 0xeb, 0x84]; // #FFEB84
const COLOR_TIR_MAX = [0x63, 0xbe, 0x7b]; // #63BE7B

function mezclarColor(colorA, colorB, t) {
  const r = Math.round(colorA[0] + (colorB[0] - colorA[0]) * t);
  const g = Math.round(colorA[1] + (colorB[1] - colorA[1]) * t);
  const b = Math.round(colorA[2] + (colorB[2] - colorA[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Mediana (percentil 50, igual a PERCENTILE.INC de Excel con k=0.5). */
function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const n = ordenados.length;
  if (n === 0) return NaN;
  const medio = (n - 1) / 2;
  return (ordenados[Math.floor(medio)] + ordenados[Math.ceil(medio)]) / 2;
}

function colorEscalaTir(valor, min, med, max) {
  if (![valor, min, med, max].every(Number.isFinite)) return null;
  if (max === min) return mezclarColor(COLOR_TIR_MEDIANA, COLOR_TIR_MEDIANA, 0);
  if (valor <= med) {
    const rango = med - min;
    const t = rango === 0 ? 0 : Math.min(1, Math.max(0, (valor - min) / rango));
    return mezclarColor(COLOR_TIR_MIN, COLOR_TIR_MEDIANA, t);
  }
  const rango = max - med;
  const t = rango === 0 ? 1 : Math.min(1, Math.max(0, (valor - med) / rango));
  return mezclarColor(COLOR_TIR_MEDIANA, COLOR_TIR_MAX, t);
}

/** Estadísticas de TIR por sección, para pintar cada alerta con la misma escala que su pestaña en Monitor Individuos. */
function estadisticasTirPorSeccion(bonos) {
  const porSeccion = new Map();
  for (const bono of bonos) {
    if (!Number.isFinite(bono.tir)) continue;
    if (!porSeccion.has(bono.seccion)) porSeccion.set(bono.seccion, []);
    porSeccion.get(bono.seccion).push(bono.tir);
  }
  const stats = new Map();
  for (const [seccion, tires] of porSeccion) {
    stats.set(seccion, { min: Math.min(...tires), med: mediana(tires), max: Math.max(...tires) });
  }
  return stats;
}

function renderAlertas(alertas, statsTirPorSeccion, ahora) {
  if (alertas.length === 0) {
    alertasVacio.classList.remove('oculto');
    alertasLista.innerHTML = '';
    return;
  }
  alertasVacio.classList.add('oculto');

  alertasLista.innerHTML = alertas
    .map(({ bono, variacion, activaDesdeTs }) => {
      const sube = variacion > 0;
      const flecha = sube ? '▲' : '▼';
      const activaDesdeTexto = formatHaceTiempo(Math.floor((ahora - activaDesdeTs) / 1000));
      const stats = statsTirPorSeccion.get(bono.seccion);
      const celdas = COLUMNAS.map((col) => {
        const texto = escapeHtml(formatValor(col.clave, bono[col.clave]));
        if (col.clave === 'tir' && stats) {
          const color = colorEscalaTir(bono.tir, stats.min, stats.med, stats.max);
          return `<td tabindex="0"${color ? ` style="background:${color};"` : ''}>${texto}</td>`;
        }
        return `<td tabindex="0">${texto}</td>`;
      }).join('');
      return `
        <article class="alerta-card ${sube ? 'alerta-sube' : 'alerta-baja'}">
          <header class="alerta-header">
            <span class="alerta-flecha">${flecha}</span>
            <span class="alerta-ticker">${escapeHtml(bono.ticker)}</span>
            <span class="alerta-variacion">${formatVariacion(variacion)}</span>
            <span class="alerta-detalle">activa ${activaDesdeTexto} · ${escapeHtml(bono.seccion)}</span>
          </header>
          <div class="tabla-wrap">
            <table class="tabla-excel tabla-excel-monitor">
              <thead><tr>${COLUMNAS.map((col) => `<th>${col.titulo}</th>`).join('')}</tr></thead>
              <tbody><tr>${celdas}</tr></tbody>
            </table>
          </div>
        </article>`;
    })
    .join('');
}

// ---------- "Última actualización" ----------

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

setInterval(refrescarTextoBadge, 1000);

// ---------- Ciclo de refresco ----------

let preparado = null; // { bonosEstaticos, workbook, hojaDetalles }, de prepararMonitorCorporativos
let intervaloActualizacion = null;
let actualizandoAhora = false;

async function refrescarCotizaciones({ silencioso = false } = {}) {
  if (!preparado || actualizandoAhora) return;
  actualizandoAhora = true;
  if (!silencioso) mostrarMensaje('Actualizando cotizaciones…');

  try {
    const { bonos, actualizadoA } = await recalcularConVivo(preparado);
    const ahora = actualizadoA.getTime();
    registrarPrecios(bonos, ahora);
    await guardarHistorial(historial);
    const alertas = detectarAlertas(bonos);
    actualizarActivasDesde(alertas, ahora);
    renderAlertas(alertas, estadisticasTirPorSeccion(bonos), ahora);

    const conCotizacion = bonos.filter((b) => !b.error).length;
    infoResultado.textContent =
      `Vigilando ${conCotizacion} de ${bonos.length} ONs con cotización en vivo · ` +
      `${alertas.length} alerta${alertas.length === 1 ? '' : 's'} activa${alertas.length === 1 ? '' : 's'} (>${(UMBRAL_ALERTA * 100).toFixed(0)}%)`;

    ultimaActualizacionTs = ahora;
    badgeActualizado.title = actualizadoA.toLocaleString('es-AR');
    refrescarTextoBadge();
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

async function procesarBuffer(arrayBuffer, nombreArchivo) {
  mostrarMensaje('Leyendo "Corporativos"…');
  if (intervaloActualizacion) clearInterval(intervaloActualizacion);

  try {
    preparado = await prepararMonitorCorporativos(arrayBuffer);
    preparado.bonosEstaticos = filtrarPorCalificacion(preparado.bonosEstaticos);
    textoDropzone.textContent = nombreArchivo;
    dropzone.classList.add('con-archivo');
    mostrarVistaCargada();
    // Se guarda apenas el archivo queda leído y validado, antes de pedir la
    // cotización en vivo: así, si esa parte tarda o falla, o si se cierra la
    // pestaña en el medio, el Monitor ya quedó guardado igual (antes se
    // guardaba recién acá abajo, después del refresco en vivo).
    await guardarArchivoGuardado(arrayBuffer, nombreArchivo);
    await refrescarCotizaciones();
    iniciarActualizacionAutomatica();
    mostrarMensaje('', '');
  } catch (error) {
    console.error(error);
    preparado = null;
    mostrarMensaje(error.message || 'No se pudo procesar el archivo.', 'error');
  }
}

async function cargarArchivo(archivo) {
  if (!archivo) return;
  const arrayBuffer = await archivo.arrayBuffer();
  await procesarBuffer(arrayBuffer, archivo.name);
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
inputArchivoActualizar.addEventListener('change', () => cargarArchivo(inputArchivoActualizar.files[0]));

// Recupera el historial de precios y el Monitor guardado (por esta página o
// por Monitor Individuos), si hay, sin esperar a que el usuario suba nada.
(async function restaurarGuardado() {
  historial = await cargarHistorial();
  const guardado = await leerArchivoGuardado();
  if (guardado && guardado.arrayBuffer) {
    await procesarBuffer(guardado.arrayBuffer, guardado.nombre || 'Monitor guardado');
  }
})();
