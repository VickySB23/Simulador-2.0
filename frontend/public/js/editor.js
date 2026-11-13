// Editor SVG: dibuja el estado del controlador con js/dibujo.js (vista ilustrada o esquemática) y
// traduce el puntero en acciones. El SVG queda estático; lo que se mueve (puntos de corriente, halo,
// calor, pulso) lo dibuja el animador en un canvas encima. El circuito se redibuja entero en cada
// cambio, salvo en dos casos que tienen que ser fluidos con 50 componentes en un celular:
// - el fantasma de la pieza a colocar se redibuja solo;
// - al arrastrar, lo seleccionado (con sus flechas y etiquetas) pasa a un SVG superpuesto que se
//   desplaza con transform de CSS, sin repintar el circuito; al soltar se simula y se redibuja una
//   vez. Reconstruir el SVG en cada movimiento costaba ~280 ms con la CPU 4× más lenta.
// Selección: clic elige una pieza; Ctrl/Shift + clic suma o saca; arrastrar sobre el fondo dibuja
// un rectángulo (con Ctrl/Shift se suma a lo que había).
import { dibujarComponente, dibujarNodo, dibujarTierra, el } from "./dibujo.js";
import { calorResistencia, colorTension } from "./lib/animacion.js";
import { corrientesDeTramos } from "./lib/corrientes.js";
import {
  ALTO_MUNDO, ANCHO_MUNDO, TIPOS, centro, esVertical, mismoPunto, nombreNodo, nodosElectricos,
  puntosConTerminal, terminalesDesdeCentro,
} from "./lib/modelo.js";
import { puntosDeEtiqueta, sentidoCorriente, tensionesPorPunto } from "./lib/netlist.js";
import { SELECCION_VACIA, alternarEnSeleccion, seleccionEnRectangulo, unirSelecciones } from "./lib/seleccion.js";
import { formatearCompacto, formatearSI, interpretarValor } from "./lib/valores.js";

export const PASO = 20;
const MARGEN = 10;
const ANCHO_PX = ANCHO_MUNDO * PASO + 2 * MARGEN;
const ALTO_PX = ALTO_MUNDO * PASO + 2 * MARGEN;
const PIEZAS = new Set(["resistor", "voltage_source", "current_source", "lamp", "switch"]);
const DOBLE_CLIC_MS = 400;

const px = (punto) => ({ x: punto.x * PASO + MARGEN, y: punto.y * PASO + MARGEN });

function texto(contenido, atributos, padre) {
  const nodo = el("text", atributos, padre);
  nodo.textContent = contenido;
  return nodo;
}

function compacto(valor, unidad) {
  try {
    return formatearCompacto(interpretarValor(valor), unidad);
  } catch {
    return String(valor);
  }
}

/** Texto del valor que acompaña al nombre del componente. */
function valorTexto(c) {
  if (c.type === "lamp") return `${compacto(c.value, "Ω")} · ${compacto(c.potencia, "W")}`;
  if (c.type === "switch" || c.type === "wire") return null;
  return compacto(c.value, TIPOS[c.type].unidad);
}

function unidadDireccion(desde, hasta) {
  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  const largo = Math.hypot(dx, dy) || 1;
  return { x: dx / largo, y: dy / largo };
}

/** Flecha fija con el sentido real y el valor de la corriente (se ve también en pausa). */
function dibujarFlecha(capaTextos, c, corriente) {
  const sentido = sentidoCorriente(c, corriente);
  if (!sentido) return;
  const capa = el("g", { "data-de": c.id }, capaTextos);
  const m = px(centro(c));
  const vertical = esVertical(c);
  const u = unidadDireccion(sentido.desde, sentido.hasta);
  // Del lado opuesto a la etiqueta; la lámpara ilustrada tiene el bulbo arriba, así que va abajo igual.
  const base = vertical ? { x: m.x - 18, y: m.y } : { x: m.x, y: m.y + 18 };
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
    texto(etiqueta, { class: "etiqueta etiqueta--corriente texto-corriente", x: base.x - 8, y: base.y, "text-anchor": "end", "dominant-baseline": "central" }, capa);
  } else {
    texto(etiqueta, { class: "etiqueta etiqueta--corriente texto-corriente", x: base.x, y: base.y + 16, "text-anchor": "middle" }, capa);
  }
}

/**
 * @param {SVGSVGElement} svg
 * @param {HTMLElement} contenedor  elemento con scroll que contiene al SVG
 * @param {object} ctl  controlador (app.js): estado, seleccion, herramienta, rotacion, vista,
 *   resultado, error y las acciones colocarPieza, agregarCable, ponerTierra, seleccionar,
 *   empezarArrastre, arrastrar, terminarArrastre, editarValor y alternarInterruptor.
 * @param {import("./animador.js").Animador} animador
 */
export function crearEditor(svg, contenedor, ctl, animador) {
  svg.setAttribute("viewBox", `0 0 ${ANCHO_PX} ${ALTO_PX}`);
  let zoom = 1;
  let puntero = null;
  let cablePendiente = null;
  let arrastre = null;
  let rectangulo = null;
  let ultimoToque = null;
  let capaFantasma = null;
  let animacionesActuales = [];
  const capa = animador.registrar(contenedor, svg, []);

  function aplicarZoom(nuevo) {
    zoom = Math.min(2, Math.max(0.5, nuevo));
    svg.setAttribute("width", Math.round(ANCHO_PX * zoom));
    svg.setAttribute("height", Math.round(ALTO_PX * zoom));
    animador.reajustar(capa);
  }

  /** Punto del mundo bajo el puntero, sin redondear (en celdas). */
  function puntoExacto(evento) {
    const matriz = svg.getScreenCTM()?.inverse();
    if (!matriz) return null;
    const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matriz);
    return { x: (p.x - MARGEN) / PASO, y: (p.y - MARGEN) / PASO };
  }

  function puntoDe(evento) {
    const p = puntoExacto(evento);
    if (!p) return null;
    return {
      x: Math.min(ANCHO_MUNDO, Math.max(0, Math.round(p.x))),
      y: Math.min(ALTO_MUNDO, Math.max(0, Math.round(p.y))),
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

    const tensiones = new Map([...tensionesPorPunto(resultado)].filter(([, v]) => v !== null));
    const valores = [...tensiones.values()];
    const minima = Math.min(0, ...valores);
    const maxima = Math.max(0, ...valores);
    const colorDe = (punto) => {
      const v = tensiones.get(nombreNodo(punto));
      return v === undefined ? null : colorTension(v, minima, maxima);
    };
    const porId = new Map((resultado?.components ?? []).map((c) => [c.id, c]));
    const tramos = corrientesDeTramos(estado, resultado);
    const potenciaMaxima = Math.max(0, ...[...porId.values()].filter((c) => c.type === "resistor").map((c) => c.power));
    const nodosConError = new Set(error?.details?.nodes ?? []);
    const componentesConError = new Set(error?.details?.components ?? []);
    const seleccionados = new Set(seleccion.ids);
    const sinConectar = ctl.sinConectar ?? new Set();

    const capaCables = el("g", {}, svg);
    const capaPiezas = el("g", {}, svg);
    const capaNodos = el("g", {}, svg);
    const capaTextos = el("g", {}, svg);
    const capaTierra = el("g", {}, svg);
    capaFantasma = el("g", { class: "fantasma" }, svg);
    const animaciones = [];

    for (const c of estado.components) {
      const res = porId.get(c.id);
      const esTramo = c.type === "wire" || c.type === "switch";
      let corriente = res?.current ?? 0;
      if (esTramo) corriente = c.type === "switch" && c.closed === false ? 0 : tramos.get(c.id) ?? 0;
      let potenciaNominal;
      if (c.type === "lamp") {
        try {
          potenciaNominal = interpretarValor(c.potencia);
        } catch {
          potenciaNominal = undefined;
        }
      }
      const g = dibujarComponente({
        id: c.id, type: c.type, a: px(c.a), b: px(c.b), closed: c.closed,
        etiqueta: c.type === "wire" ? null : c.id, valor: valorTexto(c),
      }, {
        vista: ctl.vista,
        animaciones,
        estado: {
          corriente,
          potencia: res?.power,
          potenciaNominal,
          quemada: res?.burned,
          calor: c.type === "resistor" ? calorResistencia(res?.power, potenciaMaxima) : 0,
          color: c.type === "wire" ? colorDe(c.a) : null,
          seleccionado: seleccionados.has(c.id),
          error: componentesConError.has(c.id),
        },
      });
      el("title", {}, g).textContent = (c.type === "wire" ? c.id : `${c.id} · ${TIPOS[c.type].nombre}`)
        + (sinConectar.has(c.id) ? " · sin conectar" : "");
      if (sinConectar.has(c.id)) g.classList.add("sin-conectar");
      // La palanca se anima: se dibuja en el estado anterior y se cambia en el cuadro siguiente.
      if (c.type === "switch" && ctl.interruptorRecienCambiado === c.id) {
        g.classList.toggle("abierto", c.closed !== false);
        requestAnimationFrame(() => g.classList.toggle("abierto", c.closed === false));
      }
      (c.type === "wire" ? capaCables : capaPiezas).append(g);
      if (!esTramo) dibujarFlecha(capaTextos, c, corriente);
    }
    ctl.interruptorRecienCambiado = null;

    // Nodos: un punto por terminal, del color de su tensión.
    for (const [nombre, punto] of puntosConTerminal(estado)) {
      const g = dibujarNodo(px(punto), capaNodos, { error: nodosConError.has(nombre) });
      const color = colorDe(punto);
      if (color && !nodosConError.has(nombre)) g.firstChild.style.fill = color;
      el("title", {}, g).textContent = tensiones.has(nombre)
        ? `Nodo ${nombre}: ${formatearSI(tensiones.get(nombre), "V")}` : `Nodo ${nombre}`;
    }

    // Bornes al aire: un anillo punteado y "sin conectar" (la simulación sigue con el resto).
    for (const punto of ctl.bornesSueltos ?? []) {
      const p = px(punto);
      const g = el("g", { class: "borne-suelto" }, capaNodos);
      el("circle", { class: "borne-suelto__anillo", cx: p.x, cy: p.y, r: 8 }, g);
      // El texto va hacia afuera de la pieza, así los dos bornes de una pieza suelta no se pisan.
      const duenio = estado.components.find((c) => mismoPunto(c.a, punto) || mismoPunto(c.b, punto));
      const u = duenio ? unidadDireccion(centro(duenio), punto) : { x: 0, y: 1 };
      const atributos = Math.abs(u.x) > Math.abs(u.y)
        ? { x: p.x + u.x * 13, y: p.y, "text-anchor": u.x > 0 ? "start" : "end", "dominant-baseline": "central" }
        : { x: p.x, y: p.y + (u.y >= 0 ? 22 : -14), "text-anchor": "middle" };
      texto("sin conectar", { class: "etiqueta borne-suelto__texto", ...atributos }, g);
      el("title", {}, g).textContent = "Borne sin conectar: por este componente no circula corriente.";
    }

    // Una etiqueta de tensión por nodo eléctrico.
    if (resultado) {
      for (const punto of puntosDeEtiqueta(estado)) {
        const v = tensiones.get(nombreNodo(punto));
        if (v === undefined) continue;
        const p = px(punto);
        texto(formatearSI(v, "V"), { class: "etiqueta etiqueta--tension tension", x: p.x - 7, y: p.y - 9, "text-anchor": "end" }, capaTextos);
      }
    }

    if (estado.ground) {
      const p = px(estado.ground);
      const g = el("g", {
        class: seleccion.tierra ? "comp seleccionado" : "comp", "data-tierra": "1",
      }, capaTierra);
      el("rect", { class: "golpe", x: p.x - 14, y: p.y - 2, width: 28, height: 28 }, g);
      dibujarTierra(p, g);
    }

    renderFantasma();
    animacionesActuales = animaciones;
    animador.actualizar(capa, animaciones);
  }

  /**
   * Pasa los elementos arrastrados a un SVG encima del circuito, con su mismo tamaño y viewBox:
   * moverlo con transform de CSS lo resuelve el compositor, sin repintar el SVG del circuito.
   */
  function crearCapaArrastre(elementos) {
    const capaSvg = el("svg", {
      class: "editor capa-arrastre", viewBox: svg.getAttribute("viewBox"),
      width: svg.getAttribute("width"), height: svg.getAttribute("height"), "aria-hidden": "true",
    });
    const caja = svg.getBoundingClientRect();
    const marco = contenedor.getBoundingClientRect();
    capaSvg.style.left = `${caja.left - marco.left - contenedor.clientLeft + contenedor.scrollLeft}px`;
    capaSvg.style.top = `${caja.top - marco.top - contenedor.clientTop + contenedor.scrollTop}px`;
    capaSvg.append(...elementos);
    contenedor.append(capaSvg);
    return capaSvg;
  }

  /** Elementos del SVG que se mueven con lo seleccionado (piezas, flechas y etiquetas). */
  function elementosDe(sel) {
    const selectores = sel.ids.map((id) => `[data-id="${CSS.escape(id)}"], [data-de="${CSS.escape(id)}"]`);
    if (sel.tierra) selectores.push("[data-tierra]");
    return selectores.length ? [...svg.querySelectorAll(selectores.join(", "))] : [];
  }

  /** Rectángulo de selección: un solo elemento que se actualiza (no redibuja el circuito). */
  function dibujarRectangulo(desde, hasta) {
    const a = px({ x: Math.min(desde.x, hasta.x), y: Math.min(desde.y, hasta.y) });
    const b = px({ x: Math.max(desde.x, hasta.x), y: Math.max(desde.y, hasta.y) });
    if (!rectangulo.nodo) rectangulo.nodo = el("rect", { class: "rectangulo-seleccion" }, svg);
    for (const [k, v] of Object.entries({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y })) {
      rectangulo.nodo.setAttribute(k, v);
    }
  }

  function renderFantasma() {
    if (!capaFantasma) return;
    capaFantasma.replaceChildren();
    if (!puntero || ctl.herramienta === "seleccionar") return;
    const p = px(puntero);
    if (PIEZAS.has(ctl.herramienta)) {
      const { a, b } = terminalesDesdeCentro(puntero, ctl.rotacion);
      capaFantasma.append(dibujarComponente(
        { type: ctl.herramienta, a: px(a), b: px(b), closed: true }, { vista: ctl.vista, etiquetas: false }));
    } else if (ctl.herramienta === "ground") {
      dibujarTierra(p, capaFantasma);
    }
    if (cablePendiente) {
      const q = px(cablePendiente);
      el("line", { class: "cable-pendiente", x1: q.x, y1: q.y, x2: p.x, y2: p.y }, capaFantasma);
    }
    el("circle", { class: "cursor", cx: p.x, cy: p.y, r: 4 }, capaFantasma);
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
      const tipo = sel?.tipo === "componente" ? ctl.estado.components.find((c) => c.id === sel.id)?.type : null;
      const sumar = evento.ctrlKey || evento.shiftKey || evento.metaKey;
      // Doble clic (o doble toque) detectado a mano: cada render reemplaza los elementos del SVG,
      // así que el evento dblclick del navegador no siempre llega al componente.
      const ahora = evento.timeStamp;
      const esDoble = !sumar && tipo && tipo !== "switch" && ultimoToque?.id === sel.id && ahora - ultimoToque.tiempo < DOBLE_CLIC_MS;
      ultimoToque = tipo && !sumar ? { id: sel.id, tiempo: ahora } : null;
      if (esDoble) {
        ultimoToque = null;
        ctl.editarValor(sel.id);
        evento.preventDefault();
        return;
      }
      if (!sel) {
        // Fondo: rectángulo de selección.
        rectangulo = { inicio: puntoExacto(evento), base: sumar ? ctl.seleccion : SELECCION_VACIA, nodo: null };
        if (!sumar) ctl.seleccionar(SELECCION_VACIA);
        render();
        svg.setPointerCapture(evento.pointerId);
        evento.preventDefault();
        return;
      }
      if (sumar) {
        ctl.seleccionar(alternarEnSeleccion(ctl.seleccion, sel));
        render();
        evento.preventDefault();
        return;
      }
      const yaEstaba = sel.tipo === "tierra" ? ctl.seleccion.tierra : ctl.seleccion.ids.includes(sel.id);
      const sola = sel.tipo === "tierra" ? { ids: [], tierra: true } : { ids: [sel.id], tierra: false };
      // Sobre algo ya seleccionado se arrastra todo el grupo; si no, se elige solo esa pieza.
      if (!yaEstaba) ctl.seleccionar(sola);
      render();
      arrastre = {
        inicio: punto, dx: 0, dy: 0, sel, tipo, sola, elementos: elementosDe(ctl.seleccion), movio: false,
        grupo: ctl.seleccion.ids.length + (ctl.seleccion.tierra ? 1 : 0) > 1,
      };
      ctl.empezarArrastre();
      svg.setPointerCapture(evento.pointerId);
    } else if (herramienta === "wire") {
      if (!cablePendiente) cablePendiente = punto;
      svg.setPointerCapture(evento.pointerId);
      renderFantasma();
    } else if (herramienta === "ground") {
      ctl.ponerTierra(punto);
    } else if (PIEZAS.has(herramienta)) {
      ctl.colocarPieza(herramienta, punto);
    }
    evento.preventDefault();
  });

  svg.addEventListener("pointermove", (evento) => {
    const punto = puntoDe(evento);
    if (!punto) return;
    const cambio = !puntero || !mismoPunto(punto, puntero);
    puntero = punto;
    if (rectangulo) {
      dibujarRectangulo(rectangulo.inicio, puntoExacto(evento) ?? punto);
    } else if (arrastre) {
      const dx = punto.x - arrastre.inicio.x;
      const dy = punto.y - arrastre.inicio.y;
      if ((dx !== arrastre.dx || dy !== arrastre.dy) && ctl.arrastrar(dx, dy)) {
        arrastre.dx = dx;
        arrastre.dy = dy;
        if (!arrastre.movio) {
          // Sus puntos de corriente quedarían en el lugar viejo: se sacan hasta soltar.
          arrastre.movio = true;
          const ids = new Set(ctl.seleccion.ids);
          animador.actualizar(capa, animacionesActuales.filter((e) => !ids.has(e.id)));
          arrastre.capaSvg = crearCapaArrastre(arrastre.elementos);
        }
        arrastre.capaSvg.style.transform = `translate(${dx * PASO * zoom}px, ${dy * PASO * zoom}px)`;
      }
    } else if (cambio && ctl.herramienta !== "seleccionar") {
      renderFantasma();
    }
  });

  svg.addEventListener("pointerup", (evento) => {
    const punto = puntoDe(evento) ?? puntero;
    if (rectangulo) {
      const { inicio, base, nodo } = rectangulo;
      rectangulo = null;
      nodo?.remove();
      const fin = puntoExacto(evento) ?? inicio;
      ctl.seleccionar(unirSelecciones(base, seleccionEnRectangulo(ctl.estado, inicio, fin)));
      render();
    } else if (arrastre) {
      const { dx, dy, sel, tipo, movio, capaSvg, grupo, sola } = arrastre;
      arrastre = null;
      capaSvg?.remove();
      // Si cambió, terminarArrastre simula y redibuja; si volvió al lugar, se redibuja acá.
      if (!ctl.terminarArrastre() && movio) render();
      const clic = dx === 0 && dy === 0;
      if (clic && grupo) {
        // Clic sin arrastrar sobre una pieza de un grupo: queda solo esa.
        ctl.seleccionar(sola);
        render();
      } else if (clic && tipo === "switch") {
        // Un clic sin arrastrar sobre un interruptor lo abre o lo cierra.
        ctl.alternarInterruptor(sel.id);
      }
    } else if (ctl.herramienta === "wire" && cablePendiente && punto && !mismoPunto(punto, cablePendiente)) {
      // Arrastrar o hacer clic en dos puntos: las dos formas terminan acá.
      const inicio = cablePendiente;
      cablePendiente = null;
      ctl.agregarCable(inicio, punto);
    } else {
      renderFantasma();
    }
  });

  svg.addEventListener("pointercancel", () => {
    if (rectangulo) {
      rectangulo.nodo?.remove();
      rectangulo = null;
    }
    if (arrastre) {
      const { movio, capaSvg } = arrastre;
      arrastre = null;
      capaSvg?.remove();
      if (!ctl.terminarArrastre() && movio) render();
    }
  });

  svg.addEventListener("pointerleave", (evento) => {
    if (evento.pointerType === "mouse" && !arrastre && !rectangulo) {
      puntero = null;
      renderFantasma();
    }
  });

  aplicarZoom(1);

  return {
    render,
    cancelarCable() {
      const habia = cablePendiente !== null;
      cablePendiente = null;
      renderFantasma();
      return habia;
    },
    acercar: () => aplicarZoom(zoom * 1.2),
    alejar: () => aplicarZoom(zoom / 1.2),
    ajustar() {
      // En modo proyector el circuito se agranda aunque haga falta desplazarse.
      const proyector = document.documentElement.dataset.proyector === "1";
      const [minimo, maximo] = proyector ? [1.4, 2] : [0.6, 1.4];
      aplicarZoom(Math.max(minimo, Math.min(maximo, (contenedor.clientWidth - 4) / ANCHO_PX)));
    },
    nodos: () => nodosElectricos(ctl.estado),
  };
}
