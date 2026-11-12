// Armado del netlist que entiende el motor (mismo JSON que POST /simulate) y lectura del
// resultado. Sin DOM.
import { ErrorCircuito, simulate } from "./mna.js";
import { nombreNodo, nodosElectricos, puntosConTerminal, tieneValor } from "./modelo.js";
import { normalizarTexto } from "./valores.js";

/** Tierra que se usa cuando todavía no hay GND: el motor responde no_ground. */
export const SIN_TIERRA = "0";

export function armarNetlist(estado) {
  return {
    ground: estado.ground ? nombreNodo(estado.ground) : SIN_TIERRA,
    components: estado.components.map((c) => {
      const componente = { id: c.id, type: c.type, a: nombreNodo(c.a), b: nombreNodo(c.b) };
      if (tieneValor(c.type)) componente.value = normalizarTexto(c.value);
      if (c.type === "lamp") componente.rated_power = normalizarTexto(c.potencia);
      if (c.type === "switch") componente.closed = c.closed !== false;
      return componente;
    }),
  };
}

/**
 * Problemas que se detectan antes de simular, con mensajes en términos del editor.
 * Devuelve null si el circuito se puede mandar a simular.
 */
export function problemaLocal(estado) {
  if (estado.components.length === 0) {
    return { code: "empty", message: "Dibujá un circuito: elegí una herramienta y hacé clic en la grilla." };
  }
  if (!estado.components.some((c) => tieneValor(c.type))) {
    return { code: "empty", message: "Agregá al menos una resistencia, una lámpara o una fuente." };
  }
  if (!estado.ground) {
    return { code: "no_ground", message: "Falta la tierra: elegí GND y hacé clic en un nodo." };
  }
  if (!puntosConTerminal(estado).has(nombreNodo(estado.ground))) {
    return { code: "no_ground", message: "La tierra no toca ningún terminal: movela sobre un nodo." };
  }
  return null;
}

/** Tensión de cada punto con terminal según el resultado del simulador. */
export function tensionesPorPunto(resultado) {
  return new Map(Object.entries(resultado?.node_voltages ?? {}));
}

/**
 * El punto que representa a cada nodo eléctrico: Map<nombre de cualquier punto del nodo, punto>.
 * Se prefiere un punto donde solo llegan cables (una esquina), porque al lado de una pieza la
 * etiqueta pisa su nombre; entre iguales, el de arriba a la izquierda. Lo usan la etiqueta de
 * tensión, la tabla de nodos y las ecuaciones, así el nodo se llama igual en todos lados.
 */
export function puntoRepresentativo(estado) {
  const nodos = nodosElectricos(estado);
  const dePieza = new Set(estado.components
    .filter((c) => c.type !== "wire")
    .flatMap((c) => [nombreNodo(c.a), nombreNodo(c.b)]));
  const clave = (nombre, p) => [dePieza.has(nombre) ? 1 : 0, p.y, p.x];
  const menor = (u, v) => u[0] - v[0] || u[1] - v[1] || u[2] - v[2];
  const elegidos = new Map();
  for (const [nombre, punto] of puntosConTerminal(estado)) {
    const grupo = nodos.get(nombre);
    const actual = elegidos.get(grupo);
    if (!actual || menor(clave(nombre, punto), actual.clave) < 0) {
      elegidos.set(grupo, { punto, clave: clave(nombre, punto) });
    }
  }
  return new Map([...nodos].map(([nombre, grupo]) => [nombre, elegidos.get(grupo).punto]));
}

/** Un punto por nodo eléctrico para la etiqueta de tensión, sin el de tierra (ya tiene símbolo). */
export function puntosDeEtiqueta(estado) {
  const representativo = puntoRepresentativo(estado);
  const tierra = estado.ground ? representativo.get(nombreNodo(estado.ground)) : undefined;
  return [...new Set(representativo.values())].filter((p) => p !== tierra);
}

/**
 * Sentido real de la corriente para dibujar la flecha: de `desde` hacia `hasta`.
 * El simulador informa la corriente que entra por a y sale por b; si es negativa, va de b hacia a.
 */
export function sentidoCorriente(componente, corriente) {
  if (corriente === null || corriente === undefined || Math.abs(corriente) < 1e-15) return null;
  return corriente > 0
    ? { desde: componente.a, hasta: componente.b, magnitud: corriente }
    : { desde: componente.b, hasta: componente.a, magnitud: -corriente };
}

/** Color de un nodo según su tensión: azul en el mínimo, rojo en el máximo. */
export function colorTension(tension, minimo, maximo) {
  const rango = maximo - minimo;
  const t = rango < 1e-12 ? 0.5 : Math.min(1, Math.max(0, (tension - minimo) / rango));
  const tono = Math.round(220 - 220 * t);
  return `hsl(${tono} 75% 50%)`;
}

/**
 * Simula el estado del editor en el navegador. Devuelve {resultado} o {error} con
 * {code, message, details}; los problemas de dibujo (vacío, sin tierra) se detectan antes.
 */
export function simularEstado(estado) {
  const problema = problemaLocal(estado);
  if (problema) return { error: { ...problema, details: {} } };
  try {
    return { resultado: simulate(armarNetlist(estado)) };
  } catch (e) {
    if (e instanceof ErrorCircuito) return { error: { code: e.code, message: e.message, details: e.details } };
    throw e;
  }
}
