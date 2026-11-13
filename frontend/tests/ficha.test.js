import assert from "node:assert/strict";
import { test } from "node:test";

import { avisoCorrienteBaja, corrienteNominal, fichaDe, resumenFlotante } from "../public/js/lib/ficha.js";

const lampara = { id: "L2", type: "lamp", value: "3", potencia: "48", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };

test("corriente nominal de una lámpara: √(Pnom / R)", () => {
  assert.equal(corrienteNominal(lampara), 4);
  assert.equal(corrienteNominal({ ...lampara, value: "24", potencia: "6" }), 0.5);
  assert.equal(corrienteNominal({ ...lampara, value: "x" }), null);
});

test("una lámpara conectada que brilla menos del 2 % avisa que la corriente es baja", () => {
  const fila = { id: "L2", current: 0.4444, power: 0.5925, brightness: 0.0123, burned: false, voltage: 1.33 };
  assert.equal(avisoCorrienteBaja(lampara, fila),
    "La corriente es muy baja para esta lámpara (444 mA de 4.00 A nominales).");
  const ficha = fichaDe(lampara, fila);
  assert.deepEqual(ficha.avisos.map((a) => a.texto), [avisoCorrienteBaja(lampara, fila)]);
  assert.ok(ficha.filas.some(([k, v]) => k === "Brillo" && v === "1 %"));
});

test("no avisa si brilla bien, si no circula corriente, si está quemada o sin conectar", () => {
  assert.equal(avisoCorrienteBaja(lampara, { current: 4, brightness: 1, burned: false }), null);
  assert.equal(avisoCorrienteBaja(lampara, { current: 0, brightness: 0, burned: false }), null);
  assert.equal(avisoCorrienteBaja(lampara, { current: 0, brightness: 0, burned: true }), null);
  assert.equal(avisoCorrienteBaja(lampara, { current: 0, brightness: 0, unconnected: true }), null);
  assert.equal(avisoCorrienteBaja(lampara, undefined), null);
});

test("la ficha avisa los bornes sin conectar y las lámparas quemadas", () => {
  const suelta = fichaDe({ id: "R5", type: "resistor", value: "1k", a: {}, b: {} },
    { current: 0, power: 0, voltage: null, unconnected: true });
  assert.equal(suelta.titulo, "R5 · Resistencia");
  assert.match(suelta.avisos[0].texto, /sin conectar/);
  assert.ok(suelta.filas.some(([k, v]) => k === "Tensión" && v === "—"));
  const quemada = fichaDe(lampara, { current: 0, power: 0, voltage: 12, brightness: 0, burned: true });
  assert.equal(quemada.avisos[0].tipo, "error");
  assert.ok(quemada.filas.some(([k, v]) => k === "Brillo" && v === "quemada"));
  const interruptor = fichaDe({ id: "S1", type: "switch", closed: false, a: {}, b: {} }, undefined);
  assert.deepEqual(interruptor.filas, [["Estado", "abierto"]]);
});

test("resumen al pasar el mouse: tensión y corriente de piezas y cables", () => {
  const r = { id: "R1", type: "resistor", value: "1k" };
  assert.deepEqual(resumenFlotante(r, { fila: { voltage: 4, current: -0.004 } }),
    { titulo: "R1 · Resistencia", detalle: "4.00 V · 4.00 mA" });
  assert.deepEqual(resumenFlotante({ id: "W3", type: "wire" }, { tension: 8, corriente: 0.002 }),
    { titulo: "Cable W3", detalle: "8.00 V respecto de GND · 2.00 mA" });
  assert.equal(resumenFlotante({ id: "S1", type: "switch", closed: false }, { tension: 12, corriente: 0 }).detalle,
    "abierto · 12.0 V respecto de GND · 0 A");
  assert.match(resumenFlotante(lampara, { fila: { voltage: 1.33, current: 0.444, brightness: 0.012 } }).detalle, /brillo 1 %/);
  assert.equal(resumenFlotante(r, { fila: { unconnected: true } }).detalle, "Sin conectar: no circula corriente");
  assert.equal(resumenFlotante(r, {}).detalle, null);
});
