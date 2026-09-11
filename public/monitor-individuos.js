/*
 * UI de Monitor Individuos. La lectura del archivo, la consulta de
 * cotizaciones en vivo y el recálculo de TIR/duration/paridad pasan por
 * monitor-individuos-motor.js (100% en el navegador); acá sólo se muestra
 * la tabla y se dispara el refresco automático.
 */

const INTERVALO_ACTUALIZACION_MS = 20000;

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const inputArchivoActualizar = document.getElementById('archivo-actualizar');
const mensaje = document.getElementById('mensaje');
const resultado = document.getElementById('resultado');
const infoResultado = document.getElementById('info-resultado');
const tablaWrap = document.getElementById('tabla-wrap-monitor');
const tarjetaCarga = document.getElementById('tarjeta-carga');
const barraActualizacion = document.getElementById('barra-actualizacion');
const badgeActualizado = document.getElementById('badge-actualizado');

const COLUMNAS = [
  { clave: 'ticker', titulo: 'Ticker' },
  { clave: 'emisor', titulo: 'Emisor' },
  { clave: 'precio', titulo: 'Precio' },
  { clave: 'vencimiento', titulo: 'Vencimiento' },
  { clave: 'tir', titulo: 'TIR' },
  { clave: 'duration', titulo: 'Duration' },
  { clave: 'amortizacion', titulo: 'Amortización' },
  { clave: 'cupon', titulo: 'Cupón' },
  { clave: 'mesCupon', titulo: 'Mes cupón' },
  { clave: 'moneda', titulo: 'Dólar' },
  { clave: 'ley', titulo: 'Ley' },
  { clave: 'calificacion', titulo: 'Calif.' },
  { clave: 'laminaMinima', titulo: 'Lámina mín.' },
  { clave: 'sector', titulo: 'Sector' },
  { clave: 'paridad', titulo: 'Paridad' },
];

let preparado = null; // { bonosEstaticos, workbook, hojaDetalles }, de prepararMonitorCorporativos
let intervaloActualizacion = null;
let actualizandoAhora = false;

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function formatValor(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (valor instanceof Date) return valor.toLocaleDateString('es-AR');
  if (clave === 'tir' || clave === 'paridad') {
    return Number.isFinite(valor) ? `${(valor * 100).toFixed(2)}%` : '—';
  }
  if (clave === 'duration') {
    return Number.isFinite(valor) ? `${valor.toFixed(2)} a.` : '—';
  }
  if (clave === 'precio') {
    return Number.isFinite(valor) ? valor.toFixed(2) : '—';
  }
  if (typeof valor === 'number') {
    return valor.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }
  return String(valor);
}

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Agrupa manteniendo el orden en que vienen (ya vienen agrupados por bloque de la hoja). */
function agruparPorSeccion(bonos) {
  const grupos = [];
  for (const bono of bonos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.seccion === bono.seccion) {
      ultimo.bonos.push(bono);
    } else {
      grupos.push({ seccion: bono.seccion, bonos: [bono] });
    }
  }
  return grupos;
}

function renderTabla(bonos) {
  if (bonos.length === 0) {
    tablaWrap.innerHTML = '<p class="tabla-vacia">No se encontraron ONs en "Corporativos".</p>';
    return;
  }

  const filasHtml = agruparPorSeccion(bonos)
    .map((grupo) => {
      const filaSeccion = `<tr class="fila-seccion"><td colspan="${COLUMNAS.length}">${escapeHtml(grupo.seccion)}</td></tr>`;
      const filasBonos = grupo.bonos
        .map((bono) => {
          const celdas = COLUMNAS.map((col) => `<td>${escapeHtml(formatValor(col.clave, bono[col.clave]))}</td>`).join('');
          const filaSinCotizacion = bono.error ? ' class="fila-sin-cotizacion"' : '';
          return `<tr${filaSinCotizacion}>${celdas}</tr>`;
        })
        .join('');
      return filaSeccion + filasBonos;
    })
    .join('');

  tablaWrap.innerHTML = `
    <table class="tabla-excel">
      <thead>
        <tr>${COLUMNAS.map((col) => `<th>${col.titulo}</th>`).join('')}</tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;
}

function actualizarBadge(actualizadoA) {
  const hora = actualizadoA.toLocaleTimeString('es-AR');
  badgeActualizado.textContent = `Actualizado ${hora} · se refresca solo cada 20 s`;
  badgeActualizado.title = actualizadoA.toLocaleString('es-AR');
}

async function refrescarCotizaciones({ silencioso = false } = {}) {
  if (!preparado || actualizandoAhora) return;
  actualizandoAhora = true;
  if (!silencioso) mostrarMensaje('Actualizando cotizaciones…');

  try {
    const { bonos, mep, actualizadoA } = await recalcularConVivo(preparado);
    renderTabla(bonos);
    const conCotizacion = bonos.filter((b) => !b.error).length;
    infoResultado.textContent =
      `${conCotizacion} de ${bonos.length} ONs con cotización en vivo · ` +
      `MEP (AL30): ${mep.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
    actualizarBadge(actualizadoA);
    if (!silencioso) mostrarMensaje('', '');
  } catch (error) {
    console.error(error);
    mostrarMensaje(error.message || 'No se pudo actualizar la cotización. Reintento en 20 s.', 'error');
  } finally {
    actualizandoAhora = false;
  }
}

function iniciarActualizacionAutomatica() {
  if (intervaloActualizacion) clearInterval(intervaloActualizacion);
  intervaloActualizacion = setInterval(() => refrescarCotizaciones({ silencioso: true }), INTERVALO_ACTUALIZACION_MS);
}

function mostrarVistaCargada() {
  tarjetaCarga.classList.add('oculto');
  barraActualizacion.classList.remove('oculto');
  resultado.classList.remove('oculto');
}

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje('Leyendo "Corporativos"…');
  resultado.classList.add('oculto');
  if (intervaloActualizacion) clearInterval(intervaloActualizacion);
  preparado = null;

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    preparado = await prepararMonitorCorporativos(arrayBuffer);
    mostrarVistaCargada();
    await refrescarCotizaciones();
    iniciarActualizacionAutomatica();
  } catch (error) {
    console.error(error);
    preparado = null;
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

inputArchivoActualizar.addEventListener('change', () => {
  const archivo = inputArchivoActualizar.files[0];
  if (!archivo) return;
  tarjetaCarga.classList.remove('oculto');
  barraActualizacion.classList.add('oculto');
  manejarArchivo(archivo);
});
