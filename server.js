require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const { getProductos, actualizarProducto, reordenarProductos, agregarProducto, eliminarProducto, obtenerTextoPortada, guardarTextoPortada } = require("./sheets");
const { generarCatalogoPDF } = require("./catalogo-pdf");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "cambiar-este-secreto",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8hs
  })
);

function requireLogin(req, res, next) {
  if (req.session && req.session.logueado) return next();
  return res.status(401).json({ error: "No autenticado" });
}

// --- Login ---
app.post("/api/login", (req, res) => {
  const { usuario, clave } = req.body || {};
  if (usuario === process.env.ADMIN_USER && clave === process.env.ADMIN_PASS) {
    req.session.logueado = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Usuario o clave incorrectos" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/session", (req, res) => {
  res.json({ logueado: !!(req.session && req.session.logueado) });
});

// --- Productos ---
app.get("/api/productos", requireLogin, async (req, res) => {
  try {
    const productos = await getProductos();
    res.json(productos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/productos/:rowNumber", requireLogin, async (req, res) => {
  try {
    const rowNumber = Number(req.params.rowNumber);
    const { nombre, categoria, precio, activo, imagen } = req.body || {};
    await actualizarProducto(rowNumber, { nombre, categoria, precio, activo, imagen });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/productos", requireLogin, async (req, res) => {
  try {
    const { nombre, precio, categoria, descripcion, imagen, activo } = req.body || {};
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }
    const resultado = await agregarProducto({ nombre, precio, categoria, descripcion, imagen, activo });
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/productos/orden", requireLogin, async (req, res) => {
  try {
    const { rowNumbers } = req.body || {};
    if (!Array.isArray(rowNumbers) || rowNumbers.length === 0) {
      return res.status(400).json({ error: "Falta la lista de filas en el nuevo orden" });
    }
    await reordenarProductos(rowNumbers);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/productos/:rowNumber", requireLogin, async (req, res) => {
  try {
    const rowNumber = Number(req.params.rowNumber);
    await eliminarProducto(rowNumber);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/portada", requireLogin, async (req, res) => {
  try {
    const texto = await obtenerTextoPortada();
    res.json({ texto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/portada", requireLogin, async (req, res) => {
  try {
    const { texto } = req.body || {};
    await guardarTextoPortada(texto || "");
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Catalogo PDF ---
app.get("/api/catalogo.pdf", requireLogin, async (req, res) => {
  try {
    const [productos, textoPortada] = await Promise.all([
      getProductos().then((lista) => lista.filter((p) => p.activo)),
      obtenerTextoPortada(),
    ]);
    await generarCatalogoPDF(productos, res, { textoPortada });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Panel Tienda Cuis corriendo en el puerto ${PORT}`);
});
