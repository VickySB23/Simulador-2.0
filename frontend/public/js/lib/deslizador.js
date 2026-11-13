// Deslizador de la ficha: varía el valor de la pieza seleccionada en vivo. Escala logarítmica para
// resistencias (y corrientes de fusible), lineal para baterías y fuentes de corriente. El rango
// por defecto se arma alrededor del valor y se puede fijar a mano. Sin DOM.
import { interpretarValor } from "./valores.js";

export const PASOS = 1000;

/** "log" o "lineal" según la pieza. */
export const escalaDe = (c) => (c.type === "voltage_source" || c.type === "current_source" ? "lineal" : "log");

function numero(texto) {
  try {
    return interpretarValor(String(texto ?? ""));
  } catch {
    return NaN;
  }
}

/** Rango {min, max} (números) de la pieza: el que fijó el usuario o uno alrededor del valor. */
export function rangoDe(c) {
  const fijado = c.rango && { min: numero(c.rango.min), max: numero(c.rango.max) };
  if (fijado && Number.isFinite(fijado.min) && Number.isFinite(fijado.max) && fijado.max > fijado.min) {
    if (escalaDe(c) === "lineal" || fijado.min > 0) return fijado;
  }
  const valor = numero(c.value);
  if (escalaDe(c) === "lineal") {
    const tope = Math.max(Math.abs(valor) * 2, c.type === "voltage_source" ? 24 : 0.01) || 10;
    return { min: 0, max: tope };
  }
  const base = valor > 0 ? valor : 1000;
  return { min: base / 10, max: base * 10 };
}

/** Redondea a 3 cifras significativas. */
export function redondear(valor) {
  if (valor === 0 || !Number.isFinite(valor)) return valor;
  const escala = 10 ** (Math.floor(Math.log10(Math.abs(valor))) - 2);
  return Math.round(valor / escala) * escala;
}

/** Posición del deslizador (0 a PASOS) para un valor. */
export function posicionDeValor(valor, { min, max }, escala) {
  const t = escala === "log"
    ? (Math.log(valor) - Math.log(min)) / (Math.log(max) - Math.log(min))
    : (valor - min) / (max - min);
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * PASOS);
}

/** Valor (redondeado a 3 cifras) para una posición del deslizador. */
export function valorDePosicion(posicion, { min, max }, escala) {
  const t = Math.min(1, Math.max(0, posicion / PASOS));
  const valor = escala === "log" ? Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min))) : min + t * (max - min);
  return redondear(valor);
}

const PREFIJOS = [[1e9, "G"], [1e6, "MEG"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "u"], [1e-9, "n"]];

/** Texto con prefijo que entiende el editor: 4700 → "4.7k", 0.0022 → "2.2m", 2e6 → "2MEG". */
export function textoDeValor(valor) {
  if (valor === 0) return "0";
  const [escala, prefijo] = PREFIJOS.find(([e]) => Math.abs(valor) >= e) ?? PREFIJOS.at(-1);
  const cifras = Number((valor / escala).toPrecision(3));
  return `${cifras}${prefijo}`;
}
