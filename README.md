# Panel de precios · Tienda Cuis

Panel simple para editar precio y estado (activo/inactivo) de los productos
que hoy vive en el Google Sheet publicado que usa tiendacuis.com, más un
generador de catálogo en PDF con el diseño de la tienda.

**Importante:** este panel NO reemplaza ni modifica el sitio. Lee y escribe
directamente sobre el mismo Google Sheet que ya usa tiendacuis.com, así que
los cambios se reflejan solos en la web (con el mismo delay que siempre tiene
la publicación de un Sheet, normalmente 1-5 minutos).

## Qué hace

- **Login simple** con usuario/clave (una sola cuenta, la tuya).
- **Lista de productos** con foto, nombre, categoría, precio editable y switch de activo/inactivo.
- **Guardar** escribe directo en el Sheet real (no en el CSV publicado, que es de solo lectura).
- **Catálogo PDF**: genera al vuelo un PDF con los productos activos, agrupados por categoría, con los colores y tipografía de tiendacuis.com.

## Configuración necesaria (una sola vez)

Necesitás una cuenta de servicio de Google con permiso de edición sobre el
Sheet. Si todavía no la creaste, seguí estos pasos:

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com), creá un proyecto y activá la **Google Sheets API**.
2. `APIs y servicios` → `Credenciales` → `Crear credenciales` → `Cuenta de servicio`.
3. Generale una clave nueva tipo **JSON** y descargala.
4. Abrí el JSON, copiá el valor de `client_email`.
5. Abrí tu Google Sheet ("productos-completo"), botón `Compartir`, pegá ese email y dale rol de **Editor**.

## Variables de entorno

Copiá `.env.example` a `.env` (para probar local) o cargá estas mismas
variables en Render:

| Variable | Qué va ahí |
|---|---|
| `ADMIN_USER` | Usuario para entrar al panel |
| `ADMIN_PASS` | Clave para entrar al panel |
| `SESSION_SECRET` | Cualquier frase larga random |
| `GOOGLE_SHEET_ID` | `1VLXo96c2Q6kXtYUwZuUBktk5Ta3PrLdvBqF0Gn7MUBs` (ya cargado de ejemplo) |
| `GOOGLE_SHEET_GID` | `1201411934` (ya cargado de ejemplo) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | El JSON completo de la cuenta de servicio, en una sola línea |

Para pasar el JSON a una sola línea, podés abrirlo y quitar los saltos de
línea, o correr esto en tu máquina (Windows con PowerShell):

```powershell
Get-Content credenciales.json -Raw | ForEach-Object { $_ -replace "`r`n","" -replace "`n","" }
```

## Correrlo local (para probar antes de subir)

```bash
npm install
cp .env.example .env
# editá .env con tus datos reales
npm start
```

Abrís `http://localhost:3000` y entrás con el usuario/clave que pusiste.

## Deploy en Render

1. Subí esta carpeta a un repo nuevo de GitHub (ej. `panel-tiendacuis`).
2. En Render: `New` → `Web Service` → conectá el repo.
3. Build command: `npm install` — Start command: `npm start`.
4. En `Environment`, cargá las mismas variables de la tabla de arriba (el `GOOGLE_SERVICE_ACCOUNT_JSON` va como una sola variable con todo el JSON pegado).
5. Deploy. Te da una URL tipo `panel-tiendacuis.onrender.com` — esa es tu panel.

## Nota sobre las columnas del Sheet

El panel asume que la hoja tiene, sin fila de encabezado:

```
A: id | B: nombre | C: precio | D: categoria | E: descripcion | F: imagen | G: activo | H: destacado
```

Si en algún momento agregan una fila de encabezado arriba, hay que avisar
para ajustar el rango de lectura (`sheets.js`), porque hoy arranca a leer
desde la fila 1.
