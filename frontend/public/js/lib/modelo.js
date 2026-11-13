// Modelo del circuito, sin DOM. Todas las funciones devuelven un estado nuevo (inmutable).
//
// Coordenadas en unidades de grilla (enteros). Cada componente guarda sus dos terminales `a` y `b`.
// R, V e I miden LARGO unidades y son horizontales o verticales; un cable une dos puntos cualquiera.
// Dos terminales están conectados si caen en el mismo punto o si los une un cable.

export const LARGO = 4;
export const ANCHO_MUNDO = 48;
export const ALTO_MUNDO = 30;

export const TIPOS = {
  resistor: { prefijo: "R", unidad: "Ω", porDefecto: "1k", nombre: "Resistencia" },
  voltage_source: { prefijo: "V", unidad: "V", porDefecto: "10", nombre: "Fuente de tensión" },
  current_source: { prefijo: "I", unidad: "A", porDefecto: "1m", nombre: "Fuente de corriente" },
  lamp: { prefijo: "L", unidad: "Ω", porDefecto: "24", potenciaPorDefecto: "6", nombre: "Lámpara" },
  switch: { prefijo: "S", unidad: "", porDefecto: null, nombre: "Interruptor" },
  wire: { prefijo: "W", unidad: "", porDefecto: null, nombre: "Cable" },
  // La tierra es un componente de un solo punto (a = b). Puede haber varias: todas valen 0 V.
  ground: { prefijo: "G", unidad: "", porDefecto: null, nombre: "Tierra (GND)" },
  // Fusible: conduce sin resistencia; si la corriente supera la nominal (value, en A) se abre.
  fuse: { prefijo: "F", unidad: "A", porDefecto: "1", nombre: "Fusible" },
  // Potenciómetro: resistencia total (value) con un tercer borne, el cursor, en `posicion` (0 a 1).
  potentiometer: { prefijo: "P", unidad: "Ω", porDefecto: "10k", nombre: "Potenciómetro" },
  // Multímetro: en V y Ω mide entre sus puntas (no se conecta); en A va en la rama como una pieza.
  multimeter: { prefijo: "M", unidad: "", porDefecto: null, nombre: "Multímetro" },
};

/** Tipos con un valor numérico editable (los cables e interruptores no tienen). */
export const tieneValor = (tipo) => !["wire", "switch", "ground", "multimeter"].includes(tipo);

export const esTierra = (c) => c.type === "ground";

// Rotación 0..3: dirección de a hacia b.
const DIRECCIONES = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
];

export function circuitoVacio() {
  return { components: [], counters: { ...CONTADORES }, sinTierraAuto: [] };
}

const CONTADORES = Object.freeze({ R: 0, V: 0, I: 0, W: 0, L: 0, S: 0, G: 0, F: 0, P: 0, M: 0 });

export function nombreNodo(punto) {
  return `${punto.x}_${punto.y}`;
}

export function mismoPunto(p, q) {
  return p.x === q.x && p.y === q.y;
}

export function dentroDelMundo(punto) {
  return punto.x >= 0 && punto.y >= 0 && punto.x <= ANCHO_MUNDO && punto.y <= ALTO_MUNDO;
}

/** Terminales de una pieza de largo fijo centrada en `centro`. */
export function terminalesDesdeCentro(centro, rotacion) {
  const d = DIRECCIONES[((rotacion % 4) + 4) % 4];
  const mitad = LARGO / 2;
  return {
    a: { x: centro.x - d.x * mitad, y: centro.y - d.y * mitad },
    b: { x: centro.x + d.x * mitad, y: centro.y + d.y * mitad },
  };
}

export function centro(componente) {
  return {
    x: (componente.a.x + componente.b.x) / 2,
    y: (componente.a.y + componente.b.y) / 2,
  };
}

export function rotacionDe(componente) {
  const dx = Math.sign(componente.b.x - componente.a.x);
  const dy = Math.sign(componente.b.y - componente.a.y);
  const i = DIRECCIONES.findIndex((d) => d.x === dx && d.y === dy);
  return i < 0 ? 0 : i;
}

export function esVertical(componente) {
  return componente.a.x === componente.b.x;
}

/** Reserva el próximo id del tipo. Los contadores solo crecen: un id borrado no se reutiliza. */
export function reservarId(estado, tipo) {
  const prefijo = TIPOS[tipo].prefijo;
  const siguiente = (estado.counters[prefijo] ?? 0) + 1;
  return { id: `${prefijo}${siguiente}`, counters: { ...estado.counters, [prefijo]: siguiente } };
}

function conComponente(estado, tipo, a, b, value) {
  const { id, counters } = reservarId(estado, tipo);
  const componente = { id, type: tipo, a: { ...a }, b: { ...b } };
  if (tieneValor(tipo)) componente.value = value ?? TIPOS[tipo].porDefecto;
  if (tipo === "lamp") componente.potencia = TIPOS.lamp.potenciaPorDefecto;
  if (tipo === "switch") componente.closed = true;
  if (tipo === "potentiometer") componente.posicion = 0.5;
  if (tipo === "multimeter") {
    componente.modo = "V";
    // Las puntas empiezan sueltas, debajo de cada extremo: se arrastran hasta el circuito.
    const abajo = (p) => ({ x: p.x, y: Math.min(ALTO_MUNDO, p.y + 3) });
    componente.puntas = { roja: abajo(a), negra: abajo(b) };
  }
  return { estado: { ...estado, components: [...estado.components, componente], counters }, id };
}

export function agregarPieza(estado, tipo, centroPieza, rotacion, value) {
  if (!TIPOS[tipo] || tipo === "wire") throw new Error(`Tipo de pieza inválido: ${tipo}`);
  const { a, b } = terminalesDesdeCentro(centroPieza, rotacion);
  if (!dentroDelMundo(a) || !dentroDelMundo(b)) return { estado, id: null };
  return conComponente(estado, tipo, a, b, value);
}

export function agregarCable(estado, a, b) {
  if (mismoPunto(a, b) || !dentroDelMundo(a) || !dentroDelMundo(b)) return { estado, id: null };
  const repetido = estado.components.some((c) => c.type === "wire" &&
    ((mismoPunto(c.a, a) && mismoPunto(c.b, b)) || (mismoPunto(c.a, b) && mismoPunto(c.b, a))));
  if (repetido) return { estado, id: null };
  return conComponente(estado, "wire", a, b);
}

function reemplazar(estado, id, cambio) {
  let cambio_aplicado = false;
  const components = estado.components.map((c) => {
    if (c.id !== id) return c;
    const nuevo = cambio(c);
    cambio_aplicado = nuevo !== c;
    return nuevo;
  });
  return cambio_aplicado ? { ...estado, components } : estado;
}

export function mover(estado, id, dx, dy) {
  if (dx === 0 && dy === 0) return estado;
  return reemplazar(estado, id, (c) => {
    const a = { x: c.a.x + dx, y: c.a.y + dy };
    const b = { x: c.b.x + dx, y: c.b.y + dy };
    return dentroDelMundo(a) && dentroDelMundo(b) ? { ...c, a, b } : c;
  });
}

/** Gira 90° una pieza alrededor de su centro. Los cables no se giran. */
export function rotar(estado, id) {
  return reemplazar(estado, id, (c) => {
    if (c.type === "wire") return c;
    const { a, b } = terminalesDesdeCentro(centro(c), rotacionDe(c) + 1);
    return dentroDelMundo(a) && dentroDelMundo(b) ? { ...c, a, b } : c;
  });
}

const entre = (v, p, q) => v > Math.min(p, q) && v < Math.max(p, q);
const enTramo = (v, p, q) => v >= Math.min(p, q) && v <= Math.max(p, q);

/**
 * Recorrido recto de cables que pasa por `punto` en la dirección dada: el tramo de cable que lo
 * toca (también en un extremo) más los cables alineados que siguen pegados en la misma línea.
 * Devuelve {desde, hasta, cables} en la coordenada del eje (x si es horizontal), o null.
 */
function recorridoRecto(estado, punto, horizontal) {
  const eje = horizontal ? "x" : "y";
  const otro = horizontal ? "y" : "x";
  const enLinea = estado.components.filter((c) => c.type === "wire" && c.a[otro] === punto[otro] && c.b[otro] === punto[otro]
    && c.a[eje] !== c.b[eje]);
  const intervalo = (c) => [Math.min(c.a[eje], c.b[eje]), Math.max(c.a[eje], c.b[eje])];
  const inicial = enLinea.find((c) => {
    const [d, h] = intervalo(c);
    return punto[eje] >= d && punto[eje] <= h;
  });
  if (!inicial) return null;
  let [desde, hasta] = intervalo(inicial);
  const cables = new Set([inicial]);
  let creció = true;
  while (creció) {
    creció = false;
    for (const c of enLinea) {
      if (cables.has(c)) continue;
      const [d, h] = intervalo(c);
      if (h >= desde && d <= hasta) {
        desde = Math.min(desde, d);
        hasta = Math.max(hasta, h);
        cables.add(c);
        creció = true;
      }
    }
  }
  return { desde, hasta, cables: [...cables] };
}

/**
 * Inserta la pieza `id` en serie en el cable sobre el que cae su centro. Busca el recorrido recto
 * de cables (varios cables alineados cuentan como uno) y desliza la pieza a la posición más
 * cercana donde entra entera sin tapar una unión con otra rama; ahí corta los cables en sus bornes
 * y saca lo que queda debajo. Devuelve {estado, sobreCable, motivo}: si el centro no cae sobre un
 * cable, sobreCable es false y el estado no cambia; si cae pero la pieza no entra, el estado
 * tampoco cambia y `motivo` explica por qué (para avisar en lugar de dejarla suelta encima).
 */
export function insercionEnCable(estado, id) {
  const pieza = buscar(estado, id);
  const sinCambio = { estado, sobreCable: false, motivo: null };
  if (!pieza || pieza.type === "wire" || esTierra(pieza) || pieza.type === "potentiometer"
    || (pieza.type === "multimeter" && pieza.modo !== "A")) return sinCambio;
  const m = centro(pieza);
  const largo = Math.abs(pieza.b.x - pieza.a.x) + Math.abs(pieza.b.y - pieza.a.y);
  if (!Number.isInteger(m.x) || !Number.isInteger(m.y)) return sinCambio;
  // Primero en la dirección de la pieza; si no hay cable ahí, en la otra (la pieza se gira).
  const direcciones = esVertical(pieza) ? [false, true] : [true, false];
  let motivo = null;
  for (const horizontal of direcciones) {
    const recorrido = recorridoRecto(estado, m, horizontal);
    if (!recorrido) continue;
    const eje = horizontal ? "x" : "y";
    const otro = horizontal ? "y" : "x";
    const enPunto = (t) => ({ [eje]: t, [otro]: m[otro] });
    const propios = new Set(recorrido.cables.map((c) => c.id));
    // Una unión es un punto del recorrido donde llega algo más que los cables del recorrido.
    const union = (t) => estado.components.some((c) => c.id !== pieza.id && !propios.has(c.id)
      && terminales(c).some((q) => mismoPunto(q, enPunto(t))));
    let mejor = null;
    for (let inicio = recorrido.desde; inicio + largo <= recorrido.hasta; inicio++) {
      let libre = true;
      for (let t = inicio + 1; t < inicio + largo && libre; t++) libre = !union(t);
      if (!libre) continue;
      const distancia = Math.abs(inicio + largo / 2 - m[eje]);
      if (!mejor || distancia < mejor.distancia) mejor = { inicio, distancia };
    }
    if (!mejor) {
      motivo = recorrido.hasta - recorrido.desde < largo
        ? `No entra en ese cable: el tramo mide ${recorrido.hasta - recorrido.desde} y la pieza ${largo}. Soltala sobre un cable más largo.`
        : "No entra en ese cable sin tapar una unión con otra rama. Soltala sobre un tramo libre.";
      continue;
    }
    // Bornes en la nueva posición, conservando el sentido de la pieza si ya estaba alineada.
    let a = enPunto(mejor.inicio);
    let b = enPunto(mejor.inicio + largo);
    const alineada = horizontal ? !esVertical(pieza) : esVertical(pieza);
    if (alineada && pieza.a[eje] > pieza.b[eje]) [a, b] = [b, a];
    let nuevo = partirCablesEn(partirCablesEn(estado, a), b);
    const [d, h] = [mejor.inicio, mejor.inicio + largo];
    const debajo = (c) => c.type === "wire" && c.a[otro] === m[otro] && c.b[otro] === m[otro]
      && Math.min(c.a[eje], c.b[eje]) >= d && Math.max(c.a[eje], c.b[eje]) <= h;
    nuevo = {
      ...nuevo,
      components: nuevo.components.filter((c) => !debajo(c))
        .map((c) => (c.id === pieza.id ? { ...c, a: { ...a }, b: { ...b } } : c)),
    };
    return { estado: nuevo, sobreCable: true, motivo: null };
  }
  return motivo ? { estado, sobreCable: true, motivo } : sinCambio;
}

/** Como insercionEnCable, pero devuelve solo el estado (igual si no se pudo insertar). */
export function insertarEnCable(estado, id) {
  return insercionEnCable(estado, id).estado;
}

// --- Cables en L, partir y estirar -------------------------------------------------------------

/** Tramos de a hasta b: uno si están alineados, dos en L si no (horizontal primero o vertical). */
export function tramosEnL(a, b, horizontalPrimero = true) {
  if (mismoPunto(a, b)) return [];
  if (a.x === b.x || a.y === b.y) return [[a, b]];
  const esquina = horizontalPrimero ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [[a, esquina], [esquina, b]];
}

/**
 * Si `punto` cae en el medio de un cable recto, lo parte en dos ahí: así un cable nuevo que
 * termina sobre otro queda conectado (sin esto, solo se unen los extremos).
 */
export function partirCablesEn(estado, punto) {
  let actual = estado;
  for (const c of estado.components) {
    if (c.type !== "wire") continue;
    const adentro = (c.a.y === c.b.y && punto.y === c.a.y && entre(punto.x, c.a.x, c.b.x))
      || (c.a.x === c.b.x && punto.x === c.a.x && entre(punto.y, c.a.y, c.b.y));
    if (!adentro) continue;
    const { id, counters } = reservarId(actual, "wire");
    const components = actual.components.map((x) => (x.id === c.id ? { ...x, b: { ...punto } } : x));
    components.push({ id, type: "wire", a: { ...punto }, b: { ...c.b } });
    actual = { ...actual, components, counters };
  }
  return actual;
}

/** Cable de a hasta b doblado en L si hace falta; los extremos se conectan a cables que tocan. */
export function agregarCableEnL(estado, a, b, horizontalPrimero = true) {
  const tramos = tramosEnL(a, b, horizontalPrimero);
  if (!tramos.length || !tramos.every(([p, q]) => dentroDelMundo(p) && dentroDelMundo(q))) return { estado, ids: [] };
  let actual = partirCablesEn(partirCablesEn(estado, a), b);
  const ids = [];
  for (const [p, q] of tramos) {
    const { estado: siguiente, id } = agregarCable(actual, p, q);
    actual = siguiente;
    if (id) ids.push(id);
  }
  return ids.length ? { estado: actual, ids } : { estado, ids: [] };
}

/**
 * Lleva el extremo `extremo` ("a" o "b") del cable a `punto`. Si deja de estar alineado con el
 * otro extremo, el cable se dobla en L conservando su dirección desde el extremo fijo.
 */
export function estirarCable(estado, id, extremo, punto) {
  const cable = buscar(estado, id);
  if (!cable || cable.type !== "wire" || !dentroDelMundo(punto)) return estado;
  const fijo = extremo === "a" ? cable.b : cable.a;
  if (mismoPunto(fijo, punto) || mismoPunto(cable[extremo], punto)) return estado;
  const horizontal = cable.a.y === cable.b.y && cable.a.x !== cable.b.x;
  const [[, esquina], segundo] = tramosEnL(fijo, punto, horizontal);
  let components;
  let counters = estado.counters;
  if (!segundo) {
    components = estado.components.map((c) => (c.id === id ? { ...c, [extremo]: { ...punto } } : c));
  } else {
    const reserva = reservarId(estado, "wire");
    counters = reserva.counters;
    components = estado.components.map((c) => (c.id === id ? { ...c, [extremo]: { ...esquina } } : c));
    components.push({ id: reserva.id, type: "wire", a: { ...esquina }, b: { ...punto } });
  }
  return partirCablesEn({ ...estado, components, counters }, punto);
}

export function cambiarValor(estado, id, value) {
  return reemplazar(estado, id, (c) => (!tieneValor(c.type) || c.value === value ? c : { ...c, value }));
}

/** Potencia nominal de una lámpara (texto con prefijos, como el valor). */
export function cambiarPotencia(estado, id, potencia) {
  return reemplazar(estado, id, (c) => (c.type !== "lamp" || c.potencia === potencia ? c : { ...c, potencia }));
}

/** Abre un interruptor cerrado o cierra uno abierto. */
export function alternarInterruptor(estado, id) {
  return reemplazar(estado, id, (c) => (c.type === "switch" ? { ...c, closed: !c.closed } : c));
}

export function eliminar(estado, id) {
  const components = estado.components.filter((c) => c.id !== id);
  return components.length === estado.components.length ? estado : { ...estado, components };
}

/**
 * Agrega una tierra en `punto` (si ya hay una ahí, no hace nada). `auto` marca la que se colocó
 * sola en el borne − de una batería. Devuelve {estado, id}.
 */
export function ponerTierra(estado, punto, { auto = false } = {}) {
  if (!dentroDelMundo(punto) || estado.components.some((c) => esTierra(c) && mismoPunto(c.a, punto))) {
    return { estado, id: null };
  }
  const { estado: nuevo, id } = conComponente(estado, "ground", punto, punto);
  if (!auto) return { estado: nuevo, id };
  return { estado: reemplazar(nuevo, id, (c) => ({ ...c, auto: true })), id };
}

export const tierrasDe = (estado) => estado.components.filter(esTierra);

export function buscar(estado, id) {
  return estado.components.find((c) => c.id === id) ?? null;
}

/**
 * Cursor (tercer borne) de un potenciómetro: dos cuadros al costado del medio, a la derecha de
 * a→b. Sale de a y b, así que se mueve y gira solo con la pieza.
 */
export function cursorDe(c) {
  const largo = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) || 1;
  const u = { x: (c.b.x - c.a.x) / largo, y: (c.b.y - c.a.y) / largo };
  const m = centro(c);
  return { x: Math.round(m.x - u.y * 2), y: Math.round(m.y + u.x * 2) };
}

/** Puntos donde se conecta la pieza: los dos bornes, uno en la tierra, tres en el potenciómetro. */
export function terminales(c) {
  if (c.type === "ground") return [c.a];
  if (c.type === "multimeter") return c.modo === "A" ? [c.a, c.b] : [];
  if (c.type === "potentiometer") return [c.a, c.b, cursorDe(c)];
  return [c.a, c.b];
}

/** Nombres de los puntos donde hay al menos un terminal. */
export function puntosConTerminal(estado) {
  const puntos = new Map();
  for (const c of estado.components) {
    for (const p of terminales(c)) puntos.set(nombreNodo(p), { x: p.x, y: p.y });
  }
  return puntos;
}

/** Cambia un dato de la pieza (posición del cursor, resistencia interna, rango…). */
export function cambiarCampo(estado, id, campo, valor) {
  return reemplazar(estado, id, (c) => (c[campo] === valor ? c : { ...c, [campo]: valor }));
}

/** Un fusible o una lámpara quemados quedan así hasta que se reemplazan (con un clic). */
export function reemplazarQuemado(estado, id) {
  return reemplazar(estado, id, (c) => {
    if (!c.quemado && !c.quemada) return c;
    const { quemado, quemada, ...nuevo } = c;
    return nuevo;
  });
}

/** Marca como quemados los fusibles y lámparas `ids` (lo que abrió la simulación). */
export function marcarQuemados(estado, ids) {
  const pendientes = new Set(ids);
  if (!estado.components.some((c) => pendientes.has(c.id) && !c.quemado && !c.quemada)) return estado;
  return {
    ...estado,
    components: estado.components.map((c) => {
      if (!pendientes.has(c.id)) return c;
      if (c.type === "fuse" && !c.quemado) return { ...c, quemado: true };
      if (c.type === "lamp" && !c.quemada) return { ...c, quemada: true };
      return c;
    }),
  };
}

/** Lleva una punta del multímetro ("roja" o "negra") a un punto de la grilla. */
export function moverPunta(estado, id, cual, punto) {
  if (!dentroDelMundo(punto)) return estado;
  return reemplazar(estado, id, (c) => (c.type !== "multimeter" || mismoPunto(c.puntas[cual], punto) ? c
    : { ...c, puntas: { ...c.puntas, [cual]: { x: punto.x, y: punto.y } } }));
}

/**
 * Cambia el selector del multímetro. Al pasar a A se intercala en el cable que tiene debajo (si
 * entra); al salir de A, su lugar en la rama se cierra con un cable para no dejarla cortada.
 */
export function cambiarModoMultimetro(estado, id, modo) {
  const m = buscar(estado, id);
  if (!m || m.type !== "multimeter" || m.modo === modo) return estado;
  let nuevo = reemplazar(estado, id, (c) => ({ ...c, modo }));
  if (m.modo === "A") {
    const usados = puntosConTerminal({ components: estado.components.filter((c) => c.id !== id) });
    if (usados.has(nombreNodo(m.a)) && usados.has(nombreNodo(m.b))) nuevo = agregarCable(nuevo, m.a, m.b).estado;
  }
  if (modo === "A") nuevo = insertarEnCable(nuevo, id);
  return nuevo;
}

/**
 * Agrupa los puntos en nodos eléctricos: los unidos por cables son el mismo nodo.
 * Devuelve Map<nombreDePunto, representante> (el representante es el menor nombre del grupo).
 */
export function nodosElectricos(estado) {
  const padre = new Map();
  const raiz = (n) => {
    if (!padre.has(n)) padre.set(n, n);
    let r = n;
    while (padre.get(r) !== r) r = padre.get(r);
    while (padre.get(n) !== r) { const s = padre.get(n); padre.set(n, r); n = s; }
    return r;
  };
  for (const nombre of puntosConTerminal(estado).keys()) raiz(nombre);
  for (const c of estado.components) {
    if (c.type !== "wire") continue;
    const ra = raiz(nombreNodo(c.a));
    const rb = raiz(nombreNodo(c.b));
    if (ra !== rb) padre.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const resultado = new Map();
  for (const nombre of padre.keys()) resultado.set(nombre, raiz(nombre));
  return resultado;
}

export function conectados(estado, p, q) {
  const nodos = nodosElectricos(estado);
  const rp = nodos.get(nombreNodo(p));
  return rp !== undefined && rp === nodos.get(nombreNodo(q));
}

/**
 * Restaura una instantánea del historial conservando los contadores más altos:
 * deshacer un agregado no libera su id.
 */
export function restaurar(actual, instantanea) {
  const counters = { ...instantanea.counters };
  for (const [prefijo, n] of Object.entries(actual.counters)) {
    counters[prefijo] = Math.max(counters[prefijo] ?? 0, n);
  }
  return { ...instantanea, counters };
}

// --- Layout guardado en circuit-service --------------------------------------------------

export const VERSION_LAYOUT = 1;

export function aLayout(estado) {
  return {
    version: VERSION_LAYOUT,
    components: estado.components.map((c) => ({ ...c, a: { ...c.a }, b: { ...c.b } })),
    counters: { ...estado.counters },
    sinTierraAuto: [...(estado.sinTierraAuto ?? [])],
    ...(Object.keys(estado.nombresNodos ?? {}).length ? { nombresNodos: { ...estado.nombresNodos } } : {}),
  };
}

/** Reconstruye el estado desde un layout. Lanza Error si no tiene el formato esperado. */
export function desdeLayout(layout) {
  if (!layout || layout.version !== VERSION_LAYOUT || !Array.isArray(layout.components)) {
    throw new Error("El circuito no tiene posiciones del editor (layout) en un formato conocido.");
  }
  const esPunto = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y);
  const counters = { ...CONTADORES, ...(layout.counters ?? {}) };
  const components = layout.components.map((c) => {
    if (!TIPOS[c.type] || !esPunto(c.a) || !esPunto(c.b) || typeof c.id !== "string") {
      throw new Error("El layout tiene un componente inválido.");
    }
    // Si el layout se editó a mano, los contadores igual tienen que superar a los ids existentes.
    const numero = Number(c.id.slice(1));
    const prefijo = TIPOS[c.type].prefijo;
    if (c.id.startsWith(prefijo) && Number.isInteger(numero)) {
      counters[prefijo] = Math.max(counters[prefijo], numero);
    }
    const copia = { id: c.id, type: c.type, a: { ...c.a }, b: { ...c.b } };
    if (tieneValor(c.type)) copia.value = c.value ?? TIPOS[c.type].porDefecto;
    if (c.type === "lamp") copia.potencia = c.potencia ?? TIPOS.lamp.potenciaPorDefecto;
    if (c.type === "switch") copia.closed = c.closed !== false;
    if (c.type === "ground") {
      copia.b = { ...c.a };
      if (c.auto) copia.auto = true;
    }
    if (c.type === "lamp" && c.quemada) copia.quemada = true;
    if (c.type === "fuse" && c.quemado) copia.quemado = true;
    if (c.type === "potentiometer") copia.posicion = Number.isFinite(c.posicion) ? Math.min(1, Math.max(0, c.posicion)) : 0.5;
    if (c.type === "voltage_source" && c.rInterna !== undefined) copia.rInterna = String(c.rInterna);
    if (c.type === "multimeter") {
      copia.modo = ["V", "A", "Ω"].includes(c.modo) ? c.modo : "V";
      copia.puntas = {
        roja: esPunto(c.puntas?.roja) ? { ...c.puntas.roja } : { ...c.a },
        negra: esPunto(c.puntas?.negra) ? { ...c.puntas.negra } : { ...c.b },
      };
    }
    if (c.rango && typeof c.rango.min === "string" && typeof c.rango.max === "string") copia.rango = { ...c.rango };
    return copia;
  });
  const sinTierraAuto = Array.isArray(layout.sinTierraAuto) ? layout.sinTierraAuto.filter((f) => typeof f === "string") : [];
  const nombresNodos = {};
  for (const [punto, nombre] of Object.entries(layout.nombresNodos ?? {})) {
    if (typeof nombre === "string" && /^\d+_\d+$/.test(punto)) nombresNodos[punto] = nombre;
  }
  let estado = { components, counters, sinTierraAuto };
  if (Object.keys(nombresNodos).length) estado.nombresNodos = nombresNodos;
  // Formato anterior: una sola tierra en layout.ground.
  if (esPunto(layout.ground)) estado = ponerTierra(estado, layout.ground).estado;
  return estado;
}
