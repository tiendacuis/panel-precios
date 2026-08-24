const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_GID = Number(process.env.GOOGLE_SHEET_GID || 0);

// Columnas tal cual estan hoy en el Sheet (sin fila de encabezado):
// A id | B nombre | C precio | D categoria | E descripcion | F imagen | G activo | H destacado
const COLUMNS = ["id", "nombre", "precio", "categoria", "descripcion", "imagen", "activo", "destacado"];
const LAST_COL = "H";

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

// Actualiza precio, imagen y/o activo de una fila puntual.
async function actualizarProducto(rowNumber, { precio, activo, imagen }) {
  const sheets = await getSheetsClient();
  const sheetName = await getSheetName(sheets);
  const data = [];

  if (precio !== undefined) {
    data.push({
      range: `${sheetName}!C${rowNumber}`,
      values: [[precio]],
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

module.exports = { getProductos, actualizarProducto, COLUMNS };
