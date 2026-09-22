const path = require('path');
const express = require('express');

const app = express();

// Herramientas de uso interno: no queremos que buscadores las indexen (evita
// exponer nombres de asesores/clientes en resultados de búsqueda) y sumamos
// headers básicos de hardening. No reemplaza tener autenticación real.
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

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
