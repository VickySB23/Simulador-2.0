// Valores con prefijo SI para el editor. La interpretación es la del motor (mna.js, igual que
// parse_value del backend: M y MEG = mega, m = mili); acá se suma la coma decimal y el formato.
import { parseValue } from "./mna.js";

/** Acepta coma decimal ("4,7k") y la convierte a punto, que es lo que entiende el motor. */
export function normalizarTexto(texto) {
  return String(texto).trim().replace(",", ".");
}

/** Convierte 10, "10", "4.7k", "4,7k", "1MEG", "5m" o "10 kΩ" a número. Lanza Error si no es válido. */
export function interpretarValor(crudo) {
  if (crudo === null || crudo === undefined) throw new Error("Valor inválido: vacío. Ejemplos: 10k, 4.7k, 5m.");
  try {
    return parseValue(typeof crudo === "number" ? crudo : normalizarTexto(crudo));
  } catch (e) {
    throw new Error(`${e.message}. Ejemplos: 10k, 4.7k, 5m.`);
  }
}

const ESCALAS = [
  [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"],
];

/** Como formatearSI pero sin ceros de relleno: 4700 -> "4.7 kΩ", 3 -> "3 Ω". Para etiquetas. */
export function formatearCompacto(valor, unidad = "") {
  const texto = formatearSI(valor, unidad);
  return texto.replace(/^(-?\d+)\.(\d*?)0+(?=\s)/, (_, entero, decimales) =>
    decimales ? `${entero}.${decimales}` : entero);
}

/** 0.0032, "A" -> "3.20 mA". Tres cifras significativas. */
export function formatearSI(valor, unidad = "", cifras = 3) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  const absoluto = Math.abs(valor);
  if (absoluto < 1e-15) return `0 ${unidad}`.trim();
  const [escala, prefijo] = ESCALAS.find(([e]) => absoluto >= e * 0.9995) ?? ESCALAS.at(-1);
  const texto = (valor / escala).toPrecision(cifras);
  // toPrecision puede devolver notación exponencial para valores enormes.
  const numero = texto.includes("e") ? String(Number(texto)) : texto;
  return `${numero} ${prefijo}${unidad}`.trim();
}
