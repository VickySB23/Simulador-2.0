// Circuitos de ejemplo que trae el editor. Coordenadas en unidades de grilla.

const p = (x, y) => ({ x, y });
const pieza = (id, type, a, b, value) => ({ id, type, a, b, value });
const cable = (id, a, b) => ({ id, type: "wire", a, b });

function contadores(components) {
  const counters = { R: 0, V: 0, I: 0, W: 0 };
  for (const c of components) {
    const prefijo = c.id[0];
    counters[prefijo] = Math.max(counters[prefijo], Number(c.id.slice(1)));
  }
  return counters;
}

function ejemplo(id, nombre, descripcion, components, ground) {
  return { id, nombre, descripcion, estado: { components, ground, counters: contadores(components) } };
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
    cable("W1", p(6, 6), p(6, 4)),
    cable("W2", p(6, 4), p(10, 4)),
    cable("W3", p(14, 4), p(18, 4)),
    cable("W4", p(18, 4), p(18, 6)),
    cable("W5", p(6, 10), p(18, 10)),
  ],
  p(6, 10),
);

// TP4: (3 Ω ∥ 12 Ω) en serie con (6 Ω ∥ 4 Ω) con 60 V. Cada paralelo vale 2,4 Ω,
// así que el nodo del medio (V2) queda en 30 V y la fuente entrega 12,5 A.
const TP4 = ejemplo(
  "tp4",
  "Ejercicio TP4 (mixto)",
  "60 V sobre (3 Ω ∥ 12 Ω) en serie con (6 Ω ∥ 4 Ω): V2 = 30 V, I = 12,5 A.",
  [
    pieza("V1", "voltage_source", p(6, 4), p(6, 8), "60"),
    pieza("R1", "resistor", p(12, 4), p(12, 8), "3"),
    pieza("R2", "resistor", p(18, 4), p(18, 8), "12"),
    pieza("R3", "resistor", p(12, 8), p(12, 12), "6"),
    pieza("R4", "resistor", p(18, 8), p(18, 12), "4"),
    cable("W1", p(6, 4), p(12, 4)),
    cable("W2", p(12, 4), p(18, 4)),
    cable("W3", p(12, 8), p(18, 8)),
    cable("W4", p(6, 8), p(6, 12)),
    cable("W5", p(6, 12), p(12, 12)),
    cable("W6", p(12, 12), p(18, 12)),
  ],
  p(6, 12),
);

export const EJEMPLOS = [DIVISOR, TP4];
