// Armado del netlist que entiende el motor (mismo JSON que POST /simulate) y lectura del
// resultado. Sin DOM.
import { ErrorCircuito, simulate } from "./mna.js";
import {
  buscar, cursorDe, esTierra, mismoPunto, nombreNodo, nodosElectricos, ponerTierra, puntosConTerminal, terminales,
  tieneValor, tierrasDe,
} from "./modelo.js";
import { formatearSI, interpretarValor, normalizarTexto } from "./valores.js";

/** Número de un texto con prefijos, o `porDefecto` si no se puede leer. */
function numero(texto, porDefecto = 0) {
  try {
    return interpretarValor(String(texto ?? ""));
  } catch {
    return porDefecto;
  }
}

/** Posición del cursor del potenciómetro, sin llegar a 0 ni a 1 (el contacto del cursor). */
const POSICION_MINIMA = 0.0005;
const posicionDe = (c) => Math.min(1 - POSICION_MINIMA, Math.max(POSICION_MINIMA, Number.isFinite(c.posicion) ? c.posicion : 0.5));

/** Tierra que se usa cuando todavía no hay GND: el motor responde no_ground. */
export const SIN_TIERRA = "0";

/**
 * Netlist del motor. La primera tierra es la referencia; las demás se unen a ella con cables
 * ideales (todas las tierras valen 0 V). Las piezas que el motor no conoce se arman con las que sí:
 * - amperímetro (multímetro en A): fuente de 0 V, que da su corriente sin resistencia;
 * - fusible: fuente de 0 V; quemado (o en `abiertos`), una lámpara quemada (abierta);
 * - potenciómetro: dos resistencias que se encuentran en el cursor;
 * - batería con resistencia interna: la fuente más una resistencia en serie, por un nodo oculto.
 * Lo agregado lleva ids y nodos que empiezan con "~" y se saca del resultado (traducirResultado).
 * Amperímetros y fusibles van al final: si cierran un lazo de fuentes, el motor los nombra a ellos.
 */
export function armarNetlist(estado, abiertos = new Set()) {
  const [primera, ...otras] = tierrasDe(estado);
  const referencia = primera ? nombreNodo(primera.a) : SIN_TIERRA;
  const comunes = [];
  const alFinal = [];
  for (const c of estado.components) {
    if (esTierra(c) || !terminales(c).length) continue;
    const a = nombreNodo(c.a);
    const b = nombreNodo(c.b);
    if (c.type === "multimeter") {
      alFinal.unshift({ id: c.id, type: "voltage_source", a, b, value: "0" });
    } else if (c.type === "fuse") {
      if (c.quemado || abiertos.has(c.id)) comunes.push({ id: c.id, type: "lamp", a, b, value: "1", rated_power: "1", burned: true });
      else alFinal.push({ id: c.id, type: "voltage_source", a, b, value: "0" });
    } else if (c.type === "potentiometer") {
      const cursor = nombreNodo(cursorDe(c));
      const total = numero(c.value);
      const posicion = posicionDe(c);
      comunes.push({ id: `~${c.id}a`, type: "resistor", a, b: cursor, value: String(total * posicion) });
      comunes.push({ id: `~${c.id}b`, type: "resistor", a: cursor, b, value: String(total * (1 - posicion)) });
    } else if (c.type === "voltage_source" && numero(c.rInterna) > 0) {
      const interno = `~${c.id}`;
      comunes.push({ id: c.id, type: "voltage_source", a: interno, b, value: normalizarTexto(c.value) });
      comunes.push({ id: `~${c.id}r`, type: "resistor", a, b: interno, value: normalizarTexto(c.rInterna) });
    } else {
      const componente = { id: c.id, type: c.type, a, b };
      if (tieneValor(c.type)) componente.value = normalizarTexto(c.value);
      if (c.type === "lamp") componente.rated_power = normalizarTexto(c.potencia);
      if (c.type === "lamp" && c.quemada) componente.burned = true;
      if (c.type === "switch") componente.closed = c.closed !== false;
      comunes.push(componente);
    }
  }
  return {
    ground: referencia,
    components: [...comunes, ...alFinal, ...otras.map((t) => ({ id: `~${t.id}`, type: "wire", a: nombreNodo(t.a), b: referencia }))],
  };
}

/**
 * Pasa el resultado del motor a las piezas del editor: saca lo agregado ("~"), devuelve su tipo
 * a amperímetros y fusibles, junta las dos mitades del potenciómetro (con la corriente de cada
 * borne, para los cables) y da la tensión en bornes de una batería con resistencia interna.
 */
function traducirResultado(crudo, estado, abiertos) {
  const porId = new Map(crudo.components.map((c) => [c.id, c]));
  const tension = (p) => crudo.node_voltages[nombreNodo(p)];
  const diferencia = (p, q) => (tension(p) === null || tension(q) === null || tension(p) === undefined || tension(q) === undefined
    ? null : tension(p) - tension(q));
  const components = [];
  for (const fila of crudo.components) {
    if (fila.id.startsWith("~")) continue;
    const c = buscar(estado, fila.id);
    if (c?.type === "multimeter") {
      components.push({ id: c.id, type: "multimeter", voltage: 0, current: fila.current, power: 0 });
    } else if (c?.type === "fuse") {
      const quemado = Boolean(c.quemado || abiertos.has(c.id));
      components.push({
        id: c.id, type: "fuse", voltage: quemado ? fila.voltage : 0, current: quemado ? 0 : fila.current, power: 0, blown: quemado,
      });
    } else if (c?.type === "voltage_source" && porId.has(`~${c.id}r`)) {
      const interna = porId.get(`~${c.id}r`);
      components.push({
        ...fila, voltage: diferencia(c.a, c.b), power: fila.power + interna.power,
        emf: fila.voltage, perdida: interna.power, rInterna: numero(c.rInterna),
      });
    } else {
      components.push(fila);
    }
  }
  for (const c of estado.components) {
    if (c.type !== "potentiometer" || !porId.has(`~${c.id}a`)) continue;
    const ia = porId.get(`~${c.id}a`);
    const ib = porId.get(`~${c.id}b`);
    components.push({
      id: c.id, type: "potentiometer", voltage: diferencia(c.a, c.b), current: ia.current, power: ia.power + ib.power,
      posicion: posicionDe(c),
      // Corriente que entra por cada borne (a, b y cursor), para repartirla en los cables.
      bornes: [
        { punto: nombreNodo(c.a), corriente: ia.current },
        { punto: nombreNodo(c.b), corriente: -ib.current },
        { punto: nombreNodo(cursorDe(c)), corriente: ib.current - ia.current },
      ],
    });
  }
  const node_voltages = Object.fromEntries(Object.entries(crudo.node_voltages).filter(([n]) => !n.startsWith("~")));
  const esFusible = (id) => buscar(estado, id)?.type === "fuse";
  return {
    ...crudo,
    components,
    node_voltages,
    stats: {
      ...crudo.stats,
      burned_lamps: (crudo.stats.burned_lamps ?? []).filter((id) => !esFusible(id)),
      blown_fuses: estado.components.filter((c) => c.type === "fuse" && (c.quemado || abiertos.has(c.id))).map((c) => c.id),
    },
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
  // Una tierra cuenta como una conexión en su punto, y nunca se saca. El cursor de un
  // potenciómetro puede quedar sin usar (es una resistencia fija): no se marca ni saca la pieza.
  const principales = (c) => (c.type === "potentiometer" ? [c.a, c.b] : terminales(c));
  for (const c of estado.components) for (const p of terminales(c)) sumar(p, 1);
  const bornesSueltos = [];
  for (const c of estado.components) {
    for (const p of principales(c)) {
      if (conexiones.get(nombreNodo(p)) === 1) bornesSueltos.push({ x: p.x, y: p.y });
    }
  }
  const sinConectar = new Set();
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const c of estado.components) {
      if (sinConectar.has(c.id) || esTierra(c) || !terminales(c).length) continue;
      if (principales(c).some((p) => conexiones.get(nombreNodo(p)) === 1)) {
        sinConectar.add(c.id);
        for (const p of terminales(c)) sumar(p, -1);
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
  const abiertos = new Set();
  try {
    let resultado = null;
    for (let vuelta = 0; !resultado; vuelta++) {
      let crudo;
      try {
        crudo = simulate(armarNetlist(activo, abiertos));
      } catch (e) {
        // Un fusible que cierra un lazo de fuentes es un cortocircuito: se quema y se vuelve a resolver.
        const id = e.details?.components?.[0];
        if (e instanceof ErrorCircuito && e.code === "voltage_source_loop" && buscar(activo, id)?.type === "fuse"
          && !abiertos.has(id) && vuelta < 100) {
          abiertos.add(id);
          continue;
        }
        throw e;
      }
      // Si algún fusible pasa su corriente nominal, se quema el más exigido y se vuelve a resolver.
      const pasados = activo.components
        .filter((c) => c.type === "fuse" && !c.quemado && !abiertos.has(c.id))
        .map((c) => ({ id: c.id, razon: Math.abs(crudo.components.find((f) => f.id === c.id)?.current ?? 0) / numero(c.value, Infinity) }))
        .filter((f) => f.razon > 1 + 1e-9)
        .sort((u, v) => v.razon - u.razon);
      if (pasados.length && vuelta < 100) {
        abiertos.add(pasados[0].id);
        continue;
      }
      resultado = traducirResultado(crudo, activo, abiertos);
    }
    for (const c of estado.components) {
      if (!sinConectar.has(c.id) || esTierra(c)) continue;
      const fila = { id: c.id, type: c.type, voltage: null, current: 0, power: 0, unconnected: true };
      if (c.type === "lamp") Object.assign(fila, { brightness: 0, burned: Boolean(c.quemada) });
      if (c.type === "fuse") fila.blown = Boolean(c.quemado);
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
  const medidor = buscar(estado, e.details?.components?.[0]);
  if (medidor?.type === "multimeter") return explicarAmperimetro(estado, medidor, error);
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

/** Nodos contando los interruptores cerrados como cables (igual que el motor), sin las tierras. */
function nodosDelMotor(estado) {
  return nodosElectricos({
    components: estado.components.filter((c) => !esTierra(c))
      .map((c) => (c.type === "switch" && c.closed !== false ? { ...c, type: "wire" } : c)),
  });
}

/** Amperímetro en paralelo con una fuente, o con sus dos bornes unidos por un cable. */
function explicarAmperimetro(estado, medidor, error) {
  if (error.code === "shorted_voltage_source") {
    return { ...error, message: `Los dos bornes del amperímetro ${medidor.id} están unidos por un cable: así no mide nada. Intercalalo en una rama, en serie.` };
  }
  const nodos = nodosDelMotor(estado);
  const nodo = (p) => nodos.get(nombreNodo(p)) ?? nombreNodo(p);
  const par = new Set([nodo(medidor.a), nodo(medidor.b)]);
  const fuente = estado.components.find((c) => c.type === "voltage_source" && par.has(nodo(c.a)) && par.has(nodo(c.b)));
  const quien = fuente ? `la batería ${fuente.id}` : "una fuente";
  return {
    ...error,
    message: `El amperímetro ${medidor.id} está en paralelo con ${quien}: la pone en corto. Se conecta en serie: cortá la rama y ponelo en el medio.`,
    details: { ...error.details, components: [medidor.id, ...(fuente ? [fuente.id] : [])] },
  };
}

// --- Multímetro ---------------------------------------------------------------------------------

/** El punto eléctrico donde se apoya una punta: un borne, o cualquier punto de un cable recto. */
export function puntoDeApoyo(estado, punto) {
  const nombre = nombreNodo(punto);
  if (puntosConTerminal(estado).has(nombre)) return nombre;
  const cable = estado.components.find((c) => c.type === "wire" && (
    (c.a.y === c.b.y && punto.y === c.a.y && punto.x >= Math.min(c.a.x, c.b.x) && punto.x <= Math.max(c.a.x, c.b.x))
    || (c.a.x === c.b.x && punto.x === c.a.x && punto.y >= Math.min(c.a.y, c.b.y) && punto.y <= Math.max(c.a.y, c.b.y))));
  return cable ? nombreNodo(cable.a) : null;
}

/**
 * Resistencia equivalente entre dos puntos con las fuentes apagadas (las de tensión en corto, las
 * de corriente abiertas): se inyecta 1 A de una punta a la otra y se lee la tensión. Devuelve el
 * valor en Ω, Infinity si no hay camino, o null si no se pudo calcular.
 */
export function resistenciaEntre(estado, roja, negra) {
  const piezas = [];
  for (const c of estado.components) {
    if (esTierra(c) || !terminales(c).length) continue;
    const a = nombreNodo(c.a);
    const b = nombreNodo(c.b);
    const cable = () => piezas.push({ id: c.id, type: "wire", a, b });
    const resistencia = (valor, id = c.id, desde = a, hasta = b) => piezas.push({ id, type: "resistor", a: desde, b: hasta, value: String(valor) });
    if (c.type === "wire" || c.type === "multimeter") cable();
    else if (c.type === "resistor") resistencia(numero(c.value));
    else if (c.type === "lamp" && !c.quemada) resistencia(numero(c.value));
    else if (c.type === "switch" && c.closed !== false) cable();
    else if (c.type === "fuse" && !c.quemado) cable();
    else if (c.type === "voltage_source") {
      if (numero(c.rInterna) > 0) resistencia(numero(c.rInterna));
      else cable();
    } else if (c.type === "potentiometer") {
      const cursor = nombreNodo(cursorDe(c));
      const total = numero(c.value);
      resistencia(total * posicionDe(c), `${c.id}a`, a, cursor);
      resistencia(total * (1 - posicionDe(c)), `${c.id}b`, cursor, b);
    }
  }
  // Solo la parte unida a las puntas (una parte suelta en otro lado daría nodos flotantes).
  const padre = new Map();
  const raiz = (n) => {
    if (!padre.has(n)) padre.set(n, n);
    while (padre.get(n) !== n) n = padre.get(n);
    return n;
  };
  const unir = (p, q) => padre.set(raiz(p), raiz(q));
  for (const p of piezas) unir(p.a, p.b);
  if (raiz(roja) !== raiz(negra)) return Infinity;
  const enCorto = new Map();
  const raizCable = (n) => {
    if (!enCorto.has(n)) enCorto.set(n, n);
    while (enCorto.get(n) !== n) n = enCorto.get(n);
    return n;
  };
  for (const p of piezas) if (p.type === "wire") enCorto.set(raizCable(p.a), raizCable(p.b));
  if (raizCable(roja) === raizCable(negra)) return 0;
  const grupo = raiz(roja);
  const netlist = {
    ground: negra,
    components: [
      ...piezas.filter((p) => raiz(p.a) === grupo),
      { id: "~prueba", type: "current_source", a: negra, b: roja, value: "1" },
    ],
  };
  try {
    return simulate(netlist).node_voltages[roja];
  } catch {
    return null;
  }
}

const conSigno = (valor, unidad) => `${valor > 0 ? "+" : ""}${formatearSI(valor, unidad)}`;

/**
 * Lectura de cada multímetro de la hoja: {modo, texto, valor, aviso}. V: tensión de la punta roja
 * menos la negra; A: corriente de la rama donde está intercalado (entra por la punta roja);
 * Ω: resistencia equivalente entre las puntas con las fuentes apagadas.
 */
export function lecturasDeMultimetros(estado, hoja) {
  const lecturas = new Map();
  const circuitoDe = (nombre) => hoja.circuitos.find((c) => c.puntos.has(nombre));
  for (const m of estado.components.filter((c) => c.type === "multimeter")) {
    if (m.modo === "A") {
      const fila = hoja.resultado?.components.find((c) => c.id === m.id);
      const circuito = hoja.circuitos.find((c) => c.ids.includes(m.id));
      let aviso = null;
      if (hoja.sinConectar.has(m.id)) aviso = "Intercalá el amperímetro en una rama: tiene un borne suelto.";
      else if (circuito?.error && circuito.error.code !== "empty") aviso = circuito.error.message;
      else aviso = avisoAmperimetroEnParalelo(estado, m);
      const valido = fila && !fila.unconnected && !(circuito?.error);
      lecturas.set(m.id, { modo: "A", valor: valido ? fila.current : null, texto: valido ? conSigno(fila.current, "A") : "- - -", aviso });
      continue;
    }
    const roja = puntoDeApoyo(estado, m.puntas.roja);
    const negra = puntoDeApoyo(estado, m.puntas.negra);
    const sueltas = [!roja && "roja", !negra && "negra"].filter(Boolean);
    if (sueltas.length) {
      lecturas.set(m.id, {
        modo: m.modo, valor: null, texto: "- - -",
        aviso: sueltas.length === 2 ? "Apoyá las dos puntas sobre el circuito: están sueltas."
          : `La punta ${sueltas[0]} está suelta: apoyala sobre un borne o un cable.`,
      });
      continue;
    }
    if (m.modo === "Ω") {
      const r = resistenciaEntre(estado, roja, negra);
      const texto = r === Infinity ? "∞ Ω" : r === null ? "- - -" : formatearSI(r, "Ω");
      lecturas.set(m.id, {
        modo: "Ω", valor: r, texto,
        aviso: r === Infinity ? "No hay camino entre las puntas: el circuito está abierto entre ellas." : null,
      });
      continue;
    }
    const cr = circuitoDe(roja);
    const cn = circuitoDe(negra);
    const vr = hoja.resultado?.node_voltages[roja];
    const vn = hoja.resultado?.node_voltages[negra];
    let aviso = null;
    if (cr && cn && cr !== cn) aviso = "Las puntas están en circuitos separados: entre ellos no hay una tensión definida.";
    else if ((cr?.error && cr.error.code !== "empty")) aviso = "El circuito tiene un error: primero hay que arreglarlo.";
    else if (typeof vr !== "number" || typeof vn !== "number") aviso = "Esa parte del circuito quedó aislada (sin camino a GND).";
    const valor = aviso ? null : vr - vn;
    lecturas.set(m.id, { modo: "V", valor, texto: valor === null ? "- - -" : conSigno(valor, "V"), aviso });
  }
  return lecturas;
}

/** Un amperímetro en paralelo con una pieza la deja sin corriente: se avisa (el motor lo acepta). */
function avisoAmperimetroEnParalelo(estado, medidor) {
  const nodos = nodosDelMotor(estado);
  const nodo = (p) => nodos.get(nombreNodo(p)) ?? nombreNodo(p);
  const par = [nodo(medidor.a), nodo(medidor.b)].sort().join("|");
  const otra = estado.components.find((c) => c.id !== medidor.id && !["wire", "ground", "multimeter", "switch"].includes(c.type)
    && terminales(c).length && [nodo(c.a), nodo(c.b)].sort().join("|") === par);
  return otra ? `El amperímetro está en paralelo con ${otra.id}: la deja sin corriente. Se conecta en serie, en la rama.` : null;
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
  const piezas = estado.components.filter((c) => !esTierra(c) && terminales(c).length);
  for (const c of piezas) {
    const [primero, ...resto] = terminales(c).map(nombreNodo);
    for (const otro of resto) {
      const ra = raiz(primero);
      const rb = raiz(otro);
      if (ra !== rb) padre.set(ra, rb);
    }
  }
  const grupos = new Map();
  for (const c of piezas) {
    const r = raiz(nombreNodo(c.a));
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(c);
  }
  const circuitos = [...grupos.values()].map((lista) => {
    const puntos = new Set(lista.flatMap((c) => terminales(c).map(nombreNodo)));
    const tierras = tierrasDe(estado).filter((t) => puntos.has(nombreNodo(t.a)));
    const todos = [...lista, ...tierras].flatMap((c) => terminales(c));
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
      blown_fuses: resultados.flatMap((r) => r.stats.blown_fuses ?? []),
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
  const hoja = {
    circuitos,
    resultado: combinar(resultados),
    errores,
    vacio,
    sinConectar: new Set(circuitos.flatMap((c) => [...c.sinConectar])),
    bornesSueltos: [...circuitos.flatMap((c) => c.bornesSueltos), ...tierrasSueltas.map((t) => ({ ...t.a }))],
  };
  hoja.lecturas = lecturasDeMultimetros(estado, hoja);
  return hoja;
}
