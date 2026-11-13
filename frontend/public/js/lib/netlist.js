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
 * Bornes sin conectar: un punto con un solo borne (y sin tierra) está al aire. Por un componente
 * con un borne al aire no puede circular corriente, así que se saca de la simulación; al sacarlo
 * puede quedar otro colgando, por eso se repite. Devuelve el estado activo (lo que sí se simula),
 * los ids que quedaron afuera y los puntos de los bornes al aire (para marcarlos "sin conectar").
 */
export function analizarConexiones(estado) {
  const conexiones = new Map();
  const sumar = (p, n) => conexiones.set(nombreNodo(p), (conexiones.get(nombreNodo(p)) ?? 0) + n);
  for (const c of estado.components) {
    sumar(c.a, 1);
    sumar(c.b, 1);
  }
  if (estado.ground) sumar(estado.ground, 1);
  const bornesSueltos = [];
  for (const c of estado.components) {
    for (const p of [c.a, c.b]) if (conexiones.get(nombreNodo(p)) === 1) bornesSueltos.push({ x: p.x, y: p.y });
  }
  const sinConectar = new Set();
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const c of estado.components) {
      if (sinConectar.has(c.id)) continue;
      if (conexiones.get(nombreNodo(c.a)) === 1 || conexiones.get(nombreNodo(c.b)) === 1) {
        sinConectar.add(c.id);
        sumar(c.a, -1);
        sumar(c.b, -1);
        cambio = true;
      }
    }
  }
  const activo = sinConectar.size
    ? { ...estado, components: estado.components.filter((c) => !sinConectar.has(c.id)) }
    : estado;
  return { activo, sinConectar, bornesSueltos };
}

/** El estado que de verdad se simula: sin los componentes que tienen un borne al aire. */
export function estadoActivo(estado) {
  return analizarConexiones(estado).activo;
}

/**
 * Simula el estado del editor en el navegador. Devuelve {resultado} o {error} con
 * {code, message, details}, y siempre {sinConectar, bornesSueltos}. Un borne al aire nunca frena
 * la simulación del resto: ese componente queda con corriente 0 y marcado como sin conectar.
 */
export function simularEstado(estado) {
  const { activo, sinConectar, bornesSueltos } = analizarConexiones(estado);
  const conexiones = { sinConectar, bornesSueltos };
  let problema = problemaLocal(activo);
  if (problema && estado.components.length && !activo.components.some((c) => tieneValor(c.type))) {
    problema = sinConectar.size
      ? { code: "empty", message: "Todavía no hay un circuito cerrado: uní los dos bornes de cada componente." }
      : problema;
  }
  if (problema) return { error: { ...problema, details: {} }, ...conexiones };
  try {
    const resultado = simulate(armarNetlist(activo));
    for (const c of estado.components) {
      if (!sinConectar.has(c.id)) continue;
      const fila = { id: c.id, type: c.type, voltage: null, current: 0, power: 0, unconnected: true };
      if (c.type === "lamp") Object.assign(fila, { brightness: 0, burned: false });
      resultado.components.push(fila);
    }
    resultado.stats.unconnected = [...sinConectar];
    return { resultado, ...conexiones };
  } catch (e) {
    if (e instanceof ErrorCircuito) return { error: { code: e.code, message: e.message, details: e.details }, ...conexiones };
    throw e;
  }
}
