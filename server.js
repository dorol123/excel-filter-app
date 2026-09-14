const path = require('path');
const express = require('express');

const app = express();

app.get('/healthz', (req, res) => res.status(200).send('ok'));

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
