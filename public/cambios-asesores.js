/*
 * UI de Cambios de Asesores. La lectura del archivo y el armado de las
 * filas pasan por cambios-asesores-motor.js (100% en el navegador); acá
 * sólo se muestran los datos y se arma la copia al portapapeles.
 */

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const mensaje = document.getElementById('mensaje');
const resultado = document.getElementById('resultado');
const infoResultado = document.getElementById('info-resultado');
const tablaWrap = document.getElementById('tabla-wrap');
const btnCopiar = document.getElementById('btn-copiar');
const mensajeCopiar = document.getElementById('mensaje-copiar');

let filasActuales = [];

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function mostrarMensajeCopiar(texto, tipo) {
  mensajeCopiar.textContent = texto;
  mensajeCopiar.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function formatValorParaMostrar(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (valor instanceof Date) {
    const dia = String(valor.getDate()).padStart(2, '0');
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${valor.getFullYear()}`;
  }
  return String(valor);
}

function renderTabla(filas) {
  if (filas.length === 0) {
    tablaWrap.innerHTML = '<p class="tabla-vacia">No hay gestiones a Individuos en este archivo.</p>';
    return;
  }

  const encabezados = COLUMNAS_DESTINO.map((c) => c.destino);
  const filasHtml = filas
    .map((fila) => `<tr>${encabezados.map((destino) => `<td>${formatValorParaMostrar(fila[destino])}</td>`).join('')}</tr>`)
    .join('');

  tablaWrap.innerHTML = `
    <table class="tabla-excel">
      <thead>
        <tr>${encabezados.map((nombre) => `<th>${nombre}</th>`).join('')}</tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;
}

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje('Procesando…');
  mostrarMensajeCopiar('', '');
  resultado.classList.add('oculto');

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    filasActuales = await procesarGestiones(arrayBuffer);
    renderTabla(filasActuales);
    infoResultado.textContent = `${filasActuales.length} gestión${filasActuales.length === 1 ? '' : 'es'} a Individuos, lista${filasActuales.length === 1 ? '' : 's'} para copiar.`;
    resultado.classList.remove('oculto');
    mostrarMensaje(`${filasActuales.length} gestión${filasActuales.length === 1 ? '' : 'es'} a Individuos encontrada${filasActuales.length === 1 ? '' : 's'}.`, 'exito');
  } catch (error) {
    console.error(error);
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

btnCopiar.addEventListener('click', async () => {
  if (filasActuales.length === 0) return;

  const tsv = filasATsv(filasActuales);
  const html = filasAHtml(filasActuales);

  try {
    if (window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(tsv);
    }
    mostrarMensajeCopiar('Copiado. Pegalo en la primera fila vacía de "Cambio de asesor".', 'exito');
  } catch (error) {
    console.error(error);
    try {
      await navigator.clipboard.writeText(tsv);
      mostrarMensajeCopiar('Copiado. Pegalo en la primera fila vacía de "Cambio de asesor".', 'exito');
    } catch (error2) {
      console.error(error2);
      mostrarMensajeCopiar('No se pudo copiar. Probá de nuevo.', 'error');
    }
  }
});
