/*
 * UI del Comparador de ONs. Toda la lectura del archivo pasa por
 * ons-motor.js (100% en el navegador); acá sólo se muestran los datos.
 */

let bonosCargados = [];

const ETIQUETA_MONEDA = { MEP: 'Dólar MEP', Cable: 'Dólar Cable' };

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const mensaje = document.getElementById('mensaje');
const resultado = document.getElementById('resultado');
const notaActualizacion = document.getElementById('nota-actualizacion');

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function formatPorcentaje(valor) {
  if (!Number.isFinite(valor)) return '—';
  return `${(valor * 100).toFixed(2)}%`;
}

function formatDuration(valor) {
  if (!Number.isFinite(valor)) return '—';
  return `${valor.toFixed(2)} a.`;
}

function formatPrecio(valor) {
  if (!Number.isFinite(valor)) return '—';
  return valor.toFixed(3);
}

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje('Procesando…');
  resultado.classList.add('oculto');

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    const { bonos, actualizadoA } = await procesarOns(arrayBuffer);
    if (bonos.length === 0) {
      mostrarMensaje('No se encontraron ONs en el archivo.', 'error');
      return;
    }
    bonosCargados = bonos;
    notaActualizacion.textContent = actualizadoA
      ? `Precios: ${actualizadoA}`
      : '';

    poblarCalificaciones();
    poblarTickers();
    renderRanking();
    resultado.classList.remove('oculto');

    const iliquidos = bonos.filter((b) => !b.liquido).length;
    mostrarMensaje(
      `${bonos.length} ONs cargadas (${iliquidos} sin ofertas activas en el feed de mercado).`,
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

// ---------- Tabs principales ----------

const tabsPrincipal = document.getElementById('tabs-principal');
const panelRanking = document.getElementById('panel-ranking');
const panelSugerencias = document.getElementById('panel-sugerencias');

tabsPrincipal.addEventListener('click', (e) => {
  const boton = e.target.closest('.tab');
  if (!boton) return;
  tabsPrincipal.querySelectorAll('.tab').forEach((t) => t.classList.remove('activa'));
  boton.classList.add('activa');
  const esRanking = boton.dataset.tab === 'ranking';
  panelRanking.classList.toggle('oculto', !esRanking);
  panelSugerencias.classList.toggle('oculto', esRanking);
});

// ---------- Ranking por características ----------

const selectMoneda = document.getElementById('ranking-moneda');
const selectCalificacion = document.getElementById('ranking-calificacion');
const inputDurationMin = document.getElementById('ranking-duration-min');
const inputDurationMax = document.getElementById('ranking-duration-max');
const tablaRanking = document.getElementById('tabla-ranking');
const detalleExcluidos = document.getElementById('detalle-excluidos-ranking');
const resumenExcluidos = document.getElementById('resumen-excluidos-ranking');
const tablaExcluidos = document.getElementById('tabla-excluidos-ranking');

function poblarCalificaciones() {
  const presentes = new Set(bonosCargados.map((b) => b.calificacion).filter(Boolean));
  const ordenadas = ESCALA_CALIFICACION.filter((c) => presentes.has(c));
  selectCalificacion.innerHTML = '<option value="">Cualquiera</option>';
  for (const calificacion of ordenadas) {
    const opcion = document.createElement('option');
    opcion.value = calificacion;
    opcion.textContent = calificacion;
    selectCalificacion.appendChild(opcion);
  }
}

function filasTablaBonos(bonos) {
  if (bonos.length === 0) {
    return '<p class="tabla-vacia">No hay ONs que cumplan estos filtros.</p>';
  }
  const filas = bonos
    .map(
      (b) => `
      <tr>
        <td>${b.ticker}</td>
        <td>${b.emisor ?? ''}</td>
        <td>${ETIQUETA_MONEDA[b.moneda] || b.moneda || ''}</td>
        <td>${b.calificacion ?? ''}</td>
        <td>${b.ley ?? ''}</td>
        <td class="columna-importe">${formatPorcentaje(b.tir)}</td>
        <td class="columna-importe">${formatDuration(b.duration)}</td>
        <td class="columna-importe">${formatPrecio(b.paridad)}</td>
      </tr>`
    )
    .join('');
  return `
    <table class="tabla-excel">
      <thead>
        <tr>
          <th>Ticker</th><th>Emisor</th><th>Moneda</th><th>Calif.</th><th>Ley</th>
          <th>TIR</th><th>Duration</th><th>Paridad</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function renderRanking() {
  const filtros = {
    moneda: selectMoneda.value || undefined,
    calificacionMinima: selectCalificacion.value || undefined,
    durationMin: inputDurationMin.value === '' ? undefined : parseFloat(inputDurationMin.value),
    durationMax: inputDurationMax.value === '' ? undefined : parseFloat(inputDurationMax.value),
  };
  const { resultados, excluidosPorLiquidez } = rankearBonos(bonosCargados, filtros);
  tablaRanking.innerHTML = filasTablaBonos(resultados);

  if (excluidosPorLiquidez.length > 0) {
    detalleExcluidos.classList.remove('oculto');
    resumenExcluidos.textContent = `Ver ${excluidosPorLiquidez.length} bono(s) sin liquidez excluidos del ranking`;
    tablaExcluidos.innerHTML = filasTablaBonos(excluidosPorLiquidez);
  } else {
    detalleExcluidos.classList.add('oculto');
  }
}

[selectMoneda, selectCalificacion, inputDurationMin, inputDurationMax].forEach((el) =>
  el.addEventListener('input', renderRanking)
);

// ---------- Sugerencias por ticker ----------

const inputTicker = document.getElementById('sugerencias-ticker');
const listaTickers = document.getElementById('lista-tickers');
const referenciaInfo = document.getElementById('referencia-info');
const referenciaMensaje = document.getElementById('referencia-mensaje');
const controlesSugerencia = document.getElementById('controles-sugerencia');
const modoSugerencia = document.getElementById('modo-sugerencia');
const campoToleranciaDuration = document.getElementById('campo-tolerancia-duration');
const campoToleranciaTir = document.getElementById('campo-tolerancia-tir');
const inputToleranciaDuration = document.getElementById('tolerancia-duration');
const inputToleranciaTir = document.getElementById('tolerancia-tir');
const selectCalificacionSimilar = document.getElementById('calificacion-similar');
const tablaSugerencias = document.getElementById('tabla-sugerencias');

let modoActual = 'subirTir';

function poblarTickers() {
  listaTickers.innerHTML = bonosCargados
    .map((b) => `<option value="${b.ticker}">${b.emisor ?? ''}</option>`)
    .join('');
}

function bonoPorTicker(ticker) {
  const buscado = ticker.trim().toUpperCase();
  return bonosCargados.find((b) => b.ticker.toUpperCase() === buscado);
}

function renderReferencia(bono) {
  const avisoLiquidez = bono.liquido
    ? ''
    : ' <strong>— sin ofertas activas: su TIR puede no ser confiable.</strong>';
  referenciaInfo.classList.remove('oculto');
  referenciaInfo.innerHTML = `
    <strong>${bono.ticker}</strong> — ${bono.emisor ?? ''} ·
    ${ETIQUETA_MONEDA[bono.moneda] || bono.moneda || ''} · Calificación ${bono.calificacion ?? '—'} ·
    TIR ${formatPorcentaje(bono.tir)} · Duration ${formatDuration(bono.duration)}${avisoLiquidez}`;
}

function renderTablaSugerencias(referencia, candidatos) {
  if (candidatos.length === 0) {
    tablaSugerencias.innerHTML = '<p class="tabla-vacia">No se encontraron alternativas con estos criterios.</p>';
    return;
  }
  const filas = candidatos
    .map((b) => {
      const deltaTir = b.tir - referencia.tir;
      const deltaDuration = b.duration - referencia.duration;
      return `
      <tr>
        <td>${b.ticker}</td>
        <td>${b.emisor ?? ''}</td>
        <td>${b.calificacion ?? ''}</td>
        <td class="columna-importe">${formatPorcentaje(b.tir)}</td>
        <td class="columna-importe">${deltaTir >= 0 ? '+' : ''}${formatPorcentaje(deltaTir)}</td>
        <td class="columna-importe">${formatDuration(b.duration)}</td>
        <td class="columna-importe">${deltaDuration >= 0 ? '+' : ''}${formatDuration(deltaDuration)}</td>
      </tr>`;
    })
    .join('');
  tablaSugerencias.innerHTML = `
    <table class="tabla-excel">
      <thead>
        <tr>
          <th>Ticker</th><th>Emisor</th><th>Calif.</th>
          <th>TIR</th><th>Δ TIR</th><th>Duration</th><th>Δ Duration</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function renderSugerencias() {
  const ticker = inputTicker.value.trim();
  if (!ticker) {
    referenciaInfo.classList.add('oculto');
    controlesSugerencia.classList.add('oculto');
    referenciaMensaje.textContent = '';
    return;
  }

  const referencia = bonoPorTicker(ticker);
  if (!referencia) {
    referenciaInfo.classList.add('oculto');
    controlesSugerencia.classList.add('oculto');
    mensajeEn(referenciaMensaje, 'No se encontró esa ON. Elegí un ticker de la lista.', 'error');
    return;
  }
  mensajeEn(referenciaMensaje, '', '');
  renderReferencia(referencia);
  controlesSugerencia.classList.remove('oculto');

  const opciones = {
    toleranciaDuration: parseFloat(inputToleranciaDuration.value) || 0,
    toleranciaTir: (parseFloat(inputToleranciaTir.value) || 0) / 100,
    calificacionSimilar: selectCalificacionSimilar.value === 'si',
  };

  try {
    const { candidatos } = sugerirAlternativas(bonosCargados, referencia.ticker, modoActual, opciones);
    renderTablaSugerencias(referencia, candidatos);
  } catch (error) {
    tablaSugerencias.innerHTML = '';
    mensajeEn(referenciaMensaje, error.message, 'error');
  }
}

function mensajeEn(el, texto, tipo) {
  el.textContent = texto;
  el.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

modoSugerencia.addEventListener('click', (e) => {
  const boton = e.target.closest('.tab');
  if (!boton) return;
  modoSugerencia.querySelectorAll('.tab').forEach((t) => t.classList.remove('activa'));
  boton.classList.add('activa');
  modoActual = boton.dataset.modo;
  campoToleranciaDuration.classList.toggle('oculto', modoActual !== 'subirTir');
  campoToleranciaTir.classList.toggle('oculto', modoActual !== 'bajarDuration');
  renderSugerencias();
});

[inputTicker, inputToleranciaDuration, inputToleranciaTir, selectCalificacionSimilar].forEach((el) =>
  el.addEventListener('input', renderSugerencias)
);
