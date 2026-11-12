// Corriente en cada cable (y en cada interruptor cerrado), calculada a partir del resultado del motor.
//
// El motor une con union-find los puntos conectados por cables: para él un nodo eléctrico es un
// solo punto y los cables no tienen corriente propia. Pero cada punto del nodo recibe la corriente
// de los bornes que llegan ahí, y por KCL esa corriente tiene que salir por los cables:
//   Σ (corriente que sale de p por sus cables) = s(p) = corriente que entra a p desde los componentes.
// Si los cables del nodo forman un árbol, el reparto es único. Si forman un lazo (cables ideales en
// paralelo), es indeterminado; se resuelve como si cada cable tuviera una resistencia proporcional a
// su largo, que es lo que pasa en un cable real. Sin DOM.
import { mismoPunto, nombreNodo } from "./modelo.js";

/** Los tramos que se comportan como cable: cables e interruptores cerrados. */
const esTramo = (c) => c.type === "wire" || (c.type === "switch" && c.closed !== false);

/** Eliminación gaussiana con pivoteo parcial (sistemas chicos: un nodo eléctrico). */
function resolver(A, b) {
  const n = b.length;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    [A[p], A[k]] = [A[k], A[p]];
    [b[p], b[k]] = [b[k], b[p]];
    if (Math.abs(A[k][k]) < 1e-300) continue;
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
      b[i] -= f * b[k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = Math.abs(A[i][i]) < 1e-300 ? 0 : s / A[i][i];
  }
  return x;
}

/**
 * Devuelve Map<id, corriente> para cada cable e interruptor cerrado: positiva si va de a hacia b.
 * `resultado` es la salida de simulate() (se usan las corrientes de los demás componentes).
 */
export function corrientesDeTramos(estado, resultado) {
  const corrientes = new Map();
  if (!resultado) return corrientes;
  const porId = new Map(resultado.components.map((c) => [c.id, c]));

  // s(p): corriente que entra a cada punto desde los componentes (sale por b, entra por a).
  const entrante = new Map();
  const sumar = (p, v) => entrante.set(nombreNodo(p), (entrante.get(nombreNodo(p)) ?? 0) + v);
  for (const c of estado.components) {
    if (esTramo(c)) continue;
    const i = porId.get(c.id)?.current ?? 0;
    if (!i) continue;
    sumar(c.a, -i);
    sumar(c.b, i);
  }

  // Agrupar los tramos por nodo eléctrico (componentes conexos del grafo de tramos).
  const tramos = estado.components.filter(esTramo).filter((c) => !mismoPunto(c.a, c.b));
  const vecinos = new Map();
  for (const t of tramos) {
    for (const [p, q] of [[t.a, t.b], [t.b, t.a]]) {
      const k = nombreNodo(p);
      if (!vecinos.has(k)) vecinos.set(k, []);
      vecinos.get(k).push({ tramo: t, otro: nombreNodo(q) });
    }
  }
  const visitados = new Set();
  for (const inicio of vecinos.keys()) {
    if (visitados.has(inicio)) continue;
    const puntos = [];
    const pendientes = [inicio];
    visitados.add(inicio);
    while (pendientes.length) {
      const p = pendientes.pop();
      puntos.push(p);
      for (const { otro } of vecinos.get(p)) {
        if (!visitados.has(otro)) {
          visitados.add(otro);
          pendientes.push(otro);
        }
      }
    }
    const indice = new Map(puntos.map((p, i) => [p, i]));
    const deEsteNodo = tramos.filter((t) => indice.has(nombreNodo(t.a)));
    // Laplaciano con conductancia 1/largo; el primer punto es la referencia (φ = 0).
    const n = puntos.length - 1;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const b = puntos.slice(1).map((p) => entrante.get(p) ?? 0);
    const conductancia = (t) => 1 / Math.max(1, Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y));
    for (const t of deEsteNodo) {
      const g = conductancia(t);
      const i = indice.get(nombreNodo(t.a)) - 1;
      const j = indice.get(nombreNodo(t.b)) - 1;
      if (i >= 0) A[i][i] += g;
      if (j >= 0) A[j][j] += g;
      if (i >= 0 && j >= 0) {
        A[i][j] -= g;
        A[j][i] -= g;
      }
    }
    const phi = [0, ...(n > 0 ? resolver(A, b) : [])];
    for (const t of deEsteNodo) {
      const corriente = (phi[indice.get(nombreNodo(t.a))] - phi[indice.get(nombreNodo(t.b))]) * conductancia(t);
      corrientes.set(t.id, Math.abs(corriente) < 1e-15 ? 0 : corriente);
    }
  }
  return corrientes;
}
