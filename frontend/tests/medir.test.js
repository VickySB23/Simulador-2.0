// Etapa 2A: nombres de nodos y corrientes, deslizador, multímetro (V, A, Ω), fusible, lámparas que
// quedan quemadas, potenciómetro y resistencia interna de la batería.
import assert from "node:assert/strict";
import { test } from "node:test";

import { codificar, decodificar } from "../public/js/lib/compartir.js";
import {
  PASOS, escalaDe, posicionDeValor, rangoDe, redondear, textoDeValor, valorDePosicion,
} from "../public/js/lib/deslizador.js";
import { corrientesDeTramos } from "../public/js/lib/corrientes.js";
import {
  agregarCable, agregarPieza, buscar, cambiarCampo, cambiarModoMultimetro, circuitoVacio, cursorDe, marcarQuemados,
  moverPunta, nombreNodo, ponerTierra, reemplazarQuemado, terminales,
} from "../public/js/lib/modelo.js";
import {
  letra, nombresDeCorrientes, nombresDeNodos, renombrarNodo, validarNombreNodo,
} from "../public/js/lib/nombres.js";
import { resistenciaEntre, simularHoja } from "../public/js/lib/netlist.js";
import { TP4 } from "./circuitos-de-prueba.js";

const p = (x, y) => ({ x, y });
const cerca = (real, esperado, msg = "") => assert.ok(Math.abs(real - esperado) < 1e-9 * Math.max(1, Math.abs(esperado)), `${msg} ${real} ≠ ${esperado}`);

/** Batería vertical (+ arriba en (x, y), − abajo en (x, y + 4)) y una pieza que la cierra a la derecha. */
function malla({ v = "12", tipo = "resistor", valor = "6", x = 2, y = 2 } = {}) {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(x, y + 2), 1, v));
  ({ estado: e } = agregarPieza(e, tipo, p(x + 8, y + 2), 1, valor));
  ({ estado: e } = agregarCable(e, p(x, y), p(x + 8, y)));
  ({ estado: e } = agregarCable(e, p(x, y + 4), p(x + 8, y + 4)));
  return ponerTierra(e, p(x, y + 4)).estado;
}
const fila = (hoja, id) => hoja.resultado.components.find((c) => c.id === id);

// --- Nombres ---------------------------------------------------------------------------------------

test("los nodos se llaman A, B, C… en orden de lectura; GND es la referencia", () => {
  const nombres = nombresDeNodos(TP4.estado).porPunto;
  assert.equal(nombres.get("6_4"), "A");
  assert.equal(nombres.get("18_4"), "A");
  assert.equal(nombres.get("12_8"), "B");
  assert.equal(nombres.get("6_12"), "GND");
  assert.deepEqual([letra(0), letra(25), letra(26), letra(27)], ["A", "Z", "AA", "AB"]);
});

test("un nodo renombrado conserva su nombre y las letras automáticas no lo repiten", () => {
  const e = renombrarNodo(TP4.estado, p(12, 8), "Vout");
  const nombres = nombresDeNodos(e).porPunto;
  assert.equal(nombres.get("18_8"), "Vout");
  assert.equal(nombres.get("6_4"), "A");
  // Renombrar otra vez el mismo nodo (desde otro punto) reemplaza el nombre; vacío vuelve a la letra.
  assert.equal(nombresDeNodos(renombrarNodo(e, p(18, 8), "M")).porPunto.get("12_8"), "M");
  assert.equal(nombresDeNodos(renombrarNodo(e, p(12, 8), "")).porPunto.get("12_8"), "B");
  // Un nombre propio que coincide con una letra automática: la letra pasa a la siguiente.
  const conA = renombrarNodo(TP4.estado, p(12, 8), "A");
  assert.equal(nombresDeNodos(conA).porPunto.get("12_8"), "A");
  assert.equal(nombresDeNodos(conA).porPunto.get("6_4"), "B");
});

test("validar nombres de nodo", () => {
  assert.equal(validarNombreNodo("Vout", ["A"]), null);
  assert.match(validarNombreNodo("GND", []), /tierra/);
  assert.match(validarNombreNodo("A", ["A"]), /Ya hay/);
  assert.match(validarNombreNodo("1x", []), /letra/);
  assert.equal(validarNombreNodo("  ", []), null);
});

test("corrientes de rama I₁, I₂… en el orden en que se agregaron las piezas", () => {
  const nombres = nombresDeCorrientes(TP4.estado);
  assert.deepEqual([...nombres], [["V1", "I₁"], ["R1", "I₂"], ["R2", "I₃"], ["R3", "I₄"], ["R4", "I₅"]]);
});

test("los nombres de nodo viajan en el link", async () => {
  const e = renombrarNodo(TP4.estado, p(12, 8), "Vout");
  const { estado } = await decodificar(await codificar(e, "TP4"));
  assert.deepEqual(estado.nombresNodos, { "12_8": "Vout" });
});

// --- Deslizador ------------------------------------------------------------------------------------

test("deslizador: logarítmico para resistencias, lineal para baterías", () => {
  assert.equal(escalaDe({ type: "resistor" }), "log");
  assert.equal(escalaDe({ type: "voltage_source" }), "lineal");
  const rango = rangoDe({ type: "resistor", value: "1k" });
  assert.deepEqual(rango, { min: 100, max: 10000 });
  assert.equal(posicionDeValor(1000, rango, "log"), PASOS / 2);
  assert.equal(valorDePosicion(PASOS / 2, rango, "log"), 1000);
  assert.equal(valorDePosicion(PASOS, rango, "log"), 10000);
  const pila = rangoDe({ type: "voltage_source", value: "9" });
  assert.deepEqual(pila, { min: 0, max: 24 });
  assert.equal(valorDePosicion(PASOS / 4, pila, "lineal"), 6);
});

test("deslizador: rango fijado a mano, redondeo y texto con prefijo", () => {
  assert.deepEqual(rangoDe({ type: "resistor", value: "1k", rango: { min: "10", max: "100k" } }), { min: 10, max: 100000 });
  // Un rango inválido (mínimo 0 en escala log) vuelve al de por defecto.
  assert.deepEqual(rangoDe({ type: "resistor", value: "1k", rango: { min: "0", max: "10k" } }), { min: 100, max: 10000 });
  assert.equal(redondear(4712.3), 4710);
  assert.equal(textoDeValor(4700), "4.7k");
  assert.equal(textoDeValor(0.0022), "2.2m");
  assert.equal(textoDeValor(2e6), "2MEG");
  assert.equal(textoDeValor(12), "12");
});

// --- Fusible y lámparas que quedan quemadas ---------------------------------------------------------

test("fusible: conduce sin resistencia y se abre si la corriente supera la nominal", () => {
  // 12 V sobre 6 Ω con un fusible en serie: 2 A.
  let e = malla();
  ({ estado: e } = agregarPieza(e, "fuse", p(6, 2), 0, "3")); // sobre el cable de arriba
  // Lo intercalo a mano: el cable de arriba se corta en dos tramos que llegan a sus bornes.
  e = { ...e, components: e.components.filter((c) => c.id !== "W1") };
  ({ estado: e } = agregarCable(e, p(2, 2), p(4, 2)));
  ({ estado: e } = agregarCable(e, p(8, 2), p(10, 2)));
  let hoja = simularHoja(e);
  cerca(fila(hoja, "F1").current, 2, "con 3 A nominales conduce");
  assert.equal(fila(hoja, "F1").blown, false);
  assert.ok(hoja.resultado.power.ok);
  hoja = simularHoja(cambiarCampo(e, "F1", "value", "1"));
  assert.equal(fila(hoja, "F1").blown, true, "con 1 A nominal se quema");
  assert.equal(fila(hoja, "R1").current, 0);
  assert.deepEqual(hoja.resultado.stats.blown_fuses, ["F1"]);
});

test("un fusible en corto con la batería se quema (no es un error)", () => {
  let e = malla();
  ({ estado: e } = agregarPieza(e, "fuse", p(4, 4), 1, "1")); // en paralelo con la batería: de 4_2 a 4_6
  ({ estado: e } = agregarCable(e, p(2, 2), p(4, 2)));
  ({ estado: e } = agregarCable(e, p(2, 6), p(4, 6)));
  const hoja = simularHoja(e);
  assert.equal(hoja.errores.length, 0);
  assert.equal(fila(hoja, "F1").blown, true);
  cerca(fila(hoja, "R1").current, 2, "la resistencia sigue con su corriente");
});

test("fusibles y lámparas quemados quedan así hasta reemplazarlos", () => {
  // Lámpara de 6 Ω y 30 W con 12 V: 24 W, no se quema... salvo que esté marcada como quemada.
  let e = malla({ tipo: "lamp", valor: "6" });
  e = cambiarCampo(e, "L1", "potencia", "30");
  assert.equal(fila(simularHoja(e), "L1").burned, false);
  const quemada = marcarQuemados(e, ["L1"]);
  assert.equal(buscar(quemada, "L1").quemada, true);
  assert.equal(fila(simularHoja(quemada), "L1").burned, true, "sigue quemada aunque no se pase");
  assert.equal(marcarQuemados(quemada, ["L1"]), quemada, "marcar otra vez no cambia nada");
  const nueva = reemplazarQuemado(quemada, "L1");
  assert.equal(buscar(nueva, "L1").quemada, undefined);
  assert.equal(fila(simularHoja(nueva), "L1").burned, false, "reemplazada vuelve a encender");
});

// --- Potenciómetro ------------------------------------------------------------------------------

test("potenciómetro: el cursor divide la tensión según su posición", () => {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(2, 6), 1, "10")); // + en 2_4, − en 2_8
  ({ estado: e } = agregarPieza(e, "potentiometer", p(10, 6), 1, "10k")); // a 10_4, b 10_8
  ({ estado: e } = agregarCable(e, p(2, 4), p(10, 4)));
  ({ estado: e } = agregarCable(e, p(2, 8), p(10, 8)));
  e = ponerTierra(e, p(2, 8)).estado;
  const cursor = cursorDe(buscar(e, "P1"));
  assert.deepEqual(cursor, p(8, 6));
  assert.equal(terminales(buscar(e, "P1")).length, 3);
  e = cambiarCampo(e, "P1", "posicion", 0.25);
  let hoja = simularHoja(e);
  assert.equal(hoja.errores.length, 0);
  cerca(hoja.resultado.node_voltages[nombreNodo(cursor)], 7.5, "a un cuarto del + queda en 7,5 V");
  assert.equal(hoja.sinConectar.size, 0, "el cursor sin usar no deja la pieza suelta");
  // Con una carga en el cursor, la corriente por cada borne cumple KCL en los cables.
  ({ estado: e } = agregarPieza(e, "resistor", p(6, 6), 1, "10k")); // 6_4 a 6_8: no toca el cursor
  ({ estado: e } = agregarCable(e, p(8, 6), p(8, 8)));
  hoja = simularHoja(e);
  assert.ok(hoja.resultado.kcl_max_residual < 1e-12);
  const tramos = corrientesDeTramos(e, hoja.resultado);
  assert.ok(tramos.size > 0);
});

// --- Resistencia interna ------------------------------------------------------------------------

test("resistencia interna: la tensión en bornes baja con la carga", () => {
  let e = malla({ valor: "5" }); // 12 V sobre 5 Ω
  e = cambiarCampo(e, "V1", "rInterna", "1");
  const hoja = simularHoja(e);
  const v1 = fila(hoja, "V1");
  cerca(Math.abs(v1.current), 2, "I = 12 / (5 + 1)");
  cerca(v1.voltage, 10, "en bornes: 12 − 2 × 1");
  cerca(v1.emf, 12);
  cerca(v1.perdida, 4, "I² r");
  assert.ok(hoja.resultado.power.ok);
  assert.ok(!Object.keys(hoja.resultado.node_voltages).some((n) => n.startsWith("~")), "el nodo interno no se muestra");
  cerca(fila(simularHoja(cambiarCampo(e, "V1", "rInterna", "0")), "V1").voltage, 12, "con 0 Ω, la tensión de siempre");
});

// --- Multímetro -------------------------------------------------------------------------------------

/** Divisor: 12 V sobre R1 (1 kΩ, arriba) y R2 (2 kΩ, a la derecha) y un multímetro abajo, lejos. */
function divisorConMultimetro() {
  let e = circuitoVacio();
  ({ estado: e } = agregarPieza(e, "voltage_source", p(2, 6), 1, "12")); // 2_4 (+) a 2_8
  ({ estado: e } = agregarPieza(e, "resistor", p(6, 4), 0, "1k")); // 4_4 a 8_4
  ({ estado: e } = agregarPieza(e, "resistor", p(10, 6), 1, "2k")); // 10_4 a 10_8
  ({ estado: e } = agregarCable(e, p(2, 4), p(4, 4)));
  ({ estado: e } = agregarCable(e, p(8, 4), p(10, 4)));
  ({ estado: e } = agregarCable(e, p(2, 8), p(10, 8)));
  e = ponerTierra(e, p(2, 8)).estado;
  ({ estado: e } = agregarPieza(e, "multimeter", p(20, 20), 0)); // M1, puntas sueltas
  return e;
}

test("voltímetro: tensión con signo entre las puntas; avisa si quedan sueltas", () => {
  let e = divisorConMultimetro();
  let hoja = simularHoja(e);
  assert.equal(hoja.circuitos.length, 1, "en V el multímetro no forma otro circuito");
  assert.match(hoja.lecturas.get("M1").aviso, /dos puntas/);
  e = moverPunta(e, "M1", "roja", p(9, 4)); // en el medio del cable de 8_4 a 10_4: 8 V
  hoja = simularHoja(e);
  assert.match(hoja.lecturas.get("M1").aviso, /negra está suelta/);
  e = moverPunta(e, "M1", "negra", p(6, 8)); // sobre el cable de abajo: 0 V
  hoja = simularHoja(e);
  cerca(hoja.lecturas.get("M1").valor, 8);
  assert.equal(hoja.lecturas.get("M1").texto, "+8.00 V");
  // Al revés, negativa.
  e = moverPunta(moverPunta(e, "M1", "roja", p(6, 8)), "M1", "negra", p(9, 4));
  cerca(simularHoja(e).lecturas.get("M1").valor, -8);
});

test("amperímetro: se intercala como una pieza, sin resistencia, y mide la corriente de la rama", () => {
  let e = divisorConMultimetro();
  e = moverPunta(e, "M1", "roja", p(1, 1));
  // Lo llevo sobre el cable de 8_4 a 10_4 (mide 2) no entra; uso uno largo: el de abajo.
  e = { ...e, components: e.components.map((c) => (c.id === "M1" ? { ...c, a: p(4, 8), b: p(8, 8) } : c)) };
  e = cambiarModoMultimetro(e, "M1", "A");
  const m = buscar(e, "M1");
  assert.equal(m.modo, "A");
  const hoja = simularHoja(e);
  assert.equal(hoja.errores.length, 0);
  cerca(Math.abs(hoja.lecturas.get("M1").valor), 0.004, "12 V / 3 kΩ");
  cerca(hoja.resultado.node_voltages["8_4"], 8, "sin resistencia: el divisor no cambia");
  // Al volver a V, la rama queda cerrada con un cable.
  const deVuelta = cambiarModoMultimetro(e, "M1", "V");
  assert.equal(simularHoja(deVuelta).errores.length, 0);
  cerca(simularHoja(deVuelta).resultado.node_voltages["8_4"], 8);
});

test("amperímetro mal conectado: en paralelo con la batería o con una pieza, en palabras simples", () => {
  let e = divisorConMultimetro();
  // En paralelo con la batería: de 2_4 a 2_8 por cables.
  e = { ...e, components: e.components.map((c) => (c.id === "M1" ? { ...c, modo: "A", a: p(0, 4), b: p(0, 8) } : c)) };
  ({ estado: e } = agregarCable(e, p(0, 4), p(2, 4)));
  ({ estado: e } = agregarCable(e, p(0, 8), p(2, 8)));
  let hoja = simularHoja(e);
  assert.match(hoja.errores[0].message, /^El amperímetro M1 está en paralelo con la batería V1: la pone en corto/);
  // En paralelo con R2 (de 10_4 a 10_8): el motor lo acepta, pero se avisa.
  e = divisorConMultimetro();
  e = { ...e, components: e.components.map((c) => (c.id === "M1" ? { ...c, modo: "A", a: p(12, 4), b: p(12, 8) } : c)) };
  ({ estado: e } = agregarCable(e, p(10, 4), p(12, 4)));
  ({ estado: e } = agregarCable(e, p(10, 8), p(12, 8)));
  hoja = simularHoja(e);
  assert.match(hoja.lecturas.get("M1").aviso, /en paralelo con R2/);
});

test("óhmetro: resistencia equivalente entre las puntas con las fuentes apagadas", () => {
  let e = divisorConMultimetro();
  e = cambiarModoMultimetro(e, "M1", "Ω");
  // Entre 8_4 y 2_8: R2 (2 kΩ) en paralelo con R1 + batería en corto (1 kΩ) = 666,7 Ω.
  e = moverPunta(moverPunta(e, "M1", "roja", p(8, 4)), "M1", "negra", p(2, 8));
  cerca(simularHoja(e).lecturas.get("M1").valor, 2000 / 3);
  assert.equal(resistenciaEntre(e, "8_4", "10_4"), 0, "sobre el mismo cable: 0 Ω");
  // Una pieza suelta, sin camino: abierto.
  let f = e;
  ({ estado: f } = agregarPieza(f, "resistor", p(30, 4), 0, "470"));
  assert.equal(resistenciaEntre(f, "8_4", "28_4"), Infinity);
  f = moverPunta(moverPunta(f, "M1", "roja", p(28, 4)), "M1", "negra", p(8, 4));
  assert.equal(simularHoja(f).lecturas.get("M1").texto, "∞ Ω");
});

test("el multímetro viaja en el link con su modo y sus puntas", async () => {
  let e = moverPunta(divisorConMultimetro(), "M1", "roja", p(9, 4));
  e = cambiarCampo(e, "V1", "rInterna", "0.5");
  ({ estado: e } = agregarPieza(e, "potentiometer", p(30, 10), 0, "5k"));
  e = cambiarCampo(e, "P1", "posicion", 0.3);
  e = marcarQuemados(e, []);
  const { estado } = await decodificar(await codificar(e, "x"));
  assert.deepEqual(buscar(estado, "M1"), buscar(e, "M1"));
  assert.equal(buscar(estado, "V1").rInterna, "0.5");
  assert.equal(buscar(estado, "P1").posicion, 0.3);
});
