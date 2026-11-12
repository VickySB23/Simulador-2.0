// Service worker: permite usar el simulador sin internet (por ejemplo, en un aula sin wifi).
//
// - Caché con versión: VERSION nombra la caché; al activarse una versión nueva se borran las viejas.
//   Tiene que coincidir con js/version.js (lo verifica tests/sw.test.js).
// - Red primero, para el HTML y también para JS y CSS: así una página nunca mezcla un HTML nuevo
//   con un JS viejo. Si la red no responde en TIEMPO_RED_MS o no hay conexión, se usa la caché.
// - Una versión nueva se instala en segundo plano y queda esperando: la página muestra
//   "Hay una versión nueva — Actualizar" y la activa recién cuando el usuario toca el botón.
const VERSION = "simulador-dc-v3";
const TIEMPO_RED_MS = 4000;
const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icono.svg",
  "css/app.css",
  "js/tema.js",
  "js/version.js",
  "js/actualizacion.js",
  "js/app.js",
  "js/editor.js",
  "js/exportar.js",
  "js/paneles.js",
  "js/lib/almacen.js",
  "js/lib/compartir.js",
  "js/lib/ecuaciones.js",
  "js/lib/ejemplos.js",
  "js/lib/historial.js",
  "js/lib/mna.js",
  "js/lib/modelo.js",
  "js/lib/netlist.js",
  "js/lib/valores.js",
];

self.addEventListener("install", (evento) => {
  // cache: "reload" saltea la caché HTTP (GitHub Pages cachea 10 minutos): se guarda lo publicado.
  evento.waitUntil(caches.open(VERSION).then((cache) =>
    cache.addAll(ARCHIVOS.map((archivo) => new Request(archivo, { cache: "reload" })))));
  // Sin skipWaiting: si ya hay una versión activa, la nueva espera a que el usuario toque Actualizar.
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "VERSION") evento.ports[0]?.postMessage({ tipo: "VERSION", version: VERSION });
  if (evento.data?.tipo === "ACTIVAR") self.skipWaiting();
});

function conLimite(promesa, ms) {
  return Promise.race([promesa, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("lenta")), ms))]);
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (pedido.method !== "GET" || url.origin !== self.location.origin) return;
  // La página se pide con distintas URL (/, /index.html, ?query, #c=...): todas son index.html.
  const esPagina = pedido.mode === "navigate";
  const clave = esPagina ? "index.html" : url.pathname.endsWith("/") ? "./" : pedido;
  evento.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      // no-cache: el navegador revalida con el servidor en lugar de usar su caché HTTP.
      const respuesta = await conLimite(fetch(esPagina ? url.href : pedido, { cache: "no-cache" }), TIEMPO_RED_MS);
      if (respuesta.ok) evento.waitUntil(cache.put(clave, respuesta.clone()));
      return respuesta;
    } catch {
      const guardada = await cache.match(clave, { ignoreSearch: true });
      return guardada ?? Response.error();
    }
  })());
});
