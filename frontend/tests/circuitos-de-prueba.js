// Circuitos que usan los tests pero ya no están entre los ejemplos de la página.
// El TP4 (mixto) se sacó de los ejemplos, pero sus números conocidos (30 V, 12,5 A, 750 W)
// siguen siendo una buena prueba del motor, de las ecuaciones y del editor en Chrome.
const p = (x, y) => ({ x, y });
const pieza = (id, type, a, b, value) => ({ id, type, a, b, value });
const cable = (id, a, b) => ({ id, type: "wire", a, b });

// TP4: (3 Ω ∥ 12 Ω) en serie con (6 Ω ∥ 4 Ω) con 60 V. Cada paralelo vale 2,4 Ω, así que el nodo
// del medio queda en 30 V y la fuente entrega 12,5 A (750 W).
export const TP4 = {
  id: "tp4",
  nombre: "Mixto (TP4)",
  descripcion: "60 V sobre (3 Ω ∥ 12 Ω) en serie con (6 Ω ∥ 4 Ω): V2 = 30 V, I = 12,5 A.",
  estado: {
    components: [
      pieza("V1", "voltage_source", p(6, 4), p(6, 8), "60"),
      pieza("R1", "resistor", p(12, 4), p(12, 8), "3"),
      pieza("R2", "resistor", p(18, 4), p(18, 8), "12"),
      pieza("R3", "resistor", p(12, 8), p(12, 12), "6"),
      pieza("R4", "resistor", p(18, 8), p(18, 12), "4"),
      cable("W1", p(6, 4), p(12, 4)), cable("W2", p(12, 4), p(18, 4)), cable("W3", p(12, 8), p(18, 8)),
      cable("W4", p(6, 8), p(6, 12)), cable("W5", p(6, 12), p(12, 12)), cable("W6", p(12, 12), p(18, 12)),
      { id: "G1", type: "ground", a: p(6, 12), b: p(6, 12) },
    ],
    counters: { R: 4, V: 1, I: 0, W: 6, L: 0, S: 0, G: 1 },
    sinTierraAuto: [],
  },
};
