// Análisis Nodal Modificado (MNA) para circuitos de corriente continua, en el navegador.
//
// Port de services/simulation-service/app/domain (rama microservicios), con las mismas decisiones:
// 1. Cables ideales con union-find: los nodos que une un cable son un solo nodo eléctrico (no una
//    resistencia de 1e-9 Ω, que arruina el condicionamiento de la matriz).
// 2. Sin GMIN: se revisa la topología antes de resolver (tierra, nodos flotantes, lazos de fuentes
//    de tensión y fuentes en corto), así el error dice qué está mal y nunca hay tensiones absurdas.
// 3. R ≤ 0 es un error (para un corto se usa un cable).
// 4. Resolución densa hasta DENSE_LIMIT incógnitas y dispersa por encima.
// 5. Convención pasiva: potencia positiva = absorbe; una fuente que entrega tiene potencia negativa.
//
// Componentes de la versión web (no existen en el backend):
// - lamp: una resistencia (value, en Ω) con potencia nominal (rated_power, en W). El resultado
//   agrega brightness = P / Pnom y burned = P > Pnom. Quemada se muestra, pero sigue conduciendo.
// - switch: closed = true funciona como un cable; closed = false se excluye del circuito. Si al
//   abrirlo una parte sin fuentes queda sin camino a tierra, esa parte no es un error: sus
//   corrientes son 0 y sus tensiones quedan indefinidas (null).
//
// Entrada: {ground: "0", components: [{id, type, a, b, value}]} (el mismo JSON que POST /simulate).
// Salida: {node_voltages, components, power, kcl_max_residual, stats} o un ErrorCircuito con
// `code`, `message` y `details`, con los mismos códigos que el backend.

export const TIPOS_COMPONENTE = ["resistor", "voltage_source", "current_source", "wire", "lamp", "switch"];
const RESISTIVOS = new Set(["resistor", "lamp"]);
export const TIERRA = "0";
export const DENSE_LIMIT = 200;
const ALIAS_TIERRA = new Set(["0", "GND", "TIERRA"]);
const TOLERANCIA_POTENCIA = 1e-6;
const EPS_PIVOTE = 1e-13;

export class ErrorCircuito extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const errorComponente = (mensaje, id) =>
  new ErrorCircuito("invalid_component", mensaje, id === undefined ? {} : { components: [id] });

// --- Valores con prefijo SI (como parse_value) ----------------------------------------------

const PREFIJOS = {
  T: 1e12, G: 1e9, MEG: 1e6, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, "µ": 1e-6, n: 1e-9, p: 1e-12,
};
const PATRON_VALOR =
  /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(MEG|Meg|meg|[TGMkKmuµnp])?\s*(Ω|ohm|Ohm|ohms|V|A)?\s*$/;

/** Convierte 10, "10", "4.7k", "1MEG", "5mA" o "10 kΩ" a número. M y MEG son mega; m es mili. */
export function parseValue(crudo) {
  let valor;
  if (typeof crudo === "boolean") throw new Error("Valor inválido: booleano");
  if (typeof crudo === "number") {
    valor = crudo;
  } else {
    const m = PATRON_VALOR.exec(String(crudo));
    if (!m) throw new Error(`Valor inválido: '${crudo}'`);
    const prefijo = m[2];
    const factor = !prefijo ? 1 : prefijo.toUpperCase() === "MEG" ? PREFIJOS.MEG : PREFIJOS[prefijo];
    valor = Number(m[1]) * factor;
  }
  if (!Number.isFinite(valor)) throw new Error(`Valor no finito: '${crudo}'`);
  return valor;
}

// --- Union-find ----------------------------------------------------------------------------

class UnionFind {
  constructor() {
    this.padre = new Map();
  }

  find(x) {
    if (!this.padre.has(x)) this.padre.set(x, x);
    let raiz = x;
    while (this.padre.get(raiz) !== raiz) raiz = this.padre.get(raiz);
    while (this.padre.get(x) !== raiz) {
      const siguiente = this.padre.get(x);
      this.padre.set(x, raiz);
      x = siguiente;
    }
    return raiz;
  }

  /** Une dos conjuntos; devuelve false si ya estaban unidos. La tierra queda como raíz. */
  union(a, b) {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (rb === TIERRA) [ra, rb] = [rb, ra];
    this.padre.set(rb, ra);
    return true;
  }
}

// Orden de strings igual al de Python (por punto de código; los nombres son BMP).
const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// --- Entrada ----------------------------------------------------------------------------------

/** Equivalente a to_domain del backend: tipos, valores y espacios. */
function normalizar(entrada) {
  if (!entrada || !Array.isArray(entrada.components)) {
    throw new ErrorCircuito("invalid_circuit", "El circuito no tiene la forma esperada.");
  }
  const ground = String(entrada.ground ?? TIERRA).trim() || TIERRA;
  const components = entrada.components.map((c) => {
    const id = String(c?.id ?? "").trim();
    if (!TIPOS_COMPONENTE.includes(c?.type)) {
      throw errorComponente(`${id || "?"}: tipo desconocido (${c?.type}).`, id || undefined);
    }
    const leer = (crudo, que) => {
      if (crudo === null || crudo === undefined) throw errorComponente(`${id}: falta ${que}.`, id);
      try {
        return parseValue(crudo);
      } catch (e) {
        throw errorComponente(`${id}: ${e.message}`, id);
      }
    };
    const comun = { id, type: c.type, a: String(c.a ?? "").trim(), b: String(c.b ?? "").trim() };
    if (c.type === "wire") return { ...comun, value: 0 };
    if (c.type === "switch") return { ...comun, value: 0, closed: c.closed !== false };
    const value = leer(c.value, "el valor");
    if (c.type === "lamp") return { ...comun, value, ratedPower: leer(c.rated_power, "la potencia nominal") };
    return { ...comun, value };
  });
  return { ground, components };
}

function validar(circuito) {
  if (!circuito.components.length) throw new ErrorCircuito("invalid_circuit", "El circuito está vacío.");
  const vistos = new Set();
  for (const c of circuito.components) {
    if (!c.id) throw errorComponente("Hay un componente sin identificador.");
    if (vistos.has(c.id)) throw errorComponente(`Identificador repetido: ${c.id}.`, c.id);
    vistos.add(c.id);
    if (!c.a || !c.b) throw errorComponente(`${c.id}: falta un nodo.`, c.id);
    if (c.a === c.b) {
      throw errorComponente(`${c.id}: sus dos terminales están en el mismo nodo (${c.a}).`, c.id);
    }
    if (!Number.isFinite(c.value)) throw errorComponente(`${c.id}: valor no finito.`, c.id);
    if (c.type === "resistor" && c.value <= 0) {
      throw errorComponente(
        `${c.id}: la resistencia debe ser mayor que 0 Ω (para un corto usá un cable).`, c.id);
    }
    if (c.type === "lamp" && c.value <= 0) {
      throw errorComponente(`${c.id}: la resistencia de la lámpara debe ser mayor que 0 Ω.`, c.id);
    }
    if (c.type === "lamp" && !(c.ratedPower > 0 && Number.isFinite(c.ratedPower))) {
      throw errorComponente(`${c.id}: la potencia nominal de la lámpara debe ser mayor que 0 W.`, c.id);
    }
  }
}

// --- Topología y armado ---------------------------------------------------------------------

/**
 * Valida, agrupa nodos y revisa la topología. Devuelve todo lo necesario para armar el sistema;
 * lo usan simulate() y el panel de ecuaciones.
 */
export function analizar(entrada) {
  const circuito = normalizar(entrada);
  validar(circuito);
  const canon = (n) => (n === circuito.ground || ALIAS_TIERRA.has(n.toUpperCase()) ? TIERRA : n);

  const nodosOriginales = [...new Set(circuito.components.flatMap((c) => [c.a, c.b]))].sort(comparar);
  if (!nodosOriginales.some((n) => canon(n) === TIERRA)) {
    throw new ErrorCircuito("no_ground",
      `El circuito no tiene tierra: conectá un nodo a '${circuito.ground}' o 'GND'.`);
  }

  // 1. Cables ideales: los nodos que unen son el mismo nodo eléctrico.
  const uf = new UnionFind();
  for (const n of nodosOriginales) uf.find(canon(n));
  // Un interruptor cerrado es un cable; uno abierto no une nada.
  const comoCable = (c) => c.type === "wire" || (c.type === "switch" && c.closed);
  for (const c of circuito.components) {
    if (comoCable(c)) uf.union(canon(c.a), canon(c.b));
  }
  const grupo = (n) => uf.find(canon(n));
  const grupos = [...new Set(nodosOriginales.map(grupo))].sort(comparar);
  const miembros = new Map(grupos.map((g) => [g, []]));
  for (const n of nodosOriginales) miembros.get(grupo(n)).push(n);

  // 2. Componentes efectivos y fuentes de tensión en cortocircuito.
  let activos = [];
  for (const c of circuito.components) {
    if (c.type === "wire" || c.type === "switch") continue;
    if (grupo(c.a) === grupo(c.b)) {
      if (c.type === "voltage_source") {
        throw new ErrorCircuito("shorted_voltage_source",
          `La fuente ${c.id} está en cortocircuito: sus terminales están unidos por cables.`,
          { components: [c.id] });
      }
      continue; // Una resistencia o fuente de corriente en corto no aporta ecuaciones.
    }
    activos.push(c);
  }

  // 3. Nodos flotantes: sin camino a tierra por resistencias o fuentes de tensión.
  // Una fuente de corriente no fija potenciales, así que no cuenta como camino.
  const adyacencia = new Map();
  const unir = (x, y) => {
    if (!adyacencia.has(x)) adyacencia.set(x, new Set());
    adyacencia.get(x).add(y);
  };
  for (const c of activos) {
    if (c.type !== "current_source") {
      unir(grupo(c.a), grupo(c.b));
      unir(grupo(c.b), grupo(c.a));
    }
  }
  const alcanzados = new Set([TIERRA]);
  const cola = [TIERRA];
  while (cola.length) {
    for (const siguiente of adyacencia.get(cola.shift()) ?? []) {
      if (!alcanzados.has(siguiente)) {
        alcanzados.add(siguiente);
        cola.push(siguiente);
      }
    }
  }
  // Las partes sin camino a tierra son un error, salvo que las haya aislado un interruptor
  // abierto y no tengan fuentes: entonces no circula corriente y sus tensiones quedan indefinidas.
  const aislados = new Set();
  const sinTierra = grupos.filter((g) => !alcanzados.has(g));
  if (sinTierra.length) {
    const bornesAbiertos = new Set(circuito.components
      .filter((c) => c.type === "switch" && !c.closed).flatMap((c) => [grupo(c.a), grupo(c.b)]));
    const conFuente = new Set(activos
      .filter((c) => c.type === "voltage_source" || c.type === "current_source")
      .flatMap((c) => [grupo(c.a), grupo(c.b)]));
    const visitados = new Set();
    const flotantes = [];
    for (const inicio of sinTierra) {
      if (visitados.has(inicio)) continue;
      // Una parte conectada (por resistencias, lámparas o fuentes de tensión) sin camino a tierra.
      const parte = [];
      const pendientes = [inicio];
      visitados.add(inicio);
      while (pendientes.length) {
        const g = pendientes.pop();
        parte.push(g);
        for (const siguiente of adyacencia.get(g) ?? []) {
          if (!visitados.has(siguiente)) {
            visitados.add(siguiente);
            pendientes.push(siguiente);
          }
        }
      }
      const aislable = parte.some((g) => bornesAbiertos.has(g)) && !parte.some((g) => conFuente.has(g));
      if (aislable) parte.forEach((g) => aislados.add(g));
      else flotantes.push(...parte.flatMap((g) => miembros.get(g)));
    }
    if (flotantes.length) {
      flotantes.sort(comparar);
      throw new ErrorCircuito("floating_nodes",
        `Nodos sin camino a tierra: ${flotantes.join(", ")}. Conectalos con una resistencia o fuente de tensión.`,
        { nodes: flotantes });
    }
    activos = activos.filter((c) => !aislados.has(grupo(c.a)) && !aislados.has(grupo(c.b)));
  }

  // 4. Lazos formados solo por fuentes de tensión (KVL contradictoria o indeterminada).
  const ufLazos = new UnionFind();
  for (const c of activos) {
    if (c.type === "voltage_source" && !ufLazos.union(grupo(c.a), grupo(c.b))) {
      throw new ErrorCircuito("voltage_source_loop",
        `La fuente ${c.id} cierra un lazo formado solo por fuentes de tensión (por ejemplo, dos fuentes en paralelo).`,
        { components: [c.id] });
    }
  }

  const incognitasNodo = grupos.filter((g) => g !== TIERRA && !aislados.has(g));
  const indice = new Map(incognitasNodo.map((g, i) => [g, i]));
  const fuentesTension = activos.filter((c) => c.type === "voltage_source");
  return {
    circuito, nodosOriginales, grupo, grupos, miembros, activos, incognitasNodo, indice, fuentesTension, aislados,
  };
}

/** Arma [G B; Bᵀ 0][V; I] = [J; E] como lista de entradas (fila, columna, valor) y el lado derecho. */
export function armarSistema(analisis) {
  const { activos, incognitasNodo, indice, fuentesTension, grupo } = analisis;
  const n = incognitasNodo.length;
  const tamano = n + fuentesTension.length;
  const entradas = [];
  const rhs = new Float64Array(tamano);
  const estampar = (f, c, v) => entradas.push([f, c, v]);

  for (const c of activos) {
    const ia = indice.get(grupo(c.a));
    const ib = indice.get(grupo(c.b));
    if (RESISTIVOS.has(c.type)) {
      const g = 1 / c.value;
      if (ia !== undefined) estampar(ia, ia, g);
      if (ib !== undefined) estampar(ib, ib, g);
      if (ia !== undefined && ib !== undefined) {
        estampar(ia, ib, -g);
        estampar(ib, ia, -g);
      }
    } else if (c.type === "current_source") {
      if (ia !== undefined) rhs[ia] -= c.value;
      if (ib !== undefined) rhs[ib] += c.value;
    }
  }
  fuentesTension.forEach((c, k) => {
    const fila = n + k;
    const ia = indice.get(grupo(c.a));
    const ib = indice.get(grupo(c.b));
    if (ia !== undefined) { estampar(ia, fila, 1); estampar(fila, ia, 1); }
    if (ib !== undefined) { estampar(ib, fila, -1); estampar(fila, ib, -1); }
    rhs[fila] = c.value;
  });
  return { tamano, entradas, rhs };
}

/** Matriz densa (filas de Float64Array) a partir de las entradas, sumando las repetidas. */
export function matrizDensa(tamano, entradas) {
  const A = Array.from({ length: tamano }, () => new Float64Array(tamano));
  for (const [f, c, v] of entradas) A[f][c] += v;
  return A;
}

// --- Resolución --------------------------------------------------------------------------------

const singular = () => new ErrorCircuito("singular_circuit", "El sistema de ecuaciones no tiene solución única.");

/** Eliminación gaussiana con pivoteo parcial. */
function resolverDenso(tamano, entradas, rhs) {
  const A = matrizDensa(tamano, entradas);
  const b = Float64Array.from(rhs);
  let escala = 0;
  for (const fila of A) for (const v of fila) escala = Math.max(escala, Math.abs(v));
  const umbral = EPS_PIVOTE * (escala || 1);
  for (let k = 0; k < tamano; k++) {
    let p = k;
    for (let i = k + 1; i < tamano; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if (Math.abs(A[p][k]) <= umbral) throw singular();
    if (p !== k) {
      [A[p], A[k]] = [A[k], A[p]];
      [b[p], b[k]] = [b[k], b[p]];
    }
    const filaK = A[k];
    for (let i = k + 1; i < tamano; i++) {
      const factor = A[i][k] / filaK[k];
      if (factor === 0) continue;
      const filaI = A[i];
      for (let j = k; j < tamano; j++) filaI[j] -= factor * filaK[j];
      b[i] -= factor * b[k];
    }
  }
  const x = new Float64Array(tamano);
  for (let i = tamano - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < tamano; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

/**
 * Eliminación gaussiana sobre filas dispersas (Map columna -> valor) con pivoteo parcial.
 * Las matrices de circuitos tienen pocas entradas por fila y poco relleno en orden natural.
 */
function resolverDisperso(tamano, entradas, rhs) {
  const filas = Array.from({ length: tamano }, () => new Map());
  // filasConColumna[c]: filas aún no eliminadas con una entrada en la columna c.
  const filasConColumna = Array.from({ length: tamano }, () => new Set());
  let escala = 0;
  for (const [f, c, v] of entradas) filas[f].set(c, (filas[f].get(c) ?? 0) + v);
  for (let f = 0; f < tamano; f++) {
    for (const [c, v] of filas[f]) {
      filasConColumna[c].add(f);
      escala = Math.max(escala, Math.abs(v));
    }
  }
  const umbral = EPS_PIVOTE * (escala || 1);
  const b = Float64Array.from(rhs);
  const pivotes = new Array(tamano); // pivotes[k] = fila elegida para la columna k
  for (let k = 0; k < tamano; k++) {
    let p = -1;
    let mejor = umbral;
    for (const f of filasConColumna[k]) {
      const v = Math.abs(filas[f].get(k) ?? 0);
      if (v > mejor) { mejor = v; p = f; }
    }
    if (p < 0) throw singular();
    pivotes[k] = p;
    const filaP = filas[p];
    for (const c of filaP.keys()) filasConColumna[c].delete(p);
    const pivote = filaP.get(k);
    for (const f of [...filasConColumna[k]]) {
      const fila = filas[f];
      const factor = fila.get(k) / pivote;
      for (const [c, v] of filaP) {
        const nuevo = (fila.get(c) ?? 0) - factor * v;
        if (c === k || nuevo === 0) {
          fila.delete(c);
          filasConColumna[c].delete(f);
        } else {
          if (!fila.has(c)) filasConColumna[c].add(f);
          fila.set(c, nuevo);
        }
      }
      b[f] -= factor * b[p];
    }
  }
  const x = new Float64Array(tamano);
  for (let k = tamano - 1; k >= 0; k--) {
    const p = pivotes[k];
    let s = b[p];
    for (const [c, v] of filas[p]) if (c !== k) s -= v * x[c];
    x[k] = s / filas[p].get(k);
  }
  return x;
}

function resolver(tamano, entradas, rhs) {
  const solver = tamano <= DENSE_LIMIT ? "dense" : "sparse";
  const x = solver === "dense" ? resolverDenso(tamano, entradas, rhs) : resolverDisperso(tamano, entradas, rhs);
  if (!x.every(Number.isFinite)) throw singular();
  return { x, solver };
}

// --- Simulación ----------------------------------------------------------------------------------

const ahora = () => globalThis.performance?.now?.() ?? Date.now();
const redondear = (ms) => Math.round(ms * 1000) / 1000;

export function simulate(entrada) {
  const inicio = ahora();
  const analisis = analizar(entrada);
  const { circuito, nodosOriginales, grupo, grupos, incognitasNodo, indice, fuentesTension, aislados } = analisis;
  const { tamano, entradas, rhs } = armarSistema(analisis);

  const inicioSolver = ahora();
  const { x, solver } = tamano === 0 ? { x: new Float64Array(0), solver: "trivial" } : resolver(tamano, entradas, rhs);
  const solveMs = ahora() - inicioSolver;

  const n = incognitasNodo.length;
  const tensionGrupo = new Map([[TIERRA, 0]]);
  for (const [g, i] of indice) tensionGrupo.set(g, x[i]);
  // Los nodos aislados por un interruptor abierto no tienen tensión definida.
  const tensionDe = (g) => (aislados.has(g) ? null : tensionGrupo.get(g));
  const node_voltages = {};
  for (const nodo of nodosOriginales) node_voltages[nodo] = tensionDe(grupo(nodo));
  const corrienteFuente = new Map(fuentesTension.map((c, k) => [c.id, x[n + k]]));

  const components = [];
  const kcl = new Map();
  const sumar = (g, v) => kcl.set(g, (kcl.get(g) ?? 0) + v);
  for (const c of circuito.components) {
    const va = tensionDe(grupo(c.a));
    const vb = tensionDe(grupo(c.b));
    const voltage = va === null || vb === null ? null : va - vb;
    if (c.type === "wire" || (c.type === "switch" && c.closed)) {
      components.push({ id: c.id, type: c.type, voltage: 0, current: null, power: 0 });
      continue;
    }
    if (c.type === "switch" || voltage === null) {
      // Interruptor abierto, o componente dentro de una parte aislada: no circula corriente.
      const resultado = { id: c.id, type: c.type, voltage, current: 0, power: 0 };
      if (c.type === "lamp") Object.assign(resultado, { brightness: 0, burned: false });
      components.push(resultado);
      continue;
    }
    let current;
    if (RESISTIVOS.has(c.type)) current = voltage / c.value;
    else if (c.type === "voltage_source") current = corrienteFuente.get(c.id);
    else current = c.value;
    sumar(grupo(c.a), current);
    sumar(grupo(c.b), -current);
    const power = voltage * current;
    const resultado = { id: c.id, type: c.type, voltage, current, power };
    if (c.type === "lamp") {
      Object.assign(resultado, { brightness: power / c.ratedPower, burned: power > c.ratedPower });
    }
    components.push(resultado);
  }

  const absorbed = components.filter((r) => r.power > 0).reduce((s, r) => s + r.power, 0);
  const supplied = -components.filter((r) => r.power < 0).reduce((s, r) => s + r.power, 0);
  const net = absorbed - supplied;
  return {
    node_voltages,
    components,
    power: {
      supplied, absorbed, net,
      ok: Math.abs(net) <= TOLERANCIA_POTENCIA * Math.max(1, absorbed, supplied),
    },
    kcl_max_residual: Math.max(0, ...[...kcl.values()].map(Math.abs)),
    stats: {
      components: circuito.components.length,
      electrical_nodes: grupos.length,
      unknowns: tamano,
      solver,
      solve_ms: redondear(solveMs),
      total_ms: redondear(ahora() - inicio),
    },
  };
}
