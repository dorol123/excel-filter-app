/*
 * UI del Comparador de ONs. Toda la lectura del archivo pasa por
 * ons-motor.js (100% en el navegador); acá sólo se muestran los datos.
 *
 * Los datos cargados se guardan en localStorage (STORAGE_KEY) para no tener
 * que volver a subir el archivo en cada visita — nunca salen del navegador,
 * es el mismo mecanismo que sessionStorage en beta-gate.js, sólo que
 * persiste entre sesiones.
 */

const STORAGE_KEY = 'ons-datos-v1';
const DOS_HORAS_MS = 2 * 60 * 60 * 1000;

let bonosCargados = [];
let actualizadoAActual = null;
let guardadoEn = null;

const ETIQUETA_MONEDA = { MEP: 'Dólar MEP', Cable: 'Dólar Cable' };
const ETIQUETA_MOTIVO = {
  sin_liquidez: 'Sin ofertas activas',
  brecha_alta: 'Brecha Bid/Último alta',
};

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const inputArchivoActualizar = document.getElementById('archivo-actualizar');
const mensaje = document.getElementById('mensaje');
const resultado = document.getElementById('resultado');
const notaActualizacion = document.getElementById('nota-actualizacion');
const tarjetaCarga = document.getElementById('tarjeta-carga');
const barraActualizacion = document.getElementById('barra-actualizacion');
const badgeActualizado = document.getElementById('badge-actualizado');

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

// ---------- Persistencia local (localStorage) ----------

function guardarEnStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ bonos: bonosCargados, actualizadoA: actualizadoAActual, guardadoEn })
    );
  } catch (error) {
    console.error('No se pudo guardar en localStorage:', error);
  }
}

function leerDeStorage() {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos.bonos) || datos.bonos.length === 0) return null;
    return datos;
  } catch (error) {
    console.error('No se pudo leer localStorage:', error);
    return null;
  }
}

function formatHaceTiempo(timestampMs) {
  const segundos = Math.floor((Date.now() - timestampMs) / 1000);
  if (segundos < 60) return 'hace instantes';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} minuto${minutos === 1 ? '' : 's'}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} hora${horas === 1 ? '' : 's'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

function actualizarBadgeFrescura() {
  if (!guardadoEn) {
    barraActualizacion.classList.add('oculto');
    return;
  }
  barraActualizacion.classList.remove('oculto');
  const vencido = Date.now() - guardadoEn > DOS_HORAS_MS;
  badgeActualizado.textContent = `Actualizado ${formatHaceTiempo(guardadoEn)}`;
  badgeActualizado.classList.toggle('vencido', vencido);
  badgeActualizado.title = new Date(guardadoEn).toLocaleString('es-AR');
}

setInterval(actualizarBadgeFrescura, 30000);

// ---------- Carga y procesamiento del archivo ----------

function mostrarVistaCargada() {
  tarjetaCarga.classList.add('oculto');
  resultado.classList.remove('oculto');
  actualizarBadgeFrescura();
}

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje('Procesando…');

  try {
    const arrayBuffer = await archivo.arrayBuffer();
    const { bonos, actualizadoA } = await procesarOns(arrayBuffer);
    if (bonos.length === 0) {
      mostrarMensaje('No se encontraron ONs en el archivo.', 'error');
      return;
    }
    bonosCargados = bonos;
    actualizadoAActual = actualizadoA;
    guardadoEn = Date.now();
    guardarEnStorage();

    notaActualizacion.textContent = actualizadoA ? `Datos de mercado: ${actualizadoA}` : '';

    poblarCalificaciones();
    poblarTickers();
    renderRanking();
    mostrarVistaCargada();

    const excluidos = bonos.filter((b) => calcularMotivoExclusion(b, umbralBrechaRanking())).length;
    mostrarMensaje(
      `${bonos.length} ONs cargadas (${excluidos} sin TIR confiable: sin ofertas o con brecha Bid/Último alta).`,
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
inputArchivoActualizar.addEventListener('change', () => {
  manejarArchivo(inputArchivoActualizar.files[0]);
  inputArchivoActualizar.value = '';
});

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
const inputUmbralBrechaRanking = document.getElementById('ranking-umbral-brecha');
const tablaRanking = document.getElementById('tabla-ranking');
const detalleExcluidos = document.getElementById('detalle-excluidos-ranking');
const resumenExcluidos = document.getElementById('resumen-excluidos-ranking');
const tablaExcluidos = document.getElementById('tabla-excluidos-ranking');

function umbralBrechaRanking() {
  const valor = parseFloat(inputUmbralBrechaRanking.value);
  return Number.isFinite(valor) ? valor / 100 : UMBRAL_BRECHA_BID_DEFECTO;
}

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

function filasTablaBonos(bonos, { mostrarMotivo = false } = {}) {
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
        ${mostrarMotivo ? `<td>${motivoTexto(b)}</td>` : ''}
      </tr>`
    )
    .join('');
  return `
    <table class="tabla-excel">
      <thead>
        <tr>
          <th>Ticker</th><th>Emisor</th><th>Moneda</th><th>Calif.</th><th>Ley</th>
          <th>TIR</th><th>Duration</th><th>Paridad</th>
          ${mostrarMotivo ? '<th>Motivo</th>' : ''}
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function motivoTexto(bono) {
  const etiqueta = ETIQUETA_MOTIVO[bono.motivoExclusion] || bono.motivoExclusion;
  if (bono.motivoExclusion === 'brecha_alta') {
    return `${etiqueta} (${formatPorcentaje(bono.brechaBid)})`;
  }
  return etiqueta;
}

function renderRanking() {
  const filtros = {
    moneda: selectMoneda.value || undefined,
    calificacionMinima: selectCalificacion.value || undefined,
    durationMin: inputDurationMin.value === '' ? undefined : parseFloat(inputDurationMin.value),
    durationMax: inputDurationMax.value === '' ? undefined : parseFloat(inputDurationMax.value),
    umbralBrecha: umbralBrechaRanking(),
  };
  const { resultados, excluidos } = rankearBonos(bonosCargados, filtros);
  tablaRanking.innerHTML = filasTablaBonos(resultados);

  if (excluidos.length > 0) {
    detalleExcluidos.classList.remove('oculto');
    resumenExcluidos.textContent = `Ver ${excluidos.length} bono(s) excluidos del ranking (TIR poco confiable)`;
    tablaExcluidos.innerHTML = filasTablaBonos(excluidos, { mostrarMotivo: true });
  } else {
    detalleExcluidos.classList.add('oculto');
  }
}

[selectMoneda, selectCalificacion, inputDurationMin, inputDurationMax, inputUmbralBrechaRanking].forEach(
  (el) => el.addEventListener('input', renderRanking)
);

// ---------- Sugerencias por ticker ----------

const inputTicker = document.getElementById('sugerencias-ticker');
const referenciaInfo = document.getElementById('referencia-info');
const referenciaMensaje = document.getElementById('referencia-mensaje');
const controlesSugerencia = document.getElementById('controles-sugerencia');
const modoSugerencia = document.getElementById('modo-sugerencia');
const campoToleranciaDuration = document.getElementById('campo-tolerancia-duration');
const campoToleranciaTir = document.getElementById('campo-tolerancia-tir');
const inputToleranciaDuration = document.getElementById('tolerancia-duration');
const inputToleranciaTir = document.getElementById('tolerancia-tir');
const campoCalificacionSimilar = document.getElementById('campo-calificacion-similar');
const selectCalificacionSimilar = document.getElementById('calificacion-similar');
const inputUmbralBrechaSugerencias = document.getElementById('sugerencias-umbral-brecha');
const tablaSugerencias = document.getElementById('tabla-sugerencias');
const etiquetaToleranciaDuration = document.getElementById('etiqueta-tolerancia-duration');
const notaModoSugerencia = document.getElementById('nota-modo-sugerencia');

const CONFIG_MODOS = {
  subirTir: {
    mostrarToleranciaDuration: true,
    mostrarToleranciaTir: false,
    mostrarCalificacion: true,
    etiquetaToleranciaDuration: 'Duration adicional permitida (años)',
    nota: 'Misma calificación (o similar), buscando más TIR a cambio de algo más de duration.',
  },
  bajarDuration: {
    mostrarToleranciaDuration: false,
    mostrarToleranciaTir: true,
    mostrarCalificacion: true,
    etiquetaToleranciaDuration: '',
    nota: 'Misma calificación (o similar), buscando menos duration resignando algo de TIR.',
  },
  subirCalificacion: {
    mostrarToleranciaDuration: true,
    mostrarToleranciaTir: true,
    mostrarCalificacion: false,
    etiquetaToleranciaDuration: 'Diferencia de duration admitida (años)',
    nota: 'Calificación mejor a la de esta ON, con duration parecida, resignando como máximo la TIR indicada.',
  },
  mejorRelacion: {
    mostrarToleranciaDuration: false,
    mostrarToleranciaTir: false,
    mostrarCalificacion: true,
    etiquetaToleranciaDuration: '',
    nota: 'Misma calificación (o similar), con mejor TIR por cada año de duration que esta ON (más rendimiento por riesgo).',
  },
};

let modoActual = 'subirTir';

function aplicarConfigModo(modo) {
  const config = CONFIG_MODOS[modo];
  campoToleranciaDuration.classList.toggle('oculto', !config.mostrarToleranciaDuration);
  campoToleranciaTir.classList.toggle('oculto', !config.mostrarToleranciaTir);
  campoCalificacionSimilar.classList.toggle('oculto', !config.mostrarCalificacion);
  if (config.etiquetaToleranciaDuration) {
    etiquetaToleranciaDuration.textContent = config.etiquetaToleranciaDuration;
  }
  notaModoSugerencia.textContent = config.nota;
}

function umbralBrechaSugerencias() {
  const valor = parseFloat(inputUmbralBrechaSugerencias.value);
  return Number.isFinite(valor) ? valor / 100 : UMBRAL_BRECHA_BID_DEFECTO;
}

// Mismas ONs cargadas, pero ordenadas de peor a mejor promedio entre
// calificación, duration y TIR (ver ordenarPorPeorPromedio en ons-motor.js),
// para que el desplegable del ticker las muestre en ese orden.
let bonosPeorPrimero = [];

function poblarTickers() {
  bonosPeorPrimero = ordenarPorPeorPromedio(bonosCargados);
}

function bonoPorTicker(ticker) {
  const buscado = ticker.trim().toUpperCase();
  return bonosCargados.find((b) => b.ticker.toUpperCase() === buscado);
}

// ---------- Desplegable de tickers (peor promedio primero) ----------

const listaSugerenciasTicker = document.getElementById('lista-sugerencias-ticker');
const MAX_SUGERENCIAS_TICKER = 8;

let sugerenciasTickerRenderizadas = [];
let sugerenciaTickerActivaIndice = -1;

function buscarTickers(query) {
  const texto = query.trim().toUpperCase();
  const candidatos = !texto
    ? bonosPeorPrimero
    : bonosPeorPrimero.filter((b) => {
        const haystack = `${b.ticker} ${b.emisor ?? ''}`.toUpperCase();
        return haystack.includes(texto);
      });
  return candidatos.slice(0, MAX_SUGERENCIAS_TICKER);
}

function ocultarListaTickers() {
  listaSugerenciasTicker.classList.add('oculto');
  listaSugerenciasTicker.innerHTML = '';
  sugerenciasTickerRenderizadas = [];
  sugerenciaTickerActivaIndice = -1;
}

function elegirTicker(bono) {
  inputTicker.value = bono.ticker;
  ocultarListaTickers();
  renderSugerencias();
}

function marcarTickerActivo(indice) {
  sugerenciaTickerActivaIndice = indice;
  const items = listaSugerenciasTicker.querySelectorAll('.sugerencia-item');
  items.forEach((item, i) => item.classList.toggle('activa', i === indice));
}

function renderListaTickers(query) {
  if (bonosPeorPrimero.length === 0) {
    ocultarListaTickers();
    return;
  }

  const resultados = buscarTickers(query);
  sugerenciasTickerRenderizadas = resultados;
  sugerenciaTickerActivaIndice = -1;
  listaSugerenciasTicker.innerHTML = '';

  if (resultados.length === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'sugerencia-vacia';
    vacio.textContent = 'Sin coincidencias.';
    listaSugerenciasTicker.appendChild(vacio);
    listaSugerenciasTicker.classList.remove('oculto');
    return;
  }

  resultados.forEach((bono) => {
    const item = document.createElement('div');
    item.className = 'sugerencia-item';

    const ticker = document.createElement('span');
    ticker.className = 'sugerencia-ticker';
    ticker.textContent = bono.ticker;

    const nombre = document.createElement('span');
    nombre.className = 'sugerencia-nombre';
    nombre.textContent = bono.emisor || '';

    item.appendChild(ticker);
    item.appendChild(nombre);

    if (Number.isFinite(bono.tir)) {
      const tir = document.createElement('span');
      tir.className = 'sugerencia-tir';
      tir.textContent = formatPorcentaje(bono.tir);
      item.appendChild(tir);
    }

    const calificacion = document.createElement('span');
    calificacion.className = 'sugerencia-categoria';
    calificacion.textContent = bono.calificacion || '—';
    item.appendChild(calificacion);

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      elegirTicker(bono);
    });

    listaSugerenciasTicker.appendChild(item);
  });

  listaSugerenciasTicker.classList.remove('oculto');
}

inputTicker.addEventListener('focus', () => renderListaTickers(inputTicker.value));
inputTicker.addEventListener('click', () => renderListaTickers(inputTicker.value));
inputTicker.addEventListener('input', () => renderListaTickers(inputTicker.value));

inputTicker.addEventListener('keydown', (e) => {
  if (listaSugerenciasTicker.classList.contains('oculto') || sugerenciasTickerRenderizadas.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    marcarTickerActivo(Math.min(sugerenciaTickerActivaIndice + 1, sugerenciasTickerRenderizadas.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    marcarTickerActivo(Math.max(sugerenciaTickerActivaIndice - 1, 0));
  } else if (e.key === 'Enter' && sugerenciaTickerActivaIndice >= 0) {
    e.preventDefault();
    elegirTicker(sugerenciasTickerRenderizadas[sugerenciaTickerActivaIndice]);
  } else if (e.key === 'Escape') {
    ocultarListaTickers();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.campo-ticker')) ocultarListaTickers();
});

function renderReferencia(bono) {
  const aviso = bono.motivoExclusion
    ? ` <strong>— ${motivoTexto(bono)}: su TIR puede no ser confiable.</strong>`
    : '';
  referenciaInfo.classList.remove('oculto');
  referenciaInfo.innerHTML = `
    <strong>${bono.ticker}</strong> — ${bono.emisor ?? ''} ·
    ${ETIQUETA_MONEDA[bono.moneda] || bono.moneda || ''} · Calificación ${bono.calificacion ?? '—'} ·
    TIR ${formatPorcentaje(bono.tir)} · Duration ${formatDuration(bono.duration)}${aviso}`;
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

  const referenciaBase = bonoPorTicker(ticker);
  if (!referenciaBase) {
    referenciaInfo.classList.add('oculto');
    controlesSugerencia.classList.add('oculto');
    mensajeEn(referenciaMensaje, 'No se encontró esa ON. Elegí un ticker de la lista.', 'error');
    return;
  }
  mensajeEn(referenciaMensaje, '', '');
  controlesSugerencia.classList.remove('oculto');

  const opciones = {
    toleranciaDuration: parseFloat(inputToleranciaDuration.value) || 0,
    toleranciaTir: (parseFloat(inputToleranciaTir.value) || 0) / 100,
    calificacionSimilar: selectCalificacionSimilar.value === 'si',
    umbralBrecha: umbralBrechaSugerencias(),
  };

  try {
    const { referencia, candidatos } = sugerirAlternativas(
      bonosCargados,
      referenciaBase.ticker,
      modoActual,
      opciones
    );
    renderReferencia(referencia);
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
  aplicarConfigModo(modoActual);
  renderSugerencias();
});

aplicarConfigModo(modoActual);

[
  inputTicker,
  inputToleranciaDuration,
  inputToleranciaTir,
  selectCalificacionSimilar,
  inputUmbralBrechaSugerencias,
].forEach((el) => el.addEventListener('input', renderSugerencias));

// ---------- Carga inicial: datos guardados en este navegador ----------

(function inicializar() {
  const guardado = leerDeStorage();
  if (!guardado) return;
  bonosCargados = guardado.bonos;
  actualizadoAActual = guardado.actualizadoA;
  guardadoEn = guardado.guardadoEn;

  notaActualizacion.textContent = actualizadoAActual ? `Datos de mercado: ${actualizadoAActual}` : '';
  poblarCalificaciones();
  poblarTickers();
  renderRanking();
  mostrarVistaCargada();
})();
