const PDFDocument = require("pdfkit");

// Paleta tomada directo del sitio (app/catalogo/page.tsx)
const COLORS = {
  bg: "#FAF8F5",
  texto: "#1A1A1A",
  textoSuave: "#6b6b6b",
  borde: "#E8E4DB",
  naranja: "#E8673A",
  naranjaOscuro: "#C4522C",
  navy: "#2D2B45",
  verde: "#9BA88D",
};

const CATEGORIA_LABEL = {
  mates: "Mates",
  bombillas: "Bombillas",
  vasos: "Vasos y Chops",
  complementos: "Materos y Yerberos",
  souvenirs: "Souvenirs",
  combos: "Combos Emprendedores",
};

const ORDEN_CATEGORIAS = ["mates", "bombillas", "vasos", "complementos", "souvenirs", "combos"];

async function fetchImagenBuffer(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    return null;
  }
}

function drawHeader(doc, pageWidth) {
  doc.rect(0, 0, pageWidth, 70).fill(COLORS.navy);
  doc
    .fillColor("#FFFFFF")
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("TIENDA CUIS", 40, 26, { characterSpacing: 3 });
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor(COLORS.verde)
    .text("MAYORISTA DE MATES Y ARTICULOS REGIONALES", 40, 46, { characterSpacing: 1.5, lineBreak: false });
}

function drawCategoriaHeader(doc, pageWidth, categoria) {
  const label = CATEGORIA_LABEL[categoria] || categoria || "Otros";
  const barHeight = 26;
  const startY = doc.y;
  doc.rect(40, startY, pageWidth - 80, barHeight).fill(COLORS.navy);
  doc
    .fillColor("#FFFFFF")
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(label.toUpperCase(), 52, startY + 8, { characterSpacing: 1.5, lineBreak: false });
  doc.y = startY + barHeight + 18;
}

async function generarCatalogoPDF(productos, res, opciones = {}) {
  const { textoPortada = "" } = opciones;
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const pageWidth = doc.page.width;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="catalogo-tiendacuis.pdf"');
  doc.pipe(res);

  // --- Portada ---
  doc.rect(0, 0, pageWidth, doc.page.height).fill(COLORS.bg);
  doc.rect(0, 0, pageWidth, 200).fill(COLORS.navy);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(30)
    .text("TIENDA CUIS", 40, 90, { characterSpacing: 4 });
  doc
    .fontSize(11)
    .font("Helvetica")
    .fillColor(COLORS.verde)
    .text("MAYORISTA DE MATES Y ARTICULOS REGIONALES", 40, 130, { characterSpacing: 2 });

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.textoSuave)
    .text(`Actualizado el ${new Date().toLocaleDateString("es-AR")}`, 40, 230);

  let yContacto = 265;
  if (textoPortada && textoPortada.trim()) {
    doc.font("Helvetica").fontSize(11).fillColor(COLORS.texto);
    const anchoTexto = pageWidth - 80;
    const alturaTexto = doc.heightOfString(textoPortada, { width: anchoTexto });
    doc.text(textoPortada, 40, 255, { width: anchoTexto });
    yContacto = 255 + alturaTexto + 20;
  }

  doc
    .fontSize(10)
    .fillColor(COLORS.naranja)
    .font("Helvetica-Bold")
    .text("WhatsApp: 11 2325 1963", 40, yContacto)
    .fillColor(COLORS.textoSuave)
    .font("Helvetica")
    .text("www.tiendacuis.com  ·  Solo venta mayorista", 40, yContacto + 16);

  // --- Agrupar por categoria ---
  const porCategoria = {};
  productos.forEach((p) => {
    const cat = p.categoria || "otros";
    if (!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(p);
  });

  const categoriasOrdenadas = [
    ...ORDEN_CATEGORIAS.filter((c) => porCategoria[c]),
    ...Object.keys(porCategoria).filter((c) => !ORDEN_CATEGORIAS.includes(c)),
  ];

  const colWidth = (pageWidth - 80 - 24) / 2; // 2 columnas con gap de 24
  const imgHeight = 130;
  const cardHeight = imgHeight + 60;

  for (const categoria of categoriasOrdenadas) {
    doc.addPage();
    doc.rect(0, 0, pageWidth, doc.page.height).fill(COLORS.bg);
    drawHeader(doc, pageWidth);
    doc.y = 95;
    drawCategoriaHeader(doc, pageWidth, categoria);

    const items = porCategoria[categoria];
    let col = 0;
    let startY = doc.y;

    for (let i = 0; i < items.length; i++) {
      const p = items[i];

      if (startY + cardHeight > doc.page.height - 50) {
        doc.addPage();
        doc.rect(0, 0, pageWidth, doc.page.height).fill(COLORS.bg);
        drawHeader(doc, pageWidth);
        startY = 95;
        col = 0;
      }

      const x = 40 + col * (colWidth + 24);
      const y = startY;

      doc.roundedRect(x, y, colWidth, cardHeight, 3).lineWidth(0.75).stroke(COLORS.borde);

      const imgBuffer = await fetchImagenBuffer(p.imagen);
      if (imgBuffer) {
        try {
          doc.image(imgBuffer, x + 8, y + 8, {
            fit: [colWidth - 16, imgHeight - 12],
            align: "center",
            valign: "center",
          });
        } catch (e) {
          // imagen corrupta o formato no soportado; seguimos sin ella
        }
      }

      doc
        .fillColor(COLORS.texto)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(p.nombre, x + 10, y + imgHeight + 4, { width: colWidth - 20, height: 26, ellipsis: true });

      doc
        .fillColor(COLORS.navy)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(`$${p.precio.toLocaleString("es-AR")}`, x + 10, y + imgHeight + 32, { width: colWidth - 20 });

      col++;
      if (col > 1) {
        col = 0;
        startY += cardHeight + 16;
      }
    }
  }

  // --- Numeracion de paginas ---
  // Ojo: escribir muy cerca del margen inferior hace que pdfkit
  // dispare una pagina nueva "por overflow". Nos quedamos bien
  // adentro del margen y anulamos el margen inferior al vuelo.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const bottomMarginOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fontSize(8)
      .fillColor(COLORS.textoSuave)
      .text(`${i + 1} / ${range.count}`, 40, doc.page.height - 45, {
        width: pageWidth - 80,
        align: "center",
        lineBreak: false,
      });
    doc.page.margins.bottom = bottomMarginOriginal;
  }

  doc.end();
}

module.exports = { generarCatalogoPDF };
