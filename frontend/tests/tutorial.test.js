// El tutorial reconoce cada paso hecho con las mismas acciones que haría el usuario.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agregarCable, agregarPieza, alternarInterruptor, cambiarPotencia, circuitoVacio, insertarEnCable, ponerTierra,
} from "../public/js/lib/modelo.js";
import { simularEstado } from "../public/js/lib/netlist.js";
import { PASOS, avanzar, terminado } from "../public/js/lib/tutorial.js";

const p = (x, y) => ({ x, y });
const contexto = (estado) => ({ estado, resultado: simularEstado(estado).resultado ?? null });

test("los siete pasos, en el orden pedido", () => {
  assert.deepEqual(PASOS.map((x) => x.id), ["bateria", "lampara", "cables", "tierra", "encender", "interruptor", "quemar"]);
});

test("cada paso espera a que se haga y el tutorial avanza solo", () => {
  let e = circuitoVacio();
  let paso = avanzar(0, contexto(e));
  assert.equal(paso, 0);

  ({ estado: e } = agregarPieza(e, "voltage_source", p(4, 6), 1)); // + en 4_4, − en 4_8
  paso = avanzar(paso, contexto(e));
  assert.equal(PASOS[paso].id, "lampara");

  let lampara;
  ({ estado: e, id: lampara } = agregarPieza(e, "lamp", p(12, 6), 1)); // 12_4 a 12_8
  paso = avanzar(paso, contexto(e));
  assert.equal(PASOS[paso].id, "cables");

  ({ estado: e } = agregarCable(e, p(4, 4), p(12, 4)));
  assert.equal(PASOS[avanzar(paso, contexto(e))].id, "cables", "con un solo cable todavía no");
  ({ estado: e } = agregarCable(e, p(4, 8), p(12, 8)));
  paso = avanzar(paso, contexto(e));
  assert.equal(PASOS[paso].id, "tierra");

  // Al poner la tierra la lámpara ya brilla: "encender" se cumple en el mismo cambio.
  e = ponerTierra(e, p(4, 8)).estado;
  paso = avanzar(paso, contexto(e));
  assert.equal(PASOS[paso].id, "interruptor");

  let interruptor;
  ({ estado: e, id: interruptor } = agregarPieza(e, "switch", p(8, 4), 0));
  e = insertarEnCable(e, interruptor);
  assert.equal(PASOS[avanzar(paso, contexto(e))].id, "interruptor", "cerrado, la lámpara sigue encendida");
  e = alternarInterruptor(e, interruptor);
  paso = avanzar(paso, contexto(e));
  assert.equal(PASOS[paso].id, "quemar");

  e = alternarInterruptor(e, interruptor);
  e = cambiarPotencia(e, lampara, "1");
  paso = avanzar(paso, contexto(e));
  assert.ok(terminado(paso));
});

test("un interruptor abierto que no apaga la lámpara no cumple el paso", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(4, 6), 1));
  ({ estado: e } = agregarPieza(e, "lamp", p(12, 6), 1));
  ({ estado: e } = agregarCable(e, p(4, 4), p(12, 4)));
  ({ estado: e } = agregarCable(e, p(4, 8), p(12, 8)));
  e = ponerTierra(e, p(4, 8)).estado;
  let s;
  ({ estado: e, id: s } = agregarPieza(e, "switch", p(20, 20), 0)); // suelto, lejos
  e = alternarInterruptor(e, s);
  const i = PASOS.findIndex((x) => x.id === "interruptor");
  assert.equal(avanzar(i, contexto(e)), i);
});
