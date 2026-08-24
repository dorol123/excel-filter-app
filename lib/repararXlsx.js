const JSZip = require('jszip');

// Algunos exportadores (como el que genera este reporte) escriben las filas y
// celdas del XML sin los atributos r="..." (referencia de fila/columna).
// Eso es válido según el estándar OOXML (la posición se infiere por orden),
// pero el parser de exceljs no lo soporta y falla con "Invalid row number in
// model". Esta función reconstruye esos atributos antes de pasarle el
// archivo a exceljs. Solo contempla filas "normales" (<row>...</row>), que
// es el único caso que genera este reporte.

function indiceAColumna(indice) {
  let letra = '';
  let n = indice;
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

function columnaAIndice(letra) {
  let n = 0;
  for (const ch of letra) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function repararCeldasDeFila(contenido, rowIndex) {
  let colIndex = 0;
  return contenido.replace(/<c(?=[\s/>])([^>]*?)(\/?)>/g, (match, atributos, autocierre) => {
    if (/\br="/.test(atributos)) {
      const m = atributos.match(/r="([A-Z]+)\d+"/);
      if (m) colIndex = columnaAIndice(m[1]);
      return match;
    }
    colIndex += 1;
    const letra = indiceAColumna(colIndex);
    return `<c r="${letra}${rowIndex}"${atributos}${autocierre}>`;
  });
}

function repararSheetXml(xml) {
  let rowIndex = 0;
  return xml.replace(/<row([^>]*)>([\s\S]*?)<\/row>/g, (match, atributos, contenido) => {
    rowIndex += 1;
    let nuevosAtributos = atributos;
    const m = atributos.match(/\br="(\d+)"/);
    if (m) {
      rowIndex = parseInt(m[1], 10);
    } else {
      nuevosAtributos = ` r="${rowIndex}"${atributos}`;
    }
    const contenidoReparado = repararCeldasDeFila(contenido, rowIndex);
    return `<row${nuevosAtributos}>${contenidoReparado}</row>`;
  });
}

async function repararBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const rutasHojas = Object.keys(zip.files).filter((ruta) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(ruta)
  );

  for (const ruta of rutasHojas) {
    const xml = await zip.file(ruta).async('string');
    if (/<row>|<row\s+(?!r=")/.test(xml)) {
      zip.file(ruta, repararSheetXml(xml));
    }
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = { repararBuffer };
