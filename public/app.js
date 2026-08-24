const form = document.getElementById('form-procesar');
const inputArchivo = document.getElementById('archivo');
const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const btnProcesar = document.getElementById('btn-procesar');
const mensaje = document.getElementById('mensaje');
const fechaDesde = document.getElementById('fecha-desde');
const fechaHasta = document.getElementById('fecha-hasta');
const horaDesde = document.getElementById('hora-desde');
const horaHasta = document.getElementById('hora-hasta');

function fechaLocalISO(date) {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

(function setearRangoPorDefecto() {
  const hoyISO = fechaLocalISO(new Date());
  fechaDesde.value = hoyISO;
  fechaHasta.value = hoyISO;
  horaDesde.value = '00:00';
  horaHasta.value = '23:59';
})();

function setArchivo(archivo) {
  if (!archivo) return;
  const dt = new DataTransfer();
  dt.items.add(archivo);
  inputArchivo.files = dt.files;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  btnProcesar.disabled = false;
  mostrarMensaje('', null);
}

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const archivo = e.dataTransfer.files[0];
  if (archivo) setArchivo(archivo);
});

inputArchivo.addEventListener('change', () => {
  setArchivo(inputArchivo.files[0]);
});

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ' ' + tipo : '');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivo = inputArchivo.files[0];
  if (!archivo) return;

  btnProcesar.disabled = true;
  const textoOriginal = btnProcesar.textContent;
  btnProcesar.textContent = 'Procesando...';
  mostrarMensaje('', null);

  try {
    const formData = new FormData();
    formData.append('archivo', archivo);
    formData.append('fechaDesde', fechaDesde.value);
    formData.append('fechaHasta', fechaHasta.value);
    formData.append('horaDesde', horaDesde.value);
    formData.append('horaHasta', horaHasta.value);

    const respuesta = await fetch('/api/procesar', {
      method: 'POST',
      body: formData,
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.json().catch(() => ({}));
      throw new Error(detalle.error || 'No se pudo procesar el archivo.');
    }

    const contentDisposition = respuesta.headers.get('Content-Disposition') || '';
    const matchNombre = contentDisposition.match(/filename="([^"]+)"/);
    const nombreArchivo = matchNombre ? matchNombre[1] : 'acreditaciones_procesado.xlsx';

    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);

    mostrarMensaje('Listo, se descargó el archivo procesado.', 'exito');
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  } finally {
    btnProcesar.disabled = false;
    btnProcesar.textContent = textoOriginal;
  }
});
