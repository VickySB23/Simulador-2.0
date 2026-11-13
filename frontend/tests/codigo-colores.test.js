import assert from "node:assert/strict";
import { test } from "node:test";

import { codigoDeColores, textoDeOhmios } from "../public/js/lib/codigo-colores.js";

const bandas = (ohmios) => codigoDeColores(ohmios).bandas.join("-");

test("4 bandas: dos cifras, multiplicador y tolerancia dorada", () => {
  assert.equal(bandas(4700), "amarillo-violeta-rojo-dorado");
  assert.equal(bandas(1000), "marrón-negro-rojo-dorado");
  assert.equal(bandas(100), "marrón-negro-marrón-dorado");
  assert.equal(bandas(12), "marrón-rojo-negro-dorado");
  assert.equal(bandas(3), "naranja-negro-dorado-dorado");
  assert.equal(bandas(0.47), "amarillo-violeta-plata-dorado");
  assert.equal(bandas(1e6), "marrón-negro-verde-dorado");
  assert.equal(bandas(2.2e6), "rojo-rojo-verde-dorado");
});

test("5 bandas si el valor tiene 3 cifras significativas (tolerancia marrón, ±1 %)", () => {
  assert.equal(bandas(4750), "amarillo-violeta-verde-marrón-marrón");
  assert.equal(bandas(1.27e5), "marrón-rojo-violeta-naranja-marrón");
  assert.equal(bandas(3.3e3 + 10), "naranja-naranja-marrón-marrón-marrón"); // 3310 = 331 × 10
  assert.equal(codigoDeColores(4750).porcentaje, 1);
});

test("la lectura dice colores, cifras, multiplicador y valor", () => {
  assert.equal(codigoDeColores(4700).lectura, "amarillo-violeta-rojo = 47 × 100 = 4,7 kΩ");
  assert.equal(codigoDeColores(4750).lectura, "amarillo-violeta-verde-marrón = 475 × 10 = 4,75 kΩ");
  assert.equal(codigoDeColores(1e6).lectura, "marrón-negro-verde = 10 × 10⁵ = 1 MΩ");
  assert.equal(codigoDeColores(3).lectura, "naranja-negro-dorado = 30 × 0,1 = 3 Ω");
  assert.equal(codigoDeColores(47000).lectura, "amarillo-violeta-naranja = 47 × 1.000 = 47 kΩ");
});

test("un valor que no entra en el código se redondea y queda marcado como aproximado", () => {
  const c = codigoDeColores(4753);
  assert.equal(c.aproximado, true);
  assert.equal(c.bandas.join("-"), "amarillo-violeta-verde-marrón-marrón");
  assert.match(c.lectura, /≈ 4,75 kΩ$/);
  assert.equal(codigoDeColores(0), null);
  assert.equal(codigoDeColores(-5), null);
});

test("valores con prefijo y coma decimal", () => {
  assert.equal(textoDeOhmios(4700), "4,7 kΩ");
  assert.equal(textoDeOhmios(0.47), "0,47 Ω");
  assert.equal(textoDeOhmios(2.2e6), "2,2 MΩ");
});
