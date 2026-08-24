const form = document.getElementById('form-procesar');
const inputArchivo = document.getElementById('archivo');
const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const btnProcesar = document.getElementById('btn-procesar');
const mensaje = document.getElementById('mensaje');

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

    const respuesta = await fetch('/api/procesar', {
      method: 'POST',
      body: formData,
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.json().catch(() => ({}));
      throw new Error(detalle.error || 'No se pudo procesar el archivo.');
    }

    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'acreditaciones_procesado.xlsx';
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
