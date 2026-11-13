// Ficha de un componente seleccionado: sus datos, lo que dio la simulación y avisos. Sin DOM.
import { TIPOS } from "./modelo.js";
import { formatearSI, interpretarValor } from "./valores.js";

/** Debajo de este brillo (2 % de la potencia nominal) la lámpara casi no se ve encendida. */
export const BRILLO_MINIMO = 0.02;

function numero(texto) {
  try {
    return interpretarValor(texto);
  } catch {
    return null;
  }
}

/** Corriente nominal de una lámpara: la que la hace disipar su potencia nominal, √(Pnom / R). */
export function corrienteNominal(lampara) {
  const r = numero(lampara.value);
  const p = numero(lampara.potencia);
  return r > 0 && p > 0 ? Math.sqrt(p / r) : null;
}

/** Aviso de corriente baja, o null: lámpara conectada, sana, con corriente y brillo < 2 %. */
export function avisoCorrienteBaja(lampara, fila) {
  if (lampara.type !== "lamp" || !fila || fila.unconnected || fila.burned) return null;
  const corriente = Math.abs(fila.current);
  const nominal = corrienteNominal(lampara);
  if (!nominal || corriente < 1e-9 || !(fila.brightness < BRILLO_MINIMO)) return null;
  return `La corriente es muy baja para esta lámpara (${formatearSI(corriente, "A")} de ${formatearSI(nominal, "A")} nominales).`;
}

/**
 * @param {object} c  componente del estado
 * @param {object|undefined} fila  su fila en resultado.components (si se simuló)
 * @returns {{titulo: string, filas: [string, string][], avisos: {tipo: string, texto: string}[]}}
 */
export function fichaDe(c, fila) {
  const tipo = TIPOS[c.type];
  const filas = [];
  const avisos = [];
  if (c.type === "lamp") {
    filas.push(["Resistencia", formatearSI(numero(c.value) ?? 0, "Ω")]);
    filas.push(["Potencia nominal", formatearSI(numero(c.potencia) ?? 0, "W")]);
    const nominal = corrienteNominal(c);
    if (nominal) filas.push(["Corriente nominal", formatearSI(nominal, "A")]);
  } else if (c.type === "switch") {
    filas.push(["Estado", c.closed === false ? "abierto" : "cerrado"]);
  } else if (c.type !== "wire") {
    filas.push([c.type === "resistor" ? "Resistencia" : "Valor", formatearSI(numero(c.value) ?? 0, tipo.unidad)]);
  }
  if (fila && c.type !== "wire" && c.type !== "switch") {
    filas.push(["Tensión", fila.voltage === null ? "—" : formatearSI(fila.voltage, "V")]);
    filas.push(["Corriente", formatearSI(Math.abs(fila.current), "A")]);
    filas.push(["Potencia", formatearSI(fila.power, "W") + (fila.power < -1e-15 ? " (entrega)" : "")]);
    if (c.type === "lamp" && !fila.unconnected) {
      filas.push(["Brillo", fila.burned ? "quemada" : `${Math.round(Math.min(1, fila.brightness) * 100)} %`]);
    }
  }
  if (fila?.unconnected) {
    avisos.push({ tipo: "aviso", texto: "Tiene un borne sin conectar: no circula corriente por este componente." });
  } else if (fila?.burned) {
    avisos.push({ tipo: "error", texto: "Se quemó: superó su potencia nominal y abrió el circuito." });
  }
  const baja = avisoCorrienteBaja(c, fila);
  if (baja) avisos.push({ tipo: "aviso", texto: baja });
  return { titulo: c.type === "wire" ? `Cable ${c.id}` : `${c.id} · ${tipo.nombre}`, filas, avisos };
}
