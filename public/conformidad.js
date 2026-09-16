/*
 * UI de Conformidad. La lectura del archivo pasa por conformidad-motor.js
 * (100% en el navegador); acá sólo se muestra la tabla y se arma la copia
 * como imagen — mismo patrón de "el acreditador" (Procesador de
 * Acreditaciones, ver app.js): tabla clara fija (.tabla-acreditaciones,
 * pensada para clonarse en la imagen), filtro por asesor, "seleccionar
 * todas las celdas" y "copiar imagen" con html2canvas.
 */

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const mensaje = document.getElementById('mensaje');
const bannerHasta = document.getElementById('banner-hasta');
const bannerHastaTexto = document.getElementById('banner-hasta-texto');
const resultado = document.getElementById('resultado');
const infoResultado = document.getElementById('info-resultado');
const selectAsesor = document.getElementById('filtro-asesor');
const tablaWrap = document.getElementById('tabla-wrap-conformidad');
const btnSeleccionarTodo = document.getElementById('btn-seleccionar-todo');
const zonaCopiarImagen = document.getElementById('zona-copiar-imagen');
const notaCopiarImagen = document.getElementById('nota-copiar-imagen');
const contenedor = document.getElementById('contenedor');

const UMBRAL_DIVIDIR_IMAGEN = 40; // mismo mecanismo que Acreditaciones (ver app.js), con un umbral más bajo

const COLUMNAS = [
  { clave: 'descripcion', titulo: 'Descripcion' },
  { clave: 'comitente', titulo: 'Comitente' },
  { clave: 'operacion', titulo: 'Operacion' },
  { clave: 'ticker', titulo: 'Ticker' },
  { clave: 'asesor', titulo: 'Asesor' },
];

let filasBase = [];
let textoHastaActual = '';

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function formatValor(valor) {
  return valor === null || valor === undefined || valor === '' ? '' : String(valor);
}

function construirTabla(filas) {
  const tabla = document.createElement('table');
  tabla.className = 'tabla-acreditaciones';
  tabla.id = 'tabla-activa';

  const thead = document.createElement('thead');
  const trEncabezado = document.createElement('tr');
  COLUMNAS.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col.titulo;
    trEncabezado.appendChild(th);
  });
  thead.appendChild(trEncabezado);
  tabla.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (filas.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = COLUMNAS.length;
    td.className = 'tabla-vacia';
    td.textContent = 'No hay órdenes sin conformidad.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    filas.forEach((fila) => {
      const tr = document.createElement('tr');
      COLUMNAS.forEach((col) => {
        const td = document.createElement('td');
        td.textContent = formatValor(fila[col.clave]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  tabla.appendChild(tbody);
  return tabla;
}

// ---------- Copiar como imagen (mismo patrón que Acreditaciones, ver app.js) ----------

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
  envoltorio.style.cssText =
    'position:fixed; left:-10000px; top:0; display:inline-block; padding:16px; background:#ffffff;';

  if (titulo) {
    const encabezadoImagen = document.createElement('div');
    encabezadoImagen.textContent = titulo;
    encabezadoImagen.style.cssText = 'font: 700 16px -apple-system, sans-serif; color: #101253; margin-bottom: 10px;';
    envoltorio.appendChild(encabezadoImagen);
  }

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

async function manejarClickCopiarImagen(boton, tabla, titulo) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Generando imagen...';

  try {
    const blob = await generarImagenDeTabla(tabla, titulo);
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      mostrarMensaje('Imagen copiada. Pegala en WhatsApp con Ctrl+V (o Cmd+V).', 'exito');
    } else {
      descargarBlob(blob, 'conformidad.png');
      mostrarMensaje('Tu navegador no permite copiar imágenes; se descargó como archivo.', 'exito');
    }
  } catch (err) {
    mostrarMensaje('No se pudo copiar la imagen: ' + err.message, 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function crearBotonCopiarImagen(etiqueta, tabla, titulo) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-secundario';
  boton.textContent = etiqueta;
  boton.addEventListener('click', () => manejarClickCopiarImagen(boton, tabla, titulo));
  return boton;
}

/**
 * Con más de 40 órdenes la tabla queda muy alta; igual que en Acreditaciones
 * (ver actualizarBotonesCopiarImagen en app.js), pasado el umbral se arman
 * dos imágenes más cortas en vez de una sola larga.
 */
function actualizarBotonCopiarImagen(filas) {
  zonaCopiarImagen.innerHTML = '';
  if (filas.length === 0) {
    notaCopiarImagen.classList.add('oculto');
    return;
  }

  const titulo = textoHastaActual ? `Órdenes sin conformidad hasta ${textoHastaActual}` : 'Órdenes sin conformidad';

  if (filas.length > UMBRAL_DIVIDIR_IMAGEN) {
    const mitad = Math.ceil(filas.length / 2);
    const tablaParte1 = construirTabla(filas.slice(0, mitad));
    const tablaParte2 = construirTabla(filas.slice(mitad));

    zonaCopiarImagen.appendChild(crearBotonCopiarImagen('Copiar imagen 1', tablaParte1, titulo));
    zonaCopiarImagen.appendChild(crearBotonCopiarImagen('Copiar imagen 2', tablaParte2, titulo));

    notaCopiarImagen.textContent =
      `Son ${filas.length} órdenes: se armaron 2 imágenes porque en una sola la calidad bajaría mucho.`;
    notaCopiarImagen.classList.remove('oculto');
  } else {
    const tabla = construirTabla(filas);
    zonaCopiarImagen.appendChild(crearBotonCopiarImagen('Copiar imagen', tabla, titulo));
    notaCopiarImagen.classList.add('oculto');
  }
}

// ---------- Filtro por asesor + render ----------

function actualizarTabla() {
  const asesorSeleccionado = selectAsesor.value;
  const filas = asesorSeleccionado ? filasBase.filter((f) => f.asesor === asesorSeleccionado) : filasBase;

  tablaWrap.innerHTML = '';
  tablaWrap.appendChild(construirTabla(filas));
  actualizarBotonCopiarImagen(filas);

  infoResultado.textContent =
    `${filas.length} orden${filas.length === 1 ? '' : 'es'} sin conformidad` +
    (asesorSeleccionado ? ` de ${asesorSeleccionado}.` : '.');
}

function renderVistaPrevia() {
  const asesores = [...new Set(filasBase.map((f) => f.asesor).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'es')
  );

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
  resultado.classList.remove('oculto');
  // Compacta el recuadro de carga de la izquierda para darle más ancho al
  // visor (si no, con la tarjeta a tamaño completo hay que scrollear para
  // ver la tabla entera).
  contenedor.classList.add('con-resultado');
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

// ---------- Carga de archivo ----------

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje('Procesando…');
  resultado.classList.add('oculto');
  bannerHasta.classList.add('oculto');

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    const { filas, textoHasta } = await procesarConformidad(arrayBuffer);
    filasBase = filas;
    textoHastaActual = textoHasta || '';

    if (textoHasta) {
      bannerHastaTexto.textContent = `Órdenes sin conformidad hasta ${textoHasta}`;
      bannerHasta.classList.remove('oculto');
    }

    renderVistaPrevia();
    mostrarMensaje(
      `${filas.length} orden${filas.length === 1 ? '' : 'es'} sin conformidad encontrada${filas.length === 1 ? '' : 's'}.`,
      'exito'
    );
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
