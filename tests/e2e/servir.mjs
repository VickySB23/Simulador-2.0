// Servidor estático mínimo para probar frontend/public en local (sin dependencias).
// Uso: node tests/e2e/servir.mjs [PUERTO]     -> http://localhost:8000/
// Sirve también desde una subcarpeta (/Simulador-2.0/) para imitar a GitHub Pages.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../frontend/public/", import.meta.url));
const PUERTO = Number(process.argv[2] ?? process.env.PUERTO ?? 8000);
const SUBCARPETA = "/Simulador-2.0";
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

createServer(async (pedido, respuesta) => {
  let ruta = decodeURIComponent(new URL(pedido.url, "http://x").pathname);
  if (ruta.startsWith(SUBCARPETA)) ruta = ruta.slice(SUBCARPETA.length) || "/";
  if (ruta.endsWith("/")) ruta += "index.html";
  const archivo = normalize(join(RAIZ, ruta));
  if (!archivo.startsWith(normalize(RAIZ))) {
    respuesta.writeHead(403).end();
    return;
  }
  try {
    const contenido = await readFile(archivo);
    respuesta.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
  }
}).listen(PUERTO, () => console.log(`Simulador DC en http://localhost:${PUERTO}/ (y ${SUBCARPETA}/)`));
