// Circuitos de ejemplo de Física 2. Coordenadas en unidades de grilla; las piezas miden 4.
// Cada ejemplo tiene su resultado esperado verificado en tests/ejemplos.test.js.

const p = (x, y) => ({ x, y });
const pieza = (id, type, a, b, value) => ({ id, type, a, b, value });
const cable = (id, a, b) => ({ id, type: "wire", a, b });
const lampara = (id, a, b, value, potencia) => ({ id, type: "lamp", a, b, value, potencia });
const interruptor = (id, a, b, closed) => ({ id, type: "switch", a, b, closed });

function contadores(components) {
  const counters = { R: 0, V: 0, I: 0, W: 0, L: 0, S: 0, G: 0 };
  for (const c of components) {
    const prefijo = c.id[0];
    counters[prefijo] = Math.max(counters[prefijo], Number(c.id.slice(1)));
  }
  return counters;
}

/** La tierra va como el componente G1 (un solo punto). */
function ejemplo(id, nombre, descripcion, piezas, tierra) {
  const components = [...piezas, { id: "G1", type: "ground", a: { ...tierra }, b: { ...tierra } }];
  return { id, nombre, descripcion, estado: { components, counters: contadores(components), sinTierraAuto: [] } };
}

/** Numera los cables W1, W2... en el orden dado. */
function cables(...tramos) {
  return tramos.map(([a, b], i) => cable(`W${i + 1}`, a, b));
}

// 12 V sobre 1 kΩ y 2 kΩ: el nodo del medio queda en 8 V.
const DIVISOR = ejemplo(
  "divisor",
  "Divisor de tensión",
  "12 V sobre 1 kΩ y 2 kΩ en serie: el nodo del medio queda en 8 V.",
  [
    pieza("V1", "voltage_source", p(6, 6), p(6, 10), "12"),
    pieza("R1", "resistor", p(10, 4), p(14, 4), "1k"),
    pieza("R2", "resistor", p(18, 6), p(18, 10), "2k"),
    ...cables([p(6, 6), p(6, 4)], [p(6, 4), p(10, 4)], [p(14, 4), p(18, 4)], [p(18, 4), p(18, 6)],
      [p(6, 10), p(18, 10)]),
  ],
  p(6, 10),
);

// Serie: 12 V sobre 1 k + 2 k + 3 k = 6 kΩ, I = 2 mA; caen 2, 4 y 6 V.
const SERIE = ejemplo(
  "serie",
  "Serie",
  "12 V sobre 1 kΩ, 2 kΩ y 3 kΩ en serie: circula 2 mA y caen 2 V, 4 V y 6 V.",
  [
    pieza("V1", "voltage_source", p(6, 6), p(6, 10), "12"),
    pieza("R1", "resistor", p(8, 4), p(12, 4), "1k"),
    pieza("R2", "resistor", p(15, 4), p(19, 4), "2k"),
    pieza("R3", "resistor", p(22, 6), p(22, 10), "3k"),
    ...cables([p(6, 6), p(6, 4)], [p(6, 4), p(8, 4)], [p(12, 4), p(15, 4)], [p(19, 4), p(22, 4)],
      [p(22, 4), p(22, 6)], [p(6, 10), p(22, 10)]),
  ],
  p(6, 10),
);

// Paralelo: 12 V sobre 1 k, 2 k y 3 k en paralelo: 12 + 6 + 4 = 22 mA.
const PARALELO = ejemplo(
  "paralelo",
  "Paralelo",
  "12 V sobre 1 kΩ, 2 kΩ y 3 kΩ en paralelo: 12 mA + 6 mA + 4 mA = 22 mA.",
  [
    pieza("V1", "voltage_source", p(6, 4), p(6, 8), "12"),
    pieza("R1", "resistor", p(12, 4), p(12, 8), "1k"),
    pieza("R2", "resistor", p(17, 4), p(17, 8), "2k"),
    pieza("R3", "resistor", p(22, 4), p(22, 8), "3k"),
    ...cables([p(6, 4), p(12, 4)], [p(12, 4), p(17, 4)], [p(17, 4), p(22, 4)],
      [p(6, 8), p(12, 8)], [p(12, 8), p(17, 8)], [p(17, 8), p(22, 8)]),
  ],
  p(6, 8),
);

// Puente de Wheatstone equilibrado: R1/R2 = R3/R4 = 1/2, así que por R5 (el galvanómetro)
// no circula corriente y los dos nodos del medio quedan en 10 · 2/3 = 6,67 V.
const WHEATSTONE = ejemplo(
  "wheatstone",
  "Puente de Wheatstone",
  "Equilibrado: R1/R2 = R3/R4, así que por R5 (galvanómetro) no circula corriente. Probá cambiar R4.",
  [
    pieza("V1", "voltage_source", p(4, 6), p(4, 10), "10"),
    pieza("R1", "resistor", p(10, 2), p(10, 6), "100"),
    pieza("R2", "resistor", p(10, 6), p(10, 10), "200"),
    pieza("R3", "resistor", p(20, 2), p(20, 6), "300"),
    pieza("R4", "resistor", p(20, 6), p(20, 10), "600"),
    pieza("R5", "resistor", p(13, 6), p(17, 6), "100"),
    ...cables([p(4, 6), p(4, 2)], [p(4, 2), p(10, 2)], [p(10, 2), p(20, 2)], [p(10, 6), p(13, 6)],
      [p(17, 6), p(20, 6)], [p(4, 10), p(10, 10)], [p(10, 10), p(20, 10)]),
  ],
  p(4, 10),
);

// Dos mallas: 12 V y 6 V con 1 kΩ, 2 kΩ y R3 = 2 kΩ en la rama del medio.
// KCL en el nodo del medio: (12 − V)/1k + (6 − V)/2k = V/2k → V = 7,5 V.
// Por R2 circulan 0,75 mA hacia la fuente de 6 V, que absorbe potencia (se "carga").
const DOS_MALLAS = ejemplo(
  "dos-mallas",
  "Dos mallas con dos fuentes",
  "12 V y 6 V compartiendo R3: el nodo del medio queda en 7,5 V y la fuente de 6 V absorbe potencia.",
  [
    pieza("V1", "voltage_source", p(6, 4), p(6, 8), "12"),
    pieza("R1", "resistor", p(8, 2), p(12, 2), "1k"),
    pieza("R3", "resistor", p(15, 4), p(15, 8), "2k"),
    pieza("R2", "resistor", p(18, 2), p(22, 2), "2k"),
    pieza("V2", "voltage_source", p(24, 4), p(24, 8), "6"),
    ...cables([p(6, 4), p(6, 2)], [p(6, 2), p(8, 2)], [p(12, 2), p(15, 2)], [p(15, 2), p(18, 2)],
      [p(15, 2), p(15, 4)], [p(22, 2), p(24, 2)], [p(24, 2), p(24, 4)], [p(6, 8), p(15, 8)],
      [p(15, 8), p(24, 8)]),
  ],
  p(6, 8),
);

// --- Lámparas -------------------------------------------------------------------------------

// Linterna: pila de 6 V, interruptor y lámpara de 12 Ω y 3 W: I = 0,5 A, P = 3 W, brillo pleno.
const LINTERNA = ejemplo(
  "linterna",
  "Linterna",
  "Pila de 6 V, interruptor y lámpara de 12 Ω / 3 W: circula 0,5 A y brilla al 100 %. Tocá S1 para apagarla.",
  [
    pieza("V1", "voltage_source", p(6, 6), p(6, 10), "6"),
    interruptor("S1", p(8, 4), p(12, 4), true),
    lampara("L1", p(15, 4), p(19, 4), "12", "3"),
    ...cables([p(6, 6), p(6, 4)], [p(6, 4), p(8, 4)], [p(12, 4), p(15, 4)], [p(19, 4), p(22, 4)],
      [p(22, 4), p(22, 10)], [p(22, 10), p(6, 10)]),
  ],
  p(6, 10),
);

// Mismas lámparas (12 Ω, 12 W) y misma tensión: en serie cada una recibe 3 W (25 %); en
// paralelo, 12 W cada una (100 %).
const SERIE_PARALELO = ejemplo(
  "serie-contra-paralelo",
  "Lámparas: serie contra paralelo",
  "Dos lámparas iguales con 12 V: en serie brillan al 25 % cada una; en paralelo, al 100 %.",
  [
    pieza("V1", "voltage_source", p(4, 5), p(4, 9), "12"),
    lampara("L1", p(7, 4), p(11, 4), "12", "12"),
    lampara("L2", p(13, 4), p(17, 4), "12", "12"),
    pieza("V2", "voltage_source", p(24, 5), p(24, 9), "12"),
    lampara("L3", p(32, 5), p(32, 9), "12", "12"),
    lampara("L4", p(40, 5), p(40, 9), "12", "12"),
    ...cables([p(4, 5), p(4, 4)], [p(4, 4), p(7, 4)], [p(11, 4), p(13, 4)], [p(17, 4), p(19, 4)],
      [p(19, 4), p(19, 10)], [p(4, 9), p(4, 10)], [p(4, 10), p(19, 10)], [p(19, 10), p(24, 10)],
      [p(24, 5), p(24, 4)], [p(24, 4), p(32, 4)], [p(32, 4), p(40, 4)], [p(32, 4), p(32, 5)],
      [p(40, 4), p(40, 5)], [p(24, 9), p(24, 10)], [p(24, 10), p(32, 10)], [p(32, 10), p(40, 10)],
      [p(32, 9), p(32, 10)], [p(40, 9), p(40, 10)]),
  ],
  p(4, 10),
);

// Serie con 18 V y tres lámparas de 12 Ω: I = 0,5 A y 3 W en cada una. L2 aguanta 2 W: se quema
// y abre el único camino, así que se apagan las tres.
const SERIE_SE_QUEMA = ejemplo(
  "serie-se-quema",
  "En serie se quema una y se apagan todas",
  "Tres lámparas de 12 Ω en serie con 18 V reciben 3 W cada una. L2 es de 2 W: se quema y abre el circuito.",
  [
    pieza("V1", "voltage_source", p(4, 6), p(4, 10), "18"),
    lampara("L1", p(6, 4), p(10, 4), "12", "6"),
    lampara("L2", p(12, 4), p(16, 4), "12", "2"),
    lampara("L3", p(18, 4), p(22, 4), "12", "6"),
    ...cables([p(4, 6), p(4, 4)], [p(4, 4), p(6, 4)], [p(10, 4), p(12, 4)], [p(16, 4), p(18, 4)],
      [p(22, 4), p(24, 4)], [p(24, 4), p(24, 10)], [p(24, 10), p(4, 10)]),
  ],
  p(4, 10),
);

// Paralelo con 12 V y tres lámparas de 24 Ω: 6 W en cada una. L2 aguanta 4 W y se quema, pero
// las otras dos tienen su propio camino y siguen al 100 %.
const PARALELO_SIGUEN = ejemplo(
  "paralelo-siguen",
  "En paralelo las demás siguen",
  "Tres lámparas de 24 Ω en paralelo con 12 V reciben 6 W cada una. L2 es de 4 W y se quema; L1 y L3 siguen encendidas.",
  [
    pieza("V1", "voltage_source", p(4, 5), p(4, 9), "12"),
    lampara("L1", p(10, 5), p(10, 9), "24", "6"),
    lampara("L2", p(16, 5), p(16, 9), "24", "4"),
    lampara("L3", p(22, 5), p(22, 9), "24", "6"),
    ...cables([p(4, 5), p(4, 4)], [p(4, 4), p(10, 4)], [p(10, 4), p(16, 4)], [p(16, 4), p(22, 4)],
      [p(10, 4), p(10, 5)], [p(16, 4), p(16, 5)], [p(22, 4), p(22, 5)],
      [p(4, 9), p(4, 10)], [p(4, 10), p(10, 10)], [p(10, 10), p(16, 10)], [p(16, 10), p(22, 10)],
      [p(10, 9), p(10, 10)], [p(16, 9), p(16, 10)], [p(22, 9), p(22, 10)]),
  ],
  p(4, 10),
);

// Dimmer: R1 en serie limita la corriente (0,5 A, la lámpara al 25 %). S1 puentea R1: cerrado,
// circula 1 A y la lámpara llega a su potencia nominal.
const DIMMER = ejemplo(
  "dimmer",
  "Dimmer con resistencia",
  "R1 de 12 Ω en serie deja la lámpara (12 Ω, 12 W) al 25 %. Cerrá S1 para puentear R1: sube al 100 %.",
  [
    pieza("V1", "voltage_source", p(4, 6), p(4, 10), "12"),
    pieza("R1", "resistor", p(6, 4), p(10, 4), "12"),
    interruptor("S1", p(6, 1), p(10, 1), false),
    lampara("L1", p(14, 4), p(18, 4), "12", "12"),
    ...cables([p(4, 6), p(4, 4)], [p(4, 4), p(6, 4)], [p(6, 4), p(6, 1)], [p(10, 1), p(10, 4)],
      [p(10, 4), p(14, 4)], [p(18, 4), p(20, 4)], [p(20, 4), p(20, 10)], [p(20, 10), p(4, 10)]),
  ],
  p(4, 10),
);

// En serie circula la misma corriente: 12 V / 27 Ω = 0,444 A. L1 (24 Ω, 6 W) recibe 4,74 W (79 %);
// L2 (3 Ω, 48 W) solo 0,59 W (1,2 %): casi no se ve, y su ficha avisa que la corriente es baja.
const DISTINTAS_POTENCIAS = ejemplo(
  "distintas-potencias",
  "Lámparas de distintas potencias en serie",
  "Una lámpara de 6 W y una de 48 W en serie con 12 V: la de 6 W brilla al 79 % y la de 48 W apenas (1 %).",
  [
    pieza("V1", "voltage_source", p(4, 6), p(4, 10), "12"),
    lampara("L1", p(6, 4), p(10, 4), "24", "6"),
    lampara("L2", p(13, 4), p(17, 4), "3", "48"),
    ...cables([p(4, 6), p(4, 4)], [p(4, 4), p(6, 4)], [p(10, 4), p(13, 4)], [p(17, 4), p(20, 4)],
      [p(20, 4), p(20, 10)], [p(20, 10), p(4, 10)]),
  ],
  p(4, 10),
);

// Instalación de una casa: tres lámparas en paralelo, cada una con su interruptor en serie.
// S2 está abierto: L2 apagada; L1 y L3 a 0,5 A cada una, la batería entrega 1 A.
const CASA = ejemplo(
  "casa",
  "Una casa con tres lámparas",
  "Tres lámparas de 24 Ω / 6 W en paralelo con 12 V, cada una con su interruptor. S2 está abierto: L2 apagada.",
  [
    pieza("V1", "voltage_source", p(4, 5), p(4, 9), "12"),
    interruptor("S1", p(10, 3), p(10, 7), true),
    lampara("L1", p(10, 7), p(10, 11), "24", "6"),
    interruptor("S2", p(18, 3), p(18, 7), false),
    lampara("L2", p(18, 7), p(18, 11), "24", "6"),
    interruptor("S3", p(26, 3), p(26, 7), true),
    lampara("L3", p(26, 7), p(26, 11), "24", "6"),
    ...cables([p(4, 5), p(4, 2)], [p(4, 2), p(10, 2)], [p(10, 2), p(18, 2)], [p(18, 2), p(26, 2)],
      [p(10, 2), p(10, 3)], [p(18, 2), p(18, 3)], [p(26, 2), p(26, 3)],
      [p(4, 9), p(4, 12)], [p(4, 12), p(10, 12)], [p(10, 12), p(18, 12)], [p(18, 12), p(26, 12)],
      [p(10, 11), p(10, 12)], [p(18, 11), p(18, 12)], [p(26, 11), p(26, 12)]),
  ],
  p(4, 12),
);

export const EJEMPLOS = [
  DIVISOR, SERIE, PARALELO, WHEATSTONE, DOS_MALLAS,
  LINTERNA, SERIE_PARALELO, SERIE_SE_QUEMA, PARALELO_SIGUEN, DIMMER, DISTINTAS_POTENCIAS, CASA,
];
