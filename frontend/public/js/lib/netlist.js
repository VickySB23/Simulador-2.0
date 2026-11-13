// Armado del netlist que entiende el motor (mismo JSON que POST /simulate) y lectura del
// resultado. Sin DOM.
import { ErrorCircuito, simulate } from "./mna.js";
import {
  buscar, esTierra, nombreNodo, nodosElectricos, ponerTierra, puntosConTerminal, tieneValor, tierrasDe,
} from "./modelo.js";
import { normalizarTexto } from "./valores.js";

/** Tierra que se usa cuando todavía no hay GND: el motor responde no_ground. */
export const SIN_TIERRA = "0";

/**
 * Netlist del motor. La primera tierra es la referencia; las demás se unen a ella con cables
 * ideales (todas las tierras valen 0 V).
 */
export function armarNetlist(estado) {
  const [primera, ...otras] = tierrasDe(estado);
  const referencia = primera ? nombreNodo(primera.a) : SIN_TIERRA;
  return {
    ground: referencia,
    components: [...estado.components.filter((c) => !esTierra(c)).map((c) => {
      const componente = { id: c.id, type: c.type, a: nombreNodo(c.a), b: nombreNodo(c.b) };
      if (tieneValor(c.type)) componente.value = normalizarTexto(c.value);
      if (c.type === "lamp") componente.rated_power = normalizarTexto(c.potencia);
      if (c.type === "switch") componente.closed = c.closed !== false;
      return componente;
    }), ...otras.map((t) => ({ id: `~${t.id}`, type: "wire", a: nombreNodo(t.a), b: referencia }))],
  };
}

/**
 * Problemas que se detectan antes de simular, con mensajes en términos del editor.
 * Devuelve null si el circuito se puede mandar a simular.
 */
export function problemaLocal(estado) {
  if (!estado.components.some((c) => !esTierra(c))) {
    return { code: "empty", message: "Dibujá un circuito: arrastrá una pieza desde la barra hasta la grilla." };
  }
  if (!estado.components.some((c) => tieneValor(c.type))) {
    return { code: "empty", message: "Agregá al menos una resistencia, una lámpara o una fuente." };
  }
  const tierras = tierrasDe(estado);
  if (!tierras.length) {
    return { code: "no_ground", message: "Falta la tierra: arrastrá GND hasta un nodo." };
  }
  const bornes = puntosConTerminal({ components: estado.components.filter((c) => !esTierra(c)) });
  if (!tierras.some((t) => bornes.has(nombreNodo(t.a)))) {
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
  const tierras = new Set(tierrasDe(estado).map((t) => representativo.get(nombreNodo(t.a))));
  return [...new Set(representativo.values())].filter((p) => !tierras.has(p));
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
  // Una tierra cuenta como una conexión en su punto, y nunca se saca.
  for (const c of estado.components) {
    sumar(c.a, 1);
    if (!esTierra(c)) sumar(c.b, 1);
  }
  const bornesSueltos = [];
  for (const c of estado.components) {
    for (const p of esTierra(c) ? [c.a] : [c.a, c.b]) {
      if (conexiones.get(nombreNodo(p)) === 1) bornesSueltos.push({ x: p.x, y: p.y });
    }
  }
  const sinConectar = new Set();
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const c of estado.components) {
      if (sinConectar.has(c.id) || esTierra(c)) continue;
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
  const fuentes = activo.components.some((c) => c.type === "voltage_source" || c.type === "current_source");
  if (problema?.code === "no_ground" && !fuentes) {
    // Sin fuente ni tierra no hay nada que calcular: no es un error.
    problema = { code: "empty", message: "Este circuito no tiene fuente: no circula corriente." };
  }
  if (problema && estado.components.length && !activo.components.some((c) => tieneValor(c.type))) {
    problema = sinConectar.size
      ? { code: "empty", message: "Todavía no hay un circuito cerrado: uní los dos bornes de cada componente." }
      : problema;
  }
  if (problema) return { error: { ...problema, details: {} }, ...conexiones };
  try {
    const resultado = simulate(armarNetlist(activo));
    for (const c of estado.components) {
      if (!sinConectar.has(c.id) || esTierra(c)) continue;
      const fila = { id: c.id, type: c.type, voltage: null, current: 0, power: 0, unconnected: true };
      if (c.type === "lamp") Object.assign(fila, { brightness: 0, burned: false });
      resultado.components.push(fila);
    }
    resultado.stats.unconnected = [...sinConectar];
    return { resultado, ...conexiones };
  } catch (e) {
    if (e instanceof ErrorCircuito) return { error: explicarError(activo, e), ...conexiones };
    throw e;
  }
}

/**
 * Traduce los errores que causa el propio editor: si una batería queda en corto porque hay una
 * tierra en cada uno de sus bornes (todas valen 0 V), lo dice así en lugar del error técnico.
 */
function explicarError(estado, e) {
  const error = { code: e.code, message: e.message, details: e.details };
  const tierras = tierrasDe(estado);
  const id = e.details?.components?.[0];
  const fuente = id && buscar(estado, id);
  if (e.code !== "shorted_voltage_source" || tierras.length < 2 || fuente?.type !== "voltage_source") return error;
  // Nodos contando los interruptores cerrados como cables (igual que el motor), sin las tierras.
  const nodos = nodosElectricos({
    components: estado.components.filter((c) => !esTierra(c))
      .map((c) => (c.type === "switch" && c.closed !== false ? { ...c, type: "wire" } : c)),
  });
  const nodo = (p) => nodos.get(nombreNodo(p)) ?? nombreNodo(p);
  const enA = tierras.filter((t) => nodo(t.a) === nodo(fuente.a));
  const enB = tierras.filter((t) => nodo(t.a) === nodo(fuente.b));
  if (!enA.length || !enB.length) return error;
  const cuantos = tierras.length === 2 ? "Los dos GND" : "Los GND";
  return {
    ...error,
    message: `${cuantos} ponen en corto a ${id}: hay uno en cada borne y todos valen 0 V. Dejá uno solo o movelo a otro nodo.`,
    details: { ...e.details, components: [id, ...enA.map((t) => t.id), ...enB.map((t) => t.id)] },
  };
}

// --- Varios circuitos en la misma hoja ---------------------------------------------------------

/**
 * Circuitos de la hoja: grupos de componentes que se tocan (por sus bornes o cables). Cada tierra
 * va con el circuito del punto donde está. Ordenados de izquierda a derecha y de arriba abajo.
 * Devuelve [{numero, ids, puntos: Set<nombre>, caja: {x1, y1, x2, y2}, firma, conTierra}].
 * `firma` cambia con cualquier cambio de piezas o posiciones (sin contar las tierras).
 */
export function circuitosDe(estado) {
  const padre = new Map();
  const raiz = (n) => {
    if (!padre.has(n)) padre.set(n, n);
    while (padre.get(n) !== n) {
      padre.set(n, padre.get(padre.get(n)));
      n = padre.get(n);
    }
    return n;
  };
  const piezas = estado.components.filter((c) => !esTierra(c));
  for (const c of piezas) {
    const ra = raiz(nombreNodo(c.a));
    const rb = raiz(nombreNodo(c.b));
    if (ra !== rb) padre.set(ra, rb);
  }
  const grupos = new Map();
  for (const c of piezas) {
    const r = raiz(nombreNodo(c.a));
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(c);
  }
  const circuitos = [...grupos.values()].map((lista) => {
    const puntos = new Set(lista.flatMap((c) => [nombreNodo(c.a), nombreNodo(c.b)]));
    const tierras = tierrasDe(estado).filter((t) => puntos.has(nombreNodo(t.a)));
    const todos = [...lista, ...tierras].flatMap((c) => [c.a, c.b]);
    const xs = todos.map((p) => p.x);
    const ys = todos.map((p) => p.y);
    const firma = lista.map((c) => `${c.id}@${c.a.x},${c.a.y},${c.b.x},${c.b.y}`).sort().join("|");
    return {
      ids: [...lista, ...tierras].map((c) => c.id), puntos, firma, conTierra: tierras.length > 0,
      caja: { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) },
    };
  });
  circuitos.sort((u, v) => u.caja.x1 - v.caja.x1 || u.caja.y1 - v.caja.y1);
  return circuitos.map((c, i) => ({ numero: i + 1, ...c }));
}

/**
 * Cada circuito sin tierra recibe una en el borne − de su batería (marcada `auto`), salvo los que
 * el usuario dejó sin tierra a propósito (sinTierraAuto, hasta que cambian). Las automáticas que
 * quedaron sueltas se sacan. Devuelve {estado, colocadas: [{id, fuente, numero}]}; si no hay nada
 * que cambiar, devuelve el mismo estado.
 */
export function conTierrasAutomaticas(estado) {
  let actual = estado;
  // Automáticas que ya no tocan ninguna pieza: sobran.
  const bornes = puntosConTerminal({ components: estado.components.filter((c) => !esTierra(c)) });
  const sueltas = new Set(tierrasDe(estado).filter((t) => t.auto && !bornes.has(nombreNodo(t.a))).map((t) => t.id));
  if (sueltas.size) actual = { ...actual, components: actual.components.filter((c) => !sueltas.has(c.id)) };
  const circuitos = circuitosDe(actual);
  const firmas = new Set(circuitos.map((c) => c.firma));
  const previas = actual.sinTierraAuto ?? [];
  const vigentes = previas.filter((f) => firmas.has(f));
  if (vigentes.length !== previas.length) actual = { ...actual, sinTierraAuto: vigentes };
  const colocadas = [];
  for (const circuito of circuitos) {
    if (circuito.conTierra || vigentes.includes(circuito.firma)) continue;
    const fuente = circuito.ids.map((id) => buscar(actual, id)).find((c) => c.type === "voltage_source");
    if (!fuente) continue;
    const { estado: nuevo, id } = ponerTierra(actual, fuente.b, { auto: true });
    if (!id) continue;
    actual = nuevo;
    colocadas.push({ id, fuente: fuente.id, numero: circuito.numero });
  }
  return { estado: actual, colocadas };
}

/**
 * Si se borró una tierra automática, su circuito queda sin tierra a propósito: se recuerda su
 * firma para no volver a ponerla hasta que el circuito cambie.
 */
export function recordarTierrasBorradas(antes, despues) {
  const borradas = tierrasDe(antes).filter((t) => t.auto && !buscar(despues, t.id));
  if (!borradas.length) return despues;
  const firmas = new Set(despues.sinTierraAuto ?? []);
  for (const circuito of circuitosDe(despues)) {
    if (borradas.some((t) => circuito.puntos.has(nombreNodo(t.a)))) firmas.add(circuito.firma);
  }
  return { ...despues, sinTierraAuto: [...firmas] };
}

/** Suma los resultados de varios circuitos en uno solo (para el dibujo y lo que no agrupa). */
function combinar(resultados) {
  if (!resultados.length) return null;
  if (resultados.length === 1) return resultados[0];
  const suma = (f) => resultados.reduce((t, r) => t + f(r), 0);
  const supplied = suma((r) => r.power.supplied);
  const absorbed = suma((r) => r.power.absorbed);
  return {
    components: resultados.flatMap((r) => r.components),
    node_voltages: Object.assign({}, ...resultados.map((r) => r.node_voltages)),
    power: { supplied, absorbed, net: supplied - absorbed, ok: resultados.every((r) => r.power.ok) },
    kcl_max_residual: Math.max(...resultados.map((r) => r.kcl_max_residual)),
    stats: {
      ...resultados[0].stats,
      electrical_nodes: suma((r) => r.stats.electrical_nodes),
      unknowns: suma((r) => r.stats.unknowns),
      total_ms: suma((r) => r.stats.total_ms),
      burned_lamps: resultados.flatMap((r) => r.stats.burned_lamps ?? []),
      unconnected: resultados.flatMap((r) => r.stats.unconnected ?? []),
    },
  };
}

/**
 * Simula cada circuito de la hoja por separado: un error en uno no frena a los demás.
 * Devuelve {circuitos: [{...circuito, resultado?, error?, sinConectar, bornesSueltos}],
 * resultado (los que dieron, combinados, o null), errores: [{numero, code, message, details}]
 * (solo los de verdad, no los circuitos incompletos), vacio (mensaje si no hay nada que
 * simular), sinConectar y bornesSueltos de toda la hoja}.
 */
export function simularHoja(estado) {
  const circuitos = circuitosDe(estado).map((circuito) => {
    const ids = new Set(circuito.ids);
    const sub = { ...estado, components: estado.components.filter((c) => ids.has(c.id)) };
    return { ...circuito, ...simularEstado(sub) };
  });
  // Tierras que no tocan ningún circuito: se marcan sin conectar.
  const enCircuito = new Set(circuitos.flatMap((c) => c.ids));
  const tierrasSueltas = tierrasDe(estado).filter((t) => !enCircuito.has(t.id));
  const resultados = circuitos.filter((c) => c.resultado).map((c) => c.resultado);
  const errores = circuitos.filter((c) => c.error && c.error.code !== "empty")
    .map((c) => ({ numero: c.numero, ...c.error }));
  let vacio = null;
  if (!circuitos.length) vacio = problemaLocal(estado).message;
  else if (!resultados.length && !errores.length) vacio = circuitos.find((c) => c.error).error.message;
  return {
    circuitos,
    resultado: combinar(resultados),
    errores,
    vacio,
    sinConectar: new Set(circuitos.flatMap((c) => [...c.sinConectar])),
    bornesSueltos: [...circuitos.flatMap((c) => c.bornesSueltos), ...tierrasSueltas.map((t) => ({ ...t.a }))],
  };
}
