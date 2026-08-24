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

const seccionVistaPrevia = document.getElementById('vista-previa');
const tabsContenedor = document.getElementById('tabs');
const tablaWrap = document.getElementById('tabla-wrap');
const btnSeleccionarTodo = document.getElementById('btn-seleccionar-todo');

let vistaPreviaActual = null;
let hojaActiva = null;

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

function base64ABlob(base64, mime) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function formatImporte(importe) {
  return '$ ' + Math.round(importe).toLocaleString('es-AR');
}

function construirTabla(encabezados, filas, colImporte, colAsesor) {
  const tabla = document.createElement('table');
  tabla.className = 'tabla-excel';
  tabla.id = 'tabla-activa';

  const thead = document.createElement('thead');
  const trEncabezado = document.createElement('tr');
  encabezados.forEach((encabezado) => {
    const th = document.createElement('th');
    th.textContent = encabezado;
    trEncabezado.appendChild(th);
  });
  thead.appendChild(trEncabezado);
  tabla.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (filas.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = encabezados.length;
    td.className = 'tabla-vacia';
    td.textContent = 'No hay operaciones en este rango.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    filas.forEach((fila) => {
      const tr = document.createElement('tr');
      fila.valores.forEach((valor, i) => {
        const td = document.createElement('td');
        if (i === colImporte) {
          td.textContent = formatImporte(fila.importe);
          td.classList.add('columna-importe');
        } else {
          td.textContent = valor === null || valor === undefined ? '' : String(valor);
        }
        if (fila.destacado && (i === colImporte || i === colAsesor)) {
          td.classList.add('destacado');
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  tabla.appendChild(tbody);
  return tabla;
}

function renderVistaPrevia() {
  if (!vistaPreviaActual) return;
  const nombresHojas = Object.keys(vistaPreviaActual.hojas);
  if (!nombresHojas.includes(hojaActiva)) {
    hojaActiva = nombresHojas[0];
  }

  tabsContenedor.innerHTML = '';
  nombresHojas.forEach((nombre) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'tab' + (nombre === hojaActiva ? ' activa' : '');
    boton.textContent = `${nombre} (${vistaPreviaActual.hojas[nombre].length})`;
    boton.addEventListener('click', () => {
      hojaActiva = nombre;
      renderVistaPrevia();
    });
    tabsContenedor.appendChild(boton);
  });

  tablaWrap.innerHTML = '';
  tablaWrap.appendChild(
    construirTabla(
      vistaPreviaActual.encabezados,
      vistaPreviaActual.hojas[hojaActiva],
      vistaPreviaActual.colImporte,
      vistaPreviaActual.colAsesor
    )
  );

  seccionVistaPrevia.classList.remove('oculto');
}

btnSeleccionarTodo.addEventListener('click', () => {
  const tabla = document.getElementById('tabla-activa');
  if (!tabla) return;
  const seleccion = window.getSelection();
  seleccion.removeAllRanges();
  const rango = document.createRange();
  rango.selectNodeContents(tabla);
  seleccion.addRange(rango);
});

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

    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(datos.error || 'No se pudo procesar el archivo.');
    }

    const blob = base64ABlob(
      datos.archivoBase64,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = datos.nombreArchivo || 'acreditaciones_procesado.xlsx';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);

    vistaPreviaActual = datos.vistaPrevia;
    hojaActiva = null;
    renderVistaPrevia();

    mostrarMensaje('Listo, se descargó el archivo procesado.', 'exito');
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  } finally {
    btnProcesar.disabled = false;
    btnProcesar.textContent = textoOriginal;
  }
});
