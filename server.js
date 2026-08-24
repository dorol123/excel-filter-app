const path = require('path');
const express = require('express');
const multer = require('multer');
const { procesar } = require('./lib/procesarExcel');

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
    const { xlsxBuffer, nombreArchivo, vistaPrevia } = await procesar(req.file.buffer, filtros);
    res.json({
      nombreArchivo,
      archivoBase64: Buffer.from(xlsxBuffer).toString('base64'),
      vistaPrevia,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Error al procesar el archivo.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
