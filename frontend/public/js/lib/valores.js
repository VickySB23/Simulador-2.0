// Valores con prefijo SI: misma convención que simulation-service (M y MEG = mega, m = mili).

const PREFIJOS = {
  T: 1e12, G: 1e9, MEG: 1e6, M: 1e6, k: 1e3, K: 1e3,
  m: 1e-3, u: 1e-6, "µ": 1e-6, n: 1e-9, p: 1e-12,
};
const PATRON =
  /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(MEG|Meg|meg|[TGMkKmuµnp])?\s*(Ω|ohm|Ohm|ohms|V|A)?\s*$/;

/** Acepta coma decimal ("4,7k") y la convierte a punto, que es lo que entiende el backend. */
export function normalizarTexto(texto) {
  return String(texto).trim().replace(",", ".");
}

/** Convierte 10, "10", "4.7k", "1MEG", "5m" o "10 kΩ" a número. Lanza Error si no es válido. */
export function interpretarValor(crudo) {
  if (typeof crudo === "number") {
    if (!Number.isFinite(crudo)) throw new Error("El valor no es un número finito.");
    return crudo;
  }
  const coincidencia = PATRON.exec(normalizarTexto(crudo ?? ""));
  if (!coincidencia) throw new Error(`Valor inválido: "${crudo}". Ejemplos: 10k, 4.7k, 5m.`);
  const [, numero, prefijo] = coincidencia;
  const factor = !prefijo ? 1 : prefijo.toUpperCase() === "MEG" ? 1e6 : PREFIJOS[prefijo];
  const valor = Number(numero) * factor;
  if (!Number.isFinite(valor)) throw new Error("El valor no es un número finito.");
  return valor;
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
