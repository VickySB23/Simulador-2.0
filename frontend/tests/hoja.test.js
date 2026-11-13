// Varios circuitos en la misma hoja, cada uno calculado por separado, y la tierra automática.
import assert from "node:assert/strict";
import { test } from "node:test";

import { agregarCable, agregarPieza, circuitoVacio, eliminar, mover, ponerTierra } from "../public/js/lib/modelo.js";
import {
  circuitosDe, conTierrasAutomaticas, recordarTierrasBorradas, simularHoja,
} from "../public/js/lib/netlist.js";

const p = (x, y) => ({ x, y });

/** Batería vertical con + arriba en (x, y) y − en (x, y + 4), y una resistencia que la cierra. */
function malla(e, x, y, valor = "10") {
  ({ estado: e } = agregarPieza(e, "voltage_source", p(x, y + 2), 1, valor)); // a (+) arriba, b (−) abajo
  ({ estado: e } = agregarPieza(e, "resistor", p(x + 4, y + 2), 1, "1k"));
  ({ estado: e } = agregarCable(e, p(x, y), p(x + 4, y)));
  ({ estado: e } = agregarCable(e, p(x, y + 4), p(x + 4, y + 4)));
  return e;
}

test("los circuitos se numeran de izquierda a derecha y cada tierra va con el suyo", () => {
  let e = malla(malla(circuitoVacio(), 20, 2), 2, 2);
  e = ponerTierra(e, p(2, 6)).estado;
  const circuitos = circuitosDe(e);
  assert.equal(circuitos.length, 2);
  assert.deepEqual(circuitos.map((c) => c.caja.x1), [2, 20]);
  assert.ok(circuitos[0].ids.includes("G1") && circuitos[0].conTierra);
  assert.ok(!circuitos[1].conTierra);
});

test("la tierra automática va en el borne − de la batería, una por circuito", () => {
  const e = malla(malla(circuitoVacio(), 2, 2), 20, 2, "5");
  const { estado, colocadas } = conTierrasAutomaticas(e);
  assert.deepEqual(colocadas.map((c) => [c.numero, c.fuente]), [[1, "V1"], [2, "V2"]]);
  const tierras = estado.components.filter((c) => c.type === "ground");
  assert.deepEqual(tierras.map((t) => [t.a, t.auto]), [[p(2, 6), true], [p(20, 6), true]]);
  // Si ya tienen, no cambia nada: el mismo objeto.
  assert.equal(conTierrasAutomaticas(estado).estado, estado);
});

test("cada circuito se calcula por separado: un lazo de fuentes no frena al otro", () => {
  let e = malla(circuitoVacio(), 2, 2);
  // Segundo circuito: dos baterías en paralelo (lazo de fuentes de tensión).
  ({ estado: e } = agregarPieza(e, "voltage_source", p(20, 4), 1, "5"));
  ({ estado: e } = agregarPieza(e, "voltage_source", p(24, 4), 1, "6"));
  ({ estado: e } = agregarCable(e, p(20, 2), p(24, 2)));
  ({ estado: e } = agregarCable(e, p(20, 6), p(24, 6)));
  e = conTierrasAutomaticas(e).estado;
  const hoja = simularHoja(e);
  assert.equal(hoja.circuitos.length, 2);
  assert.ok(hoja.circuitos[0].resultado, "el primero da resultados");
  assert.equal(hoja.circuitos[1].error.code, "voltage_source_loop");
  assert.deepEqual(hoja.errores.map((x) => [x.numero, x.code]), [[2, "voltage_source_loop"]]);
  // El resultado combinado tiene lo del primero: 10 V sobre 1 kΩ.
  const r1 = hoja.resultado.components.find((c) => c.id === "R1");
  assert.ok(Math.abs(Math.abs(r1.current) - 0.01) < 1e-12);
});

test("dos circuitos que dan: resultados combinados y por circuito", () => {
  const e = conTierrasAutomaticas(malla(malla(circuitoVacio(), 2, 2), 20, 2, "5")).estado;
  const hoja = simularHoja(e);
  assert.equal(hoja.errores.length, 0);
  assert.ok(hoja.circuitos.every((c) => c.resultado));
  assert.equal(hoja.resultado.components.filter((c) => c.type === "resistor").length, 2);
  assert.ok(Math.abs(hoja.resultado.power.supplied - (0.1 + 0.025)) < 1e-12);
});

test("varias tierras en un circuito valen lo mismo (0 V)", () => {
  let e = malla(circuitoVacio(), 2, 2);
  e = ponerTierra(e, p(2, 6)).estado;
  e = ponerTierra(e, p(6, 6)).estado;
  const hoja = simularHoja(e);
  assert.equal(hoja.errores.length, 0);
  assert.equal(hoja.resultado.node_voltages["2_2"], 10);
});

test("si borro la tierra automática no vuelve hasta que cambie el circuito", () => {
  const conAuto = conTierrasAutomaticas(malla(circuitoVacio(), 2, 2)).estado;
  const sinTierra = recordarTierrasBorradas(conAuto, eliminar(conAuto, "G1"));
  assert.equal(sinTierra.sinTierraAuto.length, 1);
  const { estado, colocadas } = conTierrasAutomaticas(sinTierra);
  assert.equal(colocadas.length, 0, "no vuelve");
  assert.equal(simularHoja(estado).errores[0].code, "no_ground");
  // Al cambiar el circuito (mover la resistencia), vuelve.
  const cambiado = conTierrasAutomaticas(mover(estado, "R1", 0, 1));
  assert.equal(cambiado.colocadas.length, 1);
  assert.deepEqual(cambiado.estado.sinTierraAuto, []);
});

test("una tierra automática que quedó suelta se saca", () => {
  const conAuto = conTierrasAutomaticas(malla(circuitoVacio(), 2, 2)).estado;
  let e = conAuto;
  for (const id of ["V1", "R1", "W1", "W2"]) e = eliminar(e, id);
  assert.equal(conTierrasAutomaticas(e).estado.components.length, 0);
});

test("un circuito sin fuente ni tierra no es un error; una tierra sola queda sin conectar", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "resistor", p(20, 20), 0));
  ({ estado: e } = agregarPieza(e, "resistor", p(20, 20), 0));
  e = ponerTierra(e, p(40, 25)).estado;
  const hoja = simularHoja(e);
  assert.equal(hoja.errores.length, 0);
  assert.match(hoja.vacio, /no tiene fuente/);
  assert.deepEqual(hoja.bornesSueltos, [p(40, 25)]);
});
