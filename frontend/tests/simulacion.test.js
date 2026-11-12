import assert from "node:assert/strict";
import { test } from "node:test";

import { SimulacionEnVivo, segundosDeRetryAfter } from "../public/js/lib/simulacion.js";

/** Temporizadores manuales: `avanzar(ms)` ejecuta lo que vence. */
function relojFalso() {
  let ahora = 0;
  let siguienteId = 1;
  const pendientes = new Map();
  return {
    programar(fn, ms) { const id = siguienteId++; pendientes.set(id, { fn, cuando: ahora + ms }); return id; },
    desprogramar(id) { pendientes.delete(id); },
    async avanzar(ms) {
      ahora += ms;
      for (const [id, { fn, cuando }] of [...pendientes]) {
        // Sin await: un fetch que nunca responde no debe trabar el reloj.
        if (cuando <= ahora) { pendientes.delete(id); fn(); }
      }
      for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
    },
    get pendientes() { return pendientes.size; },
  };
}

function respuesta(estado, cuerpo, headers = {}) {
  return {
    status: estado, ok: estado >= 200 && estado < 300,
    headers: { get: (n) => headers[n] ?? null },
    json: async () => cuerpo,
  };
}

function armar(respuestas) {
  const reloj = relojFalso();
  const pedidos = [];
  const estados = [];
  const fetch = async (url, opciones) => {
    pedidos.push(JSON.parse(opciones.body));
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  const sim = new SimulacionEnVivo({
    alCambiar: (e) => estados.push(e), fetch,
    programar: reloj.programar, desprogramar: reloj.desprogramar,
  });
  return { sim, reloj, pedidos, estados };
}

test("debounce: solo se manda el último netlist después de 300 ms", async () => {
  const { sim, reloj, pedidos, estados } = armar([respuesta(200, { node_voltages: {} })]);
  sim.pedir({ n: 1 });
  await reloj.avanzar(200);
  sim.pedir({ n: 2 });
  await reloj.avanzar(299);
  assert.equal(pedidos.length, 0);
  await reloj.avanzar(1);
  assert.deepEqual(pedidos, [{ n: 2 }]);
  assert.equal(estados.at(-1).fase, "ok");
});

test("un error del circuito se informa con código y detalles", async () => {
  const cuerpo = { detail: { code: "floating_nodes", message: "Nodos sin tierra", details: { nodes: ["9_9"] } } };
  const { sim, reloj, estados } = armar([respuesta(422, cuerpo)]);
  sim.pedir({});
  await reloj.avanzar(300);
  assert.deepEqual(estados.at(-1), {
    fase: "error", error: { code: "floating_nodes", message: "Nodos sin tierra", details: { nodes: ["9_9"] } },
  });
});

test("503 reintenta respetando Retry-After", async () => {
  const { sim, reloj, pedidos, estados } = armar([
    respuesta(503, { detail: { code: "overloaded" } }, { "Retry-After": "2" }),
    respuesta(200, { node_voltages: { a: 1 } }),
  ]);
  sim.pedir({ n: 1 });
  await reloj.avanzar(300);
  assert.equal(estados.at(-1).fase, "saturado");
  assert.equal(estados.at(-1).reintentoEn, 2);
  await reloj.avanzar(1999);
  assert.equal(pedidos.length, 1);
  await reloj.avanzar(1);
  assert.equal(pedidos.length, 2);
  assert.equal(estados.at(-1).fase, "ok");
});

test("429 sin Retry-After reintenta al segundo", async () => {
  const { sim, reloj, pedidos } = armar([respuesta(429, null), respuesta(200, {})]);
  sim.pedir({});
  await reloj.avanzar(300);
  await reloj.avanzar(1000);
  assert.equal(pedidos.length, 2);
});

test("un cambio durante la espera del reintento cancela el reintento viejo", async () => {
  const { sim, reloj, pedidos } = armar([
    respuesta(503, null, { "Retry-After": "5" }), respuesta(200, {}),
  ]);
  sim.pedir({ n: 1 });
  await reloj.avanzar(300);
  sim.pedir({ n: 2 });
  await reloj.avanzar(300);
  assert.deepEqual(pedidos, [{ n: 1 }, { n: 2 }]);
  await reloj.avanzar(10_000);
  assert.equal(pedidos.length, 2);
});

test("la respuesta de un pedido viejo se ignora", async () => {
  const reloj = relojFalso();
  const estados = [];
  let liberar;
  const lenta = new Promise((r) => { liberar = r; });
  const respuestas = [lenta, Promise.resolve(respuesta(200, { version: 2 }))];
  const sim = new SimulacionEnVivo({
    alCambiar: (e) => estados.push(e), fetch: () => respuestas.shift(),
    programar: reloj.programar, desprogramar: reloj.desprogramar,
  });
  sim.pedir({ n: 1 });
  await reloj.avanzar(300);
  sim.pedir({ n: 2 });
  await reloj.avanzar(300);
  liberar(respuesta(200, { version: 1 }));
  await new Promise((r) => setImmediate(r));
  const resultados = estados.filter((e) => e.fase === "ok").map((e) => e.resultado.version);
  assert.deepEqual(resultados, [2]);
});

test("sin red avisa y reintenta", async () => {
  const { sim, reloj, pedidos, estados } = armar([new TypeError("sin red"), respuesta(200, {})]);
  sim.pedir({});
  await reloj.avanzar(300);
  assert.equal(estados.at(-1).error.code, "network");
  await reloj.avanzar(3000);
  assert.equal(pedidos.length, 2);
});

test("cancelar descarta lo pendiente", async () => {
  const { sim, reloj, pedidos } = armar([]);
  sim.pedir({});
  sim.cancelar();
  await reloj.avanzar(1000);
  assert.equal(pedidos.length, 0);
  assert.equal(reloj.pendientes, 0);
});

test("Retry-After en segundos o como fecha HTTP, acotado entre 1 y 60", () => {
  assert.equal(segundosDeRetryAfter("2"), 2);
  assert.equal(segundosDeRetryAfter("0"), 1);
  assert.equal(segundosDeRetryAfter("600"), 60);
  assert.equal(segundosDeRetryAfter(null), null);
  assert.equal(segundosDeRetryAfter("mañana"), null);
  const ahora = Date.parse("2026-11-12T12:00:00Z");
  assert.equal(segundosDeRetryAfter("Thu, 12 Nov 2026 12:00:05 GMT", ahora), 5);
});
