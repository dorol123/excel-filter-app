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
const selectAsesor = document.getElementById('filtro-asesor');

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
  procesar({ descargar: false });
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
  const colFecha = encabezados.indexOf('Fecha Acreditación');
  const colCuenta = encabezados.indexOf('Cuenta');
  const tabla = document.createElement('table');
  tabla.className = 'tabla-excel';
  tabla.id = 'tabla-activa';

  const thead = document.createElement('thead');
  const trEncabezado = document.createElement('tr');
  encabezados.forEach((encabezado, i) => {
    const th = document.createElement('th');
    th.textContent = encabezado;
    if (i === colFecha) th.classList.add('columna-fecha');
    if (i === colCuenta) th.classList.add('columna-cuenta');
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
        if (i === colFecha) td.classList.add('columna-fecha');
        if (i === colCuenta) td.classList.add('columna-cuenta');
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

function actualizarTabla() {
  if (!vistaPreviaActual) return;
  const filasHoja = vistaPreviaActual.hojas[hojaActiva];
  const asesorSeleccionado = selectAsesor.value;
  const filas = asesorSeleccionado
    ? filasHoja.filter((fila) => fila.valores[vistaPreviaActual.colAsesor] === asesorSeleccionado)
    : filasHoja;

  tablaWrap.innerHTML = '';
  tablaWrap.appendChild(
    construirTabla(vistaPreviaActual.encabezados, filas, vistaPreviaActual.colImporte, vistaPreviaActual.colAsesor)
  );
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

  const asesores = [
    ...new Set(
      vistaPreviaActual.hojas[hojaActiva].map((fila) => fila.valores[vistaPreviaActual.colAsesor])
    ),
  ].sort((a, b) => String(a).localeCompare(String(b), 'es'));

  selectAsesor.innerHTML = '';
  const opcionTodos = document.createElement('option');
  opcionTodos.value = '';
  opcionTodos.textContent = 'Todos los asesores';
  selectAsesor.appendChild(opcionTodos);
  asesores.forEach((asesor) => {
    const opcion = document.createElement('option');
    opcion.value = asesor;
    opcion.textContent = asesor;
    selectAsesor.appendChild(opcion);
  });

  actualizarTabla();
  seccionVistaPrevia.classList.remove('oculto');
}

selectAsesor.addEventListener('change', actualizarTabla);

btnSeleccionarTodo.addEventListener('click', () => {
  const tabla = document.getElementById('tabla-activa');
  if (!tabla) return;
  const seleccion = window.getSelection();
  seleccion.removeAllRanges();
  const rango = document.createRange();
  rango.selectNodeContents(tabla);
  seleccion.addRange(rango);
});

const btnCopiarImagen = document.getElementById('btn-copiar-imagen');

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

async function generarImagenDeTabla(tabla) {
  const envoltorio = document.createElement('div');
  envoltorio.style.cssText = 'position:fixed; left:-10000px; top:0; display:inline-block; padding:16px; background:#ffffff;';
  envoltorio.appendChild(tabla.cloneNode(true));
  document.body.appendChild(envoltorio);

  try {
    const canvas = await html2canvas(envoltorio, { backgroundColor: '#ffffff', scale: 2 });
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo generar la imagen.'));
      }, 'image/png');
    });
  } finally {
    envoltorio.remove();
  }
}

btnCopiarImagen.addEventListener('click', async () => {
  const tabla = document.getElementById('tabla-activa');
  if (!tabla) return;

  const textoOriginal = btnCopiarImagen.textContent;
  btnCopiarImagen.disabled = true;
  btnCopiarImagen.textContent = 'Generando imagen...';

  try {
    const blob = await generarImagenDeTabla(tabla);

    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      mostrarMensaje('Imagen copiada. Pegala en WhatsApp con Ctrl+V (o Cmd+V).', 'exito');
    } else {
      descargarBlob(blob, 'tabla-acreditaciones.png');
      mostrarMensaje('Tu navegador no permite copiar imágenes; se descargó como archivo.', 'exito');
    }
  } catch (err) {
    mostrarMensaje('No se pudo copiar la imagen: ' + err.message, 'error');
  } finally {
    btnCopiarImagen.disabled = false;
    btnCopiarImagen.textContent = textoOriginal;
  }
});

let ultimoArchivoBase64 = null;
let ultimoNombreArchivo = null;
let procesando = false;
let timerReprocesar = null;

function descargarUltimoArchivo() {
  if (!ultimoArchivoBase64) return;
  const blob = base64ABlob(
    ultimoArchivoBase64,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  descargarBlob(blob, ultimoNombreArchivo || 'acreditaciones_procesado.xlsx');
}

async function procesar({ descargar }) {
  const archivo = inputArchivo.files[0];
  if (!archivo || procesando) return;

  procesando = true;
  const textoOriginal = btnProcesar.textContent;
  btnProcesar.disabled = true;
  btnProcesar.textContent = descargar ? 'Descargando...' : 'Generando vista previa...';
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

    ultimoArchivoBase64 = datos.archivoBase64;
    ultimoNombreArchivo = datos.nombreArchivo;

    vistaPreviaActual = datos.vistaPrevia;
    hojaActiva = null;
    renderVistaPrevia();

    if (descargar) {
      descargarUltimoArchivo();
      mostrarMensaje('Listo, se descargó el archivo procesado.', 'exito');
    } else {
      mostrarMensaje('Vista previa actualizada.', 'exito');
    }
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  } finally {
    procesando = false;
    btnProcesar.disabled = false;
    btnProcesar.textContent = textoOriginal;
  }
}

function reprocesarConDemora() {
  if (!inputArchivo.files[0]) return;
  clearTimeout(timerReprocesar);
  timerReprocesar = setTimeout(() => procesar({ descargar: false }), 300);
}

[fechaDesde, fechaHasta, horaDesde, horaHasta].forEach((campo) => {
  campo.addEventListener('change', reprocesarConDemora);
});

function sumarDias(fechaISO, dias) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  fecha.setDate(fecha.getDate() + dias);
  return fechaLocalISO(fecha);
}

function esLunes(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia).getDay() === 1;
}

document.querySelectorAll('.btn-atajo').forEach((boton) => {
  boton.addEventListener('click', () => {
    const tipo = boton.dataset.atajo;
    const base = fechaHasta.value || fechaLocalISO(new Date());

    if (tipo === '10-13' || tipo === '13-16') {
      fechaDesde.value = base;
      fechaHasta.value = base;
      horaDesde.value = tipo === '10-13' ? '10:00' : '13:00';
      horaHasta.value = tipo === '10-13' ? '13:00' : '16:00';
    } else if (tipo === '16-10') {
      // Desde las 16 del día hábil anterior hasta las 10 del día actual.
      // Si el día actual es lunes, el día hábil anterior es el viernes
      // (salvo feriados u otras excepciones, que hay que revisar a mano).
      const diasAtras = esLunes(base) ? 3 : 1;
      fechaDesde.value = sumarDias(base, -diasAtras);
      fechaHasta.value = base;
      horaDesde.value = '16:00';
      horaHasta.value = '10:00';
    }

    procesar({ descargar: false });
  });
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  procesar({ descargar: true });
});
