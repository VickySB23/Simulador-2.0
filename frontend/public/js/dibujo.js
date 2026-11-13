// Dibujo de componentes en SVG, en vista ilustrada o esquemática (símbolos IEC 60617).
// Lo usan la galería y el editor. Los colores y grosores vienen de circuito.css (tokens); acá solo
// hay geometría. Cada componente es un <g class="comp ..."> estático con dos capas:
//   comp__forma      el dibujo, en coordenadas locales: de a=(0,0) a b=(LARGO,0), rotado
//   comp__textos     signos y etiquetas en coordenadas del mundo, siempre derechos
// Lo que se mueve (puntos de corriente, halo, calor, pulso) no va en el SVG: se describe en la
// lista `animaciones` y lo dibuja js/animador.js en un canvas encima (ver por qué ahí).
import { brilloLampara, entregaEnergia, velocidadCorriente } from "./lib/animacion.js";
import { codigoDeColores } from "./lib/codigo-colores.js";

/** Clase CSS de cada color de banda (sin tildes). */
const claseDeBanda = (color) => `banda--${color.normalize("NFD").replace(/[̀-ͯ]/g, "")}`;

export const LARGO = 80;
const NS = "http://www.w3.org/2000/svg";

export function el(etiqueta, atributos = {}, padre = null) {
  const nodo = document.createElementNS(NS, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null && valor !== false) nodo.setAttribute(clave, valor);
  }
  padre?.appendChild(nodo);
  return nodo;
}

function texto(contenido, atributos, padre) {
  const nodo = el("text", atributos, padre);
  nodo.textContent = contenido;
  return nodo;
}

// --- Formas en coordenadas locales (horizontal, de 0 a LARGO) -------------------------------
// `efectos` son las zonas animadas de cada forma (en coordenadas locales), para el animador.

const FORMAS = {
  // Fusible: cartucho de vidrio con tapas de metal y el hilo adentro; quemado, el hilo cortado y
  // el vidrio tiznado. En la vista esquemática, el símbolo IEC (rectángulo atravesado por la línea).
  fuse: {
    cuerpo: { ilustrada: [18, 62], esquematica: [24, 56] },
    ilustrada(g, { quemada }) {
      el("path", { class: "pata", d: `M0 0H18M62 0H${LARGO}` }, g);
      el("rect", { class: "fus-vidrio contorno", x: 22, y: -7, width: 36, height: 14, rx: 6 }, g);
      if (quemada) {
        el("ellipse", { class: "fus-hollin", cx: 40, cy: 0, rx: 9, ry: 5 }, g);
        el("path", { class: "fus-hilo", d: "M26 0C29 -2 32 0 35 -2M45 2C48 0 51 2 54 0" }, g);
      } else {
        el("path", { class: "fus-hilo", d: "M26 0C32 -5 36 5 40 0S48 -5 54 0" }, g);
      }
      el("rect", { class: "fus-tapa contorno", x: 17, y: -8, width: 9, height: 16, rx: 2 }, g);
      el("rect", { class: "fus-tapa contorno", x: 54, y: -8, width: 9, height: 16, rx: 2 }, g);
    },
    esquematica(g, { quemada }) {
      el("rect", { class: "esq-cuerpo", x: 24, y: -6, width: 32, height: 12 }, g);
      el("path", { class: "esq-linea", d: quemada ? `M0 0H35M45 0H${LARGO}M36 -5L44 5M44 -5L36 5` : `M0 0H${LARGO}` }, g);
    },
  },
  // Potenciómetro: la pista (resistencia) y el cursor, una flecha que sale del tercer borne (abajo,
  // a dos cuadros del medio) y apunta a la pista en `posicion` (de a hacia b).
  potentiometer: {
    cuerpo: { ilustrada: [18, 62], esquematica: [20, 60] },
    ilustrada(g, { posicion = 0.5 }) {
      el("path", { class: "pata", d: `M0 0H18M62 0H${LARGO}` }, g);
      el("rect", { class: "pot-cuerpo contorno", x: 18, y: -10, width: 44, height: 20, rx: 9 }, g);
      el("path", { class: "pot-pista", d: "M23 0H57" }, g);
      cursorDePotenciometro(g, posicion, 11);
    },
    esquematica(g, { posicion = 0.5, simbolo }) {
      if (simbolo === "iec") {
        el("path", { class: "esq-linea", d: `M0 0H22M58 0H${LARGO}` }, g);
        el("rect", { class: "esq-cuerpo", x: 22, y: -8, width: 36, height: 16 }, g);
      } else {
        el("path", { class: "esq-linea esq-zigzag", d: `M0 0H20L23.3 -7L30 7L36.7 -7L43.3 7L50 -7L56.7 7L60 0H${LARGO}` }, g);
      }
      cursorDePotenciometro(g, posicion, 9);
    },
  },
  resistor: {
    cuerpo: { ilustrada: [18, 62], esquematica: [22, 58] },
    // Las bandas muestran el valor real (código de colores): 4 o 5 según las cifras significativas;
    // la de tolerancia, separada a la derecha. Sin valor (la galería), tres bandas decorativas.
    ilustrada(g, { bandas }) {
      el("rect", { class: "res-calor", x: 12, y: -16, width: 56, height: 32, rx: 14 }, g);
      el("path", { class: "pata", d: `M0 0H18M62 0H${LARGO}` }, g);
      el("rect", { class: "res-cuerpo contorno", x: 18, y: -10, width: 44, height: 20, rx: 9 }, g);
      if (!bandas) {
        for (const [i, x] of [[1, 27], [2, 35], [3, 47]]) {
          el("rect", { class: `res-banda-${i}`, x, y: -9, width: 4.5, height: 18 }, g);
        }
        return;
      }
      const posiciones = bandas.length === 4 ? [24, 30.5, 37, 51] : [23, 28.5, 34, 39.5, 51];
      bandas.forEach((color, i) => {
        el("rect", { class: `res-banda ${claseDeBanda(color)}`, x: posiciones[i], y: -9, width: 4, height: 18 }, g);
      });
    },
    // Zigzag (como en los libros de Física) o el rectángulo de la norma IEC, según el menú Vista.
    esquematica(g, { simbolo }) {
      el("rect", { class: "res-calor", x: 16, y: -14, width: 48, height: 28, rx: 8 }, g);
      if (simbolo === "iec") {
        el("path", { class: "esq-linea", d: `M0 0H22M58 0H${LARGO}` }, g);
        el("rect", { class: "esq-cuerpo", x: 22, y: -8, width: 36, height: 16 }, g);
        return;
      }
      el("path", {
        class: "esq-linea esq-zigzag",
        d: `M0 0H20L23.3 -7L30 7L36.7 -7L43.3 7L50 -7L56.7 7L60 0H${LARGO}`,
      }, g);
    },
    efectos: { ilustrada: { calor: [40, 0, 56, 32] }, esquematica: { calor: [40, 0, 48, 28] } },
  },
  voltage_source: {
    cuerpo: { ilustrada: [12, 68], esquematica: [35, 45] },
    // Batería tipo auto, como en la lámina: cuerpo mostaza, tapa oscura y bornes en círculos
    // rojo (+, del lado a) y azul (−, del lado b). Los signos van derechos en la capa de textos.
    ilustrada(g) {
      el("rect", { class: "bat-pulso", x: 8, y: -22, width: 64, height: 42, rx: 10 }, g);
      el("path", { class: "pata", d: `M0 0H12M68 0H${LARGO}` }, g);
      el("rect", { class: "bat-tapa contorno", x: 15, y: -17, width: 50, height: 7, rx: 2.5 }, g);
      el("rect", { class: "bat-cuerpo contorno", x: 12, y: -11, width: 56, height: 27, rx: 4 }, g);
      el("circle", { class: "bat-positivo contorno", cx: 27, cy: 2.5, r: 8 }, g);
      el("circle", { class: "bat-negativo contorno", cx: 53, cy: 2.5, r: 8 }, g);
    },
    esquematica(g) {
      el("rect", { class: "bat-pulso", x: 24, y: -22, width: 32, height: 44, rx: 8 }, g);
      el("path", { class: "esq-linea", d: `M0 0H35M45 0H${LARGO}` }, g);
      el("line", { class: "esq-placa", x1: 35, y1: -16, x2: 35, y2: 16 }, g);
      el("line", { class: "esq-placa-corta", x1: 45, y1: -8, x2: 45, y2: 8 }, g);
    },
    // Signos en coordenadas locales; se dibujan derechos en la capa de textos.
    signos: { ilustrada: [["+", 27], ["−", 53]], esquematica: [["+", 27], ["−", 53]] },
    efectos: { ilustrada: { pulso: [40, -1, 66, 42] }, esquematica: { pulso: [40, 0, 32, 44] } },
    desplazamientoSignos: { ilustrada: 2.5, esquematica: -16 },
  },
  current_source: {
    cuerpo: { ilustrada: [24, 56], esquematica: [26, 54] },
    ilustrada(g) {
      el("path", { class: "pata", d: `M0 0H24M56 0H${LARGO}` }, g);
      el("circle", { class: "fi-cuerpo contorno", cx: 40, cy: 0, r: 16 }, g);
      el("path", { class: "fi-flecha", d: "M30 0H49M43 -6L49 0 43 6" }, g);
    },
    esquematica(g) {
      el("path", { class: "esq-linea", d: `M0 0H26M54 0H${LARGO}` }, g);
      el("circle", { class: "esq-cuerpo", cx: 40, cy: 0, r: 14 }, g);
      el("path", { class: "esq-linea", d: "M40 -14V14" }, g);
      el("path", { class: "esq-linea", d: "M30 -22H50M45 -26L50 -22 45 -18" }, g);
    },
  },
  lamp: {
    cuerpo: { ilustrada: [32, 48], esquematica: [28, 52] },
    // Como en la lámina: halo en anillos concéntricos y zócalo marrón con franjas naranjas.
    ilustrada(g, estado) {
      el("circle", { class: "lam-halo lam-halo--1", cx: 40, cy: -18, r: 33 }, g);
      el("circle", { class: "lam-halo lam-halo--2", cx: 40, cy: -18, r: 26 }, g);
      el("circle", { class: "lam-halo lam-halo--3", cx: 40, cy: -18, r: 19.5 }, g);
      el("path", { class: "pata", d: `M0 0H32M48 0H${LARGO}` }, g);
      el("circle", { class: "lam-vidrio contorno", cx: 40, cy: -18, r: 12.5 }, g);
      el("circle", { class: "lam-luz", cx: 40, cy: -18, r: 11 }, g);
      if (estado.quemada) {
        el("path", { class: "lam-filamento", d: "M36.5 -8L37 -17L39 -14M41.5 -16L43 -19L43.5 -8" }, g);
        el("path", { class: "lam-grieta", d: "M33.5 -28L37.5 -23L35.5 -20M46.5 -29L44.5 -25L47.5 -22" }, g);
      } else {
        el("path", { class: "lam-filamento", d: "M36.5 -8L37 -19L39 -15L40 -21L41 -15L43 -19L43.5 -8" }, g);
      }
      el("rect", { class: "lam-base contorno", x: 32, y: -7, width: 16, height: 11, rx: 2.5 }, g);
      el("rect", { class: "lam-banda", x: 33.2, y: -4.4, width: 13.6, height: 2.2 }, g);
      el("rect", { class: "lam-banda", x: 33.2, y: -0.6, width: 13.6, height: 2.2 }, g);
    },
    esquematica(g, estado) {
      el("circle", { class: "lam-halo", cx: 40, cy: 0, r: 22 }, g);
      el("path", { class: "esq-linea", d: `M0 0H28M52 0H${LARGO}` }, g);
      el("circle", { class: "esq-cuerpo", cx: 40, cy: 0, r: 12 }, g);
      el("circle", { class: "lam-luz", cx: 40, cy: 0, r: 10.8 }, g);
      el("path", { class: "esq-linea", d: estado.quemada
        ? "M31.5 -8.5L38 -2M42 2L48.5 8.5M48.5 -8.5L42 -2M38 2L31.5 8.5"
        : "M31.5 -8.5L48.5 8.5M48.5 -8.5L31.5 8.5" }, g);
    },
    efectos: { ilustrada: { halo: [40, -18, 38] }, esquematica: { halo: [40, 0, 26] } },
  },
  switch: {
    cuerpo: { ilustrada: [14, 66], esquematica: [24, 56] },
    // Interruptor de cuchilla: la palanca gira en el borne de la izquierda y cae en el contacto en U
    // de la derecha. La luz de la base dice el estado: verde cerrado, roja abierto.
    ilustrada(g) {
      el("path", { class: "pata", d: `M0 0H16M64 0H${LARGO}` }, g);
      el("rect", { class: "int-base contorno", x: 11, y: 3, width: 58, height: 12, rx: 6 }, g);
      el("circle", { class: "int-luz contorno", cx: 40, cy: 9, r: 2.6 }, g);
      el("path", { class: "int-contacto", d: "M55 -7V2.5H65V-7" }, g);
      el("circle", { class: "int-borne contorno", cx: 60, cy: 0, r: 3 }, g);
      const palanca = el("g", { class: "int-palanca" }, g);
      // Caja simétrica alrededor de y = 0: la palanca gira justo sobre el borne (transform-box).
      el("rect", { class: "int-eje", x: 20, y: -13, width: 42, height: 26 }, palanca);
      el("rect", { class: "int-barra contorno", x: 20, y: -2.75, width: 41, height: 5.5, rx: 2.75 }, palanca);
      el("path", { class: "int-mango contorno", d: "M50 -2.5V-8" }, palanca);
      el("circle", { class: "int-perilla contorno", cx: 50, cy: -10, r: 4 }, palanca);
      el("circle", { class: "int-borne contorno", cx: 20, cy: 0, r: 5 }, g);
    },
    esquematica(g) {
      el("path", { class: "esq-linea", d: `M0 0H24M56 0H${LARGO}` }, g);
      el("line", { class: "esq-cuchilla", x1: 24, y1: 0, x2: 58, y2: 0 }, g);
      el("circle", { class: "esq-contacto", cx: 24, cy: 0, r: 3 }, g);
      el("circle", { class: "esq-contacto", cx: 56, cy: 0, r: 3 }, g);
    },
  },
};

/** Flecha del cursor: del tercer borne (40, 40) hasta la pista, en la posición del cursor. */
function cursorDePotenciometro(g, posicion, alto) {
  const x = 22 + 36 * Math.min(1, Math.max(0, posicion));
  el("path", { class: "pata pot-cursor", d: `M40 40V26H${x}V${alto + 6}` }, g);
  el("path", { class: "pot-punta", d: `M${x} ${alto}L${x - 4.5} ${alto + 7}H${x + 4.5}Z` }, g);
  el("circle", { class: "pot-perilla contorno", cx: 40, cy: 30, r: 4 }, g);
}

const rotacionEnGrados = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

function puntoEnMundo(a, b, local) {
  const largo = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / largo;
  const uy = (b.y - a.y) / largo;
  const escala = largo / LARGO;
  return { x: a.x + (local.x * ux - local.y * uy) * escala, y: a.y + (local.x * uy + local.y * ux) * escala };
}

/**
 * Puntos de corriente de a hacia b si la corriente (de a hacia b, como la informa el motor) es
 * positiva, o de b hacia a si es negativa. La velocidad sigue una escala logarítmica.
 * En un componente los puntos van solo por las patas (el canvas está encima del dibujo y si no
 * taparían el cuerpo); `desfase` mantiene el espaciado continuo a través del cuerpo.
 */
function puntosDeCorriente(animaciones, c, vista, corriente) {
  const velocidad = velocidadCorriente(corriente);
  if (!animaciones || velocidad === 0) return;
  const largo = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
  const cuerpo = FORMAS[c.type]?.cuerpo?.[vista];
  // Tramos [inicio, fin] en distancia desde a; sin cuerpo, el tramo es todo el cable.
  const tramos = cuerpo
    ? [[0, (cuerpo[0] * largo) / LARGO], [(cuerpo[1] * largo) / LARGO, largo]]
    : [[0, largo]];
  const enA = (d) => ({ x: c.a.x + ((c.b.x - c.a.x) * d) / largo, y: c.a.y + ((c.b.y - c.a.y) * d) / largo });
  for (const [inicio, fin] of tramos) {
    if (corriente > 0) {
      animaciones.push({ tipo: "puntos", id: c.id, desde: enA(inicio), hasta: enA(fin), velocidad, desfase: inicio });
    } else {
      animaciones.push({ tipo: "puntos", id: c.id, desde: enA(fin), hasta: enA(inicio), velocidad, desfase: largo - fin });
    }
  }
}

/** Zonas animadas de la forma (halo, calor, pulso) pasadas a coordenadas del mundo. */
function efectosDeForma(animaciones, c, vista, { brillo, calor, entrega }) {
  const efectos = FORMAS[c.type].efectos?.[vista];
  if (!animaciones || !efectos) return;
  const angulo = Math.atan2(c.b.y - c.a.y, c.b.x - c.a.x);
  if (efectos.halo && brillo > 0) {
    const [x, y, radio] = efectos.halo;
    animaciones.push({ tipo: "halo", id: c.id, ...puntoEnMundo(c.a, c.b, { x, y }), radio, intensidad: brillo });
  }
  if (efectos.calor && calor > 0) {
    const [x, y, ancho, alto] = efectos.calor;
    animaciones.push({ tipo: "calor", id: c.id, ...puntoEnMundo(c.a, c.b, { x, y }), ancho, alto, angulo, intensidad: calor });
  }
  if (efectos.pulso && entrega) {
    const [x, y, ancho, alto] = efectos.pulso;
    animaciones.push({ tipo: "pulso", id: c.id, ...puntoEnMundo(c.a, c.b, { x, y }), ancho, alto, angulo });
  }
}

/**
 * Dibuja un componente. `c` = {type, a, b} con a y b en píxeles del SVG (y opcionalmente id,
 * etiqueta, valor y closed). `estado` = {corriente, potencia, potenciaNominal, quemada, calor,
 * color, seleccionado, error} con los resultados de la simulación ya calculados. Si se pasa la lista
 * `animaciones`, se le agregan los efectos animados del componente para el animador.
 */
export function dibujarComponente(c, {
  vista = "ilustrada", estado = {}, etiquetas = true, animaciones = null, simbolo = "zigzag",
} = {}) {
  const clases = ["comp", `comp--${c.type}`];
  if (estado.seleccionado) clases.push("seleccionado");
  if (estado.error) clases.push("con-error");
  if (c.type === "switch" && c.closed === false) clases.push("abierto");
  const entrega = c.type === "voltage_source" && entregaEnergia(estado.potencia);
  if (entrega) clases.push("entregando");
  let lampara = null;
  if (c.type === "fuse" && estado.quemada) clases.push("quemada");
  if (c.type === "lamp" && estado.quemada) {
    // Quemada: ya no conduce (potencia 0), así que no se puede deducir de la potencia.
    lampara = { brillo: 0, quemada: true };
    clases.push("quemada");
  } else if (c.type === "lamp" && estado.potenciaNominal > 0) {
    lampara = brilloLampara(estado.potencia, estado.potenciaNominal);
    if (lampara.quemada) clases.push("quemada");
    else if (lampara.brillo > 0.02) clases.push("encendida");
  }
  const g = el("g", { class: clases.join(" ") });
  if (c.id) g.dataset.id = c.id;
  g.dataset.tipo = c.type;
  if (lampara) g.style.setProperty("--brillo", lampara.quemada ? "0" : lampara.brillo.toFixed(3));
  if (estado.calor) g.style.setProperty("--calor", estado.calor.toFixed(3));

  el("line", { class: "comp__seleccion", x1: c.a.x, y1: c.a.y, x2: c.b.x, y2: c.b.y }, g);
  if (c.type === "wire") {
    const linea = el("line", { class: "cable", x1: c.a.x, y1: c.a.y, x2: c.b.x, y2: c.b.y }, g);
    if (estado.color && !estado.error) linea.style.stroke = estado.color;
    puntosDeCorriente(animaciones, c, vista, estado.corriente);
    return g;
  }

  puntosDeCorriente(animaciones, c, vista, estado.corriente);
  efectosDeForma(animaciones, c, vista, {
    brillo: lampara && !lampara.quemada ? lampara.brillo : 0, calor: estado.calor ?? 0, entrega,
  });
  const forma = el("g", {
    class: "comp__forma",
    transform: `translate(${c.a.x} ${c.a.y}) rotate(${rotacionEnGrados(c.a, c.b)})`,
  }, g);
  const bandas = c.type === "resistor" && c.ohmios > 0 ? codigoDeColores(c.ohmios)?.bandas : null;
  FORMAS[c.type][vista](forma, {
    quemada: c.type === "fuse" ? Boolean(estado.quemada) : lampara?.quemada, bandas, simbolo, posicion: c.posicion,
  });

  const textos = el("g", { class: "comp__textos" }, g);
  const definicion = FORMAS[c.type];
  if (definicion.signos) {
    const dy = definicion.desplazamientoSignos[vista];
    for (const [signo, x] of definicion.signos[vista]) {
      const p = puntoEnMundo(c.a, c.b, { x, y: dy });
      texto(signo, { class: vista === "ilustrada" ? "signo" : "signo signo--esquema", x: p.x, y: p.y }, textos);
    }
  }
  if (etiquetas && (c.etiqueta || c.valor)) dibujarEtiqueta(textos, c);
  return g;
}

function dibujarEtiqueta(capa, c) {
  const vertical = Math.abs(c.a.x - c.b.x) < Math.abs(c.a.y - c.b.y);
  const m = { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 };
  const separacion = c.type === "lamp" ? 34 : 24;
  if (vertical) {
    if (c.etiqueta) texto(c.etiqueta, { class: "etiqueta", x: m.x + separacion, y: m.y - 3 }, capa);
    if (c.valor) texto(c.valor, { class: "etiqueta etiqueta--valor", x: m.x + separacion, y: m.y + 13 }, capa);
  } else {
    const t = texto("", { class: "etiqueta", x: m.x, y: m.y - separacion, "text-anchor": "middle" }, capa);
    if (c.etiqueta) el("tspan", {}, t).textContent = `${c.etiqueta} `;
    if (c.valor) el("tspan", { class: "etiqueta--valor" }, t).textContent = c.valor;
  }
}

/**
 * Multímetro, en coordenadas del SVG: la caja con el display y el selector (V, A, Ω). En A va en la
 * rama como una pieza (cables de a y b a la caja); en V y Ω, de la caja salen los cables de las
 * puntas roja y negra, que se dibujan en `capaPuntas` (arriba de todo, para poder arrastrarlas).
 * m = {id, a, b, modo, puntas: {roja, negra}} en píxeles; `texto` es la lectura.
 */
export function dibujarMultimetro(m, { texto = "- - -", aviso = false, seleccionado = false, capaPuntas = null } = {}) {
  const g = el("g", { class: `comp comp--multimeter${seleccionado ? " seleccionado con-foco" : ""}${aviso ? " con-aviso" : ""}` });
  if (m.id) g.dataset.id = m.id;
  g.dataset.tipo = "multimeter";
  const cx = (m.a.x + m.b.x) / 2;
  const cy = (m.a.y + m.b.y) / 2;
  if (m.modo === "A") {
    el("line", { class: "pata", x1: m.a.x, y1: m.a.y, x2: m.b.x, y2: m.b.y }, g);
    el("line", { class: "comp__seleccion", x1: m.a.x, y1: m.a.y, x2: m.b.x, y2: m.b.y }, g);
  }
  el("rect", { class: "mm-caja contorno", x: cx - 36, y: cy - 22, width: 72, height: 44, rx: 7 }, g);
  el("rect", { class: "mm-pantalla", x: cx - 31, y: cy - 17, width: 62, height: 18, rx: 3 }, g);
  const lectura = el("text", { class: "mm-lectura", x: cx + 28, y: cy - 4, "text-anchor": "end" }, g);
  lectura.textContent = texto;
  // Selector: las tres posiciones y la elegida resaltada.
  ["V", "A", "Ω"].forEach((modo, i) => {
    const x = cx - 16 + i * 16;
    el("circle", { class: `mm-boton${modo === m.modo ? " mm-boton--activo" : ""}`, cx: x, cy: cy + 12, r: 6 }, g);
    const t = el("text", { class: "mm-modo", x, y: cy + 12, "text-anchor": "middle", "dominant-baseline": "central" }, g);
    t.textContent = modo;
  });
  if (m.modo !== "A" && capaPuntas) {
    for (const [cual, dx] of [["roja", -12], ["negra", 12]]) {
      const punta = m.puntas[cual];
      const desde = { x: cx + dx, y: cy + 22 };
      const control = { x: (desde.x + punta.x) / 2, y: Math.max(desde.y, punta.y) + 30 };
      el("path", { class: `mm-cable mm-cable--${cual}`, d: `M${desde.x} ${desde.y}Q${control.x} ${control.y} ${punta.x} ${punta.y}` }, capaPuntas);
      const pg = el("g", { class: `mm-punta mm-punta--${cual}`, "data-punta": cual, "data-instrumento": m.id ?? "" }, capaPuntas);
      el("circle", { class: "mm-punta__golpe", cx: punta.x, cy: punta.y, r: 12 }, pg);
      el("circle", { class: "mm-punta__cuerpo contorno", cx: punta.x, cy: punta.y, r: 6 }, pg);
      el("circle", { class: "mm-punta__metal", cx: punta.x, cy: punta.y, r: 2 }, pg);
    }
  }
  return g;
}

export function dibujarTierra(punto, padre) {
  return el("path", {
    class: "tierra",
    d: `M${punto.x} ${punto.y}v12M${punto.x - 11} ${punto.y + 12}h22M${punto.x - 7} ${punto.y + 17}h14M${punto.x - 3} ${punto.y + 22}h6`,
  }, padre);
}

export function dibujarNodo(punto, padre, { error = false } = {}) {
  const g = el("g", {}, padre);
  el("circle", { class: error ? "nodo nodo--error" : "nodo", cx: punto.x, cy: punto.y, r: 4 }, g);
  if (error) el("circle", { class: "anillo-error", cx: punto.x, cy: punto.y, r: 9 }, g);
  return g;
}
