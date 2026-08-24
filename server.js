const path = require('path');
const express = require('express');
const multer = require('multer');
const { procesarExcel } = require('./lib/procesarExcel');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/procesar', upload.single('archivo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  }

  try {
    const filtros = {
      fechaDesde: req.body.fechaDesde,
      fechaHasta: req.body.fechaHasta,
      horaDesde: req.body.horaDesde,
      horaHasta: req.body.horaHasta,
    };
    const bufferSalida = await procesarExcel(req.file.buffer, filtros);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="acreditaciones_procesado.xlsx"');
    res.send(Buffer.from(bufferSalida));
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Error al procesar el archivo.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
