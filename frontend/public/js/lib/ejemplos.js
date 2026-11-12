// Circuitos de ejemplo de Física 2. Coordenadas en unidades de grilla; las piezas miden 4.
// Cada ejemplo tiene su resultado esperado verificado en tests/ejemplos.test.js.

const p = (x, y) => ({ x, y });
const pieza = (id, type, a, b, value) => ({ id, type, a, b, value });
const cable = (id, a, b) => ({ id, type: "wire", a, b });

function contadores(components) {
  const counters = { R: 0, V: 0, I: 0, W: 0, L: 0, S: 0 };
  for (const c of components) {
    const prefijo = c.id[0];
    counters[prefijo] = Math.max(counters[prefijo], Number(c.id.slice(1)));
  }
  return counters;
}

function ejemplo(id, nombre, descripcion, components, ground) {
  return { id, nombre, descripcion, estado: { components, ground, counters: contadores(components) } };
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

// TP4: (3 Ω ∥ 12 Ω) en serie con (6 Ω ∥ 4 Ω) con 60 V. Cada paralelo vale 2,4 Ω,
// así que el nodo del medio (V2) queda en 30 V y la fuente entrega 12,5 A.
const TP4 = ejemplo(
  "tp4",
  "Mixto (TP4)",
  "60 V sobre (3 Ω ∥ 12 Ω) en serie con (6 Ω ∥ 4 Ω): V2 = 30 V, I = 12,5 A.",
  [
    pieza("V1", "voltage_source", p(6, 4), p(6, 8), "60"),
    pieza("R1", "resistor", p(12, 4), p(12, 8), "3"),
    pieza("R2", "resistor", p(18, 4), p(18, 8), "12"),
    pieza("R3", "resistor", p(12, 8), p(12, 12), "6"),
    pieza("R4", "resistor", p(18, 8), p(18, 12), "4"),
    ...cables([p(6, 4), p(12, 4)], [p(12, 4), p(18, 4)], [p(12, 8), p(18, 8)], [p(6, 8), p(6, 12)],
      [p(6, 12), p(12, 12)], [p(12, 12), p(18, 12)]),
  ],
  p(6, 12),
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

export const EJEMPLOS = [DIVISOR, SERIE, PARALELO, TP4, WHEATSTONE, DOS_MALLAS];
