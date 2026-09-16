/*
 * Página de inicio ("Herramientas"). Las filas de acceso libre son links
 * normales; las de beta piden la clave acá mismo (en vez de mandar a la
 * herramienta y recién ahí pedirla) y comparten el mismo sessionStorage que
 * beta-gate.js — así, una vez desbloqueada acá, la propia herramienta no
 * vuelve a pedirla.
 */

const CLAVE = '000';

const filasBeta = document.querySelectorAll('.fila-beta');
const conteoLibre = document.getElementById('conteo-libre');
const conteoBeta = document.getElementById('conteo-beta');
const panelBetaCandado = document.getElementById('panel-beta-candado');
const panelBetaNota = document.getElementById('panel-beta-nota');

const dialogBackdrop = document.getElementById('dialog-backdrop');
const dialogForm = document.getElementById('dialog-form');
const dialogTitulo = document.getElementById('dialog-titulo');
const dialogClave = document.getElementById('dialog-clave');
const dialogError = document.getElementById('dialog-error');
const dialogCancelar = document.getElementById('dialog-cancelar');

let filaPendiente = null;

function claveDesbloqueadaStorageKey(toolId) {
  return 'beta-desbloqueada-' + toolId;
}

function estaDesbloqueada(toolId) {
  return sessionStorage.getItem(claveDesbloqueadaStorageKey(toolId)) === 'si';
}

const CANDADO_CERRADO = '<rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.7" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />';
const CANDADO_ABIERTO = '<rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.7" /><path d="M8 11V8a4 4 0 0 1 7.2-2.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />';

function actualizarEstadoFila(fila) {
  const desbloqueada = estaDesbloqueada(fila.dataset.toolId);
  const candado = fila.querySelector('.fila-beta-candado');
  candado.innerHTML = desbloqueada ? CANDADO_ABIERTO : CANDADO_CERRADO;
  return desbloqueada;
}

function actualizarEncabezadoBeta() {
  const total = filasBeta.length;
  const desbloqueadas = [...filasBeta].filter((f) => estaDesbloqueada(f.dataset.toolId)).length;
  const todasDesbloqueadas = total > 0 && desbloqueadas === total;

  panelBetaCandado.innerHTML = todasDesbloqueadas ? CANDADO_ABIERTO : CANDADO_CERRADO;
  panelBetaNota.textContent = todasDesbloqueadas
    ? 'Desbloqueadas en esta sesión'
    : `${total} herramienta${total === 1 ? '' : 's'} en pruebas`;
}

function actualizarConteos() {
  conteoLibre.textContent = document.querySelectorAll('.fila').length;
  conteoBeta.textContent = filasBeta.length;
}

function abrirDialogo(fila) {
  filaPendiente = fila;
  dialogTitulo.textContent = fila.dataset.titulo;
  dialogClave.value = '';
  dialogError.textContent = '';
  dialogBackdrop.hidden = false;
  dialogClave.focus();
}

function cerrarDialogo() {
  dialogBackdrop.hidden = true;
  dialogClave.value = '';
  dialogError.textContent = '';
  filaPendiente = null;
}

filasBeta.forEach((fila) => {
  actualizarEstadoFila(fila);
  fila.addEventListener('click', (e) => {
    if (estaDesbloqueada(fila.dataset.toolId)) return; // navega normal, ya desbloqueada
    e.preventDefault();
    abrirDialogo(fila);
  });
});

dialogForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!filaPendiente) return;

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

  sessionStorage.setItem(claveDesbloqueadaStorageKey(filaPendiente.dataset.toolId), 'si');
  const destino = filaPendiente.getAttribute('href');
  actualizarEstadoFila(filaPendiente);
  actualizarEncabezadoBeta();
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

actualizarConteos();
actualizarEncabezadoBeta();

document.getElementById('footer-copyright').textContent =
  `© ${new Date().getFullYear()} Facundo Viale · Todos los derechos reservados.`;
