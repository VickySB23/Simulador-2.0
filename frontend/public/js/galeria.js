// Galería del sistema de diseño: tokens, interfaz, componentes en todos sus estados (ilustrados
// y esquemáticos), animaciones, un circuito de prueba simulado con el motor y una prueba de
// rendimiento con 50 componentes.
import { Animador } from "./animador.js";
import { LARGO, dibujarComponente, dibujarNodo, dibujarTierra, el } from "./dibujo.js";
import { ICONOS, colocarIconos, icono } from "./iconos.js";
import { calorResistencia, colorTension, velocidadCorriente } from "./lib/animacion.js";
import { simulate } from "./lib/mna.js";
import { formatearCompacto, formatearSI } from "./lib/valores.js";

const $ = (id) => document.getElementById(id);
const raiz = document.documentElement;
const animador = new Animador();

/** Envuelve el SVG en un contenedor con su canvas de animación. Devuelve {marco, capa}. */
function animado(svg, animaciones) {
  const marco = document.createElement("div");
  marco.append(svg);
  return { marco, capa: animador.registrar(marco, svg, animaciones) };
}

function nodo(etiqueta, clase, contenido) {
  const n = document.createElement(etiqueta);
  if (clase) n.className = clase;
  if (contenido !== undefined) n.textContent = contenido;
  return n;
}

function lienzo(ancho, alto, clase = "lienzo-svg") {
  const svg = el("svg", { viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto, class: clase });
  const defs = el("defs", {}, svg);
  const patron = el("pattern", { id: `grilla-${ancho}-${alto}`, width: 20, height: 20, patternUnits: "userSpaceOnUse" }, defs);
  el("circle", { class: "punto-grilla", cx: 10, cy: 10, r: 1.1 }, patron);
  el("rect", { width: ancho, height: alto, fill: `url(#grilla-${ancho}-${alto})` }, svg);
  return svg;
}

// --- Controles globales -------------------------------------------------------------------

function pulsar(grupo, boton) {
  for (const b of grupo.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === boton));
}

function iniciarControles() {
  const grupoTema = $("control-tema");
  const temaGuardado = raiz.dataset.theme ?? "auto";
  pulsar(grupoTema, grupoTema.querySelector(`[data-tema="${temaGuardado}"]`));
  grupoTema.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    pulsar(grupoTema, b);
    if (b.dataset.tema === "auto") delete raiz.dataset.theme;
    else raiz.dataset.theme = b.dataset.tema;
    mostrarColores();
    animador.releerTokens();
  });

  const proyector = $("control-proyector");
  proyector.setAttribute("aria-pressed", String(raiz.dataset.proyector === "1"));
  proyector.addEventListener("click", () => {
    const activo = raiz.dataset.proyector !== "1";
    if (activo) raiz.dataset.proyector = "1"; else delete raiz.dataset.proyector;
    proyector.setAttribute("aria-pressed", String(activo));
    animador.releerTokens();
  });

  const animaciones = $("control-animaciones");
  animaciones.addEventListener("click", () => {
    const pausadas = animaciones.getAttribute("aria-pressed") !== "true";
    animador.pausar(pausadas);
    animaciones.setAttribute("aria-pressed", String(pausadas));
    animaciones.querySelector("svg").replaceWith(icono(pausadas ? "reproducir" : "pausa"));
    animaciones.querySelector("span").textContent = pausadas ? "Reanudar animaciones" : "Pausar animaciones";
  });

  const sentido = $("control-sentido");
  sentido.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    pulsar(sentido, b);
    animador.sentidoElectrones(b.dataset.sentido === "electrones");
  });

  $("abrir-dialogo").addEventListener("click", () => $("dialogo-real").showModal());
}

// --- 1. Tokens ------------------------------------------------------------------------------

const TOKENS_INTERFAZ = [
  "--color-fondo", "--color-fondo-hundido", "--color-superficie", "--color-superficie-2", "--color-tinta",
  "--color-texto-suave", "--color-borde-suave", "--color-primario", "--color-mostaza", "--color-coral",
  "--color-menta", "--color-cielo", "--color-lila", "--color-verde", "--color-verde-bosque", "--color-azul-rey",
  "--color-terracota", "--color-seleccion", "--color-error",
  "--color-ok", "--color-aviso",
];
const TOKENS_CIRCUITO = [
  "--tension-0", "--tension-1", "--tension-2", "--tension-3", "--tension-4", "--color-puntos-convencional",
  "--color-puntos-electrones", "--ilus-resistencia-cuerpo", "--ilus-calor", "--ilus-bateria-cuerpo",
  "--ilus-bateria-tapa", "--ilus-bateria-positivo", "--ilus-bateria-negativo", "--ilus-fuente-corriente", "--ilus-lampara-luz", "--ilus-lampara-quemada",
  "--ilus-interruptor-base", "--ilus-interruptor-palanca",
];

function muestrasDeColor(contenedor, nombres) {
  contenedor.replaceChildren(...nombres.map((nombre) => {
    const caja = nodo("div", "muestra-color");
    const color = nodo("div", "muestra-color__color");
    color.style.background = `var(${nombre})`;
    const texto = nodo("div", "muestra-color__texto");
    texto.append(nodo("div", "muestra-color__nombre", nombre),
      nodo("div", "muestra-color__valor", getComputedStyle(raiz).getPropertyValue(nombre).trim()));
    caja.append(color, texto);
    return caja;
  }));
}

function mostrarColores() {
  muestrasDeColor($("colores-interfaz"), TOKENS_INTERFAZ);
  muestrasDeColor($("colores-circuito"), TOKENS_CIRCUITO);
}

function mostrarTokens() {
  mostrarColores();
  const tipo = $("tipografia");
  for (const [token, peso, texto] of [
    ["--texto-xxl", "--peso-titulo", "Simulador DC · Física 2"],
    ["--texto-xl", "--peso-titulo", "Circuitos de corriente continua"],
    ["--texto-lg", "--peso-fuerte", "Ley de Kirchhoff de corrientes (KCL)"],
    ["--texto-base", "--peso-normal", "Dibujá el circuito y mirá cómo circula la corriente. 0123456789 Ω µA ≈ ×"],
    ["--texto-sm", "--peso-medio", "Texto chico: nombres de columnas y ayudas."],
    ["--texto-xs", "--peso-fuerte", "TEXTO MÍNIMO: notas y etiquetas"],
  ]) {
    const linea = nodo("span", "", `${texto}  (${token}, ${peso})`);
    linea.style.display = "block";
    linea.style.fontSize = `var(${token})`;
    linea.style.fontWeight = `var(${peso})`;
    tipo.append(linea);
  }
  $("radios").append(...[["--radio-sm", "--sombra-presionada"], ["--radio-md", "--sombra-plana"],
    ["--radio-lg", "--sombra-plana-grande"], ["--radio-pildora", "--sombra-flotante"]].map(([radio, sombra]) => {
    const caja = nodo("div", "caja-ejemplo", `${radio}\n${sombra}`);
    caja.style.borderRadius = `var(${radio})`;
    caja.style.boxShadow = `var(${sombra})`;
    caja.style.whiteSpace = "pre-line";
    return caja;
  }));
  $("espaciados").append(...["--esp-1", "--esp-2", "--esp-3", "--esp-4", "--esp-5", "--esp-6", "--esp-7"].map((token) => {
    const fila = nodo("div", "espaciado");
    const barra = nodo("span", "espaciado__barra");
    barra.style.width = `calc(var(${token}) * 4)`;
    fila.append(barra, nodo("span", "", `${token} = ${getComputedStyle(raiz).getPropertyValue(token).trim()}`));
    return fila;
  }));
  $("iconos").append(...Object.keys(ICONOS).map((nombre) => {
    const m = nodo("div", "icono-muestra");
    m.append(icono(nombre), nodo("span", "", nombre));
    return m;
  }));
}

// --- 3. Componentes en todos sus estados ---------------------------------------------------

const H = { a: { x: 20, y: 52 }, b: { x: 20 + LARGO, y: 52 } };
const VERT = { a: { x: 60, y: 12 }, b: { x: 60, y: 12 + LARGO } };

const ESTADOS = {
  resistor: {
    nombre: "Resistencia",
    base: { etiqueta: "R1", valor: "1 kΩ" },
    estados: [
      ["Reposo", {}],
      ["Con corriente", { corriente: 5e-3 }],
      ["Calor medio", { corriente: 0.05, calor: 0.5 }],
      ["Calor máximo", { corriente: 0.5, calor: 1 }],
      ["Seleccionada", { seleccionado: true }],
      ["Error", { error: true }],
      ["Vertical", { corriente: 5e-3, calor: 0.4 }, VERT],
    ],
  },
  voltage_source: {
    nombre: "Batería",
    base: { etiqueta: "V1", valor: "12 V" },
    estados: [
      ["Reposo", {}],
      ["Entregando", { corriente: -0.012, potencia: -0.144 }],
      ["Absorbiendo", { corriente: 0.002, potencia: 0.012 }],
      ["Seleccionada", { seleccionado: true }],
      ["Error", { error: true }],
      ["Vertical", { corriente: -0.012, potencia: -0.144 }, VERT],
    ],
  },
  current_source: {
    nombre: "Fuente de corriente",
    base: { etiqueta: "I1", valor: "5 mA" },
    estados: [
      ["Reposo", {}],
      ["Con corriente", { corriente: 5e-3 }],
      ["Seleccionada", { seleccionado: true }],
      ["Error", { error: true }],
      ["Vertical", { corriente: 5e-3 }, VERT],
    ],
  },
  lamp: {
    nombre: "Lámpara",
    base: { etiqueta: "L1", valor: "24 Ω · 6 W" },
    estados: [
      ["Apagada", { potencia: 0, potenciaNominal: 6 }],
      ["25 %", { potencia: 1.5, potenciaNominal: 6, corriente: 0.25 }],
      ["60 %", { potencia: 3.6, potenciaNominal: 6, corriente: 0.39 }],
      ["100 %", { potencia: 6, potenciaNominal: 6, corriente: 0.5 }],
      ["Quemada (P > Pnom)", { potencia: 13.5, potenciaNominal: 6, corriente: 0.75 }],
      ["Seleccionada", { potencia: 3, potenciaNominal: 6, seleccionado: true }],
      ["Vertical", { potencia: 4.5, potenciaNominal: 6, corriente: 0.43 }, VERT],
    ],
  },
  switch: {
    nombre: "Interruptor",
    base: { etiqueta: "S1" },
    estados: [
      ["Cerrado", { corriente: 0.5 }, null, { closed: true }],
      ["Abierto", {}, null, { closed: false }],
      ["Seleccionado", { seleccionado: true }, null, { closed: true }],
      ["Error", { error: true }, null, { closed: false }],
      ["Vertical", {}, VERT, { closed: false }],
    ],
  },
};

function lamina(titulo, svg, animaciones = []) {
  const caja = nodo("div", "lamina");
  const { marco, capa } = animado(svg, animaciones);
  caja.append(marco, nodo("div", "lamina__pie", titulo));
  caja.capa = capa;
  return caja;
}

function laminaComponente(titulo, tipo, base, estado, posicion, extra, vista) {
  const svg = lienzo(120, posicion === VERT ? 104 : 96);
  const c = { type: tipo, ...base, ...(posicion ?? H), ...extra };
  // Puntos de corriente con el interruptor cerrado (para mostrarlos u ocultarlos al tocarlo).
  const conCorriente = [];
  dibujarComponente({ ...c, closed: true }, { vista, estado, animaciones: conCorriente });
  const animaciones = [];
  const comp = dibujarComponente(c, { vista, estado: { ...estado, corriente: c.closed === false ? 0 : estado.corriente }, animaciones });
  svg.append(comp);
  const caja = lamina(titulo, svg, animaciones);
  if (tipo === "switch") {
    svg.addEventListener("click", () => {
      c.closed = !c.closed;
      // Mismo nodo: la palanca anima con transition en lugar de redibujarse.
      comp.classList.toggle("abierto", c.closed === false);
      animador.actualizar(caja.capa, c.closed ? conCorriente : []);
    });
  }
  return caja;
}

function mostrarComponentes() {
  const contenedor = $("tablas-componentes");
  for (const [tipo, definicion] of Object.entries(ESTADOS)) {
    const sub = nodo("div", "subseccion");
    sub.append(nodo("h3", "", definicion.nombre));
    const scroll = nodo("div", "tabla-scroll");
    const tabla = nodo("table", "tabla-componentes");
    const cabecera = nodo("tr");
    cabecera.append(nodo("th", "", ""), ...definicion.estados.map(([titulo]) => nodo("th", "", titulo)));
    tabla.append(cabecera);
    for (const vista of ["ilustrada", "esquematica"]) {
      const fila = nodo("tr");
      const encabezado = nodo("th", "", vista === "ilustrada" ? "Ilustrada" : "Esquemática");
      encabezado.scope = "row";
      fila.append(encabezado);
      for (const [titulo, estado, posicion, extra] of definicion.estados) {
        const celda = nodo("td", "celda-componente");
        celda.append(laminaComponente(titulo, tipo, definicion.base, estado, posicion, extra ?? {}, vista));
        fila.append(celda);
      }
      tabla.append(fila);
    }
    scroll.append(tabla);
    sub.append(scroll);
    contenedor.append(sub);
  }

  // Cables, tierra y nodos (iguales en las dos vistas).
  const sub = nodo("div", "subseccion");
  sub.append(nodo("h3", "", "Cables, tierra y nodos"));
  const fila = nodo("div", "fila");
  for (const [titulo, tension] of [["0 V (más bajo)", 0], ["3 V", 3], ["6 V", 6], ["9 V", 9], ["12 V (más alto)", 12]]) {
    const svg = lienzo(120, 64);
    const animaciones = [];
    svg.append(dibujarComponente({ type: "wire", a: { x: 16, y: 32 }, b: { x: 104, y: 32 } },
      { estado: { color: colorTension(tension, 0, 12), corriente: 0.01 }, animaciones }));
    fila.append(lamina(titulo, svg, animaciones));
  }
  const sinSimular = lienzo(120, 64);
  sinSimular.append(dibujarComponente({ type: "wire", a: { x: 16, y: 32 }, b: { x: 104, y: 32 } }));
  fila.append(lamina("Sin simular", sinSimular));
  const conError = lienzo(120, 64);
  conError.append(dibujarComponente({ type: "wire", a: { x: 16, y: 32 }, b: { x: 104, y: 32 } }, { estado: { error: true } }));
  fila.append(lamina("Error", conError));
  const tierra = lienzo(120, 64);
  dibujarTierra({ x: 60, y: 18 }, tierra);
  fila.append(lamina("Tierra", tierra));
  const nodos = lienzo(120, 64);
  dibujarNodo({ x: 40, y: 32 }, nodos);
  dibujarNodo({ x: 80, y: 32 }, nodos, { error: true });
  fila.append(lamina("Nodo / nodo suelto", nodos));
  sub.append(fila);
  contenedor.append(sub);
}

// --- 4. Animaciones ---------------------------------------------------------------------------

function mostrarAnimaciones() {
  const corrientes = $("anim-corriente");
  const svg = lienzo(560, 5 * 44 + 16);
  const animacionesCorriente = [];
  [1e-6, 1e-4, 1e-2, 1, 10].forEach((corriente, i) => {
    const y = 30 + i * 44;
    svg.append(dibujarComponente({ type: "wire", a: { x: 150, y }, b: { x: 540, y } },
      { estado: { color: colorTension(i, 0, 4), corriente }, animaciones: animacionesCorriente }));
    const t = el("text", { class: "etiqueta", x: 16, y: y + 4 }, svg);
    t.textContent = `${formatearSI(corriente, "A")} · ${velocidadCorriente(corriente).toFixed(0)} px/s`;
  });
  corrientes.append(animado(svg, animacionesCorriente).marco);

  const varios = $("anim-varios");
  const lampara = lienzo(140, 104);
  const resistencia = lienzo(140, 96);
  const laminaLampara = lamina("Lámpara: halo según el brillo", lampara);
  const laminaResistencia = lamina("Resistencia: brillo cálido", resistencia);
  const actualizar = () => {
    const brillo = Number($("rango-brillo").value) / 100;
    const calor = Number($("rango-calor").value) / 100;
    $("texto-brillo").textContent = brillo > 1 ? `${Math.round(brillo * 100)} % (quemada)` : `${Math.round(brillo * 100)} %`;
    $("texto-calor").textContent = `${Math.round(calor * 100)} %`;
    const deLampara = [];
    lampara.querySelector(".comp")?.remove();
    lampara.append(dibujarComponente({ type: "lamp", a: { x: 30, y: 70 }, b: { x: 110, y: 70 }, etiqueta: "L1" },
      { estado: { potencia: brillo * 6, potenciaNominal: 6, corriente: brillo > 0 ? 0.3 : 0 }, animaciones: deLampara }));
    animador.actualizar(laminaLampara.capa, deLampara);
    const deResistencia = [];
    resistencia.querySelector(".comp")?.remove();
    resistencia.append(dibujarComponente({ type: "resistor", a: { x: 30, y: 54 }, b: { x: 110, y: 54 }, etiqueta: "R1" },
      { estado: { calor: calorResistencia(calor, 1), corriente: 0.1 }, animaciones: deResistencia }));
    animador.actualizar(laminaResistencia.capa, deResistencia);
  };
  $("rango-brillo").addEventListener("input", actualizar);
  $("rango-calor").addEventListener("input", actualizar);
  actualizar();

  const interruptor = lienzo(140, 96);
  const comp = dibujarComponente({ type: "switch", a: { x: 30, y: 54 }, b: { x: 110, y: 54 }, closed: true, etiqueta: "S1 (clic)" });
  interruptor.append(comp);
  interruptor.addEventListener("click", () => comp.classList.toggle("abierto"));

  const bateria = lienzo(140, 96);
  const deBateria = [];
  bateria.append(dibujarComponente({ type: "voltage_source", a: { x: 30, y: 54 }, b: { x: 110, y: 54 }, etiqueta: "V1" },
    { estado: { potencia: -1, corriente: -0.1 }, animaciones: deBateria }));

  varios.append(laminaLampara, laminaResistencia,
    lamina("Interruptor: palanca (tocalo)", interruptor), lamina("Batería: pulso al entregar", bateria, deBateria));
}

// --- 5 y 6. Circuitos simulados con el motor ------------------------------------------------------

/**
 * Monta un circuito interactivo simulado con el motor. `def`:
 *   piezas: [{id, type, a, b, nodos: [na, nb], value?, rated_power?, closed?, corrienteDe?}]
 *   cables: [{a, b, nodo, corriente: [id, signo]}]  (el motor no informa corriente en los cables)
 *   uniones: puntos con nodo dibujado; tierra: punto del símbolo o null; ancho, alto
 *   tension, vista y alActualizar(resultado, porId) para la tabla o las viñetas.
 * Devuelve {dibujar}; tocar un interruptor lo abre o lo cierra.
 */
function montarCircuito(contenedor, def) {
  let capa = null;
  const simular = () => simulate({
    ground: "0",
    components: def.piezas.map((p) => {
      const c = { id: p.id, type: p.type, a: p.nodos[0], b: p.nodos[1] };
      if (p.type === "voltage_source") c.value = def.tension;
      if (p.type === "switch") c.closed = p.closed;
      if (p.type === "lamp") Object.assign(c, { value: p.value, rated_power: p.rated_power });
      if (p.type === "resistor") c.value = p.value;
      return c;
    }),
  });
  const valorDe = (p) => (p.type === "voltage_source" ? `${def.tension} V`
    : p.type === "lamp" ? `${p.value} Ω · ${p.rated_power} W`
      : p.type === "resistor" ? formatearCompacto(p.value, "Ω") : (p.closed ? "cerrado" : "abierto"));

  function dibujar() {
    const r = simular();
    const porId = Object.fromEntries(r.components.map((c) => [c.id, c]));
    const corrienteDe = ([id, signo]) => (porId[id].current ?? 0) * signo;
    const tensiones = Object.values(r.node_voltages).filter((v) => v !== null);
    const vmin = Math.min(...tensiones);
    const vmax = Math.max(...tensiones);
    const potencias = r.components.filter((c) => c.type === "resistor").map((c) => c.power);
    const svg = lienzo(def.ancho, def.alto);
    const animaciones = [];
    for (const cable of def.cables) {
      const v = r.node_voltages[cable.nodo];
      svg.append(dibujarComponente({ type: "wire", a: cable.a, b: cable.b },
        { estado: { color: v === null || v === undefined ? null : colorTension(v, vmin, vmax), corriente: corrienteDe(cable.corriente) }, animaciones }));
    }
    for (const p of def.piezas) {
      const res = porId[p.id];
      // Un interruptor cerrado es un cable para el motor (sin corriente propia): se usa la de su rama.
      const corriente = p.type === "switch" ? (p.closed ? corrienteDe(p.corrienteDe) : 0) : res.current ?? 0;
      const g = dibujarComponente({ ...p, etiqueta: p.id, valor: valorDe(p) }, {
        vista: def.vista,
        animaciones,
        estado: {
          corriente,
          potencia: res.power,
          potenciaNominal: p.rated_power,
          quemada: res.burned,
          calor: p.type === "resistor" ? calorResistencia(res.power, Math.max(...potencias, 1e-12)) : 0,
        },
      });
      if (p.type === "switch") {
        g.addEventListener("click", () => {
          p.closed = !p.closed;
          dibujar();
        });
      }
      svg.append(g);
    }
    if (def.tierra) dibujarTierra(def.tierra, svg);
    for (const punto of def.uniones ?? []) dibujarNodo(punto, svg);
    if (capa) animador.quitar(capa);
    contenedor.replaceChildren(svg);
    capa = animador.registrar(contenedor, svg, animaciones);
    def.alActualizar?.(r, porId, { vmin, vmax });
  }
  return { dibujar };
}

function conmutadorDe(id, alElegir) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    pulsar($(id), b);
    alElegir(b.dataset);
  });
}

function celdaTexto(texto, clase) {
  return nodo("td", clase, texto);
}

// Serie: una lámpara de 3 W y otra de 6 W. Con 18 V se quema la de 3 W y se apagan las dos.
const SERIE = {
  ancho: 380, alto: 230, tension: 12, vista: "ilustrada",
  piezas: [
    { id: "V1", type: "voltage_source", a: { x: 150, y: 195 }, b: { x: 230, y: 195 }, nodos: ["p", "0"] },
    { id: "S1", type: "switch", a: { x: 40, y: 160 }, b: { x: 40, y: 80 }, nodos: ["p", "s"], closed: true, corrienteDe: ["V1", -1] },
    { id: "L1", type: "lamp", a: { x: 90, y: 60 }, b: { x: 170, y: 60 }, nodos: ["s", "m"], value: 12, rated_power: 3 },
    { id: "L2", type: "lamp", a: { x: 210, y: 60 }, b: { x: 290, y: 60 }, nodos: ["m", "0"], value: 12, rated_power: 6 },
  ],
  cables: [
    { a: { x: 150, y: 195 }, b: { x: 40, y: 195 }, nodo: "p", corriente: ["V1", -1] },
    { a: { x: 40, y: 195 }, b: { x: 40, y: 160 }, nodo: "p", corriente: ["V1", -1] },
    { a: { x: 40, y: 80 }, b: { x: 40, y: 60 }, nodo: "s", corriente: ["V1", -1] },
    { a: { x: 40, y: 60 }, b: { x: 90, y: 60 }, nodo: "s", corriente: ["V1", -1] },
    { a: { x: 170, y: 60 }, b: { x: 210, y: 60 }, nodo: "m", corriente: ["V1", -1] },
    { a: { x: 290, y: 60 }, b: { x: 340, y: 60 }, nodo: "0", corriente: ["V1", -1] },
    { a: { x: 340, y: 60 }, b: { x: 340, y: 195 }, nodo: "0", corriente: ["V1", -1] },
    { a: { x: 340, y: 195 }, b: { x: 230, y: 195 }, nodo: "0", corriente: ["V1", -1] },
  ],
  alActualizar(r, c) {
    const quemadas = r.stats.burned_lamps;
    $("serie-lectura").textContent = quemadas.length
      ? `Se quemó ${quemadas.join(" y ")}: el circuito quedó abierto y se apagaron todas.`
      : `Corriente: ${formatearSI(c.L1.current, "A")} por las dos lámparas · L1 ${Math.round(c.L1.brightness * 100)} % · L2 ${Math.round(c.L2.brightness * 100)} %`;
    $("serie-lectura").className = quemadas.length ? "mensaje mensaje--aviso" : "mensaje";
  },
};

// Paralelo: una lámpara de 6 W y otra de 15 W. Con 18 V se quema la de 6 W y la otra sigue.
const PARALELO = {
  ancho: 380, alto: 270, tension: 12, vista: "ilustrada",
  piezas: [
    { id: "V1", type: "voltage_source", a: { x: 150, y: 240 }, b: { x: 230, y: 240 }, nodos: ["p", "0"] },
    { id: "S1", type: "switch", a: { x: 40, y: 220 }, b: { x: 40, y: 140 }, nodos: ["p", "s"], closed: true, corrienteDe: ["V1", -1] },
    { id: "L1", type: "lamp", a: { x: 120, y: 60 }, b: { x: 200, y: 60 }, nodos: ["s", "0"], value: 24, rated_power: 6 },
    { id: "L2", type: "lamp", a: { x: 120, y: 140 }, b: { x: 200, y: 140 }, nodos: ["s", "0"], value: 24, rated_power: 15 },
  ],
  cables: [
    { a: { x: 150, y: 240 }, b: { x: 40, y: 240 }, nodo: "p", corriente: ["V1", -1] },
    { a: { x: 40, y: 240 }, b: { x: 40, y: 220 }, nodo: "p", corriente: ["V1", -1] },
    { a: { x: 40, y: 140 }, b: { x: 40, y: 60 }, nodo: "s", corriente: ["L1", 1] },
    { a: { x: 40, y: 140 }, b: { x: 120, y: 140 }, nodo: "s", corriente: ["L2", 1] },
    { a: { x: 40, y: 60 }, b: { x: 120, y: 60 }, nodo: "s", corriente: ["L1", 1] },
    { a: { x: 200, y: 60 }, b: { x: 330, y: 60 }, nodo: "0", corriente: ["L1", 1] },
    { a: { x: 330, y: 60 }, b: { x: 330, y: 140 }, nodo: "0", corriente: ["L1", 1] },
    { a: { x: 200, y: 140 }, b: { x: 330, y: 140 }, nodo: "0", corriente: ["L2", 1] },
    { a: { x: 330, y: 140 }, b: { x: 330, y: 240 }, nodo: "0", corriente: ["V1", -1] },
    { a: { x: 330, y: 240 }, b: { x: 230, y: 240 }, nodo: "0", corriente: ["V1", -1] },
  ],
  uniones: [{ x: 40, y: 140 }, { x: 330, y: 140 }],
  alActualizar(r, c) {
    const quemadas = r.stats.burned_lamps;
    const corrientes = `Batería ${formatearSI(-c.V1.current, "A")} · L1 ${formatearSI(c.L1.current, "A")} · L2 ${formatearSI(c.L2.current, "A")}`;
    $("paralelo-lectura").textContent = quemadas.length
      ? `Se quemó ${quemadas.join(" y ")}, pero la otra rama sigue encendida. ${corrientes}`
      : corrientes;
    $("paralelo-lectura").className = quemadas.length ? "mensaje mensaje--aviso" : "mensaje";
  },
};

function iniciarSerieParalelo() {
  for (const [def, id] of [[SERIE, "serie"], [PARALELO, "paralelo"]]) {
    const circuito = montarCircuito($(`${id}-lienzo`), def);
    conmutadorDe(`${id}-tension`, (datos) => {
      def.tension = Number(datos.tension);
      circuito.dibujar();
    });
    circuito.dibujar();
  }
}

// Circuito de prueba: batería, dos interruptores, una lámpara y una resistencia.
const DEMO = {
  ancho: 560, alto: 260, tension: 12, vista: "ilustrada",
  piezas: [
    { id: "V1", type: "voltage_source", a: { x: 80, y: 100 }, b: { x: 80, y: 180 }, nodos: ["n1", "0"] },
    { id: "S1", type: "switch", a: { x: 140, y: 60 }, b: { x: 220, y: 60 }, nodos: ["n1", "n2"], closed: true, corrienteDe: ["V1", -1] },
    { id: "L1", type: "lamp", a: { x: 300, y: 100 }, b: { x: 300, y: 180 }, nodos: ["n2", "0"], value: 24, rated_power: 6 },
    { id: "S2", type: "switch", a: { x: 340, y: 60 }, b: { x: 420, y: 60 }, nodos: ["n2", "n3"], closed: false, corrienteDe: ["R1", 1] },
    { id: "R1", type: "resistor", a: { x: 480, y: 100 }, b: { x: 480, y: 180 }, nodos: ["n3", "0"], value: 48 },
  ],
  cables: [
    { a: { x: 80, y: 100 }, b: { x: 80, y: 60 }, nodo: "n1", corriente: ["V1", -1] },
    { a: { x: 80, y: 60 }, b: { x: 140, y: 60 }, nodo: "n1", corriente: ["V1", -1] },
    { a: { x: 220, y: 60 }, b: { x: 300, y: 60 }, nodo: "n2", corriente: ["V1", -1] },
    { a: { x: 300, y: 60 }, b: { x: 300, y: 100 }, nodo: "n2", corriente: ["L1", 1] },
    { a: { x: 300, y: 60 }, b: { x: 340, y: 60 }, nodo: "n2", corriente: ["R1", 1] },
    { a: { x: 420, y: 60 }, b: { x: 480, y: 60 }, nodo: "n3", corriente: ["R1", 1] },
    { a: { x: 480, y: 60 }, b: { x: 480, y: 100 }, nodo: "n3", corriente: ["R1", 1] },
    { a: { x: 480, y: 180 }, b: { x: 480, y: 220 }, nodo: "0", corriente: ["R1", 1] },
    { a: { x: 480, y: 220 }, b: { x: 300, y: 220 }, nodo: "0", corriente: ["R1", 1] },
    { a: { x: 300, y: 180 }, b: { x: 300, y: 220 }, nodo: "0", corriente: ["L1", 1] },
    { a: { x: 300, y: 220 }, b: { x: 80, y: 220 }, nodo: "0", corriente: ["V1", -1] },
    { a: { x: 80, y: 220 }, b: { x: 80, y: 180 }, nodo: "0", corriente: ["V1", -1] },
  ],
  tierra: { x: 80, y: 220 },
  uniones: [{ x: 80, y: 60 }, { x: 300, y: 60 }, { x: 480, y: 60 }, { x: 300, y: 220 }, { x: 80, y: 220 }, { x: 480, y: 220 }],
  alActualizar(r, porId, { vmin, vmax }) {
    $("demo-tabla").replaceChildren(...r.components.map((c) => {
      const tr = nodo("tr");
      tr.append(celdaTexto(c.id), celdaTexto(c.voltage === null ? "—" : formatearSI(c.voltage, "V"), "num"),
        celdaTexto(c.current === null ? "—" : formatearSI(c.current, "A"), "num"), celdaTexto(formatearSI(c.power, "W"), "num"));
      return tr;
    }));
    const lampara = porId.L1;
    const mensaje = $("demo-mensaje");
    mensaje.replaceChildren(lampara.burned
      ? Object.assign(nodo("div", "mensaje mensaje--aviso"),
        { textContent: "L1 se quemó (P > 6 W): abrió su rama. Si S2 está cerrado, R1 sigue funcionando." })
      : Object.assign(nodo("div", "mensaje"), { textContent: `Brillo de L1: ${Math.round(lampara.brightness * 100)} %` }));
    $("demo-vmin").textContent = formatearSI(vmin, "V");
    $("demo-vmax").textContent = formatearSI(vmax, "V");
  },
};

function iniciarDemo() {
  const circuito = montarCircuito($("demo-lienzo"), DEMO);
  conmutadorDe("demo-vista", (datos) => {
    DEMO.vista = datos.vista;
    circuito.dibujar();
  });
  conmutadorDe("demo-tension", (datos) => {
    DEMO.tension = Number(datos.tension);
    circuito.dibujar();
  });
  circuito.dibujar();
}

// --- 7. Rendimiento: 50 componentes animados -----------------------------------------------------

let vistaCarga = "ilustrada";
let capaCarga = null;

function dibujarCarga() {
  const tipos = ["resistor", "lamp", "voltage_source", "switch", "current_source"];
  const columnas = 10;
  const svg = lienzo(columnas * 110 + 20, 5 * 100 + 20);
  const animaciones = [];
  for (let i = 0; i < 50; i++) {
    const x = 20 + (i % columnas) * 110;
    const y = 60 + Math.floor(i / columnas) * 100;
    const tipo = tipos[Math.floor(i / columnas)];
    const corriente = 10 ** (-5 + (i % columnas) * 0.6) * (i % 2 ? 1 : -1);
    // Cada componente con su cable: 50 componentes y 50 cables animados.
    svg.append(dibujarComponente({ type: "wire", a: { x, y: y + 28 }, b: { x: x + LARGO, y: y + 28 } },
      { estado: { color: colorTension(i % columnas, 0, columnas - 1), corriente }, animaciones }));
    svg.append(dibujarComponente({ type: tipo, a: { x, y }, b: { x: x + LARGO, y }, closed: true }, {
      vista: vistaCarga,
      animaciones,
      estado: { corriente, potencia: tipo === "voltage_source" ? -1 : 2, potenciaNominal: 4, calor: (i % columnas) / columnas },
    }));
  }
  if (capaCarga) animador.quitar(capaCarga);
  const contenedor = $("carga-lienzo");
  contenedor.replaceChildren(svg);
  capaCarga = animador.registrar(contenedor, svg, animaciones);
}

function medirFps() {
  const medidor = $("medidor");
  medidor.textContent = "midiendo…";
  let cuadros = 0;
  const inicio = performance.now();
  const paso = (ahora) => {
    cuadros++;
    if (ahora - inicio < 3000) requestAnimationFrame(paso);
    else {
      const fps = (cuadros * 1000) / (ahora - inicio);
      medidor.textContent = `${fps.toFixed(1)} cuadros/s`;
      medidor.dataset.fps = fps.toFixed(1);
    }
  };
  requestAnimationFrame(paso);
}

function iniciarCarga() {
  $("carga-vista").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    pulsar($("carga-vista"), b);
    vistaCarga = b.dataset.vista;
    dibujarCarga();
  });
  $("medir").addEventListener("click", medirFps);
  dibujarCarga();
}

// --- Arranque -------------------------------------------------------------------------------------

colocarIconos();
iniciarControles();
mostrarTokens();
mostrarComponentes();
mostrarAnimaciones();
iniciarSerieParalelo();
iniciarDemo();
iniciarCarga();
