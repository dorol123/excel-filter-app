/*
 * Landing pública ("/landing"). Reutiliza el mismo gate de beta que
 * public/index.js: comparte sessionStorage (`beta-desbloqueada-<id>`), así
 * desbloquear una herramienta acá también la desbloquea en la herramienta
 * destino (y viceversa).
 */

const CLAVE = '000';

// ---------- Reloj ----------
const navReloj = document.getElementById('nav-reloj');
function actualizarReloj() {
  navReloj.textContent = new Date().toLocaleTimeString('es-AR');
}
actualizarReloj();

// ---------- Serie pseudo-aleatoria determinística (LCG) ----------
function series(seed, n, amp) {
  const out = [];
  let v = 0.5;
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    v = Math.min(0.92, Math.max(0.08, v + ((s / 2147483648) - 0.48) * amp));
    out.push(v);
  }
  return out;
}

function path(vals, w, h) {
  return vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - v * h;
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    })
    .join(' ');
}

const fmt = (n) => n.toFixed(2).replace('.', ',');

// ---------- Ticker de ONs (simulado) ----------
const TICKERS_BASE = [
  { tk: 'YMCHO', px: 98.4 },
  { tk: 'MRCAO', px: 101.2 },
  { tk: 'PNDCO', px: 96.8 },
  { tk: 'TLC1O', px: 99.5 },
  { tk: 'CP34O', px: 94.1 },
  { tk: 'RZ46O', px: 102.7 },
  { tk: 'GN38O', px: 97.3 },
  { tk: 'IRCFO', px: 100.4 },
  { tk: 'VSCSO', px: 95.6 },
  { tk: 'LOC3O', px: 103.1 },
];

let cotizaciones = TICKERS_BASE.map((q) => ({ ...q, ch: 0 }));

const ICONO_SUBE = '<path d="M3 13l6-6 4 4 6-8M15 3h4v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />';
const ICONO_BAJA = '<path d="M3 3l6 6 4-4 6 8M15 13h4V9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />';

const marqueePista = document.getElementById('marquee-pista');

function renderTicker() {
  const html = cotizaciones
    .map((q) => {
      const sube = q.ch >= 0;
      return `
        <span class="ticker-item">
          <span class="ticker-tk">${q.tk}</span>
          <span class="ticker-px">${fmt(q.px)}</span>
          <span class="ticker-ch ${sube ? 'sube' : 'baja'}">
            <svg viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${sube ? ICONO_SUBE : ICONO_BAJA}</svg>
            ${sube ? '+' : ''}${fmt(q.ch)}%
          </span>
        </span>`;
    })
    .join('');
  // Se duplica la lista para que el loop del marquee cierre sin salto.
  marqueePista.innerHTML = html + html;
}

function actualizarCotizaciones() {
  cotizaciones = cotizaciones.map((q) => {
    const nuevoPx = Math.max(70, q.px + (Math.random() - 0.48) * 1.1);
    const ch = ((nuevoPx - q.px) / q.px) * 100;
    return { ...q, px: nuevoPx, ch };
  });
  renderTicker();
}

renderTicker();

// ---------- Curva de ONs (hero) ----------
let tick = 0;
const curvaLinea = document.getElementById('curva-linea');
const curvaArea = document.getElementById('curva-area');
const curvaPunto = document.getElementById('curva-punto');
const curvaTir = document.getElementById('curva-tir');

function actualizarCurva() {
  const vals = series(41 + tick * 3, 22, 0.42);
  const d = path(vals, 320, 96);
  curvaLinea.setAttribute('d', d);
  curvaArea.setAttribute('d', `${d} L320 96 L0 96 Z`);
  const ultimo = vals[vals.length - 1];
  curvaPunto.setAttribute('cx', 320);
  curvaPunto.setAttribute('cy', (96 - ultimo * 96).toFixed(1));
  curvaTir.textContent = fmt(7.2 + ultimo * 2.4) + '%';
}

actualizarCurva();

// ---------- Parallax del hero ----------
const heroAura = document.getElementById('hero-aura');
const heroGrilla = document.getElementById('hero-grilla');
const curvaPanel = document.getElementById('curva-panel');

function manejarParallax(e) {
  const mx = (e.clientX / window.innerWidth) * 2 - 1;
  const my = (e.clientY / window.innerHeight) * 2 - 1;
  heroAura.style.transform = `translate(${(mx * 26).toFixed(1)}px, ${(my * 20).toFixed(1)}px)`;
  heroGrilla.style.transform = `translate(${(mx * -12).toFixed(1)}px, ${(my * -9).toFixed(1)}px)`;
  curvaPanel.style.transform = `translate(${(mx * 8).toFixed(1)}px, ${(my * 6).toFixed(1)}px)`;
}

// ---------- Catálogo de herramientas ----------
const CANDADO_MINI_CERRADO = '<rect x="3" y="6.5" width="8" height="5" rx="1.2" stroke="currentColor" stroke-width="1.3" /><path d="M4.6 6.5V5a2.4 2.4 0 0 1 4.8 0v1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />';
const CANDADO_MINI_ABIERTO = '<rect x="3" y="6.5" width="8" height="5" rx="1.2" stroke="currentColor" stroke-width="1.3" /><path d="M4.6 6.5V5a2.4 2.4 0 0 1 4.3-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />';
const FLECHA_CTA = '<path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />';

const CATALOGO = [
  {
    id: 'acred', titulo: 'Procesador de Acreditaciones', beta: false, seed: 3,
    href: '../acreditaciones.html',
    desc: 'Subís el Excel, lo separa en Pesos y Dólares, filtra, ordena y lo deja listo para descargar o compartir.',
    icono: '<rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" fill-opacity="0.14" /><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><path d="M12 3v18" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.35" />',
  },
  {
    id: 'analisis', titulo: 'Análisis de Carteras', beta: false, seed: 11,
    href: '../analisis-carteras.html',
    desc: 'Subís el resumen de cuenta en PDF y armás la distribución por tipo de activos, lista para revisar o exportar a Excel.',
    icono: '<path d="M12 12V3.5a8.5 8.5 0 1 1-8.5 8.5H12z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M12 12L4.5 16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />',
  },
  {
    id: 'asesores', titulo: 'Cambios de Asesores', beta: false, seed: 19,
    href: '../cambios-asesores.html',
    desc: 'Agregado de formato listo para pegar.',
    icono: '<path d="M4 8h13M17 8l-3.5-3.5M17 8l-3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /><path d="M20 16H7M7 16l3.5-3.5M7 16l3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />',
  },
  {
    id: 'conformidad', titulo: 'Conformidad', beta: true, seed: 37,
    href: '../conformidad.html',
    desc: 'Subís el reporte de Órdenes y muestra sólo las que todavía requieren conformidad, con descripción, comitente, operación, ticker y asesor.',
    icono: '<path d="M12 3l7 4v5c0 5-3 8.5-7 9-4-.5-7-4-7-9V7l7-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M8.5 12.5l2.3 2.3L16 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />',
  },
  {
    id: 'presentador', titulo: 'Presentador de Carteras', beta: true, seed: 7,
    href: '../carteras.html',
    desc: 'Cargás instrumentos con su valor y moneda, y armás una presentación de la cartera lista para descargar.',
    icono: '<path d="M3 17l5-6 4 4 5-7 4 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><path d="M3 20h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />',
  },
  {
    id: 'comparador', titulo: 'Comparador de ONs', beta: true, seed: 23,
    href: '../ons.html',
    desc: 'Subís el Monitor de ONs y comparás por TIR, duration y calificación, o pedís alternativas a partir de una ON puntual.',
    icono: '<path d="M4 19V9M10 19V5M16 19v-7M22 19V12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />',
  },
  {
    id: 'calculadora', titulo: 'Calculadora de ONs', beta: true, seed: 31,
    href: '../calculadora-ons.html',
    desc: 'Elegís una ON del Monitor y probás a qué TIR y duration queda a cualquier precio o cantidad de nominales.',
    icono: '<rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.6" /><path d="M8 8h8M8 12h3M13 12h3M8 16h3M13 16h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />',
  },
  {
    id: 'monitor', titulo: 'Monitor Individuos', beta: true, seed: 13,
    href: '../monitor-individuos.html',
    desc: 'Subís el Monitor de ONs y lo recalculás con cotizaciones en vivo (por ahora, sólo la hoja Corporativos).',
    icono: '<path d="M3 12h4l2-7 4 14 2-7h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />',
  },
  {
    id: 'alertas', titulo: 'Alertas', beta: true, seed: 29,
    href: '../alertas.html',
    desc: 'Vigila el precio en vivo de las ONs del Monitor y avisa cuando alguna se mueve más de 4% en las últimas 3 horas.',
    icono: '<path d="M12 4a5 5 0 0 0-5 5v3l-2 3h14l-2-3V9a5 5 0 0 0-5-5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />',
  },
];

function claveDesbloqueadaStorageKey(toolId) {
  return 'beta-desbloqueada-' + toolId;
}

function estaDesbloqueada(toolId) {
  return sessionStorage.getItem(claveDesbloqueadaStorageKey(toolId)) === 'si';
}

const gridHerramientas = document.getElementById('grid-herramientas');
const tarjetasHover = new Set();

function crearTarjeta(tool, indice) {
  const a = document.createElement('a');
  a.className = 'tarjeta-herr';
  a.href = tool.href;
  if (tool.beta) {
    a.dataset.toolId = tool.id;
    a.dataset.titulo = tool.titulo;
  }

  const numero = String(indice + 1).padStart(2, '0');
  const chip = tool.beta
    ? `<span class="chip-estado beta"><svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${CANDADO_MINI_CERRADO}</svg>Beta</span>`
    : `<span class="chip-estado libre"><svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${CANDADO_MINI_ABIERTO}</svg>Libre</span>`;

  a.innerHTML = `
    <span class="tarjeta-halo"></span>
    <span class="tarjeta-herr-cuerpo">
      <span class="tarjeta-herr-top">
        <span class="tarjeta-herr-icono"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${tool.icono}</svg></span>
        ${chip}
      </span>
      <span class="tarjeta-herr-titulo">${tool.titulo}</span>
      <p class="tarjeta-herr-desc">${tool.desc}</p>
      <span class="tarjeta-spark-wrap">
        <svg viewBox="0 0 220 34" preserveAspectRatio="none" aria-hidden="true">
          <path class="tarjeta-spark-trazo" d="" />
        </svg>
      </span>
      <span class="tarjeta-herr-pie">
        <span class="tarjeta-herr-numero">${numero}</span>
        <span class="tarjeta-herr-cta">
          ${tool.beta ? 'Pide clave' : 'Abrir'}
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FLECHA_CTA}</svg>
        </span>
      </span>
    </span>`;

  const halo = a.querySelector('.tarjeta-halo');
  const trazo = a.querySelector('.tarjeta-spark-trazo');

  function redibujarSparkline() {
    const vals = series(tool.seed + tick, 26, 0.34);
    trazo.setAttribute('d', path(vals, 220, 34));
  }
  redibujarSparkline();
  a._redibujarSparkline = redibujarSparkline;

  a.addEventListener('mousemove', (e) => {
    const rect = a.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    halo.style.background = `radial-gradient(220px circle at ${x}px ${y}px, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 70%)`;
  });

  a.addEventListener('mouseenter', () => {
    tarjetasHover.add(a);
    redibujarSparkline();
  });
  a.addEventListener('mouseleave', () => tarjetasHover.delete(a));

  if (tool.beta) {
    a.addEventListener('click', (e) => {
      if (estaDesbloqueada(tool.id)) return; // navega normal, ya desbloqueada
      e.preventDefault();
      abrirDialogo(a);
    });
  }

  return a;
}

CATALOGO.forEach((tool, i) => gridHerramientas.appendChild(crearTarjeta(tool, i)));

// ---------- Diálogo de clave (comparte sessionStorage con index.js / beta-gate.js) ----------
const dialogBackdrop = document.getElementById('dialog-backdrop');
const dialogForm = document.getElementById('dialog-form');
const dialogTitulo = document.getElementById('dialog-titulo');
const dialogClave = document.getElementById('dialog-clave');
const dialogError = document.getElementById('dialog-error');
const dialogCancelar = document.getElementById('dialog-cancelar');

let tarjetaPendiente = null;

function abrirDialogo(tarjeta) {
  tarjetaPendiente = tarjeta;
  dialogTitulo.textContent = tarjeta.dataset.titulo;
  dialogClave.value = '';
  dialogError.textContent = '';
  dialogBackdrop.hidden = false;
  dialogClave.focus();
}

function cerrarDialogo() {
  dialogBackdrop.hidden = true;
  dialogClave.value = '';
  dialogError.textContent = '';
  tarjetaPendiente = null;
}

dialogForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!tarjetaPendiente) return;

  const valor = dialogClave.value.trim();
  if (!valor) {
    dialogError.textContent = 'Ingresá la clave.';
    return;
  }
  if (valor !== CLAVE) {
    dialogError.textContent = 'Clave incorrecta.';
    dialogClave.value = '';
    dialogClave.focus();
    return;
  }

  sessionStorage.setItem(claveDesbloqueadaStorageKey(tarjetaPendiente.dataset.toolId), 'si');
  const destino = tarjetaPendiente.getAttribute('href');
  cerrarDialogo();
  window.location.href = destino;
});

dialogCancelar.addEventListener('click', cerrarDialogo);
dialogBackdrop.addEventListener('click', (e) => {
  if (e.target === dialogBackdrop) cerrarDialogo();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !dialogBackdrop.hidden) cerrarDialogo();
});

// ---------- Noticias del Wall Street Journal ----------
const panelNoticiasLista = document.getElementById('panel-noticias-lista');
const panelNoticiasNota = document.getElementById('panel-noticias-nota');

function formatearHoraRelativa(iso) {
  if (!iso) return '';
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'Recién';
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  return new Date(iso).toLocaleDateString('es-AR');
}

function crearItemNoticia(articulo) {
  const a = document.createElement('a');
  a.className = 'noticia-item';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  try {
    const url = new URL(articulo.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') a.href = url.href;
  } catch {
    a.href = '#';
  }

  const titulo = document.createElement('span');
  titulo.className = 'noticia-titulo';
  titulo.textContent = articulo.titulo;

  const hora = document.createElement('span');
  hora.className = 'noticia-hora';
  hora.textContent = formatearHoraRelativa(articulo.publicadoEn);

  a.append(titulo, hora);
  return a;
}

async function cargarNoticias() {
  try {
    const respuesta = await fetch('/api/wsj-news');
    if (!respuesta.ok) throw new Error('respuesta no ok');
    const datos = await respuesta.json();
    if (!datos.articulos || datos.articulos.length === 0) throw new Error('sin artículos');

    panelNoticiasLista.replaceChildren(...datos.articulos.map(crearItemNoticia));
    panelNoticiasNota.textContent = datos.stale
      ? 'No se pudo actualizar; mostrando la última copia guardada.'
      : 'Vía Google News, notas de wsj.com.';
  } catch (error) {
    panelNoticiasLista.replaceChildren();
    const aviso = document.createElement('p');
    aviso.className = 'panel-noticias-cargando';
    aviso.textContent = 'No se pudieron cargar las noticias.';
    panelNoticiasLista.appendChild(aviso);
    panelNoticiasNota.textContent = '';
  }
}

cargarNoticias();
setInterval(cargarNoticias, 60 * 60 * 1000);

// ---------- Tick global (2200ms): ticker + curva + sparklines en hover ----------
function tickGlobal() {
  tick += 1;
  actualizarCotizaciones();
  actualizarCurva();
  tarjetasHover.forEach((tarjeta) => tarjeta._redibujarSparkline());
}

// ---------- Reducción de movimiento ----------
const prefiereMenosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const intervaloReloj = setInterval(actualizarReloj, 1000);
let intervaloTick = null;

if (!prefiereMenosMovimiento) {
  intervaloTick = setInterval(tickGlobal, 2200);
  window.addEventListener('mousemove', manejarParallax);
}

window.addEventListener('pagehide', () => {
  clearInterval(intervaloReloj);
  if (intervaloTick) clearInterval(intervaloTick);
});

// ---------- Footer ----------
document.getElementById('footer-copyright').textContent =
  `© ${new Date().getFullYear()} Facundo Viale · Todos los derechos reservados.`;
