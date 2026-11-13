// Nombres de los nodos (A, B, C… o los que ponga el usuario; GND es siempre la referencia, 0 V) y
// de las corrientes de rama (I₁, I₂…). Los usan el dibujo, Resultados, Ecuaciones, el cartel y la
// ficha, así todo se llama igual. Sin DOM.
import { nombreNodo, nodosElectricos, terminales, tierrasDe } from "./modelo.js";
import { puntoRepresentativo } from "./netlist.js";

const SUBINDICES = "₀₁₂₃₄₅₆₇₈₉";
export const subindice = (n) => [...String(n)].map((d) => SUBINDICES[Number(d)]).join("");

/** Letras para los nodos: A…Z, AA, AB… */
export function letra(n) {
  let texto = "";
  for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) texto = String.fromCharCode(65 + ((k - 1) % 26)) + texto;
  return texto;
}

/**
 * Nombre de cada nodo eléctrico. Devuelve {porPunto: Map<"x_y", nombre>, porGrupo: Map<grupo,
 * nombre>}. El de la tierra es "GND"; un nombre que puso el usuario (en `estado.nombresNodos`,
 * guardado en un punto del nodo) se respeta mientras ese punto siga en el nodo; el resto recibe
 * letras en orden de lectura (de arriba abajo y de izquierda a derecha), sin repetir.
 */
export function nombresDeNodos(estado) {
  const nodos = nodosElectricos(estado);
  const representativo = puntoRepresentativo(estado);
  const tierras = new Set(tierrasDe(estado).map((t) => nodos.get(nombreNodo(t.a))));
  const propios = estado.nombresNodos ?? {};
  const miembros = new Map();
  for (const [punto, grupo] of nodos) {
    if (!miembros.has(grupo)) miembros.set(grupo, []);
    miembros.get(grupo).push(punto);
  }
  const porGrupo = new Map();
  const usados = new Set(["GND"]);
  for (const [grupo, puntos] of miembros) {
    if (tierras.has(grupo)) {
      porGrupo.set(grupo, "GND");
      continue;
    }
    const conNombre = puntos.slice().sort().find((p) => propios[p] && !usados.has(propios[p]));
    if (conNombre) {
      porGrupo.set(grupo, propios[conNombre]);
      usados.add(propios[conNombre]);
    }
  }
  const restantes = [...miembros.keys()].filter((g) => !porGrupo.has(g)).map((g) => ({ g, p: representativo.get(g) }))
    .sort((u, v) => u.p.y - v.p.y || u.p.x - v.p.x);
  let n = 0;
  for (const { g } of restantes) {
    while (usados.has(letra(n))) n++;
    porGrupo.set(g, letra(n));
    usados.add(letra(n));
    n++;
  }
  const porPunto = new Map([...nodos].map(([punto, grupo]) => [punto, porGrupo.get(grupo)]));
  return { porPunto, porGrupo };
}

/** I₁, I₂… para cada pieza por la que circula una corriente de rama, en el orden en que se agregaron. */
export function nombresDeCorrientes(estado) {
  const nombres = new Map();
  let n = 0;
  for (const c of estado.components) {
    if (c.type === "wire" || c.type === "ground" || !terminales(c).length) continue;
    nombres.set(c.id, `I${subindice(++n)}`);
  }
  return nombres;
}

/** Valida un nombre de nodo nuevo; devuelve el error o null. `otros`: los nombres de los demás nodos. */
export function validarNombreNodo(nombre, otros) {
  const texto = nombre.trim();
  if (!texto) return null; // vacío: vuelve a la letra automática
  if (texto.toUpperCase() === "GND") return "GND es la tierra: elegí otro nombre.";
  if (!/^[\p{L}][\p{L}\p{N}_]{0,7}$/u.test(texto)) return "Hasta 8 letras o números, empezando con una letra.";
  if (otros.includes(texto)) return `Ya hay un nodo que se llama ${texto}.`;
  return null;
}

/** Pone (o saca, con "") el nombre del nodo que contiene `punto`. */
export function renombrarNodo(estado, punto, nombre) {
  const nodos = nodosElectricos(estado);
  const grupo = nodos.get(nombreNodo(punto));
  if (grupo === undefined) return estado;
  const nombresNodos = Object.fromEntries(Object.entries(estado.nombresNodos ?? {}).filter(([p]) => nodos.get(p) !== grupo));
  const texto = nombre.trim();
  if (texto) nombresNodos[nombreNodo(punto)] = texto;
  const { nombresNodos: _anterior, ...resto } = estado;
  return Object.keys(nombresNodos).length ? { ...resto, nombresNodos } : resto;
}
