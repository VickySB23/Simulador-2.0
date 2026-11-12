// Exportación del circuito a SVG y PNG.
// El dibujo del editor toma colores y grosores de las hojas CSS (tokens); un archivo suelto no las tiene, así
// que se copian los estilos calculados como atributos de presentación (fill, stroke...). Se usan
// atributos y no style="" porque la CSP de la página no permite estilos en línea.

const PROPIEDADES = [
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "opacity", "font-family", "font-size", "font-weight", "paint-order",
];
const MARGEN = 24;

function copiarEstilos(original, copia) {
  const recorrerOriginal = document.createTreeWalker(original, NodeFilter.SHOW_ELEMENT);
  const recorrerCopia = document.createTreeWalker(copia, NodeFilter.SHOW_ELEMENT);
  let a = recorrerOriginal.currentNode;
  let b = recorrerCopia.currentNode;
  while (a && b) {
    const estilo = getComputedStyle(a);
    for (const propiedad of PROPIEDADES) {
      const valor = estilo.getPropertyValue(propiedad);
      if (valor) b.setAttribute(propiedad, valor);
    }
    a = recorrerOriginal.nextNode();
    b = recorrerCopia.nextNode();
  }
}

/** Caja que ocupa el circuito (sin la grilla), en coordenadas del SVG. */
function cajaDelCircuito(svg) {
  let caja = null;
  for (const capa of svg.querySelectorAll(":scope > g:not(.fantasma)")) {
    if (!capa.childElementCount) continue;
    const b = capa.getBBox();
    if (!b.width && !b.height) continue;
    caja = caja
      ? {
        x: Math.min(caja.x, b.x), y: Math.min(caja.y, b.y),
        x2: Math.max(caja.x2, b.x + b.width), y2: Math.max(caja.y2, b.y + b.height),
      }
      : { x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height };
  }
  return caja;
}

/** Devuelve {texto, ancho, alto} con el SVG del circuito recortado y con fondo. Null si está vacío. */
export function svgDelCircuito(svg) {
  const caja = cajaDelCircuito(svg);
  if (!caja) return null;
  const copia = svg.cloneNode(true);
  copiarEstilos(svg, copia);
  // Sin grilla, fondo del editor, cursor, fantasma ni las líneas invisibles para el clic.
  copia.querySelectorAll("defs, :scope > rect, .fantasma, .cursor, .cable-pendiente, .golpe, title")
    .forEach((nodo) => nodo.remove());
  // Las clases y data-* solo sirven en el editor.
  for (const nodo of copia.querySelectorAll("*")) {
    nodo.removeAttribute("class");
    for (const atributo of [...nodo.attributes]) if (atributo.name.startsWith("data-")) nodo.removeAttribute(atributo.name);
  }
  for (const atributo of ["width", "height", "role", "aria-label", "id", "class"]) copia.removeAttribute(atributo);

  const x = Math.floor(caja.x - MARGEN);
  const y = Math.floor(caja.y - MARGEN);
  const ancho = Math.ceil(caja.x2 - caja.x + 2 * MARGEN);
  const alto = Math.ceil(caja.y2 - caja.y + 2 * MARGEN);
  copia.setAttribute("viewBox", `${x} ${y} ${ancho} ${alto}`);
  copia.setAttribute("width", ancho);
  copia.setAttribute("height", alto);
  const fondo = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (const [k, v] of Object.entries({ x, y, width: ancho, height: alto })) fondo.setAttribute(k, v);
  fondo.setAttribute("fill", getComputedStyle(svg.querySelector(".fondo") ?? svg).getPropertyValue("fill") || "#ffffff");
  copia.prepend(fondo);
  const texto = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copia)}`;
  return { texto, ancho, alto };
}

/** Rasteriza el SVG a PNG, al doble de resolución para que se vea nítido en el proyector. */
export async function pngDelCircuito({ texto, ancho, alto }, escala = 2) {
  const url = URL.createObjectURL(new Blob([texto], { type: "image/svg+xml" }));
  try {
    const imagen = new Image();
    imagen.src = url;
    await imagen.decode();
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho * escala;
    lienzo.height = alto * escala;
    lienzo.getContext("2d").drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await new Promise((resolver, rechazar) =>
      lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error("No se pudo crear la imagen."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function descargar(contenido, nombreArchivo, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Mixto (TP4)" -> "mixto-tp4". */
export function nombreDeArchivo(nombre) {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "circuito";
}
