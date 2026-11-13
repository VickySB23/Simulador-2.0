// Ficha de un componente seleccionado: sus datos, lo que dio la simulación y avisos. Sin DOM.
import { TIPOS } from "./modelo.js";
import { codigoDeColores } from "./codigo-colores.js";
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
export function fichaDe(c, fila, { nombreCorriente, nodos, lectura } = {}) {
  const tipo = TIPOS[c.type];
  if (c.type === "multimeter") {
    const modos = { V: "Voltímetro (V)", A: "Amperímetro (A)", "Ω": "Óhmetro (Ω)" };
    const filas = [["Selector", modos[c.modo]], ["Lectura", lectura?.texto ?? "- - -"]];
    if (c.modo !== "A") filas.push(["Puntas", "roja (+) y negra (−): arrastralas a dos puntos del circuito"]);
    return {
      titulo: `${c.id} · Multímetro`, filas,
      avisos: lectura?.aviso ? [{ tipo: "aviso", texto: lectura.aviso }] : [],
    };
  }
  if (c.type === "ground") {
    return {
      titulo: `${c.id} · ${tipo.nombre}`,
      filas: [["Tensión", "0 V (referencia)"], ["Ubicación", `(${c.a.x}, ${c.a.y})`]],
      avisos: c.auto ? [{ tipo: "aviso", texto: "Se colocó sola en el borne − de la batería. Podés moverla a cualquier nodo." }] : [],
    };
  }
  const filas = [];
  const avisos = [];
  if (c.type === "lamp") {
    filas.push(["Resistencia", formatearSI(numero(c.value) ?? 0, "Ω")]);
    filas.push(["Potencia nominal", formatearSI(numero(c.potencia) ?? 0, "W")]);
    const nominal = corrienteNominal(c);
    if (nominal) filas.push(["Corriente nominal", formatearSI(nominal, "A")]);
  } else if (c.type === "switch") {
    filas.push(["Estado", c.closed === false ? "abierto" : "cerrado"]);
  } else if (c.type === "fuse") {
    filas.push(["Corriente nominal", formatearSI(numero(c.value) ?? 0, "A")]);
    filas.push(["Estado", c.quemado || fila?.blown ? "quemado" : "entero"]);
  } else if (c.type === "potentiometer") {
    filas.push(["Resistencia total", formatearSI(numero(c.value) ?? 0, "Ω")]);
    filas.push(["Cursor", `${Math.round((c.posicion ?? 0.5) * 100)} % desde el borne a`]);
  } else if (c.type !== "wire") {
    filas.push([c.type === "resistor" ? "Resistencia" : "Valor", formatearSI(numero(c.value) ?? 0, tipo.unidad)]);
  }
  // Código de colores: la lectura de las bandas, como se aprende en clase.
  const codigo = c.type === "resistor" ? codigoDeColores(numero(c.value)) : null;
  if (codigo) {
    filas.push(["Código de colores", codigo.lectura]);
    filas.push(["Tolerancia", `${codigo.tolerancia} (±${codigo.porcentaje} %)`]);
  }
  if (nodos?.[0] && nodos?.[1] && c.type !== "wire") filas.push(["Entre los nodos", `${nodos[0]} → ${nodos[1]}`]);
  if (c.type === "voltage_source" && fila?.emf !== undefined) {
    filas.push(["Tensión de la pila (fem)", formatearSI(fila.emf, "V")]);
    filas.push(["Pérdida en la resistencia interna", formatearSI(fila.perdida, "W")]);
  }
  if (fila && c.type !== "wire" && c.type !== "switch") {
    filas.push([c.type === "voltage_source" && fila.emf !== undefined ? "Tensión en bornes" : "Tensión",
      fila.voltage === null ? "—" : formatearSI(fila.voltage, "V")]);
    filas.push([nombreCorriente ? `Corriente ${nombreCorriente}` : "Corriente", formatearSI(Math.abs(fila.current), "A")]);
    filas.push(["Potencia", formatearSI(fila.power, "W") + (fila.power < -1e-15 ? " (entrega)" : "")]);
    if (c.type === "lamp" && !fila.unconnected) {
      filas.push(["Brillo", fila.burned ? "quemada" : `${Math.round(Math.min(1, fila.brightness) * 100)} %`]);
    }
  }
  if (fila?.unconnected) {
    avisos.push({ tipo: "aviso", texto: "Tiene un borne sin conectar: no circula corriente por este componente." });
  } else if (fila?.burned || c.quemada) {
    avisos.push({ tipo: "error", texto: "Se quemó: superó su potencia nominal y abrió el circuito. Tocala en el dibujo para reemplazarla." });
  } else if (fila?.blown || c.quemado) {
    avisos.push({ tipo: "error", texto: "Se quemó: la corriente superó la nominal y abrió el circuito. Tocalo en el dibujo para reemplazarlo." });
  }
  const baja = avisoCorrienteBaja(c, fila);
  if (baja) avisos.push({ tipo: "aviso", texto: baja });
  return { titulo: c.type === "wire" ? `Cable ${c.id}` : `${c.id} · ${tipo.nombre}`, filas, avisos };
}

/**
 * Texto corto para mostrar al pasar el mouse: nombre y, si se simuló, tensión y corriente.
 * @param {object} c  componente del estado
 * @param {{fila?: object, tension?: number|null, corriente?: number}} datos  fila del resultado;
 *   para cables e interruptores, la tensión del nodo (respecto de GND) y la corriente del tramo
 * @returns {{titulo: string, detalle: string|null}}
 */
export function resumenFlotante(c, { fila, tension, corriente, nombreCorriente, nodo, lectura } = {}) {
  const tipo = TIPOS[c.type];
  const titulo = c.type === "wire" ? `Cable ${c.id}` : `${c.id} · ${tipo.nombre}`;
  if (c.type === "ground") return { titulo, detalle: "0 V: la referencia del circuito" };
  if (c.type === "multimeter") {
    return { titulo: `${titulo} (${c.modo})`, detalle: [lectura?.texto ?? "- - -", lectura?.aviso].filter(Boolean).join(" · ") };
  }
  if (c.quemado || c.quemada || fila?.blown) {
    return { titulo, detalle: c.type === "lamp" ? "Quemada: tocala para reemplazarla" : "Quemado: tocalo para reemplazarlo" };
  }
  if (fila?.unconnected) return { titulo, detalle: "Sin conectar: no circula corriente" };
  if (c.type === "wire" || c.type === "switch") {
    if (corriente === undefined && (tension === undefined || tension === null)) return { titulo, detalle: nodo ? `Nodo ${nodo}` : null };
    const partes = [];
    if (nodo && c.type === "wire") partes.push(`Nodo ${nodo}`);
    if (c.type === "switch" && c.closed === false) partes.push("abierto");
    if (tension !== undefined && tension !== null) partes.push(`${formatearSI(tension, "V")} respecto de GND`);
    partes.push(formatearSI(Math.abs(corriente ?? 0), "A"));
    return { titulo, detalle: partes.join(" · ") };
  }
  if (!fila) return { titulo, detalle: null };
  const i = formatearSI(Math.abs(fila.current), "A");
  const partes = [
    fila.voltage === null ? "— V" : formatearSI(fila.voltage, "V"),
    nombreCorriente ? `${nombreCorriente} = ${i}` : i,
  ];
  if (c.type === "lamp") partes.push(fila.burned ? "quemada" : `brillo ${Math.round(Math.min(1, fila.brightness) * 100)} %`);
  return { titulo, detalle: partes.join(" · ") };
}
