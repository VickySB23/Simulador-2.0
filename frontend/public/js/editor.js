// Editor SVG: dibuja el estado del controlador y traduce el puntero en acciones.
// El dibujo se rehace completo en cada render: los circuitos del editor son chicos.
import {
  ALTO_MUNDO, ANCHO_MUNDO, LARGO, TIPOS, centro, esVertical, mismoPunto, nombreNodo,
  nodosElectricos, puntosConTerminal, rotacionDe, terminalesDesdeCentro,
} from "./lib/modelo.js";
import { colorTension, puntosDeEtiqueta, sentidoCorriente, tensionesPorPunto } from "./lib/netlist.js";
import { formatearCompacto, formatearSI, interpretarValor } from "./lib/valores.js";

export const PASO = 20;
const MARGEN = 10;
const SVG_NS = "http://www.w3.org/2000/svg";
const ANCHO_PX = ANCHO_MUNDO * PASO + 2 * MARGEN;
const ALTO_PX = ALTO_MUNDO * PASO + 2 * MARGEN;
const PIEZAS = new Set(["resistor", "voltage_source", "current_source"]);
const DOBLE_CLIC_MS = 400;

const px = (punto) => ({ x: punto.x * PASO + MARGEN, y: punto.y * PASO + MARGEN });

function el(etiqueta, atributos = {}, padre = null) {
  const nodo = document.createElementNS(SVG_NS, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(clave, valor);
  }
  padre?.appendChild(nodo);
  return nodo;
}

function texto(contenido, atributos, padre) {
  const nodo = el("text", atributos, padre);
  nodo.textContent = contenido;
  return nodo;
}

// Símbolos dibujados de a hacia b sobre el eje x, en píxeles; después se rotan.
const LP = LARGO * PASO;
const SIMBOLOS = {
  resistor: (g) => {
    el("path", { class: "trazo", d: `M0 0H20l3.33-7 6.67 14 6.67-14 6.67 14 6.67-14 6.67 14 3.33-7H${LP}` }, g);
  },
  voltage_source: (g) => {
    el("path", { class: "trazo", d: `M0 0H26M54 0H${LP}` }, g);
    el("circle", { class: "trazo relleno-lienzo", cx: 40, cy: 0, r: 14 }, g);
  },
  current_source: (g) => {
    el("path", { class: "trazo", d: `M0 0H26M54 0H${LP}` }, g);
    el("circle", { class: "trazo relleno-lienzo", cx: 40, cy: 0, r: 14 }, g);
    // Sentido de la fuente: de a hacia b por dentro.
    el("path", { class: "trazo", d: "M31 0H48M43-5L48 0 43 5" }, g);
  },
};

function dibujarSimbolo(componente, padre, clase = "") {
  const a = px(componente.a);
  const g = el("g", {
    class: clase,
    transform: `translate(${a.x} ${a.y}) rotate(${rotacionDe(componente) * 90})`,
  }, padre);
  SIMBOLOS[componente.type](g);
  return g;
}

function unidadDireccion(desde, hasta) {
  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  const largo = Math.hypot(dx, dy) || 1;
  return { x: dx / largo, y: dy / largo };
}

function dibujarTierra(punto, padre, atributos = {}) {
  const p = px(punto);
  const g = el("g", atributos, padre);
  el("rect", { class: "golpe", x: p.x - 14, y: p.y - 2, width: 28, height: 28 }, g);
  el("path", {
    class: "trazo",
    d: `M${p.x} ${p.y}v12M${p.x - 10} ${p.y + 12}h20M${p.x - 6} ${p.y + 17}h12M${p.x - 2.5} ${p.y + 22}h5`,
  }, g);
  return g;
}

/**
 * @param {SVGSVGElement} svg
 * @param {object} ctl controlador (app.js): estado, seleccion, herramienta, rotacion, resultado,
 *   error y las acciones colocarPieza, agregarCable, ponerTierra, seleccionar, empezarArrastre,
 *   arrastrar, terminarArrastre, editarValor.
 */
export function crearEditor(svg, contenedor, ctl) {
  svg.setAttribute("viewBox", `0 0 ${ANCHO_PX} ${ALTO_PX}`);
  let zoom = 1;
  let puntero = null;
  let cablePendiente = null;
  let arrastre = null;
  let ultimoToque = null;

  function aplicarZoom(nuevo) {
    zoom = Math.min(2, Math.max(0.5, nuevo));
    svg.setAttribute("width", Math.round(ANCHO_PX * zoom));
    svg.setAttribute("height", Math.round(ALTO_PX * zoom));
  }

  function puntoDe(evento) {
    const matriz = svg.getScreenCTM()?.inverse();
    if (!matriz) return null;
    const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matriz);
    return {
      x: Math.min(ANCHO_MUNDO, Math.max(0, Math.round((p.x - MARGEN) / PASO))),
      y: Math.min(ALTO_MUNDO, Math.max(0, Math.round((p.y - MARGEN) / PASO))),
    };
  }

  function objetivo(evento) {
    const nodo = evento.target.closest?.("[data-id],[data-tierra]");
    if (!nodo) return null;
    return nodo.dataset.id ? { tipo: "componente", id: nodo.dataset.id } : { tipo: "tierra" };
  }

  // --- Dibujo ---------------------------------------------------------------------------

  function render() {
    const { estado, seleccion, resultado, error } = ctl;
    svg.replaceChildren();
    svg.classList.toggle("herramienta-seleccionar", ctl.herramienta === "seleccionar");

    const defs = el("defs", {}, svg);
    const patron = el("pattern", { id: "grilla", width: PASO, height: PASO, patternUnits: "userSpaceOnUse" }, defs);
    el("circle", { class: "punto-grilla", cx: MARGEN, cy: MARGEN, r: 1.2 }, patron);
    el("rect", { class: "fondo", width: ANCHO_PX, height: ALTO_PX }, svg);
    el("rect", { width: ANCHO_PX, height: ALTO_PX, fill: "url(#grilla)" }, svg);

    const tensiones = tensionesPorPunto(resultado);
    const valores = [...tensiones.values()];
    const minimo = Math.min(0, ...valores);
    const maximo = Math.max(0, ...valores);
    const colorDe = (punto) => {
      const v = tensiones.get(nombreNodo(punto));
      return v === undefined ? null : colorTension(v, minimo, maximo);
    };
    const corrientes = new Map((resultado?.components ?? []).map((c) => [c.id, c.current]));
    const nodosConError = new Set(error?.details?.nodes ?? []);
    const componentesConError = new Set(error?.details?.components ?? []);

    const capaCables = el("g", {}, svg);
    const capaPiezas = el("g", {}, svg);
    const capaNodos = el("g", {}, svg);
    const capaTextos = el("g", {}, svg);
    const capaTierra = el("g", {}, svg);
    const capaFantasma = el("g", { class: "fantasma" }, svg);

    for (const c of estado.components) {
      const clases = ["componente"];
      if (seleccion?.tipo === "componente" && seleccion.id === c.id) clases.push("seleccionado");
      if (componentesConError.has(c.id)) clases.push("con-error");
      const a = px(c.a);
      const b = px(c.b);
      const capa = c.type === "wire" ? capaCables : capaPiezas;
      const g = el("g", { class: clases.join(" "), "data-id": c.id }, capa);
      el("title", {}, g).textContent = c.type === "wire" ? c.id : `${c.id} · ${TIPOS[c.type].nombre}`;
      el("line", { class: "golpe", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
      if (c.type === "wire") {
        const linea = el("line", { class: "trazo cable", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
        const color = colorDe(c.a);
        if (color && !componentesConError.has(c.id)) linea.style.stroke = color;
        continue;
      }
      dibujarSimbolo(c, g);
      dibujarTextosPieza(c, capaTextos, corrientes.get(c.id));
    }

    // Nodos: un punto por terminal, coloreado por tensión.
    for (const [nombre, punto] of puntosConTerminal(estado)) {
      const p = px(punto);
      const color = colorDe(punto);
      const nodo = el("circle", { class: color ? "nodo" : "nodo nodo-neutro", cx: p.x, cy: p.y, r: 4 }, capaNodos);
      if (color) nodo.style.fill = color;
      el("title", {}, nodo).textContent = tensiones.has(nombre)
        ? `Nodo ${nombre}: ${formatearSI(tensiones.get(nombre), "V")}`
        : `Nodo ${nombre}`;
      if (nodosConError.has(nombre)) {
        el("circle", { class: "anillo-error", cx: p.x, cy: p.y, r: 9 }, capaNodos);
      }
    }

    // Una etiqueta de tensión por nodo eléctrico.
    if (resultado) {
      for (const punto of puntosDeEtiqueta(estado)) {
        const v = tensiones.get(nombreNodo(punto));
        if (v === undefined) continue;
        const p = px(punto);
        texto(formatearSI(v, "V"), { class: "texto tension", x: p.x - 7, y: p.y - 8, "text-anchor": "end" }, capaTextos);
      }
    }

    if (estado.ground) {
      dibujarTierra(estado.ground, capaTierra, {
        class: seleccion?.tipo === "tierra" ? "componente seleccionado" : "componente",
        "data-tierra": "1",
      });
    }

    dibujarFantasma(capaFantasma);
  }

  function dibujarTextosPieza(c, capa, corriente) {
    const m = px(centro(c));
    const vertical = esVertical(c);
    const unidad = TIPOS[c.type].unidad;
    let valorTexto;
    let valido = true;
    try {
      valorTexto = formatearCompacto(interpretarValor(c.value), unidad);
    } catch {
      valorTexto = String(c.value);
      valido = false;
    }
    const claseValor = valido ? "texto texto-valor" : "texto texto-valor invalido";
    if (vertical) {
      texto(c.id, { class: "texto texto-id", x: m.x + 20, y: m.y - 3 }, capa);
      texto(valorTexto, { class: claseValor, x: m.x + 20, y: m.y + 12 }, capa);
    } else {
      const t = texto("", { class: "texto", x: m.x, y: m.y - 20, "text-anchor": "middle" }, capa);
      el("tspan", { class: "texto-id" }, t).textContent = `${c.id} `;
      el("tspan", { class: claseValor }, t).textContent = valorTexto;
    }

    // Polaridad de la fuente de tensión: + en a, − en b, siempre derecho aunque esté vertical.
    if (c.type === "voltage_source") {
      const u = unidadDireccion(c.a, c.b);
      for (const [signo, k] of [["+", -7], ["−", 7]]) {
        texto(signo, {
          class: "polaridad", x: m.x + u.x * k, y: m.y + u.y * k,
          "text-anchor": "middle", "dominant-baseline": "central",
        }, capa);
      }
    }

    // Flecha con el sentido real de la corriente, del lado opuesto a la etiqueta.
    const sentido = sentidoCorriente(c, corriente);
    if (!sentido) return;
    const u = unidadDireccion(sentido.desde, sentido.hasta);
    const base = vertical ? { x: m.x - 16, y: m.y } : { x: m.x, y: m.y + 16 };
    const inicio = { x: base.x - u.x * 11, y: base.y - u.y * 11 };
    const punta = { x: base.x + u.x * 11, y: base.y + u.y * 11 };
    el("line", { class: "flecha", x1: inicio.x, y1: inicio.y, x2: punta.x - u.x * 4, y2: punta.y - u.y * 4 }, capa);
    const n = { x: -u.y, y: u.x };
    el("path", {
      class: "punta",
      d: `M${punta.x} ${punta.y}L${punta.x - u.x * 7 + n.x * 4} ${punta.y - u.y * 7 + n.y * 4}` +
        `L${punta.x - u.x * 7 - n.x * 4} ${punta.y - u.y * 7 - n.y * 4}Z`,
    }, capa);
    const etiqueta = formatearSI(sentido.magnitud, "A");
    if (vertical) {
      texto(etiqueta, {
        class: "texto texto-corriente", x: base.x - 8, y: base.y,
        "text-anchor": "end", "dominant-baseline": "central",
      }, capa);
    } else {
      texto(etiqueta, { class: "texto texto-corriente", x: base.x, y: base.y + 16, "text-anchor": "middle" }, capa);
    }
  }

  function dibujarFantasma(capa) {
    if (!puntero || ctl.herramienta === "seleccionar") return;
    const p = px(puntero);
    if (PIEZAS.has(ctl.herramienta)) {
      const { a, b } = terminalesDesdeCentro(puntero, ctl.rotacion);
      dibujarSimbolo({ type: ctl.herramienta, a, b }, capa);
    } else if (ctl.herramienta === "ground") {
      dibujarTierra(puntero, capa);
    }
    if (cablePendiente) {
      const q = px(cablePendiente);
      el("line", { class: "cable-pendiente", x1: q.x, y1: q.y, x2: p.x, y2: p.y }, svg);
    }
    el("circle", { class: "cursor", cx: p.x, cy: p.y, r: 4 }, svg);
  }

  // --- Puntero ---------------------------------------------------------------------------

  svg.addEventListener("pointerdown", (evento) => {
    if (evento.button !== 0) return;
    const punto = puntoDe(evento);
    if (!punto) return;
    puntero = punto;
    const herramienta = ctl.herramienta;
    if (herramienta === "seleccionar") {
      const sel = objetivo(evento);
      // Doble clic (o doble toque) detectado a mano: cada render reemplaza los elementos del SVG,
      // así que el evento dblclick del navegador no siempre llega al componente.
      const ahora = evento.timeStamp;
      const esDoble = sel?.tipo === "componente" && ultimoToque?.id === sel.id &&
        ahora - ultimoToque.tiempo < DOBLE_CLIC_MS;
      ultimoToque = sel?.tipo === "componente" ? { id: sel.id, tiempo: ahora } : null;
      if (esDoble) {
        ultimoToque = null;
        ctl.editarValor(sel.id);
        evento.preventDefault();
        return;
      }
      ctl.seleccionar(sel);
      if (sel) {
        arrastre = { inicio: punto, dx: 0, dy: 0 };
        ctl.empezarArrastre();
        svg.setPointerCapture(evento.pointerId);
      }
    } else if (herramienta === "wire") {
      if (!cablePendiente) cablePendiente = punto;
      svg.setPointerCapture(evento.pointerId);
    } else if (herramienta === "ground") {
      ctl.ponerTierra(punto);
    } else if (PIEZAS.has(herramienta)) {
      ctl.colocarPieza(herramienta, punto);
    }
    render();
    evento.preventDefault();
  });

  svg.addEventListener("pointermove", (evento) => {
    const punto = puntoDe(evento);
    if (!punto) return;
    const cambio = !puntero || !mismoPunto(punto, puntero);
    puntero = punto;
    if (arrastre) {
      const dx = punto.x - arrastre.inicio.x;
      const dy = punto.y - arrastre.inicio.y;
      if (dx !== arrastre.dx || dy !== arrastre.dy) {
        arrastre.dx = dx;
        arrastre.dy = dy;
        ctl.arrastrar(dx, dy);
      }
    } else if (cambio && ctl.herramienta !== "seleccionar") {
      render();
    }
  });

  svg.addEventListener("pointerup", (evento) => {
    const punto = puntoDe(evento) ?? puntero;
    if (arrastre) {
      arrastre = null;
      ctl.terminarArrastre();
    } else if (ctl.herramienta === "wire" && cablePendiente && punto && !mismoPunto(punto, cablePendiente)) {
      // Arrastrar o hacer clic en dos puntos: las dos formas terminan acá.
      const inicio = cablePendiente;
      cablePendiente = null;
      ctl.agregarCable(inicio, punto);
    }
    render();
  });

  svg.addEventListener("pointercancel", () => {
    if (arrastre) {
      arrastre = null;
      ctl.terminarArrastre();
    }
  });

  svg.addEventListener("pointerleave", (evento) => {
    if (evento.pointerType === "mouse" && !arrastre) {
      puntero = null;
      render();
    }
  });

  aplicarZoom(1);

  return {
    render,
    cancelarCable() {
      const habia = cablePendiente !== null;
      cablePendiente = null;
      render();
      return habia;
    },
    acercar: () => { aplicarZoom(zoom * 1.2); },
    alejar: () => { aplicarZoom(zoom / 1.2); },
    ajustar() {
      aplicarZoom(Math.max(0.6, Math.min(1.4, (contenedor.clientWidth - 4) / ANCHO_PX)));
    },
    /** Grupo de nodos eléctricos, para la tabla de resultados. */
    nodos: () => nodosElectricos(ctl.estado),
  };
}
