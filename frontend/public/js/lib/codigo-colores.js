// Código de colores de las resistencias. Sin DOM.
// 4 bandas: dos cifras, multiplicador y tolerancia dorada (±5 %). Si el valor necesita tres cifras
// significativas, 5 bandas: tres cifras, multiplicador y tolerancia marrón (±1 %, la de las
// resistencias de precisión). El multiplicador va de plata (× 0,01) a blanco (× 10⁹).

export const COLORES = ["negro", "marrón", "rojo", "naranja", "amarillo", "verde", "azul", "violeta", "gris", "blanco"];
const MULTIPLICADOR = { "-2": "plata", "-1": "dorado" };
const SUPERINDICES = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const numero = new Intl.NumberFormat("es-AR", { maximumSignificantDigits: 3 });
const entero = new Intl.NumberFormat("es-AR");

const colorDelMultiplicador = (exp) => MULTIPLICADOR[exp] ?? COLORES[exp];

function textoDelMultiplicador(exp) {
  if (exp < 0) return numero.format(10 ** exp);
  if (exp <= 3) return entero.format(10 ** exp);
  return `10${[...String(exp)].map((d) => SUPERINDICES[Number(d)]).join("")}`;
}

/** Valor con prefijo y coma decimal: 4700 → "4,7 kΩ". */
export function textoDeOhmios(ohmios) {
  const prefijos = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""]];
  const [escala, prefijo] = prefijos.find(([e]) => ohmios >= e) ?? [1, ""];
  return `${numero.format(ohmios / escala)} ${prefijo}Ω`;
}

/** Cifras significativas y exponente de `ohmios` con `n` cifras (redondeando). */
function descomponer(ohmios, n) {
  let exp = Math.floor(Math.log10(ohmios)) - (n - 1);
  let cifras = Math.round(ohmios / 10 ** exp);
  if (cifras >= 10 ** n) {
    exp += 1;
    cifras = Math.round(ohmios / 10 ** exp);
  }
  return { cifras, exp };
}

/**
 * Bandas de una resistencia de `ohmios`. Devuelve null si el valor no es positivo; si no,
 * {bandas, cifras, exp, tolerancia, porcentaje, lectura, aproximado}. `bandas` incluye la de
 * tolerancia; `lectura` es, por ejemplo, "amarillo-violeta-rojo = 47 × 100 = 4,7 kΩ".
 * Un valor que no entra en el código (más de 3 cifras, o fuera de 0,1 Ω a 999 GΩ) se redondea a
 * 3 cifras y queda marcado `aproximado`.
 */
export function codigoDeColores(ohmios) {
  if (!(ohmios > 0) || !Number.isFinite(ohmios)) return null;
  let elegido = null;
  for (const n of [2, 3]) {
    const { cifras, exp } = descomponer(ohmios, n);
    const exacto = Math.abs(cifras * 10 ** exp - ohmios) <= 1e-9 * ohmios;
    if (exacto && exp >= -2 && exp <= 9) {
      elegido = { n, cifras, exp, aproximado: false };
      break;
    }
  }
  if (!elegido) {
    const { cifras, exp } = descomponer(ohmios, 3);
    elegido = { n: 3, cifras, exp: Math.min(9, Math.max(-2, exp)), aproximado: true };
  }
  const { n, cifras, exp, aproximado } = elegido;
  const digitos = String(cifras).padStart(n, "0").split("").map((d) => COLORES[Number(d)]);
  const tolerancia = n === 2 ? "dorado" : "marrón";
  const multiplicador = colorDelMultiplicador(exp);
  const valor = cifras * 10 ** exp;
  const lectura = `${[...digitos, multiplicador].join("-")} = ${cifras} × ${textoDelMultiplicador(exp)} `
    + `${aproximado ? "≈" : "="} ${textoDeOhmios(valor)}`;
  return {
    bandas: [...digitos, multiplicador, tolerancia],
    cifras,
    exp,
    tolerancia,
    porcentaje: n === 2 ? 5 : 1,
    lectura,
    aproximado,
  };
}
