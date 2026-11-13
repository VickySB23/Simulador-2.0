import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANCHO_MUNDO, LARGO, agregarCable, agregarPieza, aLayout, cambiarValor, circuitoVacio,
  agregarCableEnL, buscar, conectados, desdeLayout, eliminar, estirarCable, insercionEnCable, insertarEnCable, partirCablesEn, tramosEnL, mover, nodosElectricos, ponerTierra,
  restaurar, rotar,
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
  let g;
  ({ estado: e, id: g } = ponerTierra(e, p(3, 5)));
  assert.equal(g, "G1");
  assert.deepEqual(buscar(e, "G1"), { id: "G1", type: "ground", a: p(3, 5), b: p(3, 5) });
  assert.equal(ponerTierra(e, p(3, 5)).estado, e, "dos tierras en el mismo punto no");
  ({ estado: e, id: g } = ponerTierra(e, p(9, 5), { auto: true }));
  assert.equal(buscar(e, g).auto, true);
  assert.equal(mover(e, "G1", 1, 2).components.find((c) => c.id === "G1").b.y, 7);
  assert.equal(eliminar(e, "G1").components.filter((c) => c.type === "ground").length, 1);
});

test("el layout ida y vuelta conserva todo, incluidos tierra y contadores", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 5), 0));
  ({ estado: e } = agregarPieza(e, "resistor", p(5, 9), 0));
  e = eliminar(e, "R1");
  e = ponerTierra(e, p(3, 9)).estado;
  const layout = JSON.parse(JSON.stringify(aLayout(e)));
  assert.deepEqual(desdeLayout(layout), e);
});

test("un layout viejo con una sola tierra la convierte en el componente G1", () => {
  const e = desdeLayout({
    version: 1, ground: p(3, 9), counters: { R: 1 },
    components: [{ id: "R1", type: "resistor", a: p(3, 9), b: p(7, 9), value: "1k" }],
  });
  assert.deepEqual(e.components.map((c) => c.id), ["R1", "G1"]);
  assert.deepEqual(buscar(e, "G1").a, p(3, 9));
  assert.equal(e.counters.G, 1);
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

test("un cable entre puntos no alineados se dobla en L", () => {
  assert.deepEqual(tramosEnL(p(1, 1), p(5, 1)), [[p(1, 1), p(5, 1)]]);
  assert.deepEqual(tramosEnL(p(1, 1), p(5, 4)), [[p(1, 1), p(5, 1)], [p(5, 1), p(5, 4)]]);
  assert.deepEqual(tramosEnL(p(1, 1), p(5, 4), false), [[p(1, 1), p(1, 4)], [p(1, 4), p(5, 4)]]);
  assert.deepEqual(tramosEnL(p(1, 1), p(1, 1)), []);
  const { estado, ids } = agregarCableEnL(circuitoVacio(), p(1, 1), p(5, 4));
  assert.deepEqual(ids, ["W1", "W2"]);
  assert.equal(nodosElectricos(estado).get("1_1"), nodosElectricos(estado).get("5_4"));
});

test("un cable que termina en el medio de otro lo parte y queda conectado", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(0, 4), p(10, 4)));
  ({ estado: e } = agregarCableEnL(e, p(5, 0), p(5, 4)));
  const tramos = e.components.map((c) => `${c.id} ${c.a.x}_${c.a.y}-${c.b.x}_${c.b.y}`);
  assert.deepEqual(tramos, ["W1 0_4-5_4", "W2 5_4-10_4", "W3 5_0-5_4"]);
  const nodos = nodosElectricos(e);
  assert.equal(nodos.get("5_0"), nodos.get("10_4"));
  assert.equal(partirCablesEn(e, p(20, 20)), e);
});

test("estirar la punta de un cable: alineado se alarga, si no se dobla en L", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(2, 2), p(6, 2)));
  const largo = estirarCable(e, "W1", "b", p(9, 2));
  assert.deepEqual(largo.components[0].b, p(9, 2));
  const doblado = estirarCable(e, "W1", "b", p(9, 5));
  assert.deepEqual(doblado.components.map((c) => [c.a, c.b]), [[p(2, 2), p(9, 2)], [p(9, 2), p(9, 5)]]);
  assert.equal(estirarCable(e, "W1", "b", p(2, 2)), e, "sobre el otro extremo no hace nada");
  assert.equal(estirarCable(e, "W1", "b", p(99, 2)), e, "fuera del mundo no hace nada");
});

// Bug: al soltar una resistencia sobre un cable donde no entraba, quedaba encima sin conectar
// ("Circuito 2" con dos bornes sueltos, a veces tapada por la batería).
test("sobre un cable corto donde no entra: no se inserta y explica por qué", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(6, 8), 1)); // 6_6 a 6_10
  ({ estado: e } = agregarCable(e, p(6, 6), p(6, 4))); // el cable corto de la batería (mide 2)
  let id;
  ({ estado: e, id } = agregarPieza(e, "resistor", p(6, 5), 1));
  const r = insercionEnCable(e, id);
  assert.equal(r.estado, e);
  assert.equal(r.sobreCable, true);
  assert.match(r.motivo, /mide 2 y la pieza 4/);
});

test("varios cables alineados cuentan como uno: la pieza entra cruzando la unión entre ellos", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(2, 4), p(6, 4)));
  ({ estado: e } = agregarCable(e, p(6, 4), p(12, 4)));
  let id;
  ({ estado: e, id } = agregarPieza(e, "resistor", p(6, 4), 0));
  e = insertarEnCable(e, id);
  const r = buscar(e, id);
  assert.deepEqual([r.a, r.b], [p(4, 4), p(8, 4)]);
  const cables = e.components.filter((c) => c.type === "wire").map((c) => `${c.a.x}-${c.b.x}`).sort();
  assert.deepEqual(cables, ["2-4", "8-12"]);
});

test("si taparía una unión con otra rama, la pieza se corre a la posición libre más cercana", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarCable(e, p(0, 4), p(6, 4)));
  ({ estado: e } = agregarCable(e, p(6, 4), p(14, 4)));
  ({ estado: e } = agregarCable(e, p(6, 4), p(6, 8))); // rama que baja desde 6_4
  let id;
  ({ estado: e, id } = agregarPieza(e, "resistor", p(6, 4), 0));
  e = insertarEnCable(e, id);
  const r = buscar(e, id);
  assert.deepEqual([r.a, r.b], [p(2, 4), p(6, 4)]);
  // La rama sigue unida a un borne de la pieza.
  assert.ok(nodosElectricos(e).get("6_8") === nodosElectricos(e).get("6_4"));
});

test("en cada ejemplo, soltar una resistencia sobre cualquier punto de un cable la inserta o explica por qué", async () => {
  const { EJEMPLOS } = await import("../public/js/lib/ejemplos.js");
  const { simularHoja } = await import("../public/js/lib/netlist.js");
  for (const ejemplo of EJEMPLOS) {
    for (const w of ejemplo.estado.components.filter((c) => c.type === "wire")) {
      const horizontal = w.a.y === w.b.y;
      const [d, h] = horizontal ? [Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x)] : [Math.min(w.a.y, w.b.y), Math.max(w.a.y, w.b.y)];
      for (let k = d; k <= h; k++) {
        const centro = horizontal ? p(k, w.a.y) : p(w.a.x, k);
        const { estado, id } = agregarPieza(ejemplo.estado, "resistor", centro, horizontal ? 0 : 1);
        if (!id) continue;
        const r = insercionEnCable(estado, id);
        if (r.motivo) continue;
        assert.ok(!simularHoja(r.estado).sinConectar.has(id), `${ejemplo.id}: ${w.id} en ${k}`);
      }
    }
  }
});
