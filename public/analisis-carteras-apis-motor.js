/*
 * Motor de cotizaciones en vivo del Presentador de Carteras: acciones,
 * cedears y ONs desde las APIs públicas de data912.com. Se piden directo
 * desde el navegador (fetch), sin pasar por ningún servidor propio — mismo
 * espíritu "100% en el navegador" que el resto de la app, sólo que acá la
 * fuente de datos es una API pública en vez de un archivo que subís vos.
 *
 * Cada instrumento sale con su ticker, categoría y precio bid/offer tal
 * como los da la API (sin ninguna conversión de moneda).
 *
 * Estas APIs no traen el nombre de la empresa/emisor, sólo el ticker — no
 * hay ningún "nombre" para inventar, así que el ticker es lo único que se
 * guarda como identificador.
 */

const API_BASE_MERCADO = 'https://data912.com/live';

async function obtenerJSONMercado(ruta) {
  const respuesta = await fetch(`${API_BASE_MERCADO}/${ruta}`);
  if (!respuesta.ok) throw new Error(`No se pudo obtener ${ruta} (${respuesta.status})`);
  return respuesta.json();
}

function mapearFilaMercado(fila, categoria) {
  return {
    ticker: fila.symbol,
    categoria,
    bid: Number.isFinite(fila.px_bid) && fila.px_bid > 0 ? fila.px_bid : null,
    offer: Number.isFinite(fila.px_ask) && fila.px_ask > 0 ? fila.px_ask : null,
  };
}

/**
 * Trae acciones, cedears y ONs en vivo (100% en el navegador) y devuelve la
 * lista combinada con ticker, categoría, precio bid y precio offer.
 */
async function procesarInstrumentosDeMercado() {
  const [acciones, cedears, corp] = await Promise.all([
    obtenerJSONMercado('arg_stocks'),
    obtenerJSONMercado('arg_cedears'),
    obtenerJSONMercado('arg_corp'),
  ]);

  const instrumentosAcciones = acciones
    .filter((fila) => fila.px_bid > 0 || fila.px_ask > 0)
    .map((fila) => mapearFilaMercado(fila, 'Acción'));

  const instrumentosCedears = cedears
    .filter((fila) => fila.px_bid > 0 || fila.px_ask > 0)
    .map((fila) => mapearFilaMercado(fila, 'Cedear'));

  const instrumentosCorp = corp
    .filter((fila) => fila.px_bid > 0 || fila.px_ask > 0)
    .map((fila) => mapearFilaMercado(fila, 'ON (mercado)'));

  return [...instrumentosAcciones, ...instrumentosCedears, ...instrumentosCorp];
}
