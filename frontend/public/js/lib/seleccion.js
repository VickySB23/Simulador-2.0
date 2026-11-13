// Selección múltiple: mover, rotar, borrar, copiar, pegar y duplicar en grupo. Sin DOM.
// Una selección es {ids: [...], tierra: boolean}. Las operaciones son todo o nada: si algo
// quedaría fuera del mundo, el estado no cambia.
import { ALTO_MUNDO, ANCHO_MUNDO, dentroDelMundo, reservarId } from "./modelo.js";

export const SELECCION_VACIA = Object.freeze({ ids: [], tierra: false });

export function seleccionVacia(seleccion) {
  return !seleccion || (!seleccion.ids.length && !seleccion.tierra);
}

/** Agrega o saca un elemento (Ctrl/Shift + clic). */
export function alternarEnSeleccion(seleccion, elemento) {
  const base = seleccion ?? SELECCION_VACIA;
  if (elemento.tipo === "tierra") return { ...base, tierra: !base.tierra };
  const ids = base.ids.includes(elemento.id) ? base.ids.filter((i) => i !== elemento.id) : [...base.ids, elemento.id];
  return { ...base, ids };
}

/** Lo que cae entero dentro del rectángulo (en unidades de grilla). */
export function seleccionEnRectangulo(estado, desde, hasta) {
  const [x1, x2] = [Math.min(desde.x, hasta.x), Math.max(desde.x, hasta.x)];
  const [y1, y2] = [Math.min(desde.y, hasta.y), Math.max(desde.y, hasta.y)];
  const adentro = (p) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
  return {
    ids: estado.components.filter((c) => adentro(c.a) && adentro(c.b)).map((c) => c.id),
    tierra: Boolean(estado.ground && adentro(estado.ground)),
  };
}

/** Une dos selecciones (rectángulo con Ctrl/Shift). */
export function unirSelecciones(a, b) {
  return { ids: [...new Set([...(a?.ids ?? []), ...b.ids])], tierra: Boolean(a?.tierra || b.tierra) };
}

function transformar(estado, seleccion, f) {
  const ids = new Set(seleccion.ids);
  let valido = true;
  const mover = (p) => {
    const q = f(p);
    if (!dentroDelMundo(q)) valido = false;
    return q;
  };
  const components = estado.components.map((c) => (ids.has(c.id) ? { ...c, a: mover(c.a), b: mover(c.b) } : c));
  const ground = seleccion.tierra && estado.ground ? mover(estado.ground) : estado.ground;
  return valido ? { ...estado, components, ground } : estado;
}

export function moverSeleccion(estado, seleccion, dx, dy) {
  if (seleccionVacia(seleccion) || (dx === 0 && dy === 0)) return estado;
  return transformar(estado, seleccion, (p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Puntos de la selección, para calcular su caja. */
function puntos(estado, seleccion) {
  const ids = new Set(seleccion.ids);
  const lista = estado.components.filter((c) => ids.has(c.id)).flatMap((c) => [c.a, c.b]);
  if (seleccion.tierra && estado.ground) lista.push(estado.ground);
  return lista;
}

/**
 * Gira 90° la selección alrededor del centro de su caja, redondeado a la grilla (con un centro
 * entero, todos los puntos siguen cayendo en la grilla). Con una sola pieza es su propio centro.
 */
export function rotarSeleccion(estado, seleccion) {
  const lista = puntos(estado, seleccion);
  if (!lista.length) return estado;
  const xs = lista.map((p) => p.x);
  const ys = lista.map((p) => p.y);
  const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
  const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
  return transformar(estado, seleccion, (p) => ({ x: cx - (p.y - cy), y: cy + (p.x - cx) }));
}

export function eliminarSeleccion(estado, seleccion) {
  if (seleccionVacia(seleccion)) return estado;
  const ids = new Set(seleccion.ids);
  return {
    ...estado,
    components: estado.components.filter((c) => !ids.has(c.id)),
    ground: seleccion.tierra ? null : estado.ground,
  };
}

/** Copia de los componentes seleccionados (la tierra no se copia: hay una sola). */
export function copiarSeleccion(estado, seleccion) {
  const ids = new Set(seleccion?.ids ?? []);
  return structuredClone(estado.components.filter((c) => ids.has(c.id)));
}

/**
 * Pega componentes copiados con ids nuevos, corridos `desplazamiento` celdas (y acomodados para
 * que entren en el mundo). Devuelve {estado, seleccion} con lo pegado seleccionado.
 */
export function pegar(estado, copiados, desplazamiento = { x: 2, y: 2 }) {
  if (!copiados?.length) return { estado, seleccion: SELECCION_VACIA };
  const todos = copiados.flatMap((c) => [c.a, c.b]);
  const minX = Math.min(...todos.map((p) => p.x));
  const maxX = Math.max(...todos.map((p) => p.x));
  const minY = Math.min(...todos.map((p) => p.y));
  const maxY = Math.max(...todos.map((p) => p.y));
  // Corrimiento acotado para que la caja quede dentro del mundo.
  const probar = (d, min, max, limite) => Math.min(Math.max(d, -min), limite - max);
  const dx = probar(desplazamiento.x, minX, maxX, ANCHO_MUNDO);
  const dy = probar(desplazamiento.y, minY, maxY, ALTO_MUNDO);
  let actual = estado;
  const nuevos = [];
  for (const c of copiados) {
    const { id, counters } = reservarId(actual, c.type);
    nuevos.push({ ...structuredClone(c), id, a: { x: c.a.x + dx, y: c.a.y + dy }, b: { x: c.b.x + dx, y: c.b.y + dy } });
    actual = { ...actual, counters };
  }
  if (!nuevos.every((c) => dentroDelMundo(c.a) && dentroDelMundo(c.b))) return { estado, seleccion: SELECCION_VACIA };
  return {
    estado: { ...actual, components: [...actual.components, ...nuevos] },
    seleccion: { ids: nuevos.map((c) => c.id), tierra: false },
  };
}
