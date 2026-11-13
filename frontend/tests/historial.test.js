import assert from "node:assert/strict";
import { test } from "node:test";

import { Historial } from "../public/js/lib/historial.js";
import { agregarPieza, circuitoVacio, ponerTierra } from "../public/js/lib/modelo.js";

const p = (x, y) => ({ x, y });

test("deshacer y rehacer recorren los estados en orden", () => {
  const h = new Historial();
  const e0 = circuitoVacio();
  const e1 = agregarPieza(e0, "resistor", p(5, 5), 0).estado;
  h.registrar(e0);
  const e2 = agregarPieza(e1, "resistor", p(5, 9), 0).estado;
  h.registrar(e1);

  assert.deepEqual(h.deshacer(e2), e1);
  assert.deepEqual(h.deshacer(e1), e0);
  assert.equal(h.deshacer(e0), null);
  // El bug de Simulador-2.0: rehacer devolvía el estado anterior en vez del deshecho.
  assert.deepEqual(h.rehacer(e0), e1);
  assert.deepEqual(h.rehacer(e1), e2);
  assert.equal(h.rehacer(e2), null);
});

test("deshacer restaura la tierra", () => {
  const h = new Historial();
  const sinTierra = agregarPieza(circuitoVacio(), "resistor", p(5, 5), 0).estado;
  const conTierra = ponerTierra(sinTierra, p(3, 5)).estado;
  h.registrar(sinTierra);
  const otra = ponerTierra(conTierra, p(7, 5)).estado;
  h.registrar(conTierra);
  const tierras = (e) => e.components.filter((c) => c.type === "ground").map((c) => c.a);

  assert.deepEqual(tierras(h.deshacer(otra)), [p(3, 5)]);
  assert.deepEqual(tierras(h.deshacer(conTierra)), []);
  assert.deepEqual(tierras(h.rehacer(sinTierra)), [p(3, 5)]);
});

test("un cambio nuevo descarta lo que se podía rehacer", () => {
  const h = new Historial();
  const e0 = circuitoVacio();
  const e1 = agregarPieza(e0, "resistor", p(5, 5), 0).estado;
  h.registrar(e0);
  h.deshacer(e1);
  assert.ok(h.puedeRehacer);
  h.registrar(e0);
  assert.ok(!h.puedeRehacer);
});

test("las instantáneas son copias: mutar el estado después no las altera", () => {
  const h = new Historial();
  const e0 = agregarPieza(circuitoVacio(), "resistor", p(5, 5), 0).estado;
  h.registrar(e0);
  e0.components[0].value = "999";
  assert.equal(h.deshacer(e0).components[0].value, "1k");
});

test("respeta el límite de pasos", () => {
  const h = new Historial(3);
  for (let i = 0; i < 5; i++) h.registrar({ i });
  assert.equal(h.pilaDeshacer.length, 3);
  assert.deepEqual(h.deshacer({ i: 5 }), { i: 4 });
});
