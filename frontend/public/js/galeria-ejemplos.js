// Galería de ejemplos: un diálogo con una tarjeta por circuito (miniatura, nombre y descripción),
// en lugar de una lista larga dentro del panel.
import { dibujarComponente, dibujarTierra, el } from "./dibujo.js";

const $ = (id) => document.getElementById(id);
const PASO = 20;

/** Miniatura SVG del circuito, encuadrada en sus piezas. */
function miniatura(estado, vista) {
  const puntos = estado.components.flatMap((c) => [c.a, c.b]);
  const xs = puntos.map((p) => p.x);
  const ys = puntos.map((p) => p.y);
  const margen = 2;
  const x0 = Math.min(...xs) - margen;
  const y0 = Math.min(...ys) - margen;
  const ancho = (Math.max(...xs) - Math.min(...xs) + 2 * margen) * PASO;
  const alto = (Math.max(...ys) - Math.min(...ys) + 2 * margen) * PASO;
  const svg = el("svg", { class: "editor miniatura", viewBox: `0 0 ${ancho} ${alto}`, "aria-hidden": "true" });
  const px = (p) => ({ x: (p.x - x0) * PASO, y: (p.y - y0) * PASO });
  const cables = el("g", {}, svg);
  const piezas = el("g", {}, svg);
  for (const c of estado.components) {
    if (c.type === "ground") {
      dibujarTierra(px(c.a), piezas);
      continue;
    }
    const g = dibujarComponente({ type: c.type, a: px(c.a), b: px(c.b), closed: c.closed }, { vista, etiquetas: false });
    (c.type === "wire" ? cables : piezas).append(g);
  }
  return svg;
}

/**
 * @param {{ejemplos: object[], vista: () => string, alAbrir: (ejemplo) => void}} opciones
 */
export function crearGaleriaEjemplos({ ejemplos, vista, alAbrir }) {
  const dialogo = $("galeria-ejemplos");
  const lista = $("lista-ejemplos");

  function render() {
    lista.replaceChildren(...ejemplos.map((ejemplo) => {
      const li = document.createElement("li");
      const tarjeta = document.createElement("button");
      tarjeta.type = "button";
      tarjeta.className = "tarjeta-ejemplo";
      tarjeta.dataset.ejemplo = ejemplo.id;
      const nombre = document.createElement("span");
      nombre.className = "tarjeta-ejemplo__nombre";
      nombre.textContent = ejemplo.nombre;
      const descripcion = document.createElement("span");
      descripcion.className = "tarjeta-ejemplo__descripcion";
      descripcion.textContent = ejemplo.descripcion;
      tarjeta.append(miniatura(ejemplo.estado, vista()), nombre, descripcion);
      tarjeta.addEventListener("click", () => {
        dialogo.close();
        alAbrir(ejemplo);
      });
      li.append(tarjeta);
      return li;
    }));
  }

  $("galeria-cerrar").addEventListener("click", () => dialogo.close());
  // Un clic en el fondo oscuro (fuera de la tarjeta del diálogo) la cierra.
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });

  return {
    abrir() {
      render();
      dialogo.showModal();
      lista.querySelector("button")?.focus();
    },
  };
}
