const path = require('path');
const express = require('express');

const app = express();

app.get('/healthz', (req, res) => res.status(200).send('ok'));

// ---------- Noticias del Wall Street Journal (landing) ----------
//
// WSJ dejó de actualizar sus RSS públicos (quedaron congelados desde
// principios de 2025) y el endpoint de la API paga que se probó
// (wall-street-journal.p.rapidapi.com) está deprecado y no responde nada
// útil. En cambio, Google News sí indexa notas de wsj.com en tiempo real
// vía su propio RSS público, sin clave — se filtra a "site:wsj.com" para
// quedarnos sólo con notas del WSJ. Ese feed no manda cabeceras CORS, así
// que se pide acá (server) y no desde el navegador, con una caché de 1
// hora para no golpear a Google en cada visita.
const WSJ_FEED_URL = 'https://news.google.com/rss/search?q=site:wsj.com+when:1d&hl=en-US&gl=US&ceid=US:en';
const WSJ_CACHE_MS = 60 * 60 * 1000;
let wsjCache = { articulos: null, actualizadoEn: 0 };

function decodificarEntidadesHtml(texto) {
  return texto
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parsearItemsRss(xml, limite) {
  const items = [];
  const regexItem = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while (items.length < limite && (match = regexItem.exec(xml))) {
    const bloque = match[1];
    const titulo = bloque.match(/<title>([\s\S]*?)<\/title>/);
    const link = bloque.match(/<link>([\s\S]*?)<\/link>/);
    const pubDate = bloque.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titulo || !link) continue;

    const tituloLimpio = decodificarEntidadesHtml(titulo[1].trim()).replace(/\s*-\s*wsj(\.com)?$/i, '');
    items.push({
      titulo: tituloLimpio,
      url: link[1].trim(),
      publicadoEn: pubDate ? new Date(pubDate[1].trim()).toISOString() : null,
    });
  }
  return items;
}

app.get('/api/wsj-news', async (req, res) => {
  const ahora = Date.now();
  if (wsjCache.articulos && ahora - wsjCache.actualizadoEn < WSJ_CACHE_MS) {
    res.json({ articulos: wsjCache.articulos, actualizadoEn: wsjCache.actualizadoEn, cache: true });
    return;
  }

  try {
    const respuesta = await fetch(WSJ_FEED_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HerramientasBot/1.0)' },
    });
    if (!respuesta.ok) throw new Error(`Google News respondió ${respuesta.status}`);
    const xml = await respuesta.text();
    const articulos = parsearItemsRss(xml, 3);
    if (articulos.length === 0) throw new Error('No se encontraron artículos en el feed.');

    wsjCache = { articulos, actualizadoEn: ahora };
    res.json({ articulos, actualizadoEn: ahora, cache: false });
  } catch (error) {
    console.error('No se pudieron obtener noticias del WSJ:', error.message);
    if (wsjCache.articulos) {
      res.json({ articulos: wsjCache.articulos, actualizadoEn: wsjCache.actualizadoEn, cache: true, stale: true });
    } else {
      res.status(502).json({ error: 'No se pudieron obtener las noticias.' });
    }
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Render (plan free) duerme el servicio tras ~15 min sin tráfico HTTP
// entrante por su router público. Un cron externo (como el de
// .github/workflows/keep-alive.yml) no sirve solo: GitHub demora los
// schedule de repos con poca actividad varias horas. Acá el propio
// proceso se pinguea a sí mismo por su URL pública cada 10 minutos: ese
// pedido sale, rebota en el router de Render como cualquier visitante y
// entra de vuelta, así que cuenta como tráfico real — a diferencia de
// pegarle a "localhost", que nunca pasa por ese router y no cuenta.
const SELF_PING_MS = 10 * 60 * 1000;
const SELF_PING_URL = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;

if (SELF_PING_URL) {
  setInterval(() => {
    fetch(`${SELF_PING_URL}/healthz`).catch((error) => console.error('Self-ping falló:', error.message));
  }, SELF_PING_MS);
}
