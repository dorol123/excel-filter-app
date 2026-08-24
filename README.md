# Procesador de Acreditaciones

Web app para procesar el Excel de acreditaciones: separa Pesos y Dólares
(MEP + Cable) en dos hojas, filtra montos bajos, resalta en rojo y negrita
los importes altos, aplica formato moneda y ordena por asesor.

## Reglas aplicadas

Columnas que se descartan del archivo original: `Fecha Carga`, `Hora Carga`,
`Recibo`, `Usuario Alta`, `Equipo`, `UnidadDeNegocio`.

**Hoja "Pesos"** (moneda = `Pesos`):
- Se eliminan las filas con importe ≤ 999.999.
- `Importe` y `Asesor` en rojo y negrita cuando el importe es ≥ 5.000.000.
- `Importe` con formato moneda, sin decimales.
- Ordenado por asesor: primero los asesores con mayor importe total, y
  dentro de cada asesor sus filas de mayor a menor importe.

**Hoja "Dolares"** (moneda = `Dólar MEP` o `Dólar Cable`, combinadas):
- Se eliminan las filas con importe ≤ 999.
- `Importe` y `Asesor` en rojo y negrita cuando el importe es ≥ 5.000.
- Mismo formato y orden que la hoja de Pesos.

## Desarrollo local

```bash
npm install
npm run dev   # con recarga automática (nodemon)
# o
npm start
```

Abrí `http://localhost:3000`, subí el `.xlsx` y descargá el archivo procesado.
