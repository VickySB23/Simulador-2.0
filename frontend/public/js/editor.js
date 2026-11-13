// Editor SVG: dibuja el estado del controlador con js/dibujo.js (vista ilustrada o esquemática) y
// traduce el puntero en acciones. El SVG queda estático; lo que se mueve (puntos de corriente, halo,
// calor, pulso) lo dibuja el animador en un canvas encima. El circuito se redibuja entero en cada
// cambio, salvo en dos casos que tienen que ser fluidos con 50 componentes en un celular:
// - el fantasma de la pieza a colocar se redibuja solo;
// - al arrastrar, lo seleccionado (con sus flechas y etiquetas) pasa a un SVG superpuesto que se
//   desplaza con transform de CSS, sin repintar el circuito; al soltar se simula y se redibuja una
//   vez. Reconstruir el SVG en cada movimiento costaba ~280 ms con la CPU 4× más lenta.
//
// Sin cambiar de modo: con Seleccionar (el modo normal), arrastrar desde un borne o la punta de un
// cable dibuja un cable nuevo (en L si hace falta); arrastrar una pieza la mueve; un clic en un
// interruptor lo abre o lo cierra; arrastrar el fondo mueve la vista. Un cable seleccionado muestra
// sus puntas, que se arrastran para estirarlo. Ctrl/Shift + clic suma o saca de la selección;
// Shift + arrastrar el fondo selecciona con un rectángulo (Ctrl + arrastrar lo suma). Zoom con la
// rueda o con dos dedos; mantener presionada una pieza en el celular abre su menú.
import { dibujarComponente, dibujarNodo, dibujarTierra, el } from "./dibujo.js";
import { calorResistencia, colorTension } from "./lib/animacion.js";
import { corrientesDeTramos } from "./lib/corrientes.js";
import {
  ALTO_MUNDO, ANCHO_MUNDO, TIPOS, centro, esVertical, mismoPunto, nombreNodo, nodosElectricos,
  puntosConTerminal, terminalesDesdeCentro, tramosEnL,
} from "./lib/modelo.js";
import { resumenFlotante } from "./lib/ficha.js";
import { puntosDeEtiqueta, sentidoCorriente, tensionesPorPunto } from "./lib/netlist.js";
import { SELECCION_VACIA, alternarEnSeleccion, seleccionEnRectangulo, unirSelecciones } from "./lib/seleccion.js";
import { formatearCompacto, formatearSI, interpretarValor } from "./lib/valores.js";

export const PASO = 20;
const MARGEN = 10;
const ANCHO_PX = ANCHO_MUNDO * PASO + 2 * MARGEN;
const ALTO_PX = ALTO_MUNDO * PASO + 2 * MARGEN;
const PIEZAS = new Set(["resistor", "voltage_source", "current_source", "lamp", "switch"]);
const DOBLE_CLIC_MS = 400;
const PRESION_LARGA_MS = 550;
const ZOOM_MINIMO = 0.4;
const ZOOM_MAXIMO = 3;

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
function dibujarFlecha(capaTextos, c, corriente, enfocada = false) {
  const sentido = sentidoCorriente(c, corriente);
  if (!sentido) return;
  const capa = el("g", { "data-de": c.id, class: enfocada ? "con-foco" : null }, capaTextos);
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

/** Caja (en px) que ocupa el dibujo de una pieza, con lugar para el bulbo o el cuerpo ancho. */
function cajaDePieza(c) {
  const a = px(c.a);
  const b = px(c.b);
  const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  if (y1 === y2) return { x1: x1 + 12, x2: x2 - 12, y1: y1 - 32, y2: y1 + 24 };
  return { x1: x1 - 24, x2: x1 + 24, y1: y1 + 12, y2: y2 - 12 };
}

const seTocan = (u, v) => u.x1 < v.x2 && v.x1 < u.x2 && u.y1 < v.y2 && v.y1 < u.y2;

/** Lugar para una etiqueta de ancho `ancho` junto al punto p: arriba a la izquierda si se puede. */
function lugarDeEtiqueta(p, ancho, ocupado) {
  const alto = 11;
  const candidatos = [
    { x: p.x - 7, y: p.y - 9, ancla: "end" }, { x: p.x + 7, y: p.y - 9, ancla: "start" },
    { x: p.x - 7, y: p.y + 18, ancla: "end" }, { x: p.x + 7, y: p.y + 18, ancla: "start" },
    { x: p.x - 9, y: p.y + 4, ancla: "end" }, { x: p.x + 9, y: p.y + 4, ancla: "start" },
  ].map((c) => {
    const x1 = c.ancla === "end" ? c.x - ancho : c.x;
    return { ...c, caja: { x1, x2: x1 + ancho, y1: c.y - alto + 2, y2: c.y + 2 } };
  });
  const elegido = candidatos.find((c) => !ocupado.some((o) => seTocan(c.caja, o))) ?? candidatos[0];
  return { caja: elegido.caja, atributos: { x: elegido.x, y: elegido.y, "text-anchor": elegido.ancla } };
}

/**
 * @param {SVGSVGElement} svg
 * @param {HTMLElement} contenedor  elemento con scroll que contiene al SVG
 * @param {object} ctl  controlador (app.js): estado, seleccion, herramienta, rotacion, vista,
 *   resultado, error y las acciones colocarPieza, agregarCable, ponerTierra, seleccionar,
 *   empezarArrastre, arrastrar, terminarArrastre, editarValor, alternarInterruptor, estirarCable y
 *   abrirMenu.
 * @param {import("./animador.js").Animador} animador
 * @param {HTMLElement} info  cartel flotante con tensión y corriente al pasar el mouse
 */
export function crearEditor(svg, contenedor, ctl, animador, info) {
  svg.setAttribute("viewBox", `0 0 ${ANCHO_PX} ${ALTO_PX}`);
  let zoom = 1;
  let puntero = null;
  let cablePendiente = null;
  /** Gesto en curso con el puntero: mover, cable, borne, estirar, rectangulo, vista o pinza. */
  let gesto = null;
  const punteros = new Map();
  let ultimoTipoPuntero = "mouse";
  let presionLarga = null;
  let ultimoToque = null;
  let capaFantasma = null;
  let animacionesActuales = [];
  /** Lo que muestra el cartel flotante de cada componente: {fila, tension, corriente}. */
  let infoPorId = new Map();
  /** Pieza que se arrastra desde la barra (su tipo), para dibujar el fantasma. */
  let piezaArrastrada = null;
  /** Cable que se está dibujando o estirando: {desde, hasta, horizontal}. */
  let previa = null;
  /** Nodos eléctricos del último dibujo (para mostrar los números de lo enfocado). */
  let nodosActuales = new Map();
  let enfocado = null;
  let ocultarCartel = null;

  /** Nodos de los componentes `ids` (sus dos bornes): sus tensiones se muestran al enfocarlos. */
  function nodosEnfocados(ids) {
    const nodos = new Set();
    for (const id of ids) {
      const c = ctl.estado.components.find((x) => x.id === id);
      if (c) for (const p of [c.a, c.b]) nodos.add(nodosActuales.get(nombreNodo(p)));
    }
    return nodos;
  }

  /** Muestra los números de lo que está bajo el mouse (además de lo seleccionado). */
  function enfocar(id) {
    if (id === enfocado) return;
    enfocado = id;
    for (const e of svg.querySelectorAll(".foco-mouse")) e.classList.remove("foco-mouse", "con-foco");
    if (!id) return;
    const marcar = (e) => { if (!e.classList.contains("con-foco")) e.classList.add("con-foco", "foco-mouse"); };
    for (const e of svg.querySelectorAll(`[data-id="${CSS.escape(id)}"], [data-de="${CSS.escape(id)}"]`)) marcar(e);
    const nodos = nodosEnfocados([id]);
    for (const e of svg.querySelectorAll("text.tension")) if (nodos.has(e.dataset.nodo)) marcar(e);
  }
  const capa = animador.registrar(contenedor, svg, []);

  function aplicarZoom(nuevo) {
    zoom = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, nuevo));
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

  /** Zoom manteniendo quieto el punto de la pantalla (cx, cy). */
  function zoomEn(nuevo, cx, cy) {
    const antes = svg.getBoundingClientRect();
    const ux = (cx - antes.left) / zoom;
    const uy = (cy - antes.top) / zoom;
    aplicarZoom(nuevo);
    const despues = svg.getBoundingClientRect();
    contenedor.scrollLeft += despues.left + ux * zoom - cx;
    contenedor.scrollTop += despues.top + uy * zoom - cy;
  }

  /** Punto de la grilla con un borne o la punta de un cable cerca del puntero, o null. */
  function borneCercano(evento) {
    const e = puntoExacto(evento);
    if (!e) return null;
    const g = { x: Math.round(e.x), y: Math.round(e.y) };
    const radio = evento.pointerType === "mouse" ? 9 : 16;
    if (Math.hypot(e.x - g.x, e.y - g.y) * PASO * zoom > radio) return null;
    return ctl.estado.components.some((c) => mismoPunto(c.a, g) || mismoPunto(c.b, g)) ? g : null;
  }

  /** Componente bajo el puntero (las tierras también son componentes): {id} o null. */
  function objetivo(evento) {
    const nodo = evento.target.closest?.("[data-id]");
    return nodo ? { id: nodo.dataset.id } : null;
  }

  // --- Dibujo ---------------------------------------------------------------------------

  function render() {
    const { estado, seleccion, resultado } = ctl;
    enfocado = null; // el SVG se reconstruye: lo que estaba enfocado con el mouse se recalcula
    const errores = ctl.errores ?? [];
    svg.replaceChildren();
    svg.classList.toggle("herramienta-seleccionar", ctl.herramienta === "seleccionar");
    // Etiquetas: "todo" muestra todos los números; "valores" (por defecto) solo nombre y valor de cada
    // pieza y flechas sin número; "nada", solo el dibujo. Lo enfocado (seleccionado o bajo el mouse)
    // muestra sus números en cualquier modo (clase con-foco).
    svg.classList.toggle("etiquetas-valores", ctl.etiquetas === "valores");
    svg.classList.toggle("etiquetas-nada", ctl.etiquetas === "nada");

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
    // Cada circuito con error marca en rojo solo lo suyo.
    const nodosConError = new Set(errores.flatMap((e) => e.details?.nodes ?? []));
    const componentesConError = new Set(errores.flatMap((e) => e.details?.components ?? []));
    const seleccionados = new Set(seleccion.ids);
    nodosActuales = nodosElectricos(estado);
    const sueltos = new Set((ctl.bornesSueltos ?? []).map(nombreNodo));
    const sinConectar = ctl.sinConectar ?? new Set();

    const capaMarcos = el("g", {}, svg);
    const capaCables = el("g", {}, svg);
    const capaPiezas = el("g", {}, svg);
    const capaNodos = el("g", {}, svg);
    const capaTextos = el("g", {}, svg);
    const capaTierra = el("g", {}, svg);
    infoPorId = new Map();
    capaFantasma = el("g", { class: "fantasma" }, svg);
    const animaciones = [];

    for (const c of estado.components) {
      if (c.type === "ground") {
        const p = px(c.a);
        const g = el("g", {
          class: seleccionados.has(c.id) ? "comp seleccionado" : "comp", "data-id": c.id, "data-tierra": "1",
        }, capaTierra);
        el("rect", { class: "golpe", x: p.x - 14, y: p.y - 2, width: 28, height: 28 }, g);
        dibujarTierra(p, g);
        infoPorId.set(c.id, {});
        continue;
      }
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
      let ohmios;
      if (c.type === "resistor") {
        try {
          ohmios = interpretarValor(c.value);
        } catch {
          ohmios = undefined;
        }
      }
      const g = dibujarComponente({
        id: c.id, type: c.type, a: px(c.a), b: px(c.b), closed: c.closed, ohmios,
        etiqueta: c.type === "wire" ? null : c.id, valor: valorTexto(c),
      }, {
        vista: ctl.vista,
        simbolo: ctl.simboloResistencia,
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
      // Tensión y corriente para el cartel que aparece al pasar el mouse.
      infoPorId.set(c.id, esTramo
        ? { fila: res, tension: tensiones.get(nombreNodo(c.a)), corriente: resultado ? corriente : undefined }
        : { fila: res });
      if (sinConectar.has(c.id)) g.classList.add("sin-conectar");
      // La palanca se anima: se dibuja en el estado anterior y se cambia en el cuadro siguiente.
      if (c.type === "switch" && ctl.interruptorRecienCambiado === c.id) {
        g.classList.toggle("abierto", c.closed !== false);
        requestAnimationFrame(() => g.classList.toggle("abierto", c.closed === false));
      }
      (c.type === "wire" ? capaCables : capaPiezas).append(g);
      if (!esTramo) dibujarFlecha(capaTextos, c, corriente, seleccionados.has(c.id));
      if (seleccionados.has(c.id)) g.classList.add("con-foco");
    }
    ctl.interruptorRecienCambiado = null;

    // Nodos: un punto por terminal, del color de su tensión (los bornes al aire van aparte).
    for (const [nombre, punto] of puntosConTerminal(estado)) {
      if (sueltos.has(nombre)) continue;
      const g = dibujarNodo(px(punto), capaNodos, { error: nodosConError.has(nombre) });
      const color = colorDe(punto);
      if (color && !nodosConError.has(nombre)) g.firstChild.style.fill = color;
      el("title", {}, g).textContent = tensiones.has(nombre)
        ? `Nodo ${nombre}: ${formatearSI(tensiones.get(nombre), "V")}` : `Nodo ${nombre}`;
    }

    // Bornes al aire: un círculo hueco con borde punteado, sin texto (la simulación sigue con el
    // resto). "Sin conectar" se lee en el cartel al pasar el mouse o tocarlo.
    for (const punto of ctl.bornesSueltos ?? []) {
      const p = px(punto);
      const g = el("g", { class: "borne-suelto", "data-suelto": nombreNodo(punto) }, capaNodos);
      el("circle", { class: "borne-suelto__anillo", cx: p.x, cy: p.y, r: 4.5 }, g);
    }

    // Una etiqueta de tensión por nodo eléctrico, en el primer lugar alrededor del nodo que no
    // tape el dibujo de una pieza (el bulbo de una lámpara, una batería acostada) ni otra etiqueta.
    if (resultado) {
      const ocupado = estado.components.filter((c) => c.type !== "wire" && c.type !== "ground").map(cajaDePieza);
      for (const punto of puntosDeEtiqueta(estado)) {
        const v = tensiones.get(nombreNodo(punto));
        if (v === undefined) continue;
        const contenido = formatearSI(v, "V");
        const lugar = lugarDeEtiqueta(px(punto), contenido.length * 7.2, ocupado);
        ocupado.push(lugar.caja);
        const etiqueta = texto(contenido, {
          class: "etiqueta etiqueta--tension tension", "data-nodo": nodosActuales.get(nombreNodo(punto)), ...lugar.atributos,
        }, capaTextos);
        if (nodosEnfocados(seleccion.ids).has(etiqueta.dataset.nodo)) etiqueta.classList.add("con-foco");
      }
    }

    dibujarMarcos(capaMarcos);

    // Un cable seleccionado solo muestra sus puntas: se arrastran para estirarlo.
    if (seleccion.ids.length === 1) {
      const cable = estado.components.find((c) => c.id === seleccion.ids[0] && c.type === "wire");
      for (const extremo of cable ? ["a", "b"] : []) {
        const p = px(cable[extremo]);
        el("rect", { class: "asa", x: p.x - 6, y: p.y - 6, width: 12, height: 12, rx: 3, "data-asa": extremo, "data-cable": cable.id }, capaTierra);
      }
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
    return selectores.length ? [...svg.querySelectorAll(selectores.join(", "))] : [];
  }

  /**
   * Marco de cada circuito: con varios en la hoja, su nombre ("Circuito 2") abajo a la izquierda;
   * en rojo el que tiene un error; resaltado el que se tocó en Resultados o Ecuaciones.
   */
  function dibujarMarcos(capaMarcos) {
    const circuitos = ctl.circuitos ?? [];
    const varios = circuitos.length > 1;
    const conError = new Set((ctl.errores ?? []).map((e) => e.numero));
    for (const c of circuitos) {
      const error = conError.has(c.numero);
      const resaltado = ctl.circuitoResaltado === c.numero;
      if (!varios && !error && !resaltado) continue;
      const a = px({ x: c.caja.x1, y: c.caja.y1 });
      const b = px({ x: c.caja.x2, y: c.caja.y2 });
      const margen = 26;
      const clases = ["marco-circuito", error ? "marco-circuito--error" : "", resaltado ? "marco-circuito--resaltado" : ""];
      const g = el("g", { class: clases.filter(Boolean).join(" "), "data-circuito": c.numero }, capaMarcos);
      el("rect", {
        class: "marco-circuito__caja", x: a.x - margen, y: a.y - margen,
        width: b.x - a.x + 2 * margen, height: b.y - a.y + 2 * margen, rx: 10,
      }, g);
      // El nombre va debajo del marco: arriba están los nombres de las piezas.
      if (varios) texto(`Circuito ${c.numero}`, { class: "marco-circuito__nombre", x: a.x - margen + 6, y: b.y + margen + 14 }, g);
    }
  }

  /** Rectángulo de selección: un solo elemento que se actualiza (no redibuja el circuito). */
  function dibujarRectangulo(desde, hasta) {
    const a = px({ x: Math.min(desde.x, hasta.x), y: Math.min(desde.y, hasta.y) });
    const b = px({ x: Math.max(desde.x, hasta.x), y: Math.max(desde.y, hasta.y) });
    if (!gesto.nodo) gesto.nodo = el("rect", { class: "rectangulo-seleccion" }, svg);
    for (const [k, v] of Object.entries({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y })) {
      gesto.nodo.setAttribute(k, v);
    }
  }

  function renderFantasma() {
    if (!capaFantasma) return;
    capaFantasma.replaceChildren();
    const linea = (desde, hasta, horizontal) => {
      for (const [p, q] of tramosEnL(desde, hasta, horizontal)) {
        const a = px(p);
        const b = px(q);
        el("line", { class: "cable-pendiente", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, capaFantasma);
      }
    };
    if (previa) linea(previa.desde, previa.hasta, previa.horizontal);
    const herramienta = piezaArrastrada ?? ctl.herramienta;
    if (!puntero || (herramienta === "seleccionar" && !previa)) return;
    const p = px(puntero);
    if (PIEZAS.has(herramienta)) {
      const { a, b } = terminalesDesdeCentro(puntero, ctl.rotacion);
      capaFantasma.append(dibujarComponente(
        { type: herramienta, a: px(a), b: px(b), closed: true }, { vista: ctl.vista, etiquetas: false }));
    } else if (herramienta === "ground") {
      dibujarTierra(p, capaFantasma);
    }
    if (cablePendiente && !previa) linea(cablePendiente, puntero, esHorizontal(cablePendiente, puntero));
    el("circle", { class: "cursor", cx: p.x, cy: p.y, r: 4 }, capaFantasma);
  }

  const esHorizontal = (desde, hasta) => Math.abs(hasta.x - desde.x) >= Math.abs(hasta.y - desde.y);

  // --- Cartel flotante con tensión y corriente ---------------------------------------------

  function ocultarInfo() {
    info.hidden = true;
    enfocar(null);
  }

  /** Cartel con un título y un detalle en (x, y) de la pantalla. */
  function cartelEn(x, y, titulo, detalle) {
    info.replaceChildren();
    const t = document.createElement("strong");
    t.textContent = titulo;
    info.append(t);
    if (detalle) {
      const d = document.createElement("span");
      d.textContent = detalle;
      info.append(d);
    }
    info.hidden = false;
    const marco = info.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth };
    let izquierda = x - marco.left + 14;
    if (izquierda + info.offsetWidth > marco.width - 8) izquierda = x - marco.left - info.offsetWidth - 14;
    info.style.left = `${Math.max(4, izquierda)}px`;
    info.style.top = `${y - marco.top + 16}px`;
  }

  const SUELTO = ["Sin conectar", "Este borne no toca nada: por la pieza no circula corriente."];
  const esSuelto = (punto) => punto && (ctl.bornesSueltos ?? []).some((q) => mismoPunto(q, punto));

  function mostrarInfo(evento) {
    if (esSuelto(borneCercano(evento))) {
      enfocar(null);
      return cartelEn(evento.clientX, evento.clientY, ...SUELTO);
    }
    const nodo = evento.target.closest?.("[data-id]");
    const componente = nodo && ctl.estado.components.find((c) => c.id === nodo.dataset.id);
    if (!componente) return ocultarInfo();
    enfocar(componente.id);
    const { titulo, detalle } = resumenFlotante(componente, infoPorId.get(componente.id));
    const circuito = (ctl.circuitos ?? []).length > 1 && ctl.circuitos.find((c) => c.ids.includes(componente.id));
    info.replaceChildren();
    const t = document.createElement("strong");
    t.textContent = circuito ? `${titulo} · Circuito ${circuito.numero}` : titulo;
    info.append(t);
    if (detalle) {
      const d = document.createElement("span");
      d.textContent = detalle;
      info.append(d);
    }
    info.hidden = false;
    const marco = info.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth };
    let x = evento.clientX - marco.left + 14;
    if (x + info.offsetWidth > marco.width - 8) x = evento.clientX - marco.left - info.offsetWidth - 14;
    info.style.left = `${Math.max(4, x)}px`;
    info.style.top = `${evento.clientY - marco.top + 16}px`;
  }

  // --- Gestos -----------------------------------------------------------------------------

  function cancelarPresionLarga() {
    clearTimeout(presionLarga);
    presionLarga = null;
  }

  /** Corta el gesto en curso sin aplicarlo (al apoyar un segundo dedo o abrir el menú). */
  function cancelarGesto() {
    cancelarPresionLarga();
    const g = gesto;
    gesto = null;
    if (!g) return;
    if (g.tipo === "mover") {
      g.capaSvg?.remove();
      ctl.arrastrar(0, 0);
      if (!ctl.terminarArrastre() && g.movio) render();
    } else if (g.tipo === "rectangulo") {
      g.nodo?.remove();
    } else if (g.tipo === "cable" || g.tipo === "borne" || g.tipo === "estirar") {
      previa = null;
      renderFantasma();
    }
  }

  function empezarMover(punto, sel, tipo) {
    const yaEstaba = ctl.seleccion.ids.includes(sel.id);
    const sola = { ids: [sel.id] };
    // Sobre algo ya seleccionado se arrastra todo el grupo; si no, se elige solo esa pieza.
    if (!yaEstaba) ctl.seleccionar(sola);
    render();
    gesto = {
      tipo: "mover", inicio: punto, dx: 0, dy: 0, sel, tipoPieza: tipo, sola,
      elementos: elementosDe(ctl.seleccion), movio: false,
      grupo: ctl.seleccion.ids.length > 1,
    };
    ctl.empezarArrastre();
  }

  /** Mover lo seleccionado: el grupo pasa a la capa de arrastre y se desplaza con transform. */
  function moverA(punto) {
    const dx = punto.x - gesto.inicio.x;
    const dy = punto.y - gesto.inicio.y;
    if ((dx === gesto.dx && dy === gesto.dy) || !ctl.arrastrar(dx, dy)) return;
    gesto.dx = dx;
    gesto.dy = dy;
    cancelarPresionLarga();
    if (!gesto.movio) {
      // Sus puntos de corriente quedarían en el lugar viejo: se sacan hasta soltar.
      gesto.movio = true;
      const ids = new Set(ctl.seleccion.ids);
      animador.actualizar(capa, animacionesActuales.filter((e) => !ids.has(e.id)));
      gesto.capaSvg = crearCapaArrastre(gesto.elementos);
    }
    gesto.capaSvg.style.transform = `translate(${dx * PASO * zoom}px, ${dy * PASO * zoom}px)`;
  }

  /** Mientras se dibuja un cable: la L sigue al puntero, doblando según el primer movimiento. */
  function dibujarHasta(punto) {
    if (mismoPunto(punto, gesto.inicio) && gesto.horizontal === null) return;
    if (gesto.horizontal === null) gesto.horizontal = esHorizontal(gesto.inicio, punto);
    previa = { desde: gesto.inicio, hasta: punto, horizontal: gesto.horizontal };
    renderFantasma();
  }

  function medioYDistancia() {
    const [p, q] = [...punteros.values()];
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, d: Math.hypot(p.x - q.x, p.y - q.y) || 1 };
  }

  svg.addEventListener("pointerdown", (evento) => {
    ultimoTipoPuntero = evento.pointerType;
    punteros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    ocultarInfo();
    if (punteros.size === 2) {
      // Dos dedos: zoom y desplazamiento; lo que se estaba haciendo con uno se cancela.
      cancelarGesto();
      const { x, y, d } = medioYDistancia();
      gesto = { tipo: "pinza", d0: d, z0: zoom, medio: { x, y } };
      evento.preventDefault();
      return;
    }
    if (punteros.size > 2 || evento.button !== 0) return;
    const punto = puntoDe(evento);
    if (!punto) return;
    puntero = punto;
    svg.setPointerCapture(evento.pointerId);
    evento.preventDefault();
    const herramienta = ctl.herramienta;
    if (herramienta === "wire") {
      gesto = { tipo: "cable", inicio: punto, horizontal: null, herramienta: true };
      renderFantasma();
      return;
    }
    if (herramienta === "ground") return ctl.ponerTierra(punto);
    if (PIEZAS.has(herramienta)) return ctl.colocarPieza(herramienta, punto, { mantener: evento.shiftKey });

    // --- Seleccionar (el modo normal) ---
    const asa = evento.target.closest?.("[data-asa]");
    if (asa) {
      gesto = { tipo: "estirar", id: asa.dataset.cable, extremo: asa.dataset.asa, inicio: punto };
      return;
    }
    const sel = objetivo(evento);
    const tipo = sel ? ctl.estado.components.find((c) => c.id === sel.id)?.type : null;
    // "Seleccionar varios" (celular) se comporta como Ctrl: tocar suma o saca, el fondo es rectángulo.
    const sumar = evento.ctrlKey || evento.shiftKey || evento.metaKey || ctl.modoVarios;
    // Doble clic (o doble toque) detectado a mano: cada render reemplaza los elementos del SVG,
    // así que el evento dblclick del navegador no siempre llega al componente.
    const ahora = evento.timeStamp;
    const esDoble = !sumar && tipo && tipo !== "switch" && ultimoToque?.id === sel.id && ahora - ultimoToque.tiempo < DOBLE_CLIC_MS;
    ultimoToque = tipo && !sumar ? { id: sel.id, tiempo: ahora } : null;
    if (esDoble) {
      ultimoToque = null;
      ctl.editarValor(sel.id);
      return;
    }
    if (sel && sumar) {
      ctl.seleccionar(alternarEnSeleccion(ctl.seleccion, sel.id));
      render();
      return;
    }
    // Mantener presionado (con el dedo) una pieza abre su menú.
    if (sel && evento.pointerType !== "mouse") {
      const { clientX, clientY } = evento;
      presionLarga = setTimeout(() => {
        presionLarga = null;
        if (!gesto || gesto.movio) return;
        cancelarGesto();
        abrirMenuSobre(sel, clientX, clientY);
      }, PRESION_LARGA_MS);
    }
    const borne = !sumar && borneCercano(evento);
    if (borne) {
      // Desde un borne: si se arrastra es un cable nuevo; si no, es un clic sobre lo que hay ahí.
      gesto = { tipo: "borne", inicio: borne, horizontal: null, sel, tipoPieza: tipo };
      return;
    }
    if (sel) return empezarMover(punto, sel, tipo);
    if (sumar) {
      // Shift + arrastrar: rectángulo nuevo; Ctrl + arrastrar: se suma a lo seleccionado.
      const base = evento.ctrlKey || evento.metaKey || ctl.modoVarios ? ctl.seleccion : SELECCION_VACIA;
      gesto = { tipo: "rectangulo", inicio: puntoExacto(evento), base, nodo: null };
      return;
    }
    gesto = {
      tipo: "vista", x0: evento.clientX, y0: evento.clientY,
      sl: contenedor.scrollLeft, st: contenedor.scrollTop, movio: false,
    };
  });

  svg.addEventListener("pointermove", (evento) => {
    if (punteros.has(evento.pointerId)) punteros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (gesto?.tipo === "pinza") {
      if (punteros.size < 2) return;
      const { x, y, d } = medioYDistancia();
      zoomEn(gesto.z0 * (d / gesto.d0), x, y);
      contenedor.scrollLeft -= x - gesto.medio.x;
      contenedor.scrollTop -= y - gesto.medio.y;
      gesto.medio = { x, y };
      return;
    }
    if (gesto?.tipo === "vista") {
      const dx = evento.clientX - gesto.x0;
      const dy = evento.clientY - gesto.y0;
      if (!gesto.movio && Math.hypot(dx, dy) > 4) {
        gesto.movio = true;
        svg.classList.add("moviendo-vista");
      }
      if (gesto.movio) {
        contenedor.scrollLeft = gesto.sl - dx;
        contenedor.scrollTop = gesto.st - dy;
      }
      return;
    }
    const punto = puntoDe(evento);
    if (!punto) return;
    const cambio = !puntero || !mismoPunto(punto, puntero);
    puntero = punto;
    if (!gesto) {
      if (evento.pointerType === "mouse" && evento.buttons === 0) {
        if (ctl.herramienta === "seleccionar") {
          svg.classList.toggle("sobre-borne", Boolean(borneCercano(evento)));
          mostrarInfo(evento);
        }
        if (cambio && ctl.herramienta !== "seleccionar") renderFantasma();
      }
      return;
    }
    if (gesto.tipo === "rectangulo") {
      dibujarRectangulo(gesto.inicio, puntoExacto(evento) ?? punto);
    } else if (gesto.tipo === "mover") {
      moverA(punto);
    } else if (gesto.tipo === "borne") {
      if (!mismoPunto(punto, gesto.inicio)) {
        cancelarPresionLarga();
        gesto = { tipo: "cable", inicio: gesto.inicio, horizontal: null };
        dibujarHasta(punto);
      }
    } else if (gesto.tipo === "cable") {
      if (cambio) dibujarHasta(punto);
    } else if (gesto.tipo === "estirar" && cambio) {
      const cable = ctl.estado.components.find((c) => c.id === gesto.id);
      if (!cable) return;
      const fijo = gesto.extremo === "a" ? cable.b : cable.a;
      previa = { desde: fijo, hasta: punto, horizontal: cable.a.y === cable.b.y && cable.a.x !== cable.b.x };
      renderFantasma();
    }
  });

  function soltar(evento) {
    punteros.delete(evento.pointerId);
    cancelarPresionLarga();
    const g = gesto;
    if (!g) return;
    if (g.tipo === "pinza") {
      if (punteros.size === 0) gesto = null;
      return;
    }
    gesto = null;
    const punto = puntoDe(evento) ?? puntero;
    if (g.tipo === "vista") {
      svg.classList.remove("moviendo-vista");
      // Un clic en el fondo, sin arrastrar, deselecciona.
      if (!g.movio) {
        ctl.seleccionar(SELECCION_VACIA);
        render();
      }
    } else if (g.tipo === "rectangulo") {
      g.nodo?.remove();
      const fin = puntoExacto(evento) ?? g.inicio;
      ctl.seleccionar(unirSelecciones(g.base, seleccionEnRectangulo(ctl.estado, g.inicio, fin)));
      render();
    } else if (g.tipo === "mover") {
      g.capaSvg?.remove();
      // Si cambió, terminarArrastre simula y redibuja; si volvió al lugar, se redibuja acá.
      if (!ctl.terminarArrastre() && g.movio) render();
      const clic = g.dx === 0 && g.dy === 0;
      if (clic && g.grupo) {
        // Clic sin arrastrar sobre una pieza de un grupo: queda solo esa.
        ctl.seleccionar(g.sola);
        render();
      } else if (clic && g.tipoPieza === "switch") {
        // Un clic sin arrastrar sobre un interruptor lo abre o lo cierra.
        ctl.alternarInterruptor(g.sel.id);
      }
    } else if (g.tipo === "borne") {
      // Clic sobre un borne, sin arrastrar: como un clic sobre lo que hay ahí. Si está al aire, el
      // cartel "Sin conectar" aparece un momento (con el dedo no hay mouse para pasar por encima).
      if (esSuelto(g.inicio)) {
        cartelEn(evento.clientX, evento.clientY, ...SUELTO);
        clearTimeout(ocultarCartel);
        ocultarCartel = setTimeout(() => { info.hidden = true; }, 2500);
      }
      if (g.sel) {
        ctl.seleccionar({ ids: [g.sel.id] });
        render();
        if (g.tipoPieza === "switch") ctl.alternarInterruptor(g.sel.id);
      } else {
        ctl.seleccionar(SELECCION_VACIA);
        render();
      }
    } else if (g.tipo === "estirar") {
      previa = null;
      if (punto && !mismoPunto(punto, g.inicio)) ctl.estirarCable(g.id, g.extremo, punto);
      else renderFantasma();
    } else if (g.tipo === "cable") {
      previa = null;
      terminarCable(g, punto);
    }
  }

  /**
   * Fin de un cable. Arrastrando: de donde se apretó a donde se soltó. Con la herramienta Cable
   * también por clics: cada clic agrega un tramo desde la punta anterior, y un clic en la misma
   * punta termina. Después de un tramo se sigue dibujando desde su punta.
   */
  function terminarCable(g, punto) {
    if (!punto) return renderFantasma();
    if (!mismoPunto(punto, g.inicio)) {
      if (g.herramienta) cablePendiente = punto;
      ctl.agregarCable(g.inicio, punto, g.horizontal ?? esHorizontal(g.inicio, punto));
    } else if (g.herramienta && cablePendiente && !mismoPunto(cablePendiente, punto)) {
      const inicio = cablePendiente;
      cablePendiente = punto;
      ctl.agregarCable(inicio, punto, esHorizontal(inicio, punto));
    } else if (g.herramienta) {
      cablePendiente = cablePendiente && mismoPunto(cablePendiente, punto) ? null : punto;
      renderFantasma();
    } else {
      renderFantasma();
    }
  }

  svg.addEventListener("pointerup", soltar);
  svg.addEventListener("pointercancel", (evento) => {
    punteros.delete(evento.pointerId);
    if (gesto?.tipo !== "pinza" || punteros.size === 0) cancelarGesto();
  });

  svg.addEventListener("pointerleave", (evento) => {
    if (evento.pointerType === "mouse" && !gesto) {
      puntero = null;
      ocultarInfo();
      renderFantasma();
    }
  });

  // Rueda: zoom alrededor del puntero (también el gesto de pellizcar del touchpad).
  contenedor.addEventListener("wheel", (evento) => {
    evento.preventDefault();
    const escala = evento.deltaMode === 1 ? 0.05 : 0.0015;
    zoomEn(zoom * Math.exp(-evento.deltaY * escala), evento.clientX, evento.clientY);
  }, { passive: false });

  /** Selecciona lo tocado (si no estaba) y abre el menú contextual. */
  function abrirMenuSobre(sel, x, y) {
    if (!ctl.seleccion.ids.includes(sel.id)) ctl.seleccionar({ ids: [sel.id] });
    render();
    ctl.abrirMenu(x, y);
  }

  svg.addEventListener("contextmenu", (evento) => {
    const sel = objetivo(evento);
    if (!sel) return;
    evento.preventDefault();
    // Con el dedo el menú lo abre la presión larga (también en iOS, que no dispara contextmenu).
    if (ultimoTipoPuntero !== "mouse") return;
    cancelarGesto();
    abrirMenuSobre(sel, evento.clientX, evento.clientY);
  });

  aplicarZoom(1);

  const sobreLienzo = (x, y) => {
    const r = contenedor.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  return {
    render,
    cancelarCable() {
      const habia = cablePendiente !== null || previa !== null;
      if (gesto?.tipo === "cable" || gesto?.tipo === "borne" || gesto?.tipo === "estirar") gesto = null;
      cablePendiente = null;
      previa = null;
      renderFantasma();
      return habia;
    },
    /** Fantasma de una pieza que se arrastra desde la barra (o lo saca si está fuera del lienzo). */
    mostrarPieza(tipo, x, y) {
      piezaArrastrada = tipo;
      puntero = sobreLienzo(x, y) ? puntoDe({ clientX: x, clientY: y }) : null;
      renderFantasma();
    },
    /** Suelta una pieza arrastrada desde la barra; devuelve true si cayó en el lienzo. */
    soltarPieza(tipo, x, y) {
      piezaArrastrada = null;
      const adentro = sobreLienzo(x, y);
      const punto = adentro ? puntoDe({ clientX: x, clientY: y }) : null;
      puntero = null;
      renderFantasma();
      if (!punto) return false;
      if (tipo === "ground") ctl.ponerTierra(punto);
      else ctl.colocarPieza(tipo, punto);
      return true;
    },
    /** Centra el circuito y hace zoom para que entre todo en la parte visible del lienzo (F). */
    ajustarCircuito() {
      const puntos = ctl.estado.components.flatMap((c) => [c.a, c.b]);
      if (!puntos.length) return this.ajustar();
      const xs = puntos.map((p) => p.x);
      const ys = puntos.map((p) => p.y);
      // Margen para los nombres, las flechas, las etiquetas y el símbolo de GND.
      const margen = 70;
      const caja = {
        x: Math.min(...xs) * PASO + MARGEN - margen, y: Math.min(...ys) * PASO + MARGEN - margen,
        ancho: (Math.max(...xs) - Math.min(...xs)) * PASO + 2 * margen,
        alto: (Math.max(...ys) - Math.min(...ys)) * PASO + 2 * margen,
      };
      // En pantallas chicas la hoja inferior tapa el pie del lienzo: se descuenta.
      const marco = contenedor.getBoundingClientRect();
      const panel = document.getElementById("panel");
      const tapa = panel && getComputedStyle(panel).position === "fixed"
        ? Math.max(0, marco.bottom - panel.getBoundingClientRect().top) : 0;
      const ancho = contenedor.clientWidth;
      const alto = Math.max(PASO * 4, contenedor.clientHeight - tapa);
      aplicarZoom(Math.min(2.5, ancho / caja.ancho, alto / caja.alto));
      contenedor.scrollLeft = (caja.x + caja.ancho / 2) * zoom - ancho / 2;
      contenedor.scrollTop = (caja.y + caja.alto / 2) * zoom - alto / 2;
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
