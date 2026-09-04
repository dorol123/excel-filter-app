const form = document.getElementById('form-instrumento');
const inputNombre = document.getElementById('nombre-instrumento');
const inputValor = document.getElementById('valor-instrumento');
const selectMoneda = document.getElementById('moneda-instrumento');
const mensaje = document.getElementById('mensaje-cartera');
const visor = document.getElementById('cartera-visor');
const btnVaciar = document.getElementById('btn-vaciar-cartera');
const btnDescargar = document.getElementById('btn-descargar-presentacion');
const panelRecientes = document.getElementById('panel-recientes');
const listaRecientes = document.getElementById('lista-recientes');

const badgeDatos = document.getElementById('badge-datos');
const recuadroDatosNota = document.getElementById('recuadro-datos-nota');
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

// ---------- Persistencia: la cartera actual y un historial de recientes ----------
// Todo queda sólo en este navegador (localStorage), nunca sale de acá.

const STORAGE_KEY_ACTUAL = 'carteras-actual-v1';
const STORAGE_KEY_RECIENTES = 'carteras-recientes-v1';
const MAX_RECIENTES = 8;

function guardarCarteraActual() {
  try {
    if (instrumentos.length === 0 && !nombreCliente) {
      localStorage.removeItem(STORAGE_KEY_ACTUAL);
      return;
    }
    localStorage.setItem(STORAGE_KEY_ACTUAL, JSON.stringify({ instrumentos, nombreCliente, siguienteId }));
  } catch (error) {
    console.error('No se pudo guardar la cartera actual:', error);
  }
}

function leerCarteraActual() {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY_ACTUAL);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos.instrumentos)) return null;
    return datos;
  } catch (error) {
    console.error('No se pudo leer la cartera actual:', error);
    return null;
  }
}

function leerCarterasRecientes() {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY_RECIENTES);
    const datos = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    console.error('No se pudieron leer las carteras recientes:', error);
    return [];
  }
}

function guardarCarterasRecientes(lista) {
  try {
    localStorage.setItem(STORAGE_KEY_RECIENTES, JSON.stringify(lista));
  } catch (error) {
    console.error('No se pudieron guardar las carteras recientes:', error);
  }
}

/** Manda la cartera actual (si tiene algo) al historial de recientes antes de vaciarla o de cargar otra. */
function archivarCarteraActualComoReciente() {
  if (instrumentos.length === 0) return;
  const entrada = { id: Date.now(), nombreCliente, instrumentos, guardadoEn: Date.now() };
  const recientes = [entrada, ...leerCarterasRecientes()].slice(0, MAX_RECIENTES);
  guardarCarterasRecientes(recientes);
}

function eliminarCarteraReciente(id) {
  guardarCarterasRecientes(leerCarterasRecientes().filter((c) => c.id !== id));
  renderCarterasRecientes();
}

function cargarCarteraReciente(entrada) {
  archivarCarteraActualComoReciente();
  eliminarCarteraReciente(entrada.id);
  instrumentos = entrada.instrumentos.map((item) => ({ ...item }));
  nombreCliente = entrada.nombreCliente || '';
  mostrarInputCliente = false;
  siguienteId = instrumentos.reduce((acc, item) => Math.max(acc, item.id + 1), 1);
  guardarCarteraActual();
  renderCartera();
  mostrarMensaje('Cartera cargada.', 'exito');
}

function renderCarterasRecientes() {
  const recientes = leerCarterasRecientes();
  panelRecientes.classList.toggle('oculto', recientes.length === 0);
  listaRecientes.innerHTML = '';

  recientes.forEach((entrada) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'reciente-item';
    item.addEventListener('click', () => cargarCarteraReciente(entrada));

    const info = document.createElement('span');
    info.className = 'reciente-item-info';

    const nombre = document.createElement('span');
    nombre.className = 'reciente-item-nombre';
    nombre.textContent = entrada.nombreCliente || 'Cartera sin nombre';

    const detalle = document.createElement('span');
    detalle.className = 'reciente-item-detalle';
    const cantidad = entrada.instrumentos.length;
    detalle.textContent = `${cantidad} instrumento${cantidad === 1 ? '' : 's'} · ${formatHaceTiempoDatos(entrada.guardadoEn)}`;

    info.appendChild(nombre);
    info.appendChild(detalle);

    const quitar = document.createElement('span');
    quitar.className = 'reciente-item-quitar';
    quitar.setAttribute('role', 'button');
    quitar.setAttribute('aria-label', 'Quitar de recientes');
    quitar.textContent = '×';
    quitar.addEventListener('click', (e) => {
      e.stopPropagation();
      eliminarCarteraReciente(entrada.id);
    });

    item.appendChild(info);
    item.appendChild(quitar);
    listaRecientes.appendChild(item);
  });
}

// ---------- Datos de mercado (Monitor de instrumentos), 100% en el navegador ----------
// Independiente del localStorage de ons.js: esta herramienta guarda su propia lista de
// instrumentos buscables por ticker/emisor, con su propio storage key.

const STORAGE_KEY_DATOS = 'carteras-datos-v2';
const DOS_HORAS_MS = 2 * 60 * 60 * 1000;

let instrumentosDisponibles = [];
let cotizacionMep = null;
let guardadoEnDatos = null;
let seleccionActual = null;
let sugerenciaActivaIndice = -1;
let sugerenciasRenderizadas = [];

function guardarDatosEnStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY_DATOS,
      JSON.stringify({ instrumentos: instrumentosDisponibles, cotizacionMep, guardadoEn: guardadoEnDatos })
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
    recuadroDatosNota.classList.remove('oculto');
    return;
  }
  const vencido = Date.now() - guardadoEnDatos > DOS_HORAS_MS;
  badgeDatos.textContent = `${instrumentosDisponibles.length} instrumentos · actualizado ${formatHaceTiempoDatos(guardadoEnDatos)}`;
  badgeDatos.className = 'badge-datos ' + (vencido ? 'vencido' : 'cargado');
  badgeDatos.title = new Date(guardadoEnDatos).toLocaleString('es-AR');
  // Ya cargado: la nota explicativa deja de aportar y sólo agrega alto a la tarjeta.
  recuadroDatosNota.classList.add('oculto');
}

setInterval(actualizarBadgeDatos, 30000);

(function cargarDatosGuardados() {
  const datos = leerDatosDeStorage();
  if (!datos) return;
  instrumentosDisponibles = datos.instrumentos;
  cotizacionMep = datos.cotizacionMep || null;
  guardadoEnDatos = datos.guardadoEn;
  actualizarBadgeDatos();
})();

async function manejarArchivoDatos(archivo) {
  if (!archivo) return;
  badgeDatos.textContent = 'Procesando…';
  badgeDatos.className = 'badge-datos';
  try {
    const arrayBuffer = await archivo.arrayBuffer();
    const { instrumentos: nuevos, cotizacionMep: nuevaCotizacion } = await procesarInstrumentosDisponibles(arrayBuffer);
    if (nuevos.length === 0) {
      mostrarMensaje('No se encontraron instrumentos en el archivo.', 'error');
      actualizarBadgeDatos();
      return;
    }
    instrumentosDisponibles = nuevos;
    cotizacionMep = nuevaCotizacion;
    guardadoEnDatos = Date.now();
    guardarDatosEnStorage();
    actualizarBadgeDatos();
    renderCartera();
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

// Los fondos Balanz sólo se suscriben en Dólar Cable: no tiene sentido dejar
// elegir otra moneda para ellos.
const CATEGORIA_MONEDA_FIJA = 'Fondos Balanz';

function aplicarBloqueoMoneda(bloqueada) {
  selectMoneda.disabled = bloqueada;
}

function elegirSugerencia(inst) {
  const textoMostrado = `${inst.ticker} — ${inst.nombre}`;
  inputNombre.value = textoMostrado;
  selectMoneda.value = inst.moneda;
  aplicarBloqueoMoneda(inst.categoria === CATEGORIA_MONEDA_FIJA);
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
    aplicarBloqueoMoneda(false);
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
      guardarCarteraActual();
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

// Tonos de azul según % de la cartera: más oscuro cuanto más pesa el
// instrumento. La raíz cuadrada separa mejor las porciones chicas (si no,
// con una cartera diversificada casi todas las porciones quedan clarísimas
// y se ven iguales).
const AZUL_CLARO = [199, 212, 247];
const AZUL_OSCURO = [16, 18, 83];

function colorEscalaAzul(fraccion) {
  const t = Math.min(1, Math.sqrt(Math.max(fraccion, 0)));
  const canal = (i) => Math.round(AZUL_CLARO[i] + (AZUL_OSCURO[i] - AZUL_CLARO[i]) * t);
  return `rgb(${canal(0)}, ${canal(1)}, ${canal(2)})`;
}

// ---------- Dona interactiva de la cartera total ----------
// Sectores como <path> (no círculos apilados) para poder "desprender" el
// que está bajo el mouse. Cada sector se dibuja por partida doble: un
// <path> invisible con la forma ORIGINAL (el que escucha el mouse) y,
// encima, el <path> de color que se anima — si el mouse escuchara sobre el
// path animado, al desprenderse el sector se movería por debajo del cursor
// y dispararía mouseleave/mouseenter en bucle cerca del borde.

const DONA_VIEWBOX = 120;
const DONA_CENTRO = DONA_VIEWBOX / 2;
const DONA_RADIO_EXTERNO = 56;
const DONA_RADIO_INTERNO = 42;
const DONA_DISTANCIA_DESPRENDIDO = 6;

function puntoEnDona(radio, anguloRad) {
  return [DONA_CENTRO + radio * Math.sin(anguloRad), DONA_CENTRO - radio * Math.cos(anguloRad)];
}

function pathSectorDona(anguloInicio, anguloFin) {
  const [x1, y1] = puntoEnDona(DONA_RADIO_EXTERNO, anguloInicio);
  const [x2, y2] = puntoEnDona(DONA_RADIO_EXTERNO, anguloFin);
  const [x3, y3] = puntoEnDona(DONA_RADIO_INTERNO, anguloFin);
  const [x4, y4] = puntoEnDona(DONA_RADIO_INTERNO, anguloInicio);
  const arcoGrande = anguloFin - anguloInicio > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${DONA_RADIO_EXTERNO} ${DONA_RADIO_EXTERNO} 0 ${arcoGrande} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${DONA_RADIO_INTERNO} ${DONA_RADIO_INTERNO} 0 ${arcoGrande} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

function construirDona(items, total) {
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(DONA_VIEWBOX));
  svg.setAttribute('height', String(DONA_VIEWBOX));
  svg.setAttribute('viewBox', `0 0 ${DONA_VIEWBOX} ${DONA_VIEWBOX}`);

  const fondo = document.createElementNS(svgNS, 'circle');
  fondo.setAttribute('cx', String(DONA_CENTRO));
  fondo.setAttribute('cy', String(DONA_CENTRO));
  fondo.setAttribute('r', String((DONA_RADIO_EXTERNO + DONA_RADIO_INTERNO) / 2));
  fondo.setAttribute('fill', 'none');
  fondo.setAttribute('stroke', '#223252');
  fondo.setAttribute('stroke-width', String(DONA_RADIO_EXTERNO - DONA_RADIO_INTERNO));
  svg.appendChild(fondo);

  let anguloAcumulado = 0;
  items.forEach((item, indice) => {
    const fraccion = total > 0 ? item.valor / total : 0;
    const anguloInicio = anguloAcumulado;
    const anguloFin = anguloAcumulado + fraccion * 2 * Math.PI;
    anguloAcumulado = anguloFin;
    if (fraccion <= 0) return;

    const d = pathSectorDona(anguloInicio, anguloFin);
    const anguloMedio = (anguloInicio + anguloFin) / 2;
    const dx = Math.sin(anguloMedio) * DONA_DISTANCIA_DESPRENDIDO;
    const dy = -Math.cos(anguloMedio) * DONA_DISTANCIA_DESPRENDIDO;

    const zonaHover = document.createElementNS(svgNS, 'path');
    zonaHover.setAttribute('d', d);
    zonaHover.setAttribute('fill', 'transparent');
    zonaHover.setAttribute('class', 'cartera-torta-hit');
    zonaHover.dataset.indice = String(indice);
    svg.appendChild(zonaHover);

    const sector = document.createElementNS(svgNS, 'path');
    sector.setAttribute('d', d);
    sector.setAttribute('fill', colorEscalaAzul(fraccion));
    sector.setAttribute('class', 'cartera-torta-sector');
    sector.dataset.indice = String(indice);
    sector.style.setProperty('--dx', `${dx}px`);
    sector.style.setProperty('--dy', `${dy}px`);
    svg.appendChild(sector);
  });

  return svg;
}

/** Valor de un instrumento convertido a dólares: los pesos se convierten con
 * la cotización del dólar MEP del Monitor; los que ya están en dólares
 * (MEP o Cable) se usan tal cual. */
function valorEnUsd(item) {
  if (item.moneda === 'Pesos') {
    return cotizacionMep ? item.valor / cotizacionMep : null;
  }
  return item.valor;
}

function construirTarjetaDonaUnica(items) {
  const itemsEnUsd = items.map((item) => ({ ...item, valor: valorEnUsd(item) }));
  const itemsValidos = itemsEnUsd.filter((item) => Number.isFinite(item.valor) && item.valor > 0);
  const excluidos = itemsEnUsd.length - itemsValidos.length;
  const total = itemsValidos.reduce((acc, it) => acc + it.valor, 0);

  const tarjeta = document.createElement('div');
  tarjeta.className = 'dona-tarjeta';

  const titulo = document.createElement('span');
  titulo.className = 'dona-titulo';
  titulo.textContent = 'Cartera total';
  tarjeta.appendChild(titulo);

  const envoltorio = document.createElement('div');
  envoltorio.className = 'dona-envoltorio';
  envoltorio.appendChild(construirDona(itemsValidos, total));

  const centro = document.createElement('span');
  centro.className = 'dona-centro';
  const centroValor = document.createElement('span');
  const centroSub = document.createElement('span');
  centroSub.className = 'dona-centro-sub';
  centro.appendChild(centroValor);
  centro.appendChild(centroSub);
  envoltorio.appendChild(centro);

  const mostrarTotal = () => {
    centroValor.textContent = formatMoneda(total, 'DolarMEP');
    centroSub.textContent = 'Total';
  };
  mostrarTotal();

  envoltorio.querySelectorAll('.cartera-torta-hit').forEach((zona) => {
    const item = itemsValidos[Number(zona.dataset.indice)];
    zona.addEventListener('mouseenter', () => {
      envoltorio.querySelectorAll('.cartera-torta-sector').forEach((sector) => {
        const activo = sector.dataset.indice === zona.dataset.indice;
        sector.classList.toggle('resaltado', activo);
        sector.classList.toggle('atenuado', !activo);
      });
      centroValor.textContent = item.ticker || item.nombre;
      centroSub.textContent = formatPorcentaje(total > 0 ? item.valor / total : 0);
    });
    zona.addEventListener('mouseleave', () => {
      envoltorio.querySelectorAll('.cartera-torta-sector').forEach((sector) => {
        sector.classList.remove('resaltado', 'atenuado');
      });
      mostrarTotal();
    });
  });

  tarjeta.appendChild(envoltorio);

  const nota = document.createElement('p');
  nota.className = 'dona-nota';
  nota.textContent =
    excluidos > 0
      ? `Equivalente en USD (dólar MEP) · ${excluidos} en pesos sin cotización`
      : 'Equivalente en USD (dólar MEP)';
  tarjeta.appendChild(nota);

  return tarjeta;
}

function construirSeccionMoneda(moneda, items, total, totalGeneralUsd) {
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

    const valorUsd = valorEnUsd(item);
    if (totalGeneralUsd > 0 && Number.isFinite(valorUsd)) {
      const pctCartera = valorUsd / totalGeneralUsd;
      const pct = document.createElement('span');
      pct.className = 'fila-instrumento-pct';
      const barraPct = document.createElement('span');
      barraPct.className = 'fila-instrumento-pct-barra';
      const rellenoPct = document.createElement('span');
      rellenoPct.className = 'fila-instrumento-pct-relleno';
      rellenoPct.style.width = `${Math.min(pctCartera * 100, 100)}%`;
      barraPct.appendChild(rellenoPct);
      const numPct = document.createElement('span');
      numPct.className = 'fila-instrumento-pct-num';
      numPct.textContent = formatPorcentaje(pctCartera);
      pct.appendChild(barraPct);
      pct.appendChild(numPct);
      nombre.appendChild(pct);
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
    guardarCarteraActual();
    return;
  }

  const cuerpo = document.createElement('div');
  cuerpo.className = 'cartera-cuerpo';

  const columnaLista = document.createElement('div');
  columnaLista.className = 'cartera-columna-lista';

  const columnaDonas = document.createElement('div');
  columnaDonas.className = 'cartera-columna-donas';

  const totalGeneralUsd = instrumentos.reduce((acc, item) => {
    const valorUsd = valorEnUsd(item);
    return Number.isFinite(valorUsd) ? acc + valorUsd : acc;
  }, 0);

  ORDEN_MONEDAS.forEach((moneda) => {
    const items = instrumentos.filter((i) => i.moneda === moneda);
    if (items.length === 0) return;

    const itemsConColor = items.map((item, i) => ({ ...item, color: colorInstrumento(i) }));
    const total = itemsConColor.reduce((acc, it) => acc + it.valor, 0);

    columnaLista.appendChild(construirSeccionMoneda(moneda, itemsConColor, total, totalGeneralUsd));
  });

  columnaDonas.appendChild(construirTarjetaDonaUnica(instrumentos));

  cuerpo.appendChild(columnaLista);
  cuerpo.appendChild(columnaDonas);
  visor.appendChild(cuerpo);
  actualizarStats();
  guardarCarteraActual();
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
  aplicarBloqueoMoneda(false);
  ocultarSugerencias();
  inputNombre.focus();
});

btnVaciar.addEventListener('click', () => {
  if (instrumentos.length === 0) return;
  archivarCarteraActualComoReciente();
  instrumentos = [];
  nombreCliente = '';
  mostrarInputCliente = false;
  renderCartera();
  renderCarterasRecientes();
  mostrarMensaje('Cartera guardada en recientes.', 'exito');
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

(function cargarCarteraActualGuardada() {
  const datos = leerCarteraActual();
  if (!datos) return;
  instrumentos = datos.instrumentos;
  nombreCliente = datos.nombreCliente || '';
  siguienteId = Number.isFinite(datos.siguienteId)
    ? datos.siguienteId
    : instrumentos.reduce((acc, item) => Math.max(acc, item.id + 1), 1);
  mostrarInputCliente = Boolean(nombreCliente);
})();

renderCarterasRecientes();
renderCartera();
