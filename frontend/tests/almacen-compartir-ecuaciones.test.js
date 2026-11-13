import assert from "node:assert/strict";
import { test } from "node:test";

import { Almacen, CLAVE, aArchivo, desdeArchivo } from "../public/js/lib/almacen.js";
import { PREFIJO_HASH, codificar, decodificar } from "../public/js/lib/compartir.js";
import { ecuacionesDe, numeroCorto } from "../public/js/lib/ecuaciones.js";
import { EJEMPLOS } from "../public/js/lib/ejemplos.js";
import { TP4 } from "./circuitos-de-prueba.js";
import { agregarPieza, circuitoVacio, eliminar, ponerTierra } from "../public/js/lib/modelo.js";

const p = (x, y) => ({ x, y });
const ejemplo = (id) => structuredClone([...EJEMPLOS, TP4].find((e) => e.id === id).estado);

function memoria() {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    datos,
  };
}

function almacen(almacenamiento = memoria()) {
  let t = 0;
  let n = 0;
  return new Almacen({
    almacenamiento,
    reloj: () => `2026-11-12T12:00:${String(t++).padStart(2, "0")}Z`,
    nuevoId: () => `id-${++n}`,
  });
}

// --- Almacén local ----------------------------------------------------------------------

test("guardar, listar, abrir, renombrar y borrar", () => {
  const a = almacen();
  const { id } = a.guardar({ name: "TP4", estado: ejemplo("tp4") });
  a.guardar({ name: "Serie", estado: ejemplo("serie") });
  assert.deepEqual(a.listar().map((c) => c.name), ["Serie", "TP4"]);
  assert.equal(a.listar()[1].component_count, ejemplo("tp4").components.length);
  assert.deepEqual(a.obtener(id).estado, ejemplo("tp4"));
  a.renombrar(id, "TP4 final");
  assert.deepEqual(a.listar().map((c) => c.name), ["TP4 final", "Serie"]);
  assert.equal(a.borrar(id), true);
  assert.equal(a.borrar(id), false);
  assert.equal(a.obtener(id), null);
});

test("guardar con id reemplaza en lugar de duplicar", () => {
  const a = almacen();
  const { id } = a.guardar({ name: "TP4", estado: ejemplo("tp4") });
  const editado = eliminar(ejemplo("tp4"), "R4");
  a.guardar({ id, name: "TP4", estado: editado });
  assert.equal(a.listar().length, 1);
  assert.deepEqual(a.obtener(id).estado, editado);
});

test("nombres vacíos o largos se rechazan", () => {
  const a = almacen();
  assert.throws(() => a.guardar({ name: "  ", estado: circuitoVacio() }), /nombre/);
  assert.throws(() => a.guardar({ name: "x".repeat(121), estado: circuitoVacio() }), /120/);
});

test("datos corruptos en localStorage no rompen el editor", () => {
  const m = memoria();
  m.setItem(CLAVE, "{no es json");
  assert.deepEqual(almacen(m).listar(), []);
});

test("sin almacenamiento (modo privado) el error lo explica", () => {
  const roto = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("x"); } };
  assert.throws(() => almacen(roto).listar(), /modo privado/);
});

test("exportar e importar un archivo .json conserva el circuito exacto", () => {
  const estado = ponerTierra(eliminar(ejemplo("tp4"), "R2"), p(18, 12)).estado;
  const texto = JSON.stringify(aArchivo("Mi circuito", estado));
  assert.deepEqual(desdeArchivo(texto), { name: "Mi circuito", estado });
  assert.throws(() => desdeArchivo("hola"), /JSON/);
  assert.throws(() => desdeArchivo(JSON.stringify({ formato: "otro" })), /Simulador DC/);
  assert.throws(() => desdeArchivo(JSON.stringify({ formato: "simulador-dc", version: 9 })), /versión/);
});

// --- Compartir ------------------------------------------------------------------------------

test("el link reproduce el circuito exacto, con ids, contadores y tierra", async () => {
  let estado = ejemplo("wheatstone");
  ({ estado } = agregarPieza(estado, "current_source", p(30, 10), 1, "5m"));
  estado = eliminar(estado, "R1");
  const codigo = await codificar(estado, "Puente con Ñandú y acentos: áéíóú");
  assert.match(codigo, /^[A-Za-z0-9_-]+$/);
  const { nombre, estado: leido } = await decodificar(PREFIJO_HASH + codigo);
  assert.equal(nombre, "Puente con Ñandú y acentos: áéíóú");
  assert.deepEqual(leido, estado);
});

test("los links de los ejemplos son cortos", async () => {
  for (const e of EJEMPLOS) {
    const codigo = await codificar(e.estado, e.nombre);
    assert.ok(codigo.length < 400, `${e.id}: ${codigo.length} caracteres`);
  }
});

test("un link dañado da un error claro", async () => {
  await assert.rejects(decodificar("no-es-un-circuito"), /dañado/);
  const codigo = await codificar(ejemplo("tp4"), "TP4");
  await assert.rejects(decodificar(codigo.slice(0, 20)), /dañado/);
});

// --- Ecuaciones -----------------------------------------------------------------------------

test("TP4: ecuaciones de nodo, restricción de la fuente y sistema MNA", () => {
  const e = ecuacionesDe(ejemplo("tp4"));
  assert.equal(e.error, undefined);
  // Con los nombres del dibujo: A arriba (el + de la fuente), B en el medio, e I₁ la corriente de V1.
  assert.deepEqual(e.incognitas, ["V(A)", "V(B)", "I₁"]);
  const medio = e.nodos.find((n) => n.nombre === "V(B)");
  assert.equal(medio.ecuacion,
    "(V(B) − V(A))/3 Ω + (V(B) − V(A))/12 Ω + V(B)/6 Ω + V(B)/4 Ω = 0");
  const arriba = e.nodos.find((n) => n.nombre === "V(A)");
  assert.ok(arriba.ecuacion.includes("+ I₁"), arriba.ecuacion);
  assert.deepEqual(e.fuentes, [{ nombre: "V1 (I₁)", ecuacion: "V(A) = 60 V" }]);
  assert.deepEqual(e.nodos.map((n) => n.nombre), ["V(A)", "V(B)"]);
  // G del nodo del medio: 1/3 + 1/12 + 1/6 + 1/4 = 5/6 S.
  assert.ok(Math.abs(e.A[1][1] - 5 / 6) < 1e-12);
  assert.deepEqual(e.z, [0, 0, 60]);
  assert.ok(Math.abs(e.x[1] - 30) < 1e-9);
  assert.ok(Math.abs(e.x[2] + 12.5) < 1e-9);
});

test("la fuente de corriente pasa al lado derecho con su signo", () => {
  let estado = circuitoVacio();
  ({ estado } = agregarPieza(estado, "current_source", p(4, 6), 3, "1m")); // a 4_8, b 4_4: entra al 4_4
  ({ estado } = agregarPieza(estado, "resistor", p(6, 4), 0, "1k")); // 4_4 a 8_4
  ({ estado } = agregarPieza(estado, "resistor", p(8, 6), 1, "1k")); // 8_4 a 8_8
  estado = ponerTierra(estado, p(4, 8)).estado;
  // Falta unir 4_8 con 8_8: la R2 queda flotando de un lado. Se cierra con otra R a tierra.
  ({ estado } = agregarPieza(estado, "resistor", p(6, 8), 0, "1k")); // 4_8 a 8_8
  const e = ecuacionesDe(estado);
  const nodo = e.nodos.find((n) => n.nombre === "V(A)"); // el nodo 4_4, el primero en orden de lectura
  assert.match(nodo.ecuacion, /= 1 mA$/);
});

test("un circuito con error devuelve el mensaje del motor", () => {
  let estado = ejemplo("tp4");
  // Una pieza suelta no participa: las ecuaciones siguen siendo las del TP4.
  ({ estado } = agregarPieza(estado, "resistor", p(30, 20), 0));
  assert.ok(!ecuacionesDe(estado).error);
  // Un lazo sin camino a tierra sí es un error.
  ({ estado } = agregarPieza(estado, "resistor", p(30, 20), 0));
  assert.equal(ecuacionesDe(estado).error.code, "floating_nodes");
  assert.equal(ecuacionesDe(circuitoVacio()).error.code, "empty");
});

test("números cortos para la matriz", () => {
  assert.equal(numeroCorto(0), "0");
  assert.equal(numeroCorto(0.8333333), "0.8333");
  assert.equal(numeroCorto(-1), "-1");
  assert.equal(numeroCorto(0.001), "0.001");
  assert.equal(numeroCorto(0.0001), "1e-4");
  assert.equal(numeroCorto(250000), "2.5e5");
});
