const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_GID = Number(process.env.GOOGLE_SHEET_GID || 0);

// Columnas tal cual estan hoy en el Sheet (sin fila de encabezado):
// A id | B nombre | C precio | D categoria | E descripcion | F imagen | G activo | H destacado
const COLUMNS = ["id", "nombre", "precio", "categoria", "descripcion", "imagen", "activo", "destacado"];
const LAST_COL = "H";
const CELDA_PORTADA = "J1"; // celda reservada (fuera de las columnas de productos) para el texto de portada del catalogo

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

// Resuelve el nombre real de la hoja (tab) a partir del gid, para no
// tener que pedirselo a mano. Se cachea en memoria para no pegarle
// a la API en cada request.
let cachedSheetName = null;
async function getSheetName(sheets) {
  if (cachedSheetName) return cachedSheetName;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const match = meta.data.sheets.find((s) => s.properties.sheetId === SHEET_GID);
  if (!match) throw new Error(`No se encontro ninguna hoja con gid=${SHEET_GID}`);
  cachedSheetName = match.properties.title;
  return cachedSheetName;
}

function parseRow(row, rowNumber) {
  const [id, nombre, precio, categoria, descripcion, imagen, activo, destacado] = row;
  return {
    rowNumber, // fila real en el Sheet (1-based), la usamos para escribir despues
    id: id || "",
    nombre: nombre || "",
    precio: Number(String(precio || "0").replace(/[^0-9.-]/g, "")) || 0,
    categoria: categoria || "",
    descripcion: descripcion || "",
    imagen: imagen || "",
    activo: String(activo).trim().toUpperCase() === "TRUE",
    destacado: String(destacado).trim().toUpperCase() === "TRUE",
  };
}

async function getProductos() {
  const sheets = await getSheetsClient();
  const sheetName = await getSheetName(sheets);
  const range = `${sheetName}!A1:${LAST_COL}5000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  const rows = res.data.values || [];
  return rows
    .map((row, idx) => parseRow(row, idx + 1))
    .filter((p) => p.nombre); // ignora filas vacias al final
}

// Actualiza nombre, categoria, precio, imagen y/o activo de una fila puntual.
async function actualizarProducto(rowNumber, { nombre, categoria, precio, activo, imagen }) {
  const sheets = await getSheetsClient();
  const sheetName = await getSheetName(sheets);
  const data = [];

  if (nombre !== undefined) {
    data.push({
      range: `${sheetName}!B${rowNumber}`,
      values: [[nombre]],
    });
  }
  if (precio !== undefined) {
    data.push({
      range: `${sheetName}!C${rowNumber}`,
      values: [[precio]],
    });
  }
  if (categoria !== undefined) {
    data.push({
      range: `${sheetName}!D${rowNumber}`,
      values: [[categoria]],
    });
  }
  if (imagen !== undefined) {
    data.push({
      range: `${sheetName}!F${rowNumber}`,
      values: [[imagen]],
    });
  }
  if (activo !== undefined) {
    data.push({
      range: `${sheetName}!G${rowNumber}`,
      values: [[activo ? "TRUE" : "FALSE"]],
    });
  }

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });
}

function productoARow(p) {
  return [
    p.id,
    p.nombre,
    p.precio,
    p.categoria,
    p.descripcion || "",
    p.imagen || "",
    p.activo ? "TRUE" : "FALSE",
    "FALSE", // destacado ya no se usa: siempre se graba en FALSE
  ];
}

// Reordena TODA la lista de una vez, segun el array de ids recibido
// (en el orden visual que dejo el usuario arrastrando filas). Reescribe
// el bloque completo A:H, asi que de paso limpia cualquier "destacado"
// viejo que estuviera interfiriendo con el orden en el sitio.
async function reordenarProductos(ids) {
  const sheets = await getSheetsClient();
  const sheetName = await getSheetName(sheets);
  const productos = await getProductos();

  if (ids.length !== productos.length) {
    throw new Error("La lista de orden no coincide con la cantidad de productos");
  }

  const porId = new Map(productos.map((p) => [String(p.id), p]));
  const filas = ids.map((id) => {
    const p = porId.get(String(id));
    if (!p) throw new Error(`Producto con id ${id} no encontrado`);
    return productoARow(p);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:${LAST_COL}${filas.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: filas },
  });
}

// Agrega un producto nuevo al final de la lista.
async function agregarProducto({ nombre, precio, categoria, descripcion, imagen, activo }) {
  const sheets = await getSheetsClient();
  const sheetName = await getSheetName(sheets);
  const productos = await getProductos();

  const maxId = productos.reduce((max, p) => {
    const n = Number(p.id);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const nuevoId = maxId + 1;

  const row = [
    nuevoId,
    nombre || "",
    precio || 0,
    categoria || "",
    descripcion || "",
    imagen || "",
    activo === false ? "FALSE" : "TRUE",
    "FALSE", // destacado ya no se usa
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:${LAST_COL}1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  return { id: nuevoId };
}

// Texto libre para la portada del catalogo PDF (subtitulo, promo, lo que sea).
// Se guarda en una celda del mismo Sheet, fuera de las columnas de productos.
async function obtenerTextoPortada() {
  const sheets = await getSheetsClient();
  const sheetName = await getSheetName(sheets);
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!${CELDA_PORTADA}`,
    });
    return res.data.values?.[0]?.[0] || "";
  } catch (err) {
    return "";
  }
}

async function guardarTextoPortada(texto) {
  const sheets = await getSheetsClient();
  const sheetName = await getSheetName(sheets);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${CELDA_PORTADA}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[texto || ""]] },
  });
}

module.exports = { getProductos, actualizarProducto, reordenarProductos, agregarProducto, obtenerTextoPortada, guardarTextoPortada, COLUMNS };
