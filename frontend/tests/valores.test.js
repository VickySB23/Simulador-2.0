import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatearCompacto, formatearSI, interpretarValor, normalizarTexto,
} from "../public/js/lib/valores.js";

test("interpreta números y prefijos como el backend", () => {
  const casos = [
    [10, 10], ["10", 10], ["10k", 10e3], ["4.7k", 4.7e3], ["5m", 5e-3], ["1MEG", 1e6],
    ["1M", 1e6], ["2.2u", 2.2e-6], ["10 kΩ", 10e3], ["5mA", 5e-3], ["12V", 12], ["-3", -3],
    [".5k", 500], ["1e3", 1000],
  ];
  for (const [entrada, esperado] of casos) {
    assert.ok(Math.abs(interpretarValor(entrada) - esperado) < 1e-12 * Math.max(1, esperado),
      `${entrada} -> ${interpretarValor(entrada)}`);
  }
});

test("acepta coma decimal", () => {
  assert.equal(interpretarValor("4,7k"), 4700);
  assert.equal(normalizarTexto(" 4,7k "), "4.7k");
});

test("rechaza textos inválidos", () => {
  for (const entrada of ["", "abc", "10x", "k10", "1..2", null, Infinity]) {
    assert.throws(() => interpretarValor(entrada), /inválido|finito/, String(entrada));
  }
});

test("formato compacto para las etiquetas del editor", () => {
  assert.equal(formatearCompacto(4700, "Ω"), "4.7 kΩ");
  assert.equal(formatearCompacto(3, "Ω"), "3 Ω");
  assert.equal(formatearCompacto(60, "V"), "60 V");
  assert.equal(formatearCompacto(0.0125, "A"), "12.5 mA");
  assert.equal(formatearCompacto(100, "Ω"), "100 Ω");
  assert.equal(formatearCompacto(-1.5, "A"), "-1.5 A");
});

test("formatea con prefijo SI y tres cifras", () => {
  assert.equal(formatearSI(0.0032, "A"), "3.20 mA");
  assert.equal(formatearSI(4700, "Ω"), "4.70 kΩ");
  assert.equal(formatearSI(30, "V"), "30.0 V");
  assert.equal(formatearSI(-12.5, "A"), "-12.5 A");
  assert.equal(formatearSI(0, "V"), "0 V");
  assert.equal(formatearSI(1e-16, "V"), "0 V");
  assert.equal(formatearSI(999.99, "V"), "1.00 kV");
  assert.equal(formatearSI(null, "V"), "—");
});
