import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VELOCIDAD_MAX, VELOCIDAD_MIN, brilloLampara, calorResistencia, colorTension, duracionCiclo,
  entregaEnergia, posicionTension, velocidadCorriente,
} from "../public/js/lib/animacion.js";

test("velocidad de los puntos en escala logarítmica", () => {
  assert.equal(velocidadCorriente(0), 0);
  assert.equal(velocidadCorriente(null), 0);
  assert.equal(velocidadCorriente(1e-10), 0);
  assert.equal(velocidadCorriente(1e-7), VELOCIDAD_MIN);
  assert.equal(velocidadCorriente(1e-6), VELOCIDAD_MIN);
  assert.equal(velocidadCorriente(10), VELOCIDAD_MAX);
  assert.equal(velocidadCorriente(1000), VELOCIDAD_MAX);
  // El signo no cambia la velocidad (el sentido lo da el dibujo).
  assert.equal(velocidadCorriente(-0.01), velocidadCorriente(0.01));
  // Cada década suma lo mismo.
  const a = velocidadCorriente(1e-3);
  const b = velocidadCorriente(1e-2);
  const c = velocidadCorriente(1e-1);
  assert.ok(Math.abs((b - a) - (c - b)) < 1e-9);
  assert.ok(Math.abs((b - a) - (VELOCIDAD_MAX - VELOCIDAD_MIN) / 7) < 1e-9);
});

test("duración del ciclo de puntos", () => {
  assert.equal(duracionCiclo(0), null);
  assert.ok(Math.abs(duracionCiclo(10, 14) - 14 / VELOCIDAD_MAX) < 1e-12);
  assert.ok(duracionCiclo(1e-6) > duracionCiclo(1));
});

test("brillo de la lámpara proporcional a P/Pnom y quemada si P > Pnom", () => {
  assert.deepEqual(brilloLampara(0, 5), { brillo: 0, quemada: false, relacion: 0 });
  assert.deepEqual(brilloLampara(2.5, 5), { brillo: 0.5, quemada: false, relacion: 0.5 });
  assert.equal(brilloLampara(5, 5).quemada, false);
  assert.deepEqual(brilloLampara(7.5, 5), { brillo: 1, quemada: true, relacion: 1.5 });
  assert.equal(brilloLampara(-1, 5).brillo, 0);
  assert.throws(() => brilloLampara(1, 0), /nominal/);
});

test("calor de la resistencia relativo a la que más disipa", () => {
  assert.equal(calorResistencia(0, 10), 0);
  assert.equal(calorResistencia(10, 10), 1);
  assert.equal(calorResistencia(2.5, 10), 0.5);
  assert.equal(calorResistencia(0.1, 10), 0);
  assert.equal(calorResistencia(1, 0), 0);
});

test("color de cable: azul oscuro en la mínima, rojo en la máxima, con tokens", () => {
  assert.equal(colorTension(0, 0, 12), "var(--tension-0)");
  assert.equal(colorTension(12, 0, 12), "var(--tension-4)");
  assert.equal(colorTension(6, 0, 12), "var(--tension-2)");
  assert.equal(colorTension(4.5, 0, 12), "color-mix(in oklab, var(--tension-2) 50%, var(--tension-1))");
  assert.equal(colorTension(5, 5, 5), "var(--tension-2)");
  assert.equal(posicionTension(-1, 0, 10), 0);
  assert.equal(posicionTension(20, 0, 10), 1);
});

test("una fuente entrega energía si su potencia es negativa", () => {
  assert.equal(entregaEnergia(-0.048), true);
  assert.equal(entregaEnergia(0.01), false);
  assert.equal(entregaEnergia(0), false);
});
