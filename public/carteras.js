const form = document.getElementById('form-instrumento');
const inputNombre = document.getElementById('nombre-instrumento');
const inputValor = document.getElementById('valor-instrumento');
const selectMoneda = document.getElementById('moneda-instrumento');
const mensaje = document.getElementById('mensaje-cartera');
const visor = document.getElementById('cartera-visor');
const btnVaciar = document.getElementById('btn-vaciar-cartera');
const btnDescargar = document.getElementById('btn-descargar-presentacion');

const ETIQUETA_MONEDA = { Pesos: 'Pesos', Dolares: 'Dólares' };
const PREFIJO_MONEDA = { Pesos: '$', Dolares: 'US$' };
const ORDEN_MONEDAS = ['Pesos', 'Dolares'];

let instrumentos = [];
let siguienteId = 1;

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ' ' + tipo : '');
}

function formatMoneda(valor, moneda) {
  const texto = valor.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${PREFIJO_MONEDA[moneda]} ${texto}`;
}

function renderCartera() {
  visor.innerHTML = '';

  if (instrumentos.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'tabla-vacia';
    vacio.textContent = 'Todavía no agregaste ningún instrumento.';
    visor.appendChild(vacio);
    return;
  }

  ORDEN_MONEDAS.forEach((moneda) => {
    const items = instrumentos.filter((i) => i.moneda === moneda);
    if (items.length === 0) return;

    const seccion = document.createElement('div');
    seccion.className = 'seccion-moneda';

    const titulo = document.createElement('h3');
    titulo.textContent = ETIQUETA_MONEDA[moneda];
    seccion.appendChild(titulo);

    const lista = document.createElement('div');
    lista.className = 'lista-instrumentos';

    let total = 0;
    items.forEach((item) => {
      total += item.valor;

      const fila = document.createElement('div');
      fila.className = 'fila-instrumento';

      const nombre = document.createElement('span');
      nombre.className = 'fila-instrumento-nombre';
      nombre.textContent = item.nombre;

      const valor = document.createElement('span');
      valor.className = 'fila-instrumento-valor';
      valor.textContent = formatMoneda(item.valor, moneda);

      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'fila-instrumento-quitar';
      quitar.setAttribute('aria-label', `Quitar ${item.nombre}`);
      quitar.textContent = '×';
      quitar.addEventListener('click', () => {
        instrumentos = instrumentos.filter((i) => i.id !== item.id);
        renderCartera();
      });

      fila.appendChild(nombre);
      fila.appendChild(valor);
      fila.appendChild(quitar);
      lista.appendChild(fila);
    });

    seccion.appendChild(lista);

    const filaTotal = document.createElement('div');
    filaTotal.className = 'fila-total';
    const totalEtiqueta = document.createElement('span');
    totalEtiqueta.textContent = `Total ${ETIQUETA_MONEDA[moneda]}`;
    const totalValor = document.createElement('span');
    totalValor.textContent = formatMoneda(total, moneda);
    filaTotal.appendChild(totalEtiqueta);
    filaTotal.appendChild(totalValor);
    seccion.appendChild(filaTotal);

    visor.appendChild(seccion);
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const nombre = inputNombre.value.trim();
  const valor = parseFloat(inputValor.value);
  const moneda = selectMoneda.value;

  if (!nombre || !Number.isFinite(valor) || valor < 0) {
    mostrarMensaje('Completá el nombre y un valor válido.', 'error');
    return;
  }

  instrumentos.push({ id: siguienteId++, nombre, valor, moneda });
  renderCartera();
  mostrarMensaje('', null);

  inputNombre.value = '';
  inputValor.value = '';
  inputNombre.focus();
});

btnVaciar.addEventListener('click', () => {
  if (instrumentos.length === 0) return;
  instrumentos = [];
  renderCartera();
  mostrarMensaje('', null);
});

btnDescargar.addEventListener('click', async () => {
  if (instrumentos.length === 0) {
    mostrarMensaje('Agregá al menos un instrumento antes de descargar.', 'error');
    return;
  }

  const textoOriginal = btnDescargar.textContent;
  btnDescargar.disabled = true;
  btnDescargar.textContent = 'Generando...';

  const envoltorio = document.createElement('div');
  envoltorio.style.cssText =
    'position:fixed; left:-10000px; top:0; display:inline-block; padding:24px; background:#ffffff;';
  const visorClon = visor.cloneNode(true);
  visorClon.querySelectorAll('.fila-instrumento-quitar').forEach((boton) => boton.remove());
  envoltorio.appendChild(visorClon);
  document.body.appendChild(envoltorio);

  try {
    const canvas = await html2canvas(envoltorio, { backgroundColor: '#ffffff', scale: 2 });
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen.'))), 'image/png');
    });

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'presentacion-cartera.png';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);

    mostrarMensaje('Listo, se descargó la presentación.', 'exito');
  } catch (err) {
    mostrarMensaje('No se pudo generar la presentación: ' + err.message, 'error');
  } finally {
    envoltorio.remove();
    btnDescargar.disabled = false;
    btnDescargar.textContent = textoOriginal;
  }
});

renderCartera();
