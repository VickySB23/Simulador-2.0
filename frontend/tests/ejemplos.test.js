// Los ejemplos de Física 2 dan los resultados que se calculan a mano.
import assert from "node:assert/strict";
import { test } from "node:test";

import { EJEMPLOS } from "../public/js/lib/ejemplos.js";
import { nombreNodo } from "../public/js/lib/modelo.js";
import { simularEstado } from "../public/js/lib/netlist.js";

function simular(id) {
  const ejemplo = EJEMPLOS.find((e) => e.id === id);
  const { resultado, error } = simularEstado(ejemplo.estado);
  assert.equal(error, undefined, `${id}: ${error?.message}`);
  const comp = Object.fromEntries(resultado.components.map((c) => [c.id, c]));
  const v = (x, y) => resultado.node_voltages[nombreNodo({ x, y })];
  return { resultado, comp, v };
}

const cerca = (real, esperado, msg) =>
  assert.ok(Math.abs(real - esperado) <= 1e-9 * Math.max(1, Math.abs(esperado)), `${msg}: ${real} ≠ ${esperado}`);

test("todos los ejemplos simulan con balance de potencias y KCL", () => {
  for (const { id } of EJEMPLOS) {
    const { resultado } = simular(id);
    assert.ok(resultado.power.ok, id);
    assert.ok(resultado.kcl_max_residual < 1e-12, id);
  }
});

test("los ids de cada ejemplo son únicos y los contadores los cubren", () => {
  for (const { id, estado } of EJEMPLOS) {
    const ids = estado.components.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, id);
    for (const c of estado.components) {
      assert.ok(Number(c.id.slice(1)) <= estado.counters[c.id[0]], `${id}: ${c.id}`);
    }
  }
});

test("divisor: 8 V en el medio", () => {
  const { v } = simular("divisor");
  cerca(v(18, 4), 8, "V medio");
});

test("serie: 2 mA y caídas de 2, 4 y 6 V", () => {
  const { comp } = simular("serie");
  for (const [id, caida] of [["R1", 2], ["R2", 4], ["R3", 6]]) {
    cerca(comp[id].current, 2e-3, `I ${id}`);
    cerca(comp[id].voltage, caida, `V ${id}`);
  }
});

test("paralelo: 12 + 6 + 4 = 22 mA", () => {
  const { comp } = simular("paralelo");
  cerca(comp.R1.current, 12e-3, "R1");
  cerca(comp.R2.current, 6e-3, "R2");
  cerca(comp.R3.current, 4e-3, "R3");
  cerca(comp.V1.current, -22e-3, "fuente");
});

test("TP4: V2 = 30 V e I = 12,5 A", () => {
  const { comp, v, resultado } = simular("tp4");
  cerca(v(12, 8), 30, "V2");
  cerca(comp.V1.current, -12.5, "I fuente");
  cerca(resultado.power.absorbed, 750, "potencia");
});

test("Wheatstone equilibrado: no circula corriente por el galvanómetro", () => {
  const { comp, v } = simular("wheatstone");
  assert.ok(Math.abs(comp.R5.current) < 1e-15, `I R5 = ${comp.R5.current}`);
  cerca(v(10, 6), 20 / 3, "nodo izquierdo");
  cerca(v(20, 6), 20 / 3, "nodo derecho");
});

test("dos mallas: 7,5 V en el medio y la fuente de 6 V absorbe", () => {
  const { comp, v } = simular("dos-mallas");
  cerca(v(15, 4), 7.5, "V medio");
  cerca(comp.R3.current, 3.75e-3, "R3");
  cerca(comp.R1.current, 4.5e-3, "R1");
  cerca(comp.R2.current, 0.75e-3, "R2 (de izquierda a derecha)");
  assert.ok(comp.V2.power > 0, "V2 absorbe potencia");
  assert.ok(comp.V1.power < 0, "V1 entrega potencia");
});
