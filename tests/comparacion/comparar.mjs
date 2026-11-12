// Compara el motor JS (frontend/public/js/lib/mna.js) con POST /simulate del backend Python
// (rama microservicios) sobre circuitos aleatorios, incluidos los que deben dar error.
//
// Uso: con el stack de la rama microservicios levantado en BASE_URL (por defecto localhost:8080):
//   node tests/comparacion/comparar.mjs [CANTIDAD] [SEMILLA]
import { simulate } from "../../frontend/public/js/lib/mna.js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const CANTIDAD = Number(process.argv[2] ?? 500);
let semilla = Number(process.argv[3] ?? 20261112);

// Generador reproducible (mulberry32).
function azar() {
  semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entero = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

const VALORES_R = [1, 3, 4.7, 10, 22, 100, "330", "1k", "4.7k", "10k", "2.2k", "1MEG", "47", 0.5];
const VALORES_V = [1, 5, 9, 12, -12, 24, 60, "3.3", "1.5V", 100];
const VALORES_I = ["1m", "5m", "10mA", 0.1, -0.02, "250u", 1];

function componente(tipo, id, a, b) {
  const c = { id, type: tipo, a, b };
  if (tipo === "resistor") c.value = elegir(VALORES_R);
  else if (tipo === "voltage_source") c.value = elegir(VALORES_V);
  else if (tipo === "current_source") c.value = elegir(VALORES_I);
  return c;
}

function tipoAlAzar() {
  const x = azar();
  return x < 0.55 ? "resistor" : x < 0.7 ? "voltage_source" : x < 0.85 ? "current_source" : "wire";
}

/** Circuito conectado: un árbol de resistencias desde tierra más componentes extra al azar. */
function conectado(nodos, extra) {
  const nombres = ["0", ...Array.from({ length: nodos }, (_, i) => `n${i + 1}`)];
  const comps = [];
  let k = 0;
  for (let i = 1; i < nombres.length; i++) {
    comps.push(componente("resistor", `R${++k}`, nombres[entero(0, i - 1)], nombres[i]));
  }
  for (let j = 0; j < extra; j++) {
    const a = elegir(nombres);
    let b = elegir(nombres);
    if (a === b) b = nombres[(nombres.indexOf(a) + 1) % nombres.length];
    const tipo = tipoAlAzar();
    comps.push(componente(tipo, `${tipo[0].toUpperCase()}x${++k}`, a, b));
  }
  return { ground: "0", components: comps };
}

/** Totalmente al azar: suele tener nodos flotantes, lazos de fuentes o faltarle tierra. */
function alAzar() {
  const nombres = ["0", "GND", "a", "b", "c", "d", "e", "f"].slice(0, entero(3, 8));
  const comps = [];
  for (let k = 1; k <= entero(1, 10); k++) {
    const a = elegir(nombres);
    const b = elegir(nombres);
    comps.push(componente(tipoAlAzar(), `C${k}`, a, b));
  }
  return { ground: elegir(["0", "0", "a"]), components: comps };
}

/** Errores forzados: valor inválido o faltante, R ≤ 0, id repetido, fuentes en paralelo o en corto. */
function conError() {
  const base = conectado(entero(2, 6), entero(0, 4));
  const caso = entero(0, 6);
  const c = base.components;
  if (caso === 0) c.push({ id: "Rmal", type: "resistor", a: "0", b: "n1", value: elegir(["1x", "abc", "k", ""]) });
  if (caso === 1) c.push({ id: "Rnulo", type: "resistor", a: "0", b: "n1", value: elegir([0, -5, "-1k"]) });
  if (caso === 2) c.push({ id: c[0].id, type: "resistor", a: "0", b: "n1", value: 10 });
  if (caso === 3) c.push({ id: "Va", type: "voltage_source", a: "n1", b: "0", value: 5 },
    { id: "Vb", type: "voltage_source", a: "n1", b: "0", value: 7 });
  if (caso === 4) c.push({ id: "Vc", type: "voltage_source", a: "n1", b: "0", value: 5 }, { id: "Wc", type: "wire", a: "n1", b: "0" });
  if (caso === 5) c.push({ id: "Rsin", type: "resistor", a: "0", b: "n1" });
  if (caso === 6) c.push({ id: "Rlejos", type: "resistor", a: "z1", b: "z2", value: 10 });
  return base;
}

function generar(i) {
  if (i % 50 === 49) return conectado(entero(220, 400), entero(5, 30)); // resolución dispersa
  const x = azar();
  if (x < 0.55) return conectado(entero(1, 25), entero(0, 25));
  if (x < 0.8) return alAzar();
  return conError();
}

async function backend(circuito) {
  for (let intento = 0; intento < 10; intento++) {
    const r = await fetch(`${BASE_URL}/simulate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(circuito),
    });
    if (r.status === 429 || r.status === 503) {
      await new Promise((ok) => setTimeout(ok, 1000 * Number(r.headers.get("Retry-After") ?? 1)));
      continue;
    }
    return { estado: r.status, cuerpo: await r.json() };
  }
  throw new Error("El backend siguió saturado.");
}

function local(circuito) {
  try {
    return { ok: true, resultado: simulate(structuredClone(circuito)) };
  } catch (e) {
    if (!e.code) throw e;
    return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
  }
}

// Diferencia absoluta máxima, relativa al propio valor (engañosa cerca de cero) y relativa a la
// escala del circuito (|Δ| / máximo |valor| de esa magnitud en el circuito), que es la que importa.
const diferencias = { tension: 0, corriente: 0, potencia: 0, balance: 0 };
const aEscala = { tension: 0, corriente: 0, potencia: 0, balance: 0 };
const relativas = { tension: 0, corriente: 0, potencia: 0, balance: 0 };
const peores = {};
let actual = null;
const anotar = (tipo, js, py) => {
  const d = Math.abs(js - py);
  aEscala[tipo] = Math.max(aEscala[tipo], d / Math.max(actual.escala[tipo], 1e-300));
  const rel = d / Math.max(Math.abs(py), 1e-9);
  diferencias[tipo] = Math.max(diferencias[tipo], d);
  if (rel > relativas[tipo]) {
    relativas[tipo] = rel;
    peores[tipo] = { circuito: actual.i, js, py, ...actual.extra };
  }
};
const discrepancias = [];
const conteo = { ok: 0, error: 0, codigos: {}, solvers: {} };

for (let i = 0; i < CANTIDAD; i++) {
  const circuito = generar(i);
  const py = await backend(circuito);
  const js = local(circuito);
  actual = { i, extra: {}, escala: {} };
  if (py.estado === 200) {
    const abs = Object.values(py.cuerpo.node_voltages).map(Math.abs);
    actual.extra = { v_max: Math.max(...abs), componentes: circuito.components.length,
      solver: py.cuerpo.stats.solver };
    const corrientes = py.cuerpo.components.filter((c) => c.current !== null);
    actual.escala = {
      tension: Math.max(...abs),
      corriente: Math.max(0, ...corrientes.map((c) => Math.abs(c.current))),
      potencia: Math.max(0, ...corrientes.map((c) => Math.abs(c.power))),
      balance: Math.max(py.cuerpo.power.supplied, py.cuerpo.power.absorbed),
    };
    if (!js.ok) { discrepancias.push({ i, py: "200", js: js.error.code }); continue; }
    conteo.ok++;
    const r = js.resultado;
    const p = py.cuerpo;
    conteo.solvers[p.stats.solver] = (conteo.solvers[p.stats.solver] ?? 0) + 1;
    if (r.stats.solver !== p.stats.solver || r.stats.unknowns !== p.stats.unknowns ||
        r.stats.electrical_nodes !== p.stats.electrical_nodes) {
      discrepancias.push({ i, stats: [r.stats, p.stats] });
    }
    if (Object.keys(r.node_voltages).sort().join() !== Object.keys(p.node_voltages).sort().join()) {
      discrepancias.push({ i, nodos: "distintos" });
    }
    for (const [nodo, v] of Object.entries(p.node_voltages)) anotar("tension", r.node_voltages[nodo], v);
    const porId = new Map(r.components.map((c) => [c.id, c]));
    for (const c of p.components) {
      const m = porId.get(c.id);
      if (c.current === null || m.current === null) {
        if (c.current !== m.current) discrepancias.push({ i, corrienteNula: c.id });
        continue;
      }
      anotar("corriente", m.current, c.current);
      anotar("potencia", m.power, c.power);
    }
    anotar("balance", r.power.supplied, p.power.supplied);
    if (r.power.ok !== p.power.ok) discrepancias.push({ i, balanceOk: [r.power.ok, p.power.ok] });
  } else {
    const detalle = py.cuerpo.detail;
    conteo.error++;
    conteo.codigos[detalle.code] = (conteo.codigos[detalle.code] ?? 0) + 1;
    if (js.ok || js.error.code !== detalle.code ||
        JSON.stringify(js.error.details) !== JSON.stringify(detalle.details) ||
        js.error.message !== detalle.message) {
      discrepancias.push({ i, py: [py.estado, detalle], js: js.ok ? "200" : js.error });
    }
  }
}

console.log(JSON.stringify({
  circuitos: CANTIDAD, semilla: Number(process.argv[3] ?? 20261112),
  simulados: conteo.ok, solvers: conteo.solvers, errores: conteo.error, codigos: conteo.codigos,
  diferencia_absoluta_maxima: diferencias, diferencia_relativa_maxima: relativas,
  diferencia_relativa_a_la_escala_maxima: aEscala, peores_casos: peores,
  discrepancias: discrepancias.length, primeras: discrepancias.slice(0, 5),
}, null, 2));
process.exitCode = discrepancias.length ? 1 : 0;
