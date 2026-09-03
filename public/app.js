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

function formatImporte(importe) {
  return '$ ' + Math.round(importe).toLocaleString('es-AR');
}

function normalizarNombre(valor) {
  return String(valor || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
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
    if (i === colFecha) {
      const thHora = document.createElement('th');
      thHora.textContent = 'Hora';
      thHora.classList.add('columna-hora');
      trEncabezado.appendChild(thHora);
    }
  });
  thead.appendChild(trEncabezado);
  tabla.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (filas.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = encabezados.length + 1;
    td.className = 'tabla-vacia';
    td.textContent = 'No hay operaciones en este rango.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    filas.forEach((fila) => {
      const tr = document.createElement('tr');
      const ocultarCuenta =
        colCuenta !== -1 &&
        normalizarNombre(fila.valores[colCuenta]) === normalizarNombre(fila.valores[colAsesor]);
      fila.valores.forEach((valor, i) => {
        const td = document.createElement('td');
        if (i === colImporte) {
          td.textContent = formatImporte(fila.importe);
          td.classList.add('columna-importe');
        } else if (i === colCuenta && ocultarCuenta) {
          td.textContent = '';
        } else {
          td.textContent = valor === null || valor === undefined ? '' : String(valor);
        }
        if (i === colFecha) td.classList.add('columna-fecha');
        if (i === colCuenta) td.classList.add('columna-cuenta');
        if (fila.destacado && (i === colImporte || i === colAsesor)) {
          td.classList.add('destacado');
        }
        tr.appendChild(td);
        if (i === colFecha) {
          const tdHora = document.createElement('td');
          tdHora.textContent = fila.hora || '';
          tdHora.classList.add('columna-hora');
          tr.appendChild(tdHora);
        }
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

  actualizarBotonesCopiarImagen(
    vistaPreviaActual.encabezados,
    filas,
    vistaPreviaActual.colImporte,
    vistaPreviaActual.colAsesor
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

const zonaCopiarImagen = document.getElementById('zona-copiar-imagen');
const notaCopiarImagen = document.getElementById('nota-copiar-imagen');
const UMBRAL_DIVIDIR_IMAGEN = 60;

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

async function generarImagenDeTabla(tabla, titulo) {
  const envoltorio = document.createElement('div');
  envoltorio.style.cssText = 'position:fixed; left:-10000px; top:0; display:inline-block; padding:16px; background:#ffffff;';

  if (titulo) {
    const encabezadoImagen = document.createElement('div');
    encabezadoImagen.textContent = titulo;
    encabezadoImagen.style.cssText = 'font: 700 16px -apple-system, sans-serif; color: #101253; margin-bottom: 10px;';
    envoltorio.appendChild(encabezadoImagen);
  }

  const tablaClon = tabla.cloneNode(true);
  tablaClon.querySelectorAll('.columna-hora').forEach((celda) => celda.remove());
  envoltorio.appendChild(tablaClon);
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

async function manejarClickCopiarImagen(boton, tabla, nombreArchivo, etiquetaExito, titulo) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Generando imagen...';

  try {
    const blob = await generarImagenDeTabla(tabla, titulo);

    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      mostrarMensaje(`${etiquetaExito} Pegala en WhatsApp con Ctrl+V (o Cmd+V).`, 'exito');
    } else {
      descargarBlob(blob, nombreArchivo);
      mostrarMensaje('Tu navegador no permite copiar imágenes; se descargó como archivo.', 'exito');
    }
  } catch (err) {
    mostrarMensaje('No se pudo copiar la imagen: ' + err.message, 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function crearBotonCopiarImagen(etiqueta, tabla, nombreArchivo, etiquetaExito, titulo) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-secundario';
  boton.textContent = etiqueta;
  boton.addEventListener('click', () => manejarClickCopiarImagen(boton, tabla, nombreArchivo, etiquetaExito, titulo));
  return boton;
}

const ETIQUETA_MONEDA_HOJA = { Pesos: 'Pesos', Dolares: 'Dólares' };

function formatFechaDDMMYYYY(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Título que va arriba de todo en la imagen copiada: moneda + el rango de fecha/hora pedido. */
function tituloImagenTabla(nombreHoja) {
  const moneda = ETIQUETA_MONEDA_HOJA[nombreHoja] || nombreHoja;
  if (fechaDesde.value === fechaHasta.value) {
    return `${moneda} desde ${horaDesde.value} hasta ${horaHasta.value} — ${formatFechaDDMMYYYY(fechaDesde.value)}`;
  }
  return (
    `${moneda} desde ${horaDesde.value} (${formatFechaDDMMYYYY(fechaDesde.value)}) ` +
    `hasta ${horaHasta.value} (${formatFechaDDMMYYYY(fechaHasta.value)})`
  );
}

/**
 * Con muchas órdenes la tabla queda muy alta; WhatsApp comprime las imágenes
 * y una sola imagen gigante pierde bastante calidad (texto ilegible). Por
 * eso, pasado el umbral, se arman dos imágenes más cortas en vez de una.
 */
function actualizarBotonesCopiarImagen(encabezados, filas, colImporte, colAsesor) {
  zonaCopiarImagen.innerHTML = '';
  const titulo = tituloImagenTabla(hojaActiva);

  if (filas.length > UMBRAL_DIVIDIR_IMAGEN) {
    const mitad = Math.ceil(filas.length / 2);
    const tablaParte1 = construirTabla(encabezados, filas.slice(0, mitad), colImporte, colAsesor);
    const tablaParte2 = construirTabla(encabezados, filas.slice(mitad), colImporte, colAsesor);

    zonaCopiarImagen.appendChild(
      crearBotonCopiarImagen('Copiar imagen 1', tablaParte1, 'tabla-acreditaciones-1.png', 'Imagen 1 copiada.', titulo)
    );
    zonaCopiarImagen.appendChild(
      crearBotonCopiarImagen('Copiar imagen 2', tablaParte2, 'tabla-acreditaciones-2.png', 'Imagen 2 copiada.', titulo)
    );

    notaCopiarImagen.textContent =
      `Son ${filas.length} órdenes: se armaron 2 imágenes porque en una sola la calidad bajaría mucho.`;
    notaCopiarImagen.classList.remove('oculto');
  } else {
    const tabla = construirTabla(encabezados, filas, colImporte, colAsesor);
    zonaCopiarImagen.appendChild(
      crearBotonCopiarImagen('Copiar imagen', tabla, 'tabla-acreditaciones.png', 'Imagen copiada.', titulo)
    );
    notaCopiarImagen.classList.add('oculto');
  }
}

let ultimoArchivoBuffer = null;
let ultimoNombreArchivo = null;
let procesando = false;
let timerReprocesar = null;

function descargarUltimoArchivo() {
  if (!ultimoArchivoBuffer) return;
  const blob = new Blob([ultimoArchivoBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
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
    const filtros = {
      fechaDesde: fechaDesde.value,
      fechaHasta: fechaHasta.value,
      horaDesde: horaDesde.value,
      horaHasta: horaHasta.value,
    };

    // Todo el procesamiento corre acá mismo, en el navegador: el archivo
    // nunca se sube a ningún servidor.
    const arrayBuffer = await archivo.arrayBuffer();
    const resultado = await procesarAcreditaciones(arrayBuffer, filtros);

    ultimoArchivoBuffer = resultado.xlsxBuffer;
    ultimoNombreArchivo = resultado.nombreArchivo;

    vistaPreviaActual = resultado.vistaPrevia;
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
