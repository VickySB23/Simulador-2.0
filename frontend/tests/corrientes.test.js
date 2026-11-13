// Corriente en los cables calculada (no asignada a mano) y lámpara/interruptor en el modelo.
import assert from "node:assert/strict";
import { test } from "node:test";

import { PREFIJO_HASH, codificar, decodificar } from "../public/js/lib/compartir.js";
import { corrientesDeTramos } from "../public/js/lib/corrientes.js";
import { EJEMPLOS } from "../public/js/lib/ejemplos.js";
import {
  aLayout, agregarCable, agregarPieza, alternarInterruptor, cambiarPotencia, circuitoVacio, desdeLayout,
  nombreNodo, ponerTierra,
} from "../public/js/lib/modelo.js";
import { armarNetlist, simularEstado } from "../public/js/lib/netlist.js";

const p = (x, y) => ({ x, y });
const ejemplo = (id) => structuredClone(EJEMPLOS.find((e) => e.id === id).estado);
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);

/** KCL en cada punto: lo que entra por los bornes sale por los tramos (cables e interruptores). */
function residuoKcl(estado, resultado, corrientes) {
  const porId = new Map(resultado.components.map((c) => [c.id, c]));
  const balance = new Map();
  const sumar = (q, v) => balance.set(nombreNodo(q), (balance.get(nombreNodo(q)) ?? 0) + v);
  for (const c of estado.components) {
    const i = corrientes.has(c.id) ? corrientes.get(c.id) : porId.get(c.id)?.current ?? 0;
    sumar(c.a, -i);
    sumar(c.b, i);
  }
  return Math.max(0, ...[...balance.values()].map(Math.abs));
}

test("serie: todos los cables llevan la corriente de la fuente, en su sentido", () => {
  const estado = ejemplo("serie");
  const { resultado } = simularEstado(estado);
  const corrientes = corrientesDeTramos(estado, resultado);
  assert.equal(corrientes.size, 6);
  for (const [id, i] of corrientes) cerca(Math.abs(i), 2e-3, id);
  // W1 va de V1 (+, en 6,6) hacia arriba (6,4): la corriente sale por el + y sube.
  cerca(corrientes.get("W1"), 2e-3, "W1 sube desde el + de la batería");
  assert.ok(residuoKcl(estado, resultado, corrientes) < 1e-12);
});

test("paralelo: los cables de los rieles reparten la corriente por KCL", () => {
  const estado = ejemplo("paralelo");
  const { resultado } = simularEstado(estado);
  const c = corrientesDeTramos(estado, resultado);
  // Riel de arriba: de la batería a R1 pasan 22 mA, de R1 a R2 quedan 10 mA y de R2 a R3, 4 mA.
  cerca(c.get("W1"), 22e-3, "W1");
  cerca(c.get("W2"), 10e-3, "W2");
  cerca(c.get("W3"), 4e-3, "W3");
  // Riel de abajo, de vuelta hacia la batería (cables dibujados de izquierda a derecha).
  cerca(c.get("W4"), -22e-3, "W4");
  assert.ok(residuoKcl(estado, resultado, c) < 1e-12);
});

test("TP4 y Wheatstone: KCL se cumple en todos los puntos", () => {
  for (const id of ["tp4", "wheatstone", "dos-mallas", "divisor"]) {
    const estado = ejemplo(id);
    const { resultado } = simularEstado(estado);
    assert.ok(residuoKcl(estado, resultado, corrientesDeTramos(estado, resultado)) < 1e-12, id);
  }
});

test("lazo de cables: se reparte en proporción inversa al largo", () => {
  // Dos caminos de cable entre los mismos puntos: uno de largo 4 y otro de largo 12 (tres tramos).
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(2, 4), 1, "10")); // 2_2 (+) a 2_6
  ({ estado: e } = agregarPieza(e, "resistor", p(14, 4), 1, "10")); // 14_2 a 14_6
  ({ estado: e } = agregarCable(e, p(2, 2), p(10, 2))); // W1
  ({ estado: e } = agregarCable(e, p(10, 2), p(14, 2))); // W2: camino corto
  ({ estado: e } = agregarCable(e, p(10, 2), p(10, 0))); // W3
  ({ estado: e } = agregarCable(e, p(10, 0), p(14, 0))); // W4
  ({ estado: e } = agregarCable(e, p(14, 0), p(14, 2))); // W5 (camino largo: 2 + 4 + 2 = 8)
  ({ estado: e } = agregarCable(e, p(2, 6), p(14, 6))); // W6
  e = ponerTierra(e, p(2, 6)).estado;
  const { resultado } = simularEstado(e);
  const c = corrientesDeTramos(e, resultado);
  cerca(c.get("W1"), 1, "total");
  // Conductancias 1/4 y 1/8: el corto lleva 2/3 y el largo 1/3.
  cerca(c.get("W2"), 2 / 3, "camino corto");
  cerca(c.get("W4"), 1 / 3, "camino largo");
  assert.ok(residuoKcl(e, resultado, c) < 1e-12);
});

test("interruptor cerrado lleva corriente; abierto, no", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(4, 4), 1, "12")); // 4_2 (+) a 4_6
  ({ estado: e } = agregarPieza(e, "switch", p(8, 2), 0)); // 6_2 a 10_2
  ({ estado: e } = agregarPieza(e, "lamp", p(12, 4), 1)); // 12_2 a 12_6 (24 Ω, 6 W)
  ({ estado: e } = agregarCable(e, p(4, 2), p(6, 2)));
  ({ estado: e } = agregarCable(e, p(10, 2), p(12, 2)));
  ({ estado: e } = agregarCable(e, p(4, 6), p(12, 6)));
  e = ponerTierra(e, p(4, 6)).estado;
  let { resultado } = simularEstado(e);
  let c = corrientesDeTramos(e, resultado);
  cerca(c.get("S1"), 0.5, "S1 cerrado");
  cerca(resultado.components.find((x) => x.id === "L1").brightness, 1, "brillo");
  e = alternarInterruptor(e, "S1");
  ({ resultado } = simularEstado(e));
  c = corrientesDeTramos(e, resultado);
  assert.equal(c.has("S1"), false);
  assert.equal(c.get("W1") ?? 0, 0);
  assert.equal(resultado.components.find((x) => x.id === "L1").current, 0);
});

test("lámpara e interruptor en el modelo: ids, netlist, layout y link", async () => {
  let e = circuitoVacio();
  let id;
  ({ estado: e, id } = agregarPieza(e, "lamp", p(6, 6), 0));
  assert.equal(id, "L1");
  ({ estado: e, id } = agregarPieza(e, "switch", p(6, 10), 0));
  assert.equal(id, "S1");
  e = cambiarPotencia(e, "L1", "15");
  e = alternarInterruptor(e, "S1");
  const [lampara, interruptor] = armarNetlist(e).components;
  assert.deepEqual(lampara, { id: "L1", type: "lamp", a: "4_6", b: "8_6", value: "24", rated_power: "15" });
  assert.deepEqual(interruptor, { id: "S1", type: "switch", a: "4_10", b: "8_10", closed: false });
  assert.deepEqual(desdeLayout(JSON.parse(JSON.stringify(aLayout(e)))), e);
  const { estado } = await decodificar(PREFIJO_HASH + await codificar(e, "x"));
  assert.deepEqual(estado, e);
});

test("un link viejo (sin lámparas ni interruptores) se sigue abriendo", async () => {
  const viejo = { components: [], ground: null, counters: { R: 3, V: 1, I: 0, W: 2 } };
  const { estado } = await decodificar(await codificar(viejo, "viejo"));
  assert.deepEqual(estado.counters, { R: 3, V: 1, I: 0, W: 2, L: 0, S: 0, G: 0 });
});
