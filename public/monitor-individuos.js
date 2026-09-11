/*
 * UI de Monitor Individuos. La lectura del archivo, la consulta a data912 y
 * el recálculo de TIR/duration/paridad pasan por monitor-individuos-motor.js
 * (100% en el navegador); acá sólo se muestra la tabla.
 */

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const mensaje = document.getElementById('mensaje');
const resultado = document.getElementById('resultado');
const infoResultado = document.getElementById('info-resultado');
const tablaWrap = document.getElementById('tabla-wrap-monitor');

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

function renderTabla(bonos) {
  if (bonos.length === 0) {
    tablaWrap.innerHTML = '<p class="tabla-vacia">No se encontraron ONs en "Corporativos".</p>';
    return;
  }

  const filasHtml = bonos
    .map((bono) => {
      const celdas = COLUMNAS.map((col) => `<td>${formatValor(col.clave, bono[col.clave])}</td>`).join('');
      const filaSinCotizacion = bono.error ? ' class="fila-sin-cotizacion"' : '';
      return `<tr${filaSinCotizacion}>${celdas}</tr>`;
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

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje('Leyendo "Corporativos" y consultando cotizaciones en vivo…');
  resultado.classList.add('oculto');

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    const { bonos, mep, actualizadoA } = await procesarMonitorCorporativos(arrayBuffer, (hecho, total, ticker) => {
      mostrarMensaje(`Recalculando ${hecho}/${total} (${ticker})…`);
    });

    renderTabla(bonos);
    const conCotizacion = bonos.filter((b) => !b.error).length;
    const hora = actualizadoA.toLocaleTimeString('es-AR');
    infoResultado.textContent =
      `${conCotizacion} de ${bonos.length} ONs con cotización en vivo · ` +
      `MEP (AL30): ${mep.toLocaleString('es-AR', { maximumFractionDigits: 2 })} · actualizado ${hora}`;
    resultado.classList.remove('oculto');
    mostrarMensaje(`${bonos.length} ONs procesadas.`, 'exito');
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
