// Service worker: guarda todos los archivos en la primera visita para que el simulador funcione
// sin internet (por ejemplo, en un aula sin wifi). Responde desde la caché y, si hay red, la
// actualiza en segundo plano: los cambios publicados se ven en la visita siguiente.
// tests/sw.test.js verifica que ARCHIVOS incluya todo lo que hay en public/.
const VERSION = "simulador-dc-v1";
const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icono.svg",
  "css/app.css",
  "js/tema.js",
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
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET" || new URL(pedido.url).origin !== self.location.origin) return;
  evento.respondWith(caches.open(VERSION).then(async (cache) => {
    // La página se pide con distintas URL (/, /index.html, con ?query): todas son index.html.
    const clave = pedido.mode === "navigate" ? "index.html" : pedido;
    const guardada = await cache.match(clave, { ignoreSearch: true });
    const deRed = fetch(pedido)
      .then((respuesta) => {
        if (respuesta.ok) cache.put(clave, respuesta.clone());
        return respuesta;
      })
      .catch(() => guardada);
    if (guardada) {
      evento.waitUntil(deRed);
      return guardada;
    }
    return deRed;
  }));
});
