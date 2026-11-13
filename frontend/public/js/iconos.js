// Íconos propios: grilla de 24, trazo redondeado del grosor del borde (token --borde), mismo
// lenguaje que las ilustraciones. relleno-suave da el acento de color plano.
const NS = "http://www.w3.org/2000/svg";

const p = (d, clase) => ["path", { d, class: clase }];
const c = (cx, cy, r, clase) => ["circle", { cx, cy, r, class: clase }];
const r = (x, y, width, height, rx, clase) => ["rect", { x, y, width, height, rx, class: clase }];

export const ICONOS = {
  seleccionar: [p("M6 3.5l12.5 7.6-5.8 1.6-2.6 6.1z", "relleno-suave"), p("M6 3.5l12.5 7.6-5.8 1.6-2.6 6.1z")],
  cable: [c(5, 19, 2.3), c(19, 5, 2.3), p("M6.8 17.2L17.2 6.8")],
  resistencia: [p("M2 12h4.5M17.5 12H22"), r(6.5, 8.5, 11, 7, 3, "relleno-suave"), r(6.5, 8.5, 11, 7, 3), p("M10 8.8v6.4M13.5 8.8v6.4")],
  bateria: [r(2.5, 7, 16, 10, 2.5, "relleno-suave"), r(2.5, 7, 16, 10, 2.5), p("M18.5 10.2h2.3v3.6h-2.3"), p("M6 12h4M8 10v4M13 12h2.5")],
  "fuente-corriente": [c(12, 12, 8, "relleno-suave"), c(12, 12, 8), p("M7.5 12h8.5M13 9l3 3-3 3")],
  lampara: [p("M12 3a6 6 0 0 0-3.6 10.8V16h7.2v-2.2A6 6 0 0 0 12 3z", "relleno-suave"),
    p("M12 3a6 6 0 0 0-3.6 10.8V16h7.2v-2.2A6 6 0 0 0 12 3z"), p("M9.2 19h5.6M10.2 21.5h3.6M10.5 12l1.5-2 1.5 2")],
  interruptor: [c(5, 16, 2.2), c(19, 16, 2.2), p("M6.9 14.9L17.6 7.4"), p("M3 19.5h18", "")],
  tierra: [p("M12 3v9M5 12h14M8 16h8M10.5 20h3")],
  rotar: [p("M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v5h-5")],
  valor: [p("M4 20h4L19 9l-4-4L4 16z", "relleno-suave"), p("M4 20h4L19 9l-4-4L4 16zM13 7l4 4")],
  ajustar: [p("M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"), r(8, 8, 8, 8, 2, "relleno-suave"), r(8, 8, 8, 8, 2)],
  abajo: [p("M7 10l5 5 5-5")],
  panel: [r(3, 4, 18, 16, 3, "relleno-suave"), r(3, 4, 18, 16, 3), p("M14 4v16")],
  ejemplos: [r(3, 3, 8, 8, 2, "relleno-suave"), r(3, 3, 8, 8, 2), r(13, 3, 8, 8, 2), r(3, 13, 8, 8, 2), r(13, 13, 8, 8, 2, "relleno-suave"), r(13, 13, 8, 8, 2)],
  varios: [p("M3 8V4.5A1.5 1.5 0 0 1 4.5 3H8M16 3h3.5A1.5 1.5 0 0 1 21 4.5V8M21 16v3.5a1.5 1.5 0 0 1-1.5 1.5H16M8 21H4.5A1.5 1.5 0 0 1 3 19.5V16"),
    r(8, 8, 8, 8, 2, "relleno-suave"), r(8, 8, 8, 8, 2)],
  duplicar: [r(8.5, 8.5, 12, 12, 2.5, "relleno-suave"), r(8.5, 8.5, 12, 12, 2.5),
    p("M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5")],
  borrar: [p("M6 7l1 13h10l1-13z", "relleno-suave"), p("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5")],
  deshacer: [p("M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3")],
  rehacer: [p("M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3")],
  imagen: [r(3, 3, 18, 18, 3.5, "relleno-suave"), r(3, 3, 18, 18, 3.5), c(9, 9, 2), p("M21 15l-5-5L5 21")],
  descargar: [p("M12 3v12M7 10l5 5 5-5M4.5 20.5h15")],
  compartir: [c(18, 5, 3, "relleno-suave"), c(6, 12, 3, "relleno-suave"), c(18, 19, 3, "relleno-suave"),
    c(18, 5, 3), c(6, 12, 3), c(18, 19, 3), p("M8.6 13.5l6.8 4M15.4 6.5l-6.8 4")],
  proyector: [r(2.5, 4, 19, 13, 2.5, "relleno-suave"), r(2.5, 4, 19, 13, 2.5), p("M8 21h8M12 17v4")],
  sol: [c(12, 12, 4, "relleno-suave"), c(12, 12, 4), p("M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4")],
  luna: [p("M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z", "relleno-suave"), p("M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z")],
  pausa: [r(6.5, 5, 4, 14, 1.5, "relleno"), r(13.5, 5, 4, 14, 1.5, "relleno")],
  reproducir: [p("M8 5.5v13l10.5-6.5z", "relleno-suave"), p("M8 5.5v13l10.5-6.5z")],
  sentido: [p("M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3")],
  ilustrada: [p("M12 3l2.3 5.4L20 9l-4.3 3.9L17 19l-5-3-5 3 1.3-6.1L4 9l5.7-.6z", "relleno-suave"),
    p("M12 3l2.3 5.4L20 9l-4.3 3.9L17 19l-5-3-5 3 1.3-6.1L4 9l5.7-.6z")],
  esquematica: [p("M2 12h4l1.5-4 3 8 3-8 3 8 1.5-4h4")],
  guardar: [p("M5 3h11l3 3v15H5z", "relleno-suave"), p("M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7")],
  abrir: [p("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "relleno-suave"),
    p("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z")],
  nuevo: [p("M12 5v14M5 12h14")],
  exportar: [p("M12 15V3M7 8l5-5 5 5M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5")],
  importar: [p("M12 3v12M7 10l5 5 5-5M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5")],
  ecuaciones: [p("M17.5 5H7l6 7-6 7h10.5")],
  actualizar: [p("M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5")],
  cerrar: [p("M6 6l12 12M18 6L6 18")],
};

/** Devuelve un <svg class="icono"> con el ícono pedido. */
export function icono(nombre, titulo = null) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icono");
  if (titulo) {
    const t = document.createElementNS(NS, "title");
    t.textContent = titulo;
    svg.append(t);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  for (const [etiqueta, atributos] of ICONOS[nombre] ?? []) {
    const nodo = document.createElementNS(NS, etiqueta);
    for (const [k, v] of Object.entries(atributos)) if (v !== undefined && v !== "") nodo.setAttribute(k, v);
    svg.append(nodo);
  }
  return svg;
}

/** Reemplaza cada <span data-icono="nombre"> del documento por su ícono. */
export function colocarIconos(raiz = document) {
  for (const marca of raiz.querySelectorAll("[data-icono]")) {
    marca.replaceWith(icono(marca.dataset.icono));
  }
}
