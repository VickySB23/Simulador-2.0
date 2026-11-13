import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANCHO_MUNDO, LARGO, agregarCable, agregarPieza, aLayout, cambiarValor, circuitoVacio,
  conectados, desdeLayout, eliminar, insertarEnCable, mover, moverTierra, nodosElectricos, ponerTierra,
  quitarTierra, restaurar, rotar,
} from "../public/js/lib/modelo.js";

const p = (x, y) => ({ x, y });

test("una pieza mide LARGO y se centra en el punto", () => {
  const { estado, id } = agregarPieza(circuitoVacio(), "resistor", p(10, 5), 0);
  assert.equal(id, "R1");
  const [r] = estado.components;
  assert.deepEqual(r.a, p(10 - LARGO / 2, 5));
  assert.deepEqual(r.b, p(10 + LARGO / 2, 5));
  assert.equal(r.value, "1k");
});

test("los ids no se repiten aunque se borre", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 5), 0));
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 10), 0));
  e = eliminar(e, "R2");
  let id;
  ({ estado: e, id } = agregarPieza(e, "resistor", p(5, 15), 0));
  assert.equal(id, "R3");
  ({ estado: e, id } = agregarCable(e, p(1, 1), p(1, 3)));
  assert.equal(id, "W1");
  ({ estado: e, id } = agregarPieza(e, "voltage_source", p(10, 10), 1));
  assert.equal(id, "V1");
  assert.deepEqual(e.components.map((c) => c.id), ["R1", "R3", "W1", "V1"]);
});

test("restaurar desde el historial conserva los contadores: deshacer no libera ids", () => {
  const antes = circuitoVacio();
  const { estado: despues } = agregarPieza(antes, "resistor", p(5, 5), 0);
  const deshecho = restaurar(despues, antes);
  assert.equal(deshecho.components.length, 0);
  const { id } = agregarPieza(deshecho, "resistor", p(5, 5), 0);
  assert.equal(id, "R2");
});

test("dos terminales en el mismo punto están conectados", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(6, 4), 0)); // 4_4 a 8_4
  ({ estado: e } = agregarPieza(e, "resistor", p(10, 4), 0)); // 8_4 a 12_4
  assert.ok(conectados(e, p(8, 4), p(8, 4)));
  const nodos = nodosElectricos(e);
  assert.equal(nodos.size, 3);
});

test("un cable une dos puntos; un cable que pasa por encima de otro punto no lo conecta", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(6, 4), 0)); // 4_4 a 8_4
  ({ estado: e } = agregarPieza(e, "resistor", p(6, 10), 0)); // 4_10 a 8_10
  assert.ok(!conectados(e, p(8, 4), p(8, 10)));
  ({ estado: e } = agregarCable(e, p(8, 4), p(8, 10)));
  assert.ok(conectados(e, p(8, 4), p(8, 10)));
  // El cable pasa por 8_7, pero ahí no hay terminal: no es un nodo.
  assert.equal(nodosElectricos(e).has("8_7"), false);
  assert.ok(!conectados(e, p(4, 4), p(4, 10)));
});

test("cables encadenados forman un solo nodo", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(1, 1), p(2, 1)));
  ({ estado: e } = agregarCable(e, p(2, 1), p(3, 1)));
  ({ estado: e } = agregarCable(e, p(5, 5), p(3, 1)));
  const nodos = nodosElectricos(e);
  assert.equal(new Set(nodos.values()).size, 1);
});

test("no se agregan cables de largo cero ni repetidos", () => {
  let e = circuitoVacio();
  assert.equal(agregarCable(e, p(1, 1), p(1, 1)).id, null);
  ({ estado: e } = agregarCable(e, p(1, 1), p(1, 4)));
  assert.equal(agregarCable(e, p(1, 4), p(1, 1)).id, null);
});

test("rotar gira alrededor del centro; los cables no rotan", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(10, 10), 0));
  e = rotar(e, "V1");
  assert.deepEqual(e.components[0].a, p(10, 8));
  assert.deepEqual(e.components[0].b, p(10, 12));
  e = rotar(rotar(rotar(e, "V1"), "V1"), "V1");
  assert.deepEqual(e.components[0].a, p(8, 10));
  ({ estado: e } = agregarCable(e, p(1, 1), p(1, 4)));
  assert.equal(rotar(e, "W1"), e);
});

test("mover respeta los bordes del mundo", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(2, 2), 0));
  assert.equal(mover(e, "R1", -1, 0), e);
  assert.deepEqual(mover(e, "R1", 3, 1).components[0].a, p(3, 3));
  assert.equal(agregarPieza(e, "resistor", p(ANCHO_MUNDO, 2), 0).id, null);
});

test("cambiar valor, tierra y operaciones sin efecto devuelven el mismo objeto", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 5), 0));
  e = cambiarValor(e, "R1", "4.7k");
  assert.equal(e.components[0].value, "4.7k");
  assert.equal(cambiarValor(e, "R1", "4.7k"), e);
  assert.equal(eliminar(e, "R9"), e);
  e = ponerTierra(e, p(3, 5));
  assert.deepEqual(e.ground, p(3, 5));
  assert.equal(ponerTierra(e, p(3, 5)), e);
  assert.deepEqual(moverTierra(e, 1, 2).ground, p(4, 7));
  assert.equal(quitarTierra(e).ground, null);
});

test("el layout ida y vuelta conserva todo, incluidos tierra y contadores", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 5), 0));
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 9), 0));
  e = eliminar(e, "R1");
  e = ponerTierra(e, p(3, 9));
  const layout = JSON.parse(JSON.stringify(aLayout(e)));
  assert.deepEqual(desdeLayout(layout), e);
});

test("desdeLayout corrige contadores menores que los ids y rechaza formatos desconocidos", () => {
  const layout = {
    version: 1, ground: null, counters: { R: 0 },
    components: [{ id: "R7", type: "resistor", a: p(1, 1), b: p(5, 1), value: "1k" }],
  };
  assert.equal(desdeLayout(layout).counters.R, 7);
  assert.throws(() => desdeLayout(null), /layout/);
  assert.throws(() => desdeLayout({ version: 99, components: [] }), /layout/);
  assert.throws(() => desdeLayout({ version: 1, components: [{ id: "X", type: "diodo" }] }), /inválido/);
});

test("soltar una pieza sobre un cable la inserta en serie", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(2, 4), p(12, 4)));
  let id;
  ({ estado: e, id } = agregarPieza(e, "resistor", p(6, 4), 0)); // 4_4 a 8_4, sobre el cable
  e = insertarEnCable(e, id);
  const cables = e.components.filter((c) => c.type === "wire");
  assert.deepEqual(cables.map((c) => [c.a, c.b]), [[p(2, 4), p(4, 4)], [p(8, 4), p(12, 4)]]);
  assert.equal(new Set(e.components.map((c) => c.id)).size, e.components.length);
  // Ya no hay un cable que la puentee: entre sus bornes hay dos nodos distintos.
  const nodos = nodosElectricos(e);
  assert.notEqual(nodos.get("4_4"), nodos.get("8_4"));
});

test("una pieza girada se acuesta sobre el cable; si toca un extremo, el cable se acorta", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(4, 2), p(4, 10)));
  let id;
  ({ estado: e, id } = agregarPieza(e, "lamp", p(4, 4), 0)); // horizontal, centro sobre un cable vertical
  e = insertarEnCable(e, id);
  const lampara = e.components.find((c) => c.id === id);
  assert.deepEqual([lampara.a, lampara.b], [p(4, 2), p(4, 6)]);
  const cables = e.components.filter((c) => c.type === "wire");
  assert.deepEqual(cables.map((c) => [c.a, c.b]), [[p(4, 6), p(4, 10)]]);
});

test("si la pieza no entra en el cable o no está encima, no cambia nada", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(2, 4), p(4, 4)));
  let id;
  ({ estado: e, id } = agregarPieza(e, "resistor", p(3, 4), 0));
  assert.equal(insertarEnCable(e, id), e);
  ({ estado: e, id } = agregarPieza(e, "resistor", p(10, 10), 0));
  assert.equal(insertarEnCable(e, id), e);
});
