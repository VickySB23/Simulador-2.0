// Los ejemplos de Física 2 dan los resultados que se calculan a mano.
import assert from "node:assert/strict";
import { test } from "node:test";

import { EJEMPLOS } from "../public/js/lib/ejemplos.js";
import { TP4 } from "./circuitos-de-prueba.js";
import { alternarInterruptor, nombreNodo } from "../public/js/lib/modelo.js";
import { avisoCorrienteBaja } from "../public/js/lib/ficha.js";
import { analizarConexiones, simularEstado, simularHoja } from "../public/js/lib/netlist.js";

function simular(id, cambiar = (e) => e) {
  const ejemplo = [...EJEMPLOS, TP4].find((e) => e.id === id);
  const { resultado, error } = simularEstado(cambiar(ejemplo.estado));
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
    const { estado } = [...EJEMPLOS, TP4].find((e) => e.id === id);
    assert.equal(analizarConexiones(estado).sinConectar.size, 0, `${id}: tiene un borne suelto`);
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

// --- Lámparas ---------------------------------------------------------------------------

const brillo = (c) => Math.round(c.brightness * 1000) / 10;

test("linterna: 0,5 A, la lámpara al 100 %; con S1 abierto se apaga", () => {
  const { comp, resultado } = simular("linterna");
  cerca(comp.L1.current, 0.5, "I");
  cerca(comp.L1.brightness, 1, "brillo");
  assert.equal(comp.L1.burned, false);
  assert.deepEqual(resultado.stats.burned_lamps ?? [], []);
  const apagada = simular("linterna", (e) => alternarInterruptor(e, "S1")).comp.L1;
  assert.equal(apagada.current, 0);
});

test("serie contra paralelo: 25 % en serie, 100 % en paralelo", () => {
  const { comp } = simular("serie-contra-paralelo");
  for (const id of ["L1", "L2"]) cerca(comp[id].brightness, 0.25, id);
  for (const id of ["L3", "L4"]) cerca(comp[id].brightness, 1, id);
  assert.ok(["L1", "L2", "L3", "L4"].every((id) => !comp[id].burned));
});

test("en serie se quema L2 y se apagan las tres", () => {
  const { comp, resultado } = simular("serie-se-quema");
  assert.deepEqual(resultado.stats.burned_lamps, ["L2"]);
  assert.equal(comp.L2.burned, true);
  for (const id of ["L1", "L2", "L3"]) assert.ok(Math.abs(comp[id].current) < 1e-12, id);
  assert.ok(!comp.L1.burned && !comp.L3.burned);
});

test("en paralelo se quema L2 y las demás siguen al 100 %", () => {
  const { comp, resultado } = simular("paralelo-siguen");
  assert.deepEqual(resultado.stats.burned_lamps, ["L2"]);
  for (const id of ["L1", "L3"]) {
    cerca(comp[id].brightness, 1, id);
    assert.equal(comp[id].burned, false);
  }
  cerca(Math.abs(comp.V1.current), 1, "la batería entrega 1 A");
});

test("dimmer: 25 % con R1 en serie, 100 % al cerrar S1", () => {
  cerca(simular("dimmer").comp.L1.brightness, 0.25, "S1 abierto");
  const cerrado = simular("dimmer", (e) => alternarInterruptor(e, "S1")).comp;
  cerca(cerrado.L1.brightness, 1, "S1 cerrado");
  assert.equal(cerrado.L1.burned, false);
  assert.ok(Math.abs(cerrado.R1.current) < 1e-12, "por R1 puenteada no circula corriente");
});

test("distintas potencias en serie: misma corriente, 79 % y 1,2 %; la de 48 W avisa", () => {
  const { comp } = simular("distintas-potencias");
  cerca(comp.L1.current, 12 / 27, "I L1");
  cerca(comp.L2.current, 12 / 27, "I L2");
  assert.equal(brillo(comp.L1), 79);
  assert.equal(brillo(comp.L2), 1.2);
  const l2 = EJEMPLOS.find((e) => e.id === "distintas-potencias").estado.components.find((c) => c.id === "L2");
  assert.equal(avisoCorrienteBaja(l2, comp.L2),
    "La corriente es muy baja para esta lámpara (444 mA de 4.00 A nominales).");
});

test("casa: S2 abierto apaga solo L2; la batería entrega 1 A", () => {
  const { comp } = simular("casa");
  cerca(comp.L1.brightness, 1, "L1");
  cerca(comp.L3.brightness, 1, "L3");
  assert.equal(comp.L2.current, 0);
  cerca(Math.abs(comp.V1.current), 1, "V1");
  const todas = simular("casa", (e) => alternarInterruptor(e, "S2")).comp;
  cerca(todas.L2.brightness, 1, "con S2 cerrado se prende L2");
  cerca(Math.abs(todas.V1.current), 1.5, "y la batería entrega 1,5 A");
});

test("una lámpara justo en su potencia nominal no se quema", () => {
  for (const id of ["linterna", "serie-contra-paralelo", "paralelo-siguen", "casa"]) {
    const { resultado } = simular(id);
    for (const c of resultado.components) {
      if (c.type === "lamp" && Math.abs(c.brightness - 1) < 1e-6) assert.equal(c.burned, false, `${id} ${c.id}`);
    }
  }
});

// --- Medir y proteger ---------------------------------------------------------------------------

test("multímetro: el voltímetro sobre R2 marca +8 V y el amperímetro en serie +4 mA", () => {
  const { estado } = EJEMPLOS.find((e) => e.id === "multimetro");
  const hoja = simularHoja(estado);
  assert.equal(hoja.errores.length, 0);
  assert.equal(hoja.lecturas.get("M1").texto, "+8.00 V");
  assert.equal(hoja.lecturas.get("M2").texto, "+4.00 mA");
  assert.equal(hoja.lecturas.get("M1").aviso, null);
  assert.equal(hoja.lecturas.get("M2").aviso, null);
});

test("fusible: con S1 abierto conduce 1 A; al cerrarlo pasan 4 A y se quema", () => {
  const { estado } = EJEMPLOS.find((e) => e.id === "fusible");
  const abierto = simularHoja(estado).resultado;
  const fila = (r, id) => r.components.find((c) => c.id === id);
  cerca(Math.abs(fila(abierto, "F1").current), 1, "1 A por el fusible");
  cerca(fila(abierto, "L1").brightness, 0.8, "la lámpara al 80 %");
  assert.equal(fila(abierto, "F1").blown, false);
  const cerrado = simularHoja(alternarInterruptor(estado, "S1")).resultado;
  assert.equal(fila(cerrado, "F1").blown, true);
  assert.equal(fila(cerrado, "L1").current, 0);
  assert.deepEqual(cerrado.stats.blown_fuses, ["F1"]);
});
