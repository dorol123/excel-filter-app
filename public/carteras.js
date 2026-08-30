const form = document.getElementById('form-instrumento');
const inputNombre = document.getElementById('nombre-instrumento');
const inputValor = document.getElementById('valor-instrumento');
const selectMoneda = document.getElementById('moneda-instrumento');
const mensaje = document.getElementById('mensaje-cartera');
const visor = document.getElementById('cartera-visor');
const btnVaciar = document.getElementById('btn-vaciar-cartera');
const btnDescargar = document.getElementById('btn-descargar-presentacion');

const badgeDatos = document.getElementById('badge-datos');
const inputArchivoDatos = document.getElementById('archivo-datos');
const listaSugerencias = document.getElementById('lista-sugerencias');
const panelStats = document.getElementById('panel-stats');
const statsDurationUsd = document.getElementById('stats-duration-usd');
const statsDurationArs = document.getElementById('stats-duration-ars');
const statsTirUsd = document.getElementById('stats-tir-usd');
const statsTirArs = document.getElementById('stats-tir-ars');
const statsCalificaciones = document.getElementById('stats-calificaciones');
const statsCalifLista = document.getElementById('stats-calif-lista');

function formatPorcentaje(valor) {
  if (!Number.isFinite(valor)) return '—';
  return `${(valor * 100).toFixed(2)}%`;
}

const ETIQUETA_MONEDA = { Pesos: 'Pesos', DolarMEP: 'Dólar MEP', DolarCable: 'Dólar Cable' };
const PREFIJO_MONEDA = { Pesos: '$', DolarMEP: 'US$', DolarCable: 'US$' };
const ORDEN_MONEDAS = ['Pesos', 'DolarMEP', 'DolarCable'];

// Paleta categórica validada (dataviz): identidad de instrumento, no magnitud.
const PALETA_INSTRUMENTOS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];

let instrumentos = [];
let siguienteId = 1;
let nombreCliente = '';
let mostrarInputCliente = false;

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje' + (tipo ? ' ' + tipo : '');
}

// ---------- Datos de mercado (Monitor de instrumentos), 100% en el navegador ----------
// Independiente del localStorage de ons.js: esta herramienta guarda su propia lista de
// instrumentos buscables por ticker/emisor, con su propio storage key.

const STORAGE_KEY_DATOS = 'carteras-datos-v2';
const DOS_HORAS_MS = 2 * 60 * 60 * 1000;

let instrumentosDisponibles = [];
let guardadoEnDatos = null;
let seleccionActual = null;
let sugerenciaActivaIndice = -1;
let sugerenciasRenderizadas = [];

function guardarDatosEnStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY_DATOS,
      JSON.stringify({ instrumentos: instrumentosDisponibles, guardadoEn: guardadoEnDatos })
    );
  } catch (error) {
    console.error('No se pudo guardar en localStorage:', error);
  }
}

function leerDatosDeStorage() {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY_DATOS);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos.instrumentos) || datos.instrumentos.length === 0) return null;
    return datos;
  } catch (error) {
    console.error('No se pudo leer localStorage:', error);
    return null;
  }
}

function formatHaceTiempoDatos(timestampMs) {
  const segundos = Math.floor((Date.now() - timestampMs) / 1000);
  if (segundos < 60) return 'hace instantes';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} minuto${minutos === 1 ? '' : 's'}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} hora${horas === 1 ? '' : 's'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

function actualizarBadgeDatos() {
  if (!guardadoEnDatos) {
    badgeDatos.textContent = 'Sin datos cargados';
    badgeDatos.className = 'badge-datos';
    return;
  }
  const vencido = Date.now() - guardadoEnDatos > DOS_HORAS_MS;
  badgeDatos.textContent = `${instrumentosDisponibles.length} instrumentos · actualizado ${formatHaceTiempoDatos(guardadoEnDatos)}`;
  badgeDatos.className = 'badge-datos ' + (vencido ? 'vencido' : 'cargado');
  badgeDatos.title = new Date(guardadoEnDatos).toLocaleString('es-AR');
}

setInterval(actualizarBadgeDatos, 30000);

(function cargarDatosGuardados() {
  const datos = leerDatosDeStorage();
  if (!datos) return;
  instrumentosDisponibles = datos.instrumentos;
  guardadoEnDatos = datos.guardadoEn;
  actualizarBadgeDatos();
})();

async function manejarArchivoDatos(archivo) {
  if (!archivo) return;
  badgeDatos.textContent = 'Procesando…';
  badgeDatos.className = 'badge-datos';
  try {
    const arrayBuffer = await archivo.arrayBuffer();
    const nuevos = await procesarInstrumentosDisponibles(arrayBuffer);
    if (nuevos.length === 0) {
      mostrarMensaje('No se encontraron instrumentos en el archivo.', 'error');
      actualizarBadgeDatos();
      return;
    }
    instrumentosDisponibles = nuevos;
    guardadoEnDatos = Date.now();
    guardarDatosEnStorage();
    actualizarBadgeDatos();
    mostrarMensaje(`${nuevos.length} instrumentos cargados para buscar.`, 'exito');
  } catch (error) {
    console.error(error);
    mostrarMensaje(error.message || 'No se pudo procesar el archivo.', 'error');
    actualizarBadgeDatos();
  }
}

inputArchivoDatos.addEventListener('change', () => {
  manejarArchivoDatos(inputArchivoDatos.files[0]);
  inputArchivoDatos.value = '';
});

// ---------- Búsqueda de instrumentos por ticker o emisor ----------

// Construido con fromCharCode (en vez de escribir el rango literal) para evitar ambigüedad
// visual entre los caracteres combinantes y su forma escapada.
const RANGO_DIACRITICOS = String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f);
const REGEX_DIACRITICOS = new RegExp('[' + RANGO_DIACRITICOS + ']', 'g');

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(REGEX_DIACRITICOS, '')
    .toLowerCase();
}

function buscarInstrumentos(query) {
  const tokens = normalizarTexto(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return instrumentosDisponibles
    .filter((inst) => {
      const haystack = normalizarTexto(`${inst.ticker} ${inst.nombre} ${inst.categoria}`);
      return tokens.every((token) => haystack.includes(token));
    })
    .slice(0, 8);
}

function ocultarSugerencias() {
  listaSugerencias.classList.add('oculto');
  listaSugerencias.innerHTML = '';
  sugerenciasRenderizadas = [];
  sugerenciaActivaIndice = -1;
}

function elegirSugerencia(inst) {
  const textoMostrado = `${inst.ticker} — ${inst.nombre}`;
  inputNombre.value = textoMostrado;
  selectMoneda.value = inst.moneda;
  seleccionActual = {
    ticker: inst.ticker,
    nombre: inst.nombre,
    categoria: inst.categoria,
    moneda: inst.moneda,
    tir: inst.tir,
    duration: inst.duration,
    calificacion: inst.calificacion,
    textoMostrado,
  };
  ocultarSugerencias();
  inputValor.focus();
}

function marcarSugerenciaActiva(indice) {
  sugerenciaActivaIndice = indice;
  const items = listaSugerencias.querySelectorAll('.sugerencia-item');
  items.forEach((item, i) => item.classList.toggle('activa', i === indice));
}

function renderSugerencias(query) {
  if (instrumentosDisponibles.length === 0 || !query.trim()) {
    ocultarSugerencias();
    return;
  }

  const resultados = buscarInstrumentos(query);
  sugerenciasRenderizadas = resultados;
  sugerenciaActivaIndice = -1;
  listaSugerencias.innerHTML = '';

  if (resultados.length === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'sugerencia-vacia';
    vacio.textContent = 'Sin coincidencias — se agrega como instrumento manual.';
    listaSugerencias.appendChild(vacio);
    listaSugerencias.classList.remove('oculto');
    return;
  }

  resultados.forEach((inst) => {
    const item = document.createElement('div');
    item.className = 'sugerencia-item';

    const ticker = document.createElement('span');
    ticker.className = 'sugerencia-ticker';
    ticker.textContent = inst.ticker;

    const nombre = document.createElement('span');
    nombre.className = 'sugerencia-nombre';
    nombre.textContent = inst.nombre || '';

    item.appendChild(ticker);
    item.appendChild(nombre);

    if (Number.isFinite(inst.tir)) {
      const tir = document.createElement('span');
      tir.className = 'sugerencia-tir';
      tir.textContent = formatPorcentaje(inst.tir);
      item.appendChild(tir);
    }

    const categoria = document.createElement('span');
    categoria.className = 'sugerencia-categoria';
    categoria.textContent = inst.categoria;
    item.appendChild(categoria);
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      elegirSugerencia(inst);
    });

    listaSugerencias.appendChild(item);
  });

  listaSugerencias.classList.remove('oculto');
}

inputNombre.addEventListener('input', () => {
  if (seleccionActual && inputNombre.value !== seleccionActual.textoMostrado) {
    seleccionActual = null;
  }
  renderSugerencias(inputNombre.value);
});

inputNombre.addEventListener('keydown', (e) => {
  if (listaSugerencias.classList.contains('oculto') || sugerenciasRenderizadas.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    marcarSugerenciaActiva(Math.min(sugerenciaActivaIndice + 1, sugerenciasRenderizadas.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    marcarSugerenciaActiva(Math.max(sugerenciaActivaIndice - 1, 0));
  } else if (e.key === 'Enter' && sugerenciaActivaIndice >= 0) {
    e.preventDefault();
    elegirSugerencia(sugerenciasRenderizadas[sugerenciaActivaIndice]);
  } else if (e.key === 'Escape') {
    ocultarSugerencias();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.campo-busqueda')) ocultarSugerencias();
});

function formatMoneda(valor, moneda) {
  const texto = valor.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${PREFIJO_MONEDA[moneda]} ${texto}`;
}

function colorInstrumento(indice) {
  return PALETA_INSTRUMENTOS[indice % PALETA_INSTRUMENTOS.length];
}

function construirEncabezadoCartera() {
  const encabezado = document.createElement('div');
  encabezado.className = 'cartera-header';

  const label = document.createElement('span');
  label.className = 'cartera-header-label';
  label.textContent = 'Cartera';
  encabezado.appendChild(label);

  const regla = document.createElement('div');
  regla.className = 'cartera-header-regla';
  encabezado.appendChild(regla);

  const zonaCliente = document.createElement('div');
  zonaCliente.className = 'cartera-cliente-zona';

  if (mostrarInputCliente) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cartera-cliente-input';
    input.placeholder = 'Nombre del cliente';
    input.value = nombreCliente;
    input.addEventListener('input', (e) => {
      nombreCliente = e.target.value;
    });
    zonaCliente.appendChild(input);
    requestAnimationFrame(() => input.focus());
  } else {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'cartera-cliente-boton';
    boton.textContent = '+ Agregar nombre del cliente';
    boton.addEventListener('click', () => {
      mostrarInputCliente = true;
      renderCartera();
    });
    zonaCliente.appendChild(boton);
  }

  encabezado.appendChild(zonaCliente);
  return encabezado;
}

function construirDona(items, total) {
  const RADIO = 49;
  const CIRC = 2 * Math.PI * RADIO;
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '120');
  svg.setAttribute('height', '120');
  svg.setAttribute('viewBox', '0 0 120 120');

  const fondo = document.createElementNS(svgNS, 'circle');
  fondo.setAttribute('cx', '60');
  fondo.setAttribute('cy', '60');
  fondo.setAttribute('r', String(RADIO));
  fondo.setAttribute('fill', 'none');
  fondo.setAttribute('stroke', '#e4e7f7');
  fondo.setAttribute('stroke-width', '14');
  svg.appendChild(fondo);

  let acumulado = 0;
  items.forEach((item) => {
    const fraccion = total > 0 ? item.valor / total : 0;
    const largo = fraccion * CIRC;
    const arco = document.createElementNS(svgNS, 'circle');
    arco.setAttribute('cx', '60');
    arco.setAttribute('cy', '60');
    arco.setAttribute('r', String(RADIO));
    arco.setAttribute('fill', 'none');
    arco.setAttribute('stroke', item.color);
    arco.setAttribute('stroke-width', '14');
    arco.setAttribute('stroke-dasharray', `${largo} ${CIRC}`);
    arco.setAttribute('stroke-dashoffset', String(-acumulado));
    arco.setAttribute('transform', 'rotate(-90 60 60)');
    svg.appendChild(arco);
    acumulado += largo;
  });

  return svg;
}

function construirTarjetaDona(moneda, items, total) {
  const tarjeta = document.createElement('div');
  tarjeta.className = 'dona-tarjeta';

  const titulo = document.createElement('span');
  titulo.className = 'dona-titulo';
  titulo.textContent = ETIQUETA_MONEDA[moneda];
  tarjeta.appendChild(titulo);

  const envoltorio = document.createElement('div');
  envoltorio.className = 'dona-envoltorio';
  envoltorio.appendChild(construirDona(items, total));

  const centro = document.createElement('span');
  centro.className = 'dona-centro';
  centro.textContent = formatMoneda(total, moneda);
  envoltorio.appendChild(centro);

  tarjeta.appendChild(envoltorio);
  return tarjeta;
}

function construirSeccionMoneda(moneda, items, total) {
  const seccion = document.createElement('div');
  seccion.className = 'seccion-moneda';

  const titulo = document.createElement('h3');
  const dotTitulo = document.createElement('span');
  dotTitulo.className = 'fila-instrumento-dot';
  dotTitulo.style.background = 'var(--navy)';
  dotTitulo.style.marginRight = '8px';
  titulo.appendChild(dotTitulo);
  titulo.appendChild(document.createTextNode(ETIQUETA_MONEDA[moneda]));
  seccion.appendChild(titulo);

  const lista = document.createElement('div');
  lista.className = 'lista-instrumentos';

  items.forEach((item) => {
    const fila = document.createElement('div');
    fila.className = 'fila-instrumento';

    const top = document.createElement('div');
    top.className = 'fila-instrumento-top';

    const nombre = document.createElement('span');
    nombre.className = 'fila-instrumento-nombre';
    const dot = document.createElement('span');
    dot.className = 'fila-instrumento-dot';
    dot.style.background = item.color;
    nombre.appendChild(dot);
    nombre.appendChild(document.createTextNode(item.nombre));

    if (Number.isFinite(item.tir)) {
      const tir = document.createElement('span');
      tir.className = 'fila-instrumento-tir';
      tir.textContent = `TIR ${formatPorcentaje(item.tir)}`;
      nombre.appendChild(tir);
    }

    const valor = document.createElement('span');
    valor.className = 'fila-instrumento-valor';
    valor.textContent = formatMoneda(item.valor, moneda);

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'fila-instrumento-quitar';
    quitar.setAttribute('aria-label', `Quitar ${item.nombre}`);
    quitar.textContent = '×';
    quitar.addEventListener('click', () => {
      instrumentos = instrumentos.filter((i) => i.id !== item.id);
      renderCartera();
    });

    top.appendChild(nombre);
    top.appendChild(valor);
    top.appendChild(quitar);
    fila.appendChild(top);

    const barra = document.createElement('div');
    barra.className = 'fila-instrumento-barra';
    const relleno = document.createElement('div');
    relleno.className = 'fila-instrumento-barra-relleno';
    relleno.style.width = total > 0 ? `${(item.valor / total) * 100}%` : '0%';
    barra.appendChild(relleno);
    fila.appendChild(barra);

    lista.appendChild(fila);
  });

  seccion.appendChild(lista);

  const filaTotal = document.createElement('div');
  filaTotal.className = 'fila-total';
  const totalEtiqueta = document.createElement('span');
  totalEtiqueta.className = 'fila-total-etiqueta';
  totalEtiqueta.textContent = `Total ${ETIQUETA_MONEDA[moneda]}`;
  const totalValor = document.createElement('span');
  totalValor.className = 'fila-total-valor';
  totalValor.textContent = formatMoneda(total, moneda);
  filaTotal.appendChild(totalEtiqueta);
  filaTotal.appendChild(totalValor);
  seccion.appendChild(filaTotal);

  return seccion;
}

// ---------- Estadísticas en vivo (duration por moneda, calificación de ONs) ----------
// La duration no se promedia entre monedas distintas sin un tipo de cambio (no sería
// financieramente válido): se separa en Dólares (MEP + Cable) y Pesos.

const ETIQUETA_CALIFICACION_SIN_DATO = 'Sin calificar';

function mergearCalificacion(calificacion) {
  if (!calificacion) return ETIQUETA_CALIFICACION_SIN_DATO;
  if (calificacion === 'AA' || calificacion === 'AA-') return 'AA/AA-';
  return calificacion;
}

function calcularPromedioPonderado(items, campo) {
  const conDato = items.filter((i) => Number.isFinite(i[campo]) && i.valor > 0);
  const sumaValor = conDato.reduce((acc, i) => acc + i.valor, 0);
  if (sumaValor === 0) return null;
  const sumaPonderada = conDato.reduce((acc, i) => acc + i.valor * i[campo], 0);
  return sumaPonderada / sumaValor;
}

function actualizarStats() {
  if (instrumentos.length === 0) {
    panelStats.classList.add('oculto');
    return;
  }
  panelStats.classList.remove('oculto');

  const enDolares = instrumentos.filter((i) => i.moneda === 'DolarMEP' || i.moneda === 'DolarCable');
  const enPesos = instrumentos.filter((i) => i.moneda === 'Pesos');

  const durationUsd = calcularPromedioPonderado(enDolares, 'duration');
  const durationArs = calcularPromedioPonderado(enPesos, 'duration');
  statsDurationUsd.textContent = durationUsd !== null ? `${durationUsd.toFixed(2)} a.` : '—';
  statsDurationArs.textContent = durationArs !== null ? `${durationArs.toFixed(2)} a.` : '—';

  const tirUsd = calcularPromedioPonderado(enDolares, 'tir');
  const tirArs = calcularPromedioPonderado(enPesos, 'tir');
  statsTirUsd.textContent = formatPorcentaje(tirUsd);
  statsTirArs.textContent = formatPorcentaje(tirArs);

  const ons = instrumentos.filter((i) => i.categoria === 'ON');
  statsCalifLista.innerHTML = '';
  if (ons.length === 0) {
    statsCalificaciones.classList.add('oculto');
    return;
  }
  statsCalificaciones.classList.remove('oculto');

  const totalOn = ons.reduce((acc, i) => acc + i.valor, 0);
  const grupos = new Map();
  ons.forEach((i) => {
    const clave = mergearCalificacion(i.calificacion);
    grupos.set(clave, (grupos.get(clave) || 0) + i.valor);
  });

  const filas = [...grupos.entries()].sort((a, b) => b[1] - a[1]);
  filas.forEach(([calificacion, valor]) => {
    const pct = totalOn > 0 ? (valor / totalOn) * 100 : 0;

    const fila = document.createElement('div');
    fila.className = 'stats-calif-fila';

    const etiqueta = document.createElement('span');
    etiqueta.className = 'stats-calif-etiqueta';
    etiqueta.textContent = calificacion;

    const barra = document.createElement('div');
    barra.className = 'stats-calif-barra';
    const relleno = document.createElement('div');
    relleno.className = 'stats-calif-barra-relleno';
    relleno.style.width = `${pct}%`;
    barra.appendChild(relleno);

    const pctSpan = document.createElement('span');
    pctSpan.className = 'stats-calif-pct';
    pctSpan.textContent = `${pct.toFixed(0)}%`;

    fila.appendChild(etiqueta);
    fila.appendChild(barra);
    fila.appendChild(pctSpan);
    statsCalifLista.appendChild(fila);
  });
}

function renderCartera() {
  visor.innerHTML = '';
  visor.appendChild(construirEncabezadoCartera());

  if (instrumentos.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'tabla-vacia';
    vacio.textContent = 'Todavía no agregaste ningún instrumento.';
    visor.appendChild(vacio);
    actualizarStats();
    return;
  }

  const cuerpo = document.createElement('div');
  cuerpo.className = 'cartera-cuerpo';

  const columnaLista = document.createElement('div');
  columnaLista.className = 'cartera-columna-lista';

  const columnaDonas = document.createElement('div');
  columnaDonas.className = 'cartera-columna-donas';

  ORDEN_MONEDAS.forEach((moneda) => {
    const items = instrumentos.filter((i) => i.moneda === moneda);
    if (items.length === 0) return;

    const itemsConColor = items.map((item, i) => ({ ...item, color: colorInstrumento(i) }));
    const total = itemsConColor.reduce((acc, it) => acc + it.valor, 0);

    columnaLista.appendChild(construirSeccionMoneda(moneda, itemsConColor, total));
    columnaDonas.appendChild(construirTarjetaDona(moneda, itemsConColor, total));
  });

  cuerpo.appendChild(columnaLista);
  cuerpo.appendChild(columnaDonas);
  visor.appendChild(cuerpo);
  actualizarStats();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const textoIngresado = inputNombre.value.trim();
  const valor = parseFloat(inputValor.value);
  const moneda = selectMoneda.value;

  if (!textoIngresado || !Number.isFinite(valor) || valor < 0) {
    mostrarMensaje('Completá el nombre y un valor válido.', 'error');
    return;
  }

  const seleccion = seleccionActual && seleccionActual.textoMostrado === textoIngresado ? seleccionActual : null;

  const instrumento = seleccion
    ? {
        id: siguienteId++,
        nombre: `${seleccion.ticker} · ${seleccion.nombre}`,
        valor,
        moneda,
        ticker: seleccion.ticker,
        categoria: seleccion.categoria,
        tir: seleccion.tir,
        duration: seleccion.duration,
        calificacion: seleccion.calificacion,
      }
    : { id: siguienteId++, nombre: textoIngresado, valor, moneda };

  instrumentos.push(instrumento);
  renderCartera();
  mostrarMensaje('', null);

  inputNombre.value = '';
  inputValor.value = '';
  seleccionActual = null;
  ocultarSugerencias();
  inputNombre.focus();
});

btnVaciar.addEventListener('click', () => {
  if (instrumentos.length === 0) return;
  instrumentos = [];
  renderCartera();
  mostrarMensaje('', null);
});

function nombreArchivoSlug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

btnDescargar.addEventListener('click', async () => {
  if (instrumentos.length === 0) {
    mostrarMensaje('Agregá al menos un instrumento antes de descargar.', 'error');
    return;
  }

  const textoOriginal = btnDescargar.textContent;
  btnDescargar.disabled = true;
  btnDescargar.textContent = 'Generando...';

  const anchoVisor = visor.offsetWidth;
  const envoltorio = document.createElement('div');
  envoltorio.style.cssText = `position:fixed; left:-10000px; top:0; width:${anchoVisor}px; padding:24px; background:#ffffff;`;
  const visorClon = visor.cloneNode(true);
  visorClon.style.width = anchoVisor + 'px';
  visorClon.querySelectorAll('.fila-instrumento-quitar').forEach((boton) => boton.remove());

  const zonaClienteClon = visorClon.querySelector('.cartera-cliente-zona');
  if (zonaClienteClon) {
    zonaClienteClon.innerHTML = '';
    const nombreValor = nombreCliente.trim();
    if (nombreValor) {
      const nombreSpan = document.createElement('span');
      nombreSpan.className = 'cartera-cliente-nombre';
      nombreSpan.textContent = nombreValor;
      zonaClienteClon.appendChild(nombreSpan);
    }
  }

  envoltorio.appendChild(visorClon);
  document.body.appendChild(envoltorio);

  try {
    const canvas = await html2canvas(envoltorio, { backgroundColor: '#ffffff', scale: 2 });
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen.'))), 'image/png');
    });

    const nombreValor = nombreCliente.trim();
    const nombreArchivo = nombreValor
      ? `presentacion-cartera-${nombreArchivoSlug(nombreValor)}.png`
      : 'presentacion-cartera.png';

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);

    mostrarMensaje('Listo, se descargó la presentación.', 'exito');
  } catch (err) {
    mostrarMensaje('No se pudo generar la presentación: ' + err.message, 'error');
  } finally {
    envoltorio.remove();
    btnDescargar.disabled = false;
    btnDescargar.textContent = textoOriginal;
  }
});

renderCartera();
