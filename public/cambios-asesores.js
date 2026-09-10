/*
 * UI de Cambios de Asesores. La lectura del archivo y el armado de las
 * filas pasan por cambios-asesores-motor.js (100% en el navegador); acá
 * sólo se muestran los datos y se arma la copia al portapapeles.
 */

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const mensaje = document.getElementById('mensaje');
const dropzoneAum = document.getElementById('dropzone-aum');
const textoDropzoneAum = document.getElementById('texto-dropzone-aum');
const inputArchivoAum = document.getElementById('archivo-aum');
const mensajeAum = document.getElementById('mensaje-aum');
const resultado = document.getElementById('resultado');
const infoResultado = document.getElementById('info-resultado');
const tablaWrap = document.getElementById('tabla-wrap-cambios');
const btnCopiar = document.getElementById('btn-copiar');
const mensajeCopiar = document.getElementById('mensaje-copiar');

let filasBase = [];
let mapaAUM = null;
let filasActuales = [];

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function mostrarMensajeAum(texto, tipo) {
  mensajeAum.textContent = texto;
  mensajeAum.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
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
  if (typeof valor === 'number') {
    return valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(valor);
}

function renderTabla(filas) {
  if (filas.length === 0) {
    tablaWrap.innerHTML = '<p class="tabla-vacia">No hay gestiones con origen Individuos en este archivo.</p>';
    return;
  }

  const encabezados = COLUMNAS_DESTINO.map((c) => c.destino);
  const filasHtml = filas
    .map((fila) => {
      const celdas = encabezados
        .map((destino) => {
          const clase = destino === 'MONTO' && montoEsDestacado(fila[destino]) ? ' class="celda-monto-destacado"' : '';
          return `<td${clase}>${formatValorParaMostrar(fila[destino])}</td>`;
        })
        .join('');
      return `<tr>${celdas}</tr>`;
    })
    .join('');

  tablaWrap.innerHTML = `
    <table class="tabla-excel">
      <thead>
        <tr>${encabezados.map((nombre) => `<th>${nombre}</th>`).join('')}</tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;
}

function recalcularYRenderizar() {
  if (filasBase.length === 0) return;
  filasActuales = mapaAUM ? aplicarAUM(filasBase, mapaAUM) : filasBase;
  renderTabla(filasActuales);
  const cantidadConMonto = mapaAUM ? filasActuales.filter((f) => f.MONTO !== null).length : 0;
  infoResultado.textContent = mapaAUM
    ? `${filasActuales.length} gestión${filasActuales.length === 1 ? '' : 'es'} con origen Individuos, ${cantidadConMonto} con MONTO encontrado, listas para copiar.`
    : `${filasActuales.length} gestión${filasActuales.length === 1 ? '' : 'es'} con origen Individuos, lista${filasActuales.length === 1 ? '' : 's'} para copiar.`;
  resultado.classList.remove('oculto');
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
    filasBase = await procesarGestiones(arrayBuffer);
    recalcularYRenderizar();
    mostrarMensaje(`${filasBase.length} gestión${filasBase.length === 1 ? '' : 'es'} con origen Individuos encontrada${filasBase.length === 1 ? '' : 's'}.`, 'exito');
  } catch (error) {
    console.error(error);
    mostrarMensaje(error.message || 'No se pudo procesar el archivo.', 'error');
  }
}

async function manejarArchivoAum(archivo) {
  if (!archivo) return;
  textoDropzoneAum.textContent = archivo.name;
  dropzoneAum.classList.add('con-archivo');
  mostrarMensajeAum('Procesando…');

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    mapaAUM = await procesarCuentasAUM(arrayBuffer);
    mostrarMensajeAum(`${mapaAUM.size} cuentas cargadas para cruzar por Comitente.`, 'exito');
    recalcularYRenderizar();
  } catch (error) {
    console.error(error);
    mapaAUM = null;
    mostrarMensajeAum(error.message || 'No se pudo procesar el archivo de cuentas.', 'error');
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

dropzoneAum.addEventListener('click', () => inputArchivoAum.click());
dropzoneAum.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzoneAum.classList.add('dragover');
});
dropzoneAum.addEventListener('dragleave', () => dropzoneAum.classList.remove('dragover'));
dropzoneAum.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzoneAum.classList.remove('dragover');
  const archivo = e.dataTransfer.files[0];
  if (archivo) {
    inputArchivoAum.files = e.dataTransfer.files;
    manejarArchivoAum(archivo);
  }
});
inputArchivoAum.addEventListener('change', () => manejarArchivoAum(inputArchivoAum.files[0]));

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
