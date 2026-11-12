// Port de services/simulation-service/tests/test_mna.py y de los casos de motor de test_api.py
// (rama microservicios): mismos circuitos, mismos resultados esperados y mismos códigos de error.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DENSE_LIMIT, ErrorCircuito, parseValue, simulate } from "../public/js/lib/mna.js";

const [R, V, I, W] = ["resistor", "voltage_source", "current_source", "wire"];

function circuito(partes, ground = "0") {
  return {
    ground,
    components: partes.map(([id, type, a, b, value]) => (type === W ? { id, type, a, b } : { id, type, a, b, value })),
  };
}

/** Como pytest.approx: relativo 1e-6, absoluto 1e-12. */
function aprox(real, esperado, mensaje = "") {
  const tolerancia = Math.max(1e-6 * Math.abs(esperado), 1e-12);
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${mensaje} ${real} ≉ ${esperado}`);
}

const porId = (r) => Object.fromEntries(r.components.map((c) => [c.id, c]));

function esperarError(partes, code, clave, detalle, ground) {
  assert.throws(() => simulate(circuito(partes, ground)), (e) => {
    assert.ok(e instanceof ErrorCircuito, `no es ErrorCircuito: ${e}`);
    assert.equal(e.code, code, e.message);
    if (clave) assert.deepEqual(e.details[clave], detalle);
    return true;
  });
}

// --- test_mna.py ---------------------------------------------------------------------------

test("divisor de tensión", () => {
  const r = simulate(circuito([["V1", V, "1", "0", 12], ["R1", R, "1", "2", 1e3], ["R2", R, "2", "0", 2e3]]));
  aprox(r.node_voltages["2"], 8);
  const c = porId(r);
  aprox(c.R1.current, 4e-3);
  // La fuente entrega energía: corriente de a hacia b negativa y potencia negativa.
  aprox(c.V1.current, -4e-3);
  aprox(c.V1.power, -48e-3);
  assert.ok(r.power.ok);
  aprox(r.power.supplied, 48e-3);
});

test("ejercicio TP4 mixto: V2 = 30 V", () => {
  // (3 Ω ∥ 12 Ω) en serie con (6 Ω ∥ 4 Ω): 2,4 Ω + 2,4 Ω con 60 V -> V2 = 30 V, I = 12,5 A.
  const r = simulate(circuito([
    ["V1", V, "1", "0", 60],
    ["R_3", R, "1", "2", 3], ["R_12", R, "1", "2", 12],
    ["R_6", R, "2", "0", 6], ["R_4", R, "2", "0", 4],
  ]));
  aprox(r.node_voltages["2"], 30);
  aprox(porId(r).V1.current, -12.5);
  aprox(r.power.absorbed, 750);
});

test("fuente de corriente: sentido de a hacia b", () => {
  // 1 mA entra al nodo 1 desde tierra: V1 = 1 mA * 1 kΩ = 1 V.
  const r = simulate(circuito([["I1", I, "0", "1", 1e-3], ["R1", R, "1", "0", 1e3]]));
  aprox(r.node_voltages["1"], 1);
  aprox(porId(r).I1.power, -1e-3);
  assert.ok(r.power.ok);
});

test("superposición con ambas fuentes", () => {
  const r = simulate(circuito([
    ["V1", V, "1", "0", 10], ["R1", R, "1", "2", 100], ["R2", R, "2", "0", 200],
    ["R3", R, "1", "0", 1000], ["I1", I, "2", "0", 5e-3],
  ]));
  // KCL en el nodo 2: (10 - V2)/100 = V2/200 + 0,005 -> V2 = 19/3 V.
  aprox(r.node_voltages["2"], 19 / 3);
  assert.ok(r.power.ok);
  assert.ok(r.kcl_max_residual < 1e-12);
});

test("cables ideales no degradan la precisión", () => {
  const partes = [["V1", V, "a", "0", 12]];
  let anterior = "a";
  for (let k = 0; k < 50; k++) {
    partes.push([`W${k}`, W, anterior, `w${k}`]);
    anterior = `w${k}`;
  }
  partes.push(["R1", R, anterior, "m", 1e3], ["R2", R, "m", "0", 2e3]);
  const r = simulate(circuito(partes));
  assert.equal(r.node_voltages.m, 8);
  assert.equal(r.node_voltages.w49, 12);
  assert.equal(r.stats.electrical_nodes, 3);
});

test("alias de tierra y tierra personalizada", () => {
  let r = simulate(circuito([["V1", V, "1", "GND", 5], ["R1", R, "1", "gnd", 10]]));
  assert.equal(r.node_voltages.GND, 0);
  assert.equal(r.node_voltages["1"], 5);
  r = simulate(circuito([["V1", V, "top", "base", 5], ["R1", R, "top", "base", 10]], "base"));
  assert.equal(r.node_voltages.top, 5);
});

test("una resistencia en corto no conduce", () => {
  const r = simulate(circuito([
    ["V1", V, "1", "0", 5], ["R1", R, "1", "0", 10],
    ["R2", R, "x", "y", 10], ["W1", W, "x", "y"], ["W2", W, "x", "1"],
  ]));
  assert.equal(porId(r).R2.current, 0);
});

test("una escalera grande usa la resolución dispersa", () => {
  const n = DENSE_LIMIT * 3;
  const partes = [["V1", V, "n0", "0", n]];
  for (let k = 0; k < n - 1; k++) partes.push([`R${k}`, R, `n${k}`, `n${k + 1}`, 1]);
  partes.push(["Rlast", R, `n${n - 1}`, "0", 1]);
  const r = simulate(circuito(partes));
  assert.equal(r.stats.solver, "sparse");
  // n resistencias de 1 Ω en serie con n voltios: cada una cae 1 V.
  aprox(r.node_voltages.n10, n - 10);
  assert.ok(r.power.ok);
});

test("densa y dispersa dan lo mismo en el límite", () => {
  // Escalera con DENSE_LIMIT incógnitas (densa) y una más (dispersa).
  for (const nodos of [DENSE_LIMIT - 1, DENSE_LIMIT]) {
    const partes = [["V1", V, "1", "0", 10]];
    for (let k = 1; k < nodos; k++) {
      partes.push([`RS${k}`, R, `${k}`, `${k + 1}`, 1000], [`RP${k + 1}`, R, `${k + 1}`, "0", 10000]);
    }
    const r = simulate(circuito(partes));
    assert.equal(r.stats.solver, nodos + 1 <= DENSE_LIMIT ? "dense" : "sparse");
    assert.ok(r.power.ok && r.kcl_max_residual < 1e-12, `${nodos} nodos`);
  }
});

const CASOS_ERROR = [
  ["sin tierra", [["V1", V, "1", "2", 5], ["R1", R, "1", "2", 1]], "no_ground"],
  ["nodos flotantes", [["V1", V, "1", "0", 5], ["R1", R, "1", "0", 1], ["R2", R, "5", "6", 1]],
    "floating_nodes", "nodes", ["5", "6"]],
  // Nodo alimentado solo por una fuente de corriente: Simulador-2.0 mostraba 1 GV.
  ["nodo solo con fuente de corriente", [["V1", V, "1", "0", 5], ["R1", R, "1", "0", 1], ["I1", I, "0", "5", 1e-3]],
    "floating_nodes", "nodes", ["5"]],
  ["dos fuentes en paralelo", [["V1", V, "1", "0", 10], ["V2", V, "1", "0", 5], ["R1", R, "1", "0", 1]],
    "voltage_source_loop", "components", ["V2"]],
  ["fuente en corto", [["V1", V, "1", "0", 10], ["W1", W, "1", "0"]],
    "shorted_voltage_source", "components", ["V1"]],
  ["R = 0", [["V1", V, "1", "0", 10], ["R1", R, "1", "0", 0]], "invalid_component", "components", ["R1"]],
  ["R negativa", [["V1", V, "1", "0", 10], ["R1", R, "1", "0", -5]], "invalid_component", "components", ["R1"]],
  ["id repetido", [["V1", V, "1", "0", 10], ["V1", R, "1", "0", 5]], "invalid_component", "components", ["V1"]],
  ["terminales en el mismo nodo", [["V1", V, "1", "0", 10], ["R1", R, "1", "1", 5]],
    "invalid_component", "components", ["R1"]],
  ["circuito vacío", [], "invalid_circuit"],
];

for (const [nombre, partes, code, clave, detalle] of CASOS_ERROR) {
  test(`error explícito: ${nombre}`, () => esperarError(partes, code, clave, detalle));
}

test("parse_value acepta los mismos formatos que el backend", () => {
  const casos = [
    [10, 10], ["10", 10], ["4.7k", 4700], ["1MEG", 1e6], ["1meg", 1e6], ["2M", 2e6],
    ["5m", 5e-3], ["5mA", 5e-3], ["10 kΩ", 1e4], ["3u", 3e-6], ["2.2n", 2.2e-9], ["-12V", -12],
    [".5", 0.5], ["1e3", 1000],
  ];
  for (const [crudo, esperado] of casos) aprox(parseValue(crudo), esperado, String(crudo));
});

test("parse_value rechaza lo inválido", () => {
  for (const crudo of ["1x", "abc", "", "k", "nan", true, Infinity]) {
    assert.throws(() => parseValue(crudo), Error, String(crudo));
  }
});

// --- Casos de motor de test_api.py --------------------------------------------------------

const DIVISOR = [
  { id: "V1", type: V, a: "1", b: "0", value: 12 },
  { id: "R1", type: R, a: "1", b: "2", value: "1k" },
  { id: "R2", type: R, a: "2", b: "0", value: "2k" },
];

test("respuesta con la forma de POST /simulate", () => {
  const r = simulate({ components: DIVISOR });
  aprox(r.node_voltages["2"], 8);
  assert.equal(r.power.ok, true);
  assert.deepEqual(new Set(r.components.map((c) => c.id)), new Set(["V1", "R1", "R2"]));
  assert.equal(r.stats.solver, "dense");
  assert.deepEqual(Object.keys(r).sort(), ["components", "kcl_max_residual", "node_voltages", "power", "stats"]);
});

test("un cable devuelve corriente nula", () => {
  const r = simulate({ components: [...DIVISOR, { id: "W1", type: W, a: "2", b: "3" }] });
  const cable = r.components.find((c) => c.id === "W1");
  assert.equal(cable.current, null);
  aprox(r.node_voltages["3"], 8);
});

const CAMBIOS = [
  [{ id: "R3", type: R, a: "7", b: "8", value: 10 }, "floating_nodes"],
  [{ id: "V2", type: V, a: "1", b: "0", value: 5 }, "voltage_source_loop"],
  [{ id: "R3", type: R, a: "1", b: "0", value: "1x" }, "invalid_component"],
  [{ id: "R3", type: R, a: "1", b: "0" }, "invalid_component"],
  [{ id: "R3", type: R, a: "1", b: "0", value: 0 }, "invalid_component"],
  [{ id: "X", type: "capacitor", a: "1", b: "0" }, "invalid_component"],
];

for (const [cambio, code] of CAMBIOS) {
  test(`error con código ${code} (${cambio.id})`, () => {
    assert.throws(() => simulate({ components: [...DIVISOR, cambio] }), (e) => e.code === code);
  });
}

test("los espacios en ids y nodos se ignoran, como en el backend", () => {
  const r = simulate({ ground: " 0 ", components: [
    { id: " V1 ", type: V, a: " 1", b: "0 ", value: 5 }, { id: "R1", type: R, a: "1", b: "0", value: 5 }] });
  assert.equal(r.node_voltages["1"], 5);
  assert.deepEqual(r.components.map((c) => c.id), ["V1", "R1"]);
});
