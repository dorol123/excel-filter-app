/*
 * Gate simple para funciones en beta: no es un mecanismo de seguridad (la
 * clave queda visible en el código del cliente), es solo un freno para que
 * no se use por accidente algo que todavía no está terminado.
 *
 * Uso: poner este script como PRIMERA etiqueta dentro de <body>, con
 * data-clave="000" data-id="nombre-unico-de-la-herramienta".
 */
(function () {
  const config = document.currentScript.dataset;
  const clave = config.clave;
  if (!clave) return;

  const storageKey = 'beta-desbloqueada-' + (config.id || 'default');
  if (sessionStorage.getItem(storageKey) === 'si') return;

  document.body.classList.add('beta-bloqueado');

  const overlay = document.createElement('div');
  overlay.className = 'beta-overlay';
  overlay.innerHTML = `
    <div class="beta-card">
      <span class="beta-etiqueta">Función en beta</span>
      <h2>Acceso restringido</h2>
      <p>Esta herramienta todavía está en pruebas. Ingresá la clave para continuar.</p>
      <form id="beta-form">
        <input type="password" id="beta-clave-input" placeholder="Clave" autocomplete="off" />
        <button type="submit">Ingresar</button>
      </form>
      <p class="beta-error" id="beta-error"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('#beta-form');
  const input = overlay.querySelector('#beta-clave-input');
  const error = overlay.querySelector('#beta-error');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value === clave) {
      sessionStorage.setItem(storageKey, 'si');
      overlay.remove();
      document.body.classList.remove('beta-bloqueado');
    } else {
      error.textContent = 'Clave incorrecta.';
      input.value = '';
      input.focus();
    }
  });

  window.addEventListener('DOMContentLoaded', () => input.focus());
})();
