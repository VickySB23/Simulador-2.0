import assert from "node:assert/strict";
import { test } from "node:test";

import { agregarCable, agregarPieza, circuitoVacio, ponerTierra } from "../public/js/lib/modelo.js";
import {
  armarNetlist, colorTension, problemaLocal, puntosDeEtiqueta, sentidoCorriente, simularEstado,
} from "../public/js/lib/netlist.js";
import { EJEMPLOS } from "../public/js/lib/ejemplos.js";

const p = (x, y) => ({ x, y });

function divisorChico() {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(4, 5), 1)); // a 4_3 (+), b 4_7
  ({ estado: e } = agregarPieza(e, "resistor", p(6, 3), 0)); // 4_3 a 8_3
  ({ estado: e } = agregarPieza(e, "resistor", p(8, 5), 1)); // 8_3 a 8_7
  ({ estado: e } = agregarCable(e, p(4, 7), p(8, 7)));
  return ponerTierra(e, p(4, 7));
}

test("el netlist usa x_y como nombre de nodo y la tierra marcada", () => {
  const netlist = armarNetlist(divisorChico());
  assert.equal(netlist.ground, "4_7");
  assert.deepEqual(netlist.components[0], { id: "V1", type: "voltage_source", a: "4_3", b: "4_7", value: "10" });
  assert.deepEqual(netlist.components[1], { id: "R1", type: "resistor", a: "4_3", b: "8_3", value: "1k" });
  assert.deepEqual(netlist.components[3], { id: "W1", type: "wire", a: "4_7", b: "8_7" });
});

test("los valores se mandan con punto decimal", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 5), 0, "4,7k"));
  assert.equal(armarNetlist(e).components[0].value, "4.7k");
});

test("sin tierra se manda '0' para que el simulador responda no_ground", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 5), 0));
  assert.equal(armarNetlist(e).ground, "0");
});

test("problemas locales antes de llamar al simulador", () => {
  assert.equal(problemaLocal(circuitoVacio()).code, "empty");
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(1, 1), p(1, 3)));
  assert.equal(problemaLocal(e).code, "empty");
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 5), 0));
  assert.equal(problemaLocal(e).code, "no_ground");
  e = ponerTierra(e, p(20, 20));
  assert.match(problemaLocal(e).message, /no toca/);
  assert.equal(problemaLocal(divisorChico()), null);
});

test("una etiqueta de tensión por nodo eléctrico, sin la tierra", () => {
  const puntos = puntosDeEtiqueta(divisorChico());
  assert.deepEqual(puntos.sort((u, v) => u.x - v.x), [p(4, 3), p(8, 3)]);
});

test("la etiqueta de tensión prefiere una esquina de cables antes que el borne de una pieza", () => {
  const divisor = EJEMPLOS.find((e) => e.id === "divisor").estado;
  const puntos = puntosDeEtiqueta(divisor).sort((u, v) => u.x - v.x);
  // Nodo de arriba a la izquierda: esquina 6_4; nodo del medio: esquina 18_4, no el borne 14_4 de R1.
  assert.deepEqual(puntos, [p(6, 4), p(18, 4)]);
});

test("la flecha sigue el signo de la corriente", () => {
  const r = { a: p(0, 0), b: p(4, 0) };
  assert.deepEqual(sentidoCorriente(r, 0.5), { desde: r.a, hasta: r.b, magnitud: 0.5 });
  assert.deepEqual(sentidoCorriente(r, -2), { desde: r.b, hasta: r.a, magnitud: 2 });
  assert.equal(sentidoCorriente(r, 0), null);
  assert.equal(sentidoCorriente(r, null), null);
});

test("color de tensión: azul en el mínimo, rojo en el máximo", () => {
  assert.equal(colorTension(0, 0, 10), "hsl(220 75% 50%)");
  assert.equal(colorTension(10, 0, 10), "hsl(0 75% 50%)");
  assert.equal(colorTension(5, 5, 5), "hsl(110 75% 50%)");
});

test("simularEstado: resultado o error con códigos del motor", () => {
  const ok = simularEstado(divisorChico());
  assert.ok(ok.resultado && !ok.error);
  let e = divisorChico();
  ({ estado: e } = agregarPieza(e, "resistor", p(20, 20), 0)); // 18_20 a 22_20, suelta
  const { error } = simularEstado(e);
  assert.equal(error.code, "floating_nodes");
  assert.deepEqual(error.details.nodes, ["18_20", "22_20"]);
  assert.equal(simularEstado(circuitoVacio()).error.code, "empty");
});

test("los ejemplos precargados no tienen problemas locales", () => {
  for (const ejemplo of EJEMPLOS) {
    assert.equal(problemaLocal(ejemplo.estado), null, ejemplo.nombre);
  }
});

test("el ejemplo del TP4 arma el circuito del ejercicio", () => {
  const tp4 = EJEMPLOS.find((e) => e.id === "tp4");
  const netlist = armarNetlist(tp4.estado);
  const piezas = netlist.components.filter((c) => c.type !== "wire");
  assert.deepEqual(piezas.map((c) => [c.id, c.value]),
    [["V1", "60"], ["R1", "3"], ["R2", "12"], ["R3", "6"], ["R4", "4"]]);
});
