const form = document.getElementById('form-instrumento');
const inputNombre = document.getElementById('nombre-instrumento');
const inputValor = document.getElementById('valor-instrumento');
const selectMoneda = document.getElementById('moneda-instrumento');
const mensaje = document.getElementById('mensaje-cartera');
const visor = document.getElementById('cartera-visor');
const btnVaciar = document.getElementById('btn-vaciar-cartera');
const btnDescargar = document.getElementById('btn-descargar-presentacion');

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

function renderCartera() {
  visor.innerHTML = '';
  visor.appendChild(construirEncabezadoCartera());

  if (instrumentos.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'tabla-vacia';
    vacio.textContent = 'Todavía no agregaste ningún instrumento.';
    visor.appendChild(vacio);
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
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const nombre = inputNombre.value.trim();
  const valor = parseFloat(inputValor.value);
  const moneda = selectMoneda.value;

  if (!nombre || !Number.isFinite(valor) || valor < 0) {
    mostrarMensaje('Completá el nombre y un valor válido.', 'error');
    return;
  }

  instrumentos.push({ id: siguienteId++, nombre, valor, moneda });
  renderCartera();
  mostrarMensaje('', null);

  inputNombre.value = '';
  inputValor.value = '';
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
