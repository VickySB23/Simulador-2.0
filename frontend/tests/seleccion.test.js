import assert from "node:assert/strict";
import { test } from "node:test";

import { agregarCable, agregarPieza, circuitoVacio, ponerTierra } from "../public/js/lib/modelo.js";
import {
  SELECCION_VACIA, alternarEnSeleccion, copiarSeleccion, eliminarSeleccion, moverSeleccion, pegar,
  rotarSeleccion, seleccionEnRectangulo, seleccionVacia, unirSelecciones,
} from "../public/js/lib/seleccion.js";

const p = (x, y) => ({ x, y });

function circuito() {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(4, 5), 1)); // V1 4_3 a 4_7
  ({ estado: e } = agregarPieza(e, "resistor", p(6, 3), 0)); // R1 4_3 a 8_3
  ({ estado: e } = agregarCable(e, p(4, 7), p(8, 7))); // W1
  return ponerTierra(e, p(4, 7));
}

test("Ctrl+clic agrega y saca de la selección", () => {
  let s = alternarEnSeleccion(SELECCION_VACIA, { tipo: "componente", id: "R1" });
  s = alternarEnSeleccion(s, { tipo: "componente", id: "V1" });
  s = alternarEnSeleccion(s, { tipo: "tierra" });
  assert.deepEqual(s, { ids: ["R1", "V1"], tierra: true });
  s = alternarEnSeleccion(s, { tipo: "componente", id: "R1" });
  assert.deepEqual(s, { ids: ["V1"], tierra: true });
  assert.ok(seleccionVacia(SELECCION_VACIA));
  assert.ok(!seleccionVacia(s));
});

test("el rectángulo toma lo que cae entero adentro, y se puede sumar", () => {
  const e = circuito();
  assert.deepEqual(seleccionEnRectangulo(e, p(3, 2), p(9, 4)), { ids: ["R1"], tierra: false });
  assert.deepEqual(seleccionEnRectangulo(e, p(9, 8), p(3, 6)), { ids: ["W1"], tierra: true });
  const ambas = unirSelecciones({ ids: ["R1"], tierra: false }, { ids: ["W1", "R1"], tierra: true });
  assert.deepEqual(ambas, { ids: ["R1", "W1"], tierra: true });
});

test("mover en grupo: todo o nada", () => {
  const e = circuito();
  const sel = { ids: ["V1", "W1"], tierra: true };
  const movido = moverSeleccion(e, sel, 2, 1);
  assert.deepEqual(movido.components.find((c) => c.id === "V1").a, p(6, 4));
  assert.deepEqual(movido.ground, p(6, 8));
  assert.deepEqual(movido.components.find((c) => c.id === "R1"), e.components.find((c) => c.id === "R1"));
  assert.equal(moverSeleccion(e, sel, -10, 0), e); // se saldría del mundo
});

test("rotar en grupo gira 90° alrededor del centro y queda en la grilla", () => {
  const e = circuito();
  const girado = rotarSeleccion(e, { ids: ["R1"], tierra: false });
  const r1 = girado.components.find((c) => c.id === "R1");
  assert.deepEqual([r1.a, r1.b], [p(6, 1), p(6, 5)]);
  const todo = rotarSeleccion(e, { ids: ["V1", "R1", "W1"], tierra: true });
  for (const c of todo.components) for (const q of [c.a, c.b]) assert.ok(Number.isInteger(q.x) && Number.isInteger(q.y));
  // Cuatro giros vuelven al lugar.
  let vuelta = e;
  for (let i = 0; i < 4; i++) vuelta = rotarSeleccion(vuelta, { ids: ["V1", "R1", "W1"], tierra: true });
  assert.deepEqual(vuelta.components, e.components);
});

test("borrar en grupo, con la tierra", () => {
  const e = eliminarSeleccion(circuito(), { ids: ["R1", "W1"], tierra: true });
  assert.deepEqual(e.components.map((c) => c.id), ["V1"]);
  assert.equal(e.ground, null);
});

test("copiar y pegar: ids nuevos, corridos y seleccionados", () => {
  const e = circuito();
  const copia = copiarSeleccion(e, { ids: ["R1", "W1"], tierra: true });
  assert.equal(copia.length, 2);
  const { estado, seleccion } = pegar(e, copia);
  assert.deepEqual(seleccion, { ids: ["R2", "W2"], tierra: false });
  assert.deepEqual(estado.components.find((c) => c.id === "R2").a, p(6, 5));
  assert.equal(estado.components.length, 5);
  // Otra vez: los contadores siguen creciendo.
  assert.deepEqual(pegar(estado, copia).seleccion.ids, ["R3", "W3"]);
  // Cerca del borde, el corrimiento se acomoda para que entre.
  const borde = pegar(e, copia, { x: 100, y: 0 });
  for (const c of borde.estado.components) assert.ok(c.b.x <= 48 && c.a.x <= 48);
});
