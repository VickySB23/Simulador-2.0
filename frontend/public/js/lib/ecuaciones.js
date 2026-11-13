// Ecuaciones del circuito actual para el panel "Ecuaciones": KCL en cada nodo con los valores
// del circuito y el sistema MNA [G B; Bᵀ 0]·[V; I] = [J; E] que resuelve el motor. Sin DOM.
//
// Convención de las ecuaciones de nodo: suma de corrientes que SALEN del nodo = 0, con las
// corrientes conocidas (fuentes de corriente) pasadas al lado derecho. Los nodos se llaman como en
// el dibujo (V(A), V(B)…) y la corriente de cada fuente de tensión con su nombre de rama (I₁, I₂…),
// la que entra por su borne + y sale por el −, igual que en los resultados.
import { ErrorCircuito, TIERRA, analizar, armarSistema, matrizDensa, simulate } from "./mna.js";
import { nombresDeCorrientes, nombresDeNodos } from "./nombres.js";
import { armarNetlist, estadoActivo, problemaLocal, puntoRepresentativo, simularEstado } from "./netlist.js";
import { formatearCompacto } from "./valores.js";

export const MAXIMO_MATRIZ = 30;

const restar = "−";

/** Punto representativo de cada nodo eléctrico del motor (para nombrarlo y ordenarlo). */
function puntosDeGrupos(estado, analisis) {
  const representativo = puntoRepresentativo(estado);
  const puntos = new Map();
  for (const g of analisis.grupos) {
    if (g === TIERRA) continue;
    // Un nodo oculto (el de adentro de una batería con resistencia interna) va al final.
    const real = analisis.miembros.get(g).find((m) => !m.startsWith("~"));
    puntos.set(g, real ? representativo.get(real) : { x: Infinity, y: Infinity, oculto: analisis.miembros.get(g)[0] });
  }
  return puntos;
}

/** Número corto para la matriz: 4 cifras significativas, sin ceros de relleno. */
export function numeroCorto(valor) {
  if (valor === 0) return "0";
  const absoluto = Math.abs(valor);
  const texto = absoluto >= 1e5 || absoluto < 1e-3 ? valor.toExponential(3) : valor.toPrecision(4);
  return texto.replace(/\.?0+(e|$)/, "$1").replace("e+", "e");
}

function terminoResistencia(nombreDe, g, otro, r) {
  const valor = formatearCompacto(r, "Ω");
  return otro === TIERRA ? `${nombreDe(g)}/${valor}` : `(${nombreDe(g)} ${restar} ${nombreDe(otro)})/${valor}`;
}

/**
 * Devuelve {error} si el circuito no se puede plantear, o
 * {nodos, fuentes, incognitas, A, z, x, recortada}:
 * - nodos: [{nombre, ecuacion}] una ecuación de KCL por nodo (sin tierra).
 * - fuentes: [{nombre, ecuacion}] la restricción de cada fuente de tensión.
 * - incognitas: nombres de las columnas (tensiones de nodo y corrientes de las fuentes).
 * - A, z: el sistema MNA; x: la solución. Vacíos si tiene más de MAXIMO_MATRIZ incógnitas.
 */
export function ecuacionesDe(estadoCompleto) {
  // Los componentes con un borne al aire no participan (no circula corriente por ellos).
  const estado = estadoActivo(estadoCompleto);
  const problema = problemaLocal(estado);
  if (problema) return { error: problema };
  // Con los fusibles que la simulación abrió (corto o sobrecorriente), igual que en el resultado.
  const simulado = simularEstado(estadoCompleto);
  if (simulado.error && simulado.error.code !== "empty") return { error: simulado.error };
  const abiertos = new Set(simulado.resultado?.stats.blown_fuses ?? []);
  let analisis;
  let resultado;
  try {
    const netlist = armarNetlist(estado, abiertos);
    resultado = simulate(netlist);
    // Con las lámparas quemadas abiertas, igual que en el resultado.
    analisis = analizar(netlist, new Set(resultado.stats.burned_lamps));
  } catch (e) {
    if (e instanceof ErrorCircuito) return { error: { code: e.code, message: e.message } };
    throw e;
  }
  const { activos, incognitasNodo, fuentesTension, grupo } = analisis;
  const puntos = puntosDeGrupos(estado, analisis);
  const nombresNodo = nombresDeNodos(estadoCompleto).porPunto;
  const nombresCorriente = nombresDeCorrientes(estadoCompleto);
  const nombreDe = (g) => {
    const p = puntos.get(g);
    return p.oculto ? `V(int ${p.oculto.slice(1)})` : `V(${nombresNodo.get(`${p.x}_${p.y}`) ?? `${p.x},${p.y}`})`;
  };
  const corrienteDe = (c) => nombresCorriente.get(c.id) ?? `I(${c.id})`;
  // El motor numera los nodos por nombre; para leer, de arriba hacia abajo y de izquierda a derecha.
  const ordenNodos = incognitasNodo
    .map((g, i) => ({ g, i, p: puntos.get(g) }))
    .sort((u, v) => u.p.y - v.p.y || u.p.x - v.p.x);
  const n = incognitasNodo.length;
  const orden = [...ordenNodos.map((o) => o.i), ...fuentesTension.map((_, k) => n + k)];

  const nodos = ordenNodos.map(({ g }) => {
    // Primero las resistencias y después las corrientes de las fuentes de tensión.
    const izquierda = [];
    const deFuentes = [];
    let derecha = 0;
    const fuentesDerecha = [];
    for (const c of activos) {
      const ga = grupo(c.a);
      const gb = grupo(c.b);
      if (ga !== g && gb !== g) continue;
      const enA = ga === g;
      if (c.type === "resistor" || c.type === "lamp") {
        izquierda.push(terminoResistencia(nombreDe, g, enA ? gb : ga, c.value));
      } else if (c.type === "voltage_source") {
        deFuentes.push(`${enA ? "+" : restar} ${corrienteDe(c)}`);
      } else {
        // La fuente lleva corriente de a hacia b por dentro: sale del nodo a y entra al nodo b.
        derecha += enA ? -c.value : c.value;
        fuentesDerecha.push(`${enA ? restar : "+"} ${c.id}`);
      }
    }
    const lado = [...izquierda, ...deFuentes]
      .map((t, i) => (i === 0 ? t.replace(/^\+ /, "") : t.startsWith(restar) || t.startsWith("+") ? t : `+ ${t}`))
      .join(" ");
    const ladoDerecho = fuentesDerecha.length ? formatearCompacto(derecha, "A") : "0";
    return { nombre: nombreDe(g), ecuacion: `${lado} = ${ladoDerecho}` };
  });

  const fuentes = fuentesTension.map((c) => {
    const ga = grupo(c.a);
    const gb = grupo(c.b);
    const partes = [];
    if (ga !== TIERRA) partes.push(nombreDe(ga));
    if (gb !== TIERRA) partes.push(partes.length ? `${restar} ${nombreDe(gb)}` : `${restar}${nombreDe(gb)}`);
    return { nombre: `${c.id} (${corrienteDe(c)})`, ecuacion: `${partes.join(" ")} = ${formatearCompacto(c.value, "V")}` };
  });

  const incognitas = [...ordenNodos.map((o) => nombreDe(o.g)), ...fuentesTension.map((c) => corrienteDe(c))];
  const { tamano, entradas, rhs } = armarSistema(analisis);
  if (tamano > MAXIMO_MATRIZ) return { nodos, fuentes, incognitas, A: [], z: [], x: [], recortada: true };
  const corrientes = new Map(resultado.components.map((c) => [c.id, c.current]));
  const x = [
    ...incognitasNodo.map((g) => resultado.node_voltages[analisis.miembros.get(g)[0]]),
    ...fuentesTension.map((c) => corrientes.get(c.id)),
  ];
  // Misma permutación en filas y columnas: el sistema sigue siendo el mismo.
  const A = matrizDensa(tamano, entradas);
  return {
    nodos, fuentes, incognitas,
    A: orden.map((f) => orden.map((c) => A[f][c])),
    z: orden.map((f) => rhs[f]),
    x: orden.map((f) => x[f]),
    recortada: false,
  };
}
