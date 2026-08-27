/*
 * UI de la Calculadora de ONs. La lectura del archivo y el recálculo de
 * TIR/duration pasan por ons-motor.js (100% en el navegador); acá sólo se
 * muestran los datos. A diferencia del Comparador de ONs, esta herramienta
 * no guarda nada entre visitas: necesita el archivo cargado en memoria para
 * poder abrir la hoja de cualquier ON que se elija, así que cada visita
 * pide subirlo de nuevo.
 */

let arrayBufferActual = null;
let bonosCargados = [];
let datosCalculadoraActuales = null;

const ETIQUETA_MONEDA = { MEP: 'Dólar MEP', Cable: 'Dólar Cable' };

const dropzone = document.getElementById('dropzone');
const textoDropzone = document.getElementById('texto-dropzone');
const inputArchivo = document.getElementById('archivo');
const mensaje = document.getElementById('mensaje');
const fieldsetTicker = document.getElementById('fieldset-ticker');
const tickerInput = document.getElementById('ticker-input');
const listaTickers = document.getElementById('lista-tickers');
const tickerMensaje = document.getElementById('ticker-mensaje');
const resultado = document.getElementById('resultado');
const resultadoTitulo = document.getElementById('resultado-titulo');
const datosBono = document.getElementById('datos-bono');
const inputPrecio = document.getElementById('input-precio');
const inputNominales = document.getElementById('input-nominales');
const btnPrecioMercado = document.getElementById('btn-precio-mercado');
const calcResultados = document.getElementById('calc-resultados');
const tablaFlujo = document.getElementById('tabla-flujo');

function mostrarMensaje(el, texto, tipo) {
  el.textContent = texto;
  el.className = 'mensaje' + (tipo ? ` ${tipo}` : '');
}

function formatPorcentaje(valor) {
  if (!Number.isFinite(valor)) return '—';
  return `${(valor * 100).toFixed(2)}%`;
}

function formatDuration(valor) {
  if (!Number.isFinite(valor)) return '—';
  return `${valor.toFixed(2)} a.`;
}

function formatNumero(valor, decimales = 2) {
  if (!Number.isFinite(valor)) return '—';
  return valor.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function formatFecha(fecha) {
  if (!(fecha instanceof Date)) return '—';
  return fecha.toLocaleDateString('es-AR');
}

// ---------- Carga del archivo ----------

async function manejarArchivo(archivo) {
  if (!archivo) return;
  textoDropzone.textContent = archivo.name;
  dropzone.classList.add('con-archivo');
  mostrarMensaje(mensaje, 'Procesando…');
  resultado.classList.add('oculto');
  fieldsetTicker.classList.add('oculto');

  try {
    arrayBufferActual = await archivo.arrayBuffer();
    const { bonos } = await procesarOns(arrayBufferActual);
    if (bonos.length === 0) {
      mostrarMensaje(mensaje, 'No se encontraron ONs en el archivo.', 'error');
      return;
    }
    bonosCargados = bonos;
    listaTickers.innerHTML = bonos.map((b) => `<option value="${b.ticker}">${b.emisor ?? ''}</option>`).join('');
    fieldsetTicker.classList.remove('oculto');
    mostrarMensaje(mensaje, `${bonos.length} ONs disponibles. Elegí un ticker para calcular.`, 'exito');
    tickerInput.focus();
  } catch (error) {
    console.error(error);
    mostrarMensaje(mensaje, error.message || 'No se pudo procesar el archivo.', 'error');
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

// ---------- Selección de ticker y cálculo ----------

function bonoPorTicker(ticker) {
  const buscado = ticker.trim().toUpperCase();
  return bonosCargados.find((b) => b.ticker.toUpperCase() === buscado);
}

async function seleccionarTicker(ticker) {
  const bono = bonoPorTicker(ticker);
  if (!bono) {
    resultado.classList.add('oculto');
    mostrarMensaje(tickerMensaje, 'No se encontró esa ON. Elegí un ticker de la lista.', 'error');
    return;
  }
  mostrarMensaje(tickerMensaje, 'Cargando calculadora…', '');

  try {
    datosCalculadoraActuales = await cargarDatosCalculadora(arrayBufferActual, bono.ticker);
    mostrarMensaje(tickerMensaje, '', '');
    resultadoTitulo.textContent = `${datosCalculadoraActuales.ticker} — ${datosCalculadoraActuales.estatico.emisor ?? ''}`;
    renderDatosBono(datosCalculadoraActuales);
    inputPrecio.value = datosCalculadoraActuales.precioMercado.toFixed(2);
    inputNominales.value = datosCalculadoraActuales.nominalesOriginal;
    resultado.classList.remove('oculto');
    recalcularYRenderizar();
  } catch (error) {
    console.error(error);
    resultado.classList.add('oculto');
    mostrarMensaje(tickerMensaje, error.message || 'No se pudo cargar esa ON.', 'error');
  }
}

let temporizadorTicker = null;
tickerInput.addEventListener('input', () => {
  clearTimeout(temporizadorTicker);
  const ticker = tickerInput.value.trim();
  if (!ticker) {
    resultado.classList.add('oculto');
    mostrarMensaje(tickerMensaje, '', '');
    return;
  }
  temporizadorTicker = setTimeout(() => seleccionarTicker(ticker), 250);
});

// ---------- Render ----------

function filaDato(etiqueta, valor) {
  return `<div class="calc-dato"><span class="calc-dato-etiqueta">${etiqueta}</span><span class="calc-dato-valor">${valor}</span></div>`;
}

function renderDatosBono(datos) {
  const e = datos.estatico;
  datosBono.innerHTML = `
    ${filaDato('Emisor', e.emisor ?? '—')}
    ${filaDato('Sector', e.sector ?? '—')}
    ${filaDato('Calificación', e.calificacion ?? '—')}
    ${filaDato('Moneda de cobro', e.monedaCobro ?? '—')}
    ${filaDato('Ley', e.ley ?? '—')}
    ${filaDato('Tipo de tasa', e.tipoTasa ?? '—')}
    ${filaDato('Interés anual', formatPorcentaje(e.interesAnual))}
    ${filaDato('Frecuencia de cobro', e.frecuencia ?? '—')}
    ${filaDato('Base de cálculo', e.baseCalculo ?? '—')}
    ${filaDato('Amortización', e.amortizacionTexto ?? '—')}
    ${filaDato('Fecha de emisión', formatFecha(e.fechaEmision))}
    ${filaDato('Fecha de vencimiento', formatFecha(e.fechaVencimiento))}
    ${filaDato('Nominales mínimos', formatNumero(e.nominalesMinimos, 0))}
    ${filaDato('Liquidación', formatFecha(datos.fechaLiquidacion))}
  `;
}

function renderResultados(res) {
  calcResultados.innerHTML = `
    ${filaDato('TIR efectiva', formatPorcentaje(res.tir))}
    ${filaDato('TIR nominal', formatPorcentaje(res.tirNominal))}
    ${filaDato('Current yield', formatPorcentaje(res.currentYield))}
    ${filaDato('Duration', formatDuration(res.duration))}
    ${filaDato('Mod. duration', formatDuration(res.modDuration))}
    ${filaDato('Paridad', formatNumero(res.paridad, 4))}
    ${filaDato('Valor técnico', formatNumero(res.valorTecnico))}
    ${filaDato('Intereses corridos', formatNumero(res.interesesCorridos))}
    ${filaDato('A finish', formatPorcentaje(res.aFinishPct))}
    ${filaDato('Precio total pagado', formatNumero(-res.precioTotal))}
    ${filaDato('Change in price (aprox.)', formatPorcentaje(res.changeInPrice))}
  `;

  if (res.flujos.length === 0) {
    tablaFlujo.innerHTML = '<p class="tabla-vacia">Sin flujo de pagos futuro.</p>';
    return;
  }
  const filas = res.flujos
    .map(
      (f) => `
      <tr>
        <td>${formatFecha(f.fecha)}</td>
        <td class="columna-importe">${formatNumero(f.amortizacionUsd)}</td>
        <td class="columna-importe">${formatNumero(f.interesUsd)}</td>
        <td class="columna-importe">${formatNumero(f.total)}</td>
      </tr>`
    )
    .join('');
  tablaFlujo.innerHTML = `
    <table class="tabla-excel">
      <thead>
        <tr><th>Fecha</th><th>Amortización</th><th>Interés</th><th>Total</th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function recalcularYRenderizar() {
  if (!datosCalculadoraActuales) return;
  const precio = parseFloat(inputPrecio.value);
  const nominales = parseFloat(inputNominales.value);
  try {
    const res = recalcularCalculadora(datosCalculadoraActuales, {
      precio: Number.isFinite(precio) ? precio : undefined,
      nominales: Number.isFinite(nominales) ? nominales : undefined,
    });
    renderResultados(res);
  } catch (error) {
    calcResultados.innerHTML = `<p class="tabla-vacia">${error.message}</p>`;
    tablaFlujo.innerHTML = '';
  }
}

inputPrecio.addEventListener('input', recalcularYRenderizar);
inputNominales.addEventListener('input', recalcularYRenderizar);

btnPrecioMercado.addEventListener('click', () => {
  if (!datosCalculadoraActuales) return;
  inputPrecio.value = datosCalculadoraActuales.precioMercado.toFixed(2);
  recalcularYRenderizar();
});
