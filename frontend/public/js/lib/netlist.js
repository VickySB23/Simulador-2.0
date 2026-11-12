// Armado del netlist que espera POST /simulate y lectura de su resultado. Sin DOM.
import { nombreNodo, nodosElectricos, puntosConTerminal } from "./modelo.js";
import { normalizarTexto } from "./valores.js";

/** Nombre que se manda como tierra cuando todavía no hay GND: el simulador responde no_ground. */
export const SIN_TIERRA = "0";

export function armarNetlist(estado) {
  return {
    ground: estado.ground ? nombreNodo(estado.ground) : SIN_TIERRA,
    components: estado.components.map((c) => {
      const componente = { id: c.id, type: c.type, a: nombreNodo(c.a), b: nombreNodo(c.b) };
      if (c.type !== "wire") componente.value = normalizarTexto(c.value);
      return componente;
    }),
  };
}

/**
 * Problemas que se detectan sin llamar al simulador, con mensajes en términos del editor.
 * Devuelve null si el circuito se puede mandar a simular.
 */
export function problemaLocal(estado) {
  if (estado.components.length === 0) {
    return { code: "empty", message: "Dibujá un circuito: elegí una herramienta y hacé clic en la grilla." };
  }
  if (!estado.components.some((c) => c.type !== "wire")) {
    return { code: "empty", message: "Agregá al menos una resistencia o una fuente." };
  }
  if (!estado.ground) {
    return { code: "no_ground", message: "Falta la tierra: elegí GND y hacé clic en un nodo." };
  }
  if (!puntosConTerminal(estado).has(nombreNodo(estado.ground))) {
    return { code: "no_ground", message: "La tierra no toca ningún terminal: movela sobre un nodo." };
  }
  return null;
}

/** Tensión de cada punto con terminal según el resultado del simulador. */
export function tensionesPorPunto(resultado) {
  return new Map(Object.entries(resultado?.node_voltages ?? {}));
}

/**
 * Un punto por nodo eléctrico para poner la etiqueta de tensión. Se prefiere un punto donde solo
 * llegan cables (una esquina), porque al lado de una pieza la etiqueta pisa su nombre; entre
 * iguales, el de arriba a la izquierda. Se omite el nodo de tierra, que ya tiene su símbolo.
 */
export function puntosDeEtiqueta(estado) {
  const nodos = nodosElectricos(estado);
  const tierra = estado.ground ? nodos.get(nombreNodo(estado.ground)) : undefined;
  const dePieza = new Set(estado.components
    .filter((c) => c.type !== "wire")
    .flatMap((c) => [nombreNodo(c.a), nombreNodo(c.b)]));
  const clave = (nombre, p) => [dePieza.has(nombre) ? 1 : 0, p.y, p.x];
  const menor = (u, v) => u[0] - v[0] || u[1] - v[1] || u[2] - v[2];
  const elegidos = new Map();
  for (const [nombre, punto] of puntosConTerminal(estado)) {
    const grupo = nodos.get(nombre);
    if (grupo === tierra) continue;
    const actual = elegidos.get(grupo);
    if (!actual || menor(clave(nombre, punto), actual.clave) < 0) {
      elegidos.set(grupo, { punto, clave: clave(nombre, punto) });
    }
  }
  return [...elegidos.values()].map((e) => e.punto);
}

/**
 * Sentido real de la corriente para dibujar la flecha: de `desde` hacia `hasta`.
 * El simulador informa la corriente que entra por a y sale por b; si es negativa, va de b hacia a.
 */
export function sentidoCorriente(componente, corriente) {
  if (corriente === null || corriente === undefined || Math.abs(corriente) < 1e-15) return null;
  return corriente > 0
    ? { desde: componente.a, hasta: componente.b, magnitud: corriente }
    : { desde: componente.b, hasta: componente.a, magnitud: -corriente };
}

/** Color de un nodo según su tensión: azul en el mínimo, rojo en el máximo. */
export function colorTension(tension, minimo, maximo) {
  const rango = maximo - minimo;
  const t = rango < 1e-12 ? 0.5 : Math.min(1, Math.max(0, (tension - minimo) / rango));
  const tono = Math.round(220 - 220 * t);
  return `hsl(${tono} 75% 50%)`;
}

/** Normaliza un error del simulador o de la red al formato {code, message, details}. */
export function errorDeRespuesta(estado, cuerpo) {
  const detalle = cuerpo?.detail;
  if (detalle && typeof detalle === "object" && !Array.isArray(detalle) && detalle.code) {
    return { code: detalle.code, message: detalle.message ?? "Error", details: detalle.details ?? {} };
  }
  if (estado === 422) {
    return { code: "invalid_schema", message: "El circuito no respeta el formato esperado.", details: {} };
  }
  return { code: `http_${estado}`, message: `El servidor respondió ${estado}.`, details: {} };
}
