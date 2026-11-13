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
};

/** Tipos con un valor numérico editable (los cables e interruptores no tienen). */
export const tieneValor = (tipo) => tipo !== "wire" && tipo !== "switch";

// Rotación 0..3: dirección de a hacia b.
const DIRECCIONES = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
];

export function circuitoVacio() {
  return { components: [], ground: null, counters: { R: 0, V: 0, I: 0, W: 0, L: 0, S: 0 } };
}

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
 * Si el centro de la pieza `id` cae sobre un cable recto en el que entra entera, la pieza queda en
 * serie: se alinea con el cable (si ya lo estaba, conserva su sentido, para no invertir una
 * batería) y el cable se parte en dos tramos que llegan a sus bornes. Si no, devuelve el estado.
 */
export function insertarEnCable(estado, id) {
  const pieza = buscar(estado, id);
  if (!pieza || pieza.type === "wire") return estado;
  const m = centro(pieza);
  for (const cable of estado.components) {
    if (cable.type !== "wire") continue;
    const horizontal = cable.a.y === cable.b.y;
    const vertical = cable.a.x === cable.b.x;
    const sobre = (horizontal && m.y === cable.a.y && entre(m.x, cable.a.x, cable.b.x))
      || (vertical && m.x === cable.a.x && entre(m.y, cable.a.y, cable.b.y));
    if (!sobre) continue;
    const alineada = horizontal ? !esVertical(pieza) : esVertical(pieza);
    const { a, b } = alineada ? pieza : terminalesDesdeCentro(m, horizontal ? 0 : 1);
    const dentro = (p) => (horizontal ? enTramo(p.x, cable.a.x, cable.b.x) : enTramo(p.y, cable.a.y, cable.b.y));
    if (!dentro(a) || !dentro(b)) continue;
    // El borne más cercano al extremo a del cable se une con él; el otro, con el extremo b.
    const distancia = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
    const [cerca, lejos] = distancia(a, cable.a) <= distancia(b, cable.a) ? [a, b] : [b, a];
    let components = estado.components.map((c) => (c.id === pieza.id ? { ...c, a: { ...a }, b: { ...b } } : c));
    components = mismoPunto(cable.a, cerca)
      ? components.filter((c) => c.id !== cable.id)
      : components.map((c) => (c.id === cable.id ? { ...c, b: { ...cerca } } : c));
    let counters = estado.counters;
    if (!mismoPunto(lejos, cable.b)) {
      const reserva = reservarId(estado, "wire");
      counters = reserva.counters;
      components = [...components, { id: reserva.id, type: "wire", a: { ...lejos }, b: { ...cable.b } }];
    }
    return { ...estado, components, counters };
  }
  return estado;
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

export function ponerTierra(estado, punto) {
  if (!dentroDelMundo(punto) || (estado.ground && mismoPunto(estado.ground, punto))) return estado;
  return { ...estado, ground: { x: punto.x, y: punto.y } };
}

export function quitarTierra(estado) {
  return estado.ground ? { ...estado, ground: null } : estado;
}

export function moverTierra(estado, dx, dy) {
  if (!estado.ground) return estado;
  return ponerTierra(estado, { x: estado.ground.x + dx, y: estado.ground.y + dy });
}

export function buscar(estado, id) {
  return estado.components.find((c) => c.id === id) ?? null;
}

/** Nombres de los puntos donde hay al menos un terminal. */
export function puntosConTerminal(estado) {
  const puntos = new Map();
  for (const c of estado.components) {
    for (const p of [c.a, c.b]) puntos.set(nombreNodo(p), { x: p.x, y: p.y });
  }
  return puntos;
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
    ground: estado.ground ? { ...estado.ground } : null,
    counters: { ...estado.counters },
  };
}

/** Reconstruye el estado desde un layout. Lanza Error si no tiene el formato esperado. */
export function desdeLayout(layout) {
  if (!layout || layout.version !== VERSION_LAYOUT || !Array.isArray(layout.components)) {
    throw new Error("El circuito no tiene posiciones del editor (layout) en un formato conocido.");
  }
  const esPunto = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y);
  const counters = { R: 0, V: 0, I: 0, W: 0, L: 0, S: 0, ...(layout.counters ?? {}) };
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
    return copia;
  });
  const ground = esPunto(layout.ground) ? { x: layout.ground.x, y: layout.ground.y } : null;
  return { components, ground, counters };
}
