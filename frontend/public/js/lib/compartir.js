// Circuito dentro del hash de la URL: JSON compacto, comprimido (deflate) y en base64url.
// Así un link reproduce el circuito exacto (ids, posiciones, valores, tierra y contadores) sin
// servidor. Sin DOM: usa CompressionStream, que existe en los navegadores actuales y en Node 18+.
import { VERSION_LAYOUT, desdeLayout } from "./modelo.js";

export const PREFIJO_HASH = "#c=";
const VERSION = 1;
const CODIGOS = { resistor: "r", voltage_source: "v", current_source: "i", wire: "w", lamp: "l", switch: "s", ground: "g" };
const PREFIJOS = ["R", "V", "I", "W", "L", "S", "G"];
const TIPOS = Object.fromEntries(Object.entries(CODIGOS).map(([tipo, codigo]) => [codigo, tipo]));

/**
 * Forma compacta: [id, tipo, ax, ay, bx, by, valor?, potencia?]; en un interruptor, [..., 1 | 0]
 * (cerrado); en una tierra, [..., 1 | 0] (automática). `t`: circuitos sin tierra automática.
 */
function compactar(estado, nombre) {
  return {
    v: VERSION,
    n: nombre,
    k: PREFIJOS.map((p) => estado.counters[p] ?? 0),
    t: estado.sinTierraAuto ?? [],
    c: estado.components.map((c) => {
      const fila = [c.id, CODIGOS[c.type], c.a.x, c.a.y, c.b.x, c.b.y];
      if (c.type === "switch") fila.push(c.closed === false ? 0 : 1);
      else if (c.type === "ground") fila.push(c.auto ? 1 : 0);
      else if (c.type !== "wire") fila.push(c.value);
      if (c.type === "lamp") fila.push(c.potencia);
      return fila;
    }),
  };
}

function expandir(datos) {
  if (datos?.v !== VERSION || !Array.isArray(datos.c)) throw new Error("El link no tiene un circuito válido.");
  const layout = {
    version: VERSION_LAYOUT,
    // Links viejos: una sola tierra en `g`.
    ground: Array.isArray(datos.g) ? { x: datos.g[0], y: datos.g[1] } : null,
    counters: Object.fromEntries(PREFIJOS.map((p, i) => [p, datos.k?.[i] ?? 0])),
    sinTierraAuto: Array.isArray(datos.t) ? datos.t : [],
    components: datos.c.map(([id, codigo, ax, ay, bx, by, extra, potencia]) => {
      const c = { id, type: TIPOS[codigo], a: { x: ax, y: ay }, b: { x: bx, y: by } };
      if (codigo === "s") c.closed = extra !== 0;
      else if (codigo === "g") c.auto = extra === 1;
      else if (codigo !== "w") c.value = extra;
      if (codigo === "l") c.potencia = potencia;
      return c;
    }),
  };
  return { nombre: typeof datos.n === "string" ? datos.n : "Circuito compartido", estado: desdeLayout(layout) };
}

async function transformar(bytes, flujo) {
  const salida = new Blob([bytes]).stream().pipeThrough(flujo);
  return new Uint8Array(await new Response(salida).arrayBuffer());
}

function aBase64Url(bytes) {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function desdeBase64Url(texto) {
  const base64 = texto.replaceAll("-", "+").replaceAll("_", "/");
  const binario = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** Devuelve el código que va después de "#c=". */
export async function codificar(estado, nombre) {
  const json = new TextEncoder().encode(JSON.stringify(compactar(estado, nombre)));
  return aBase64Url(await transformar(json, new CompressionStream("deflate-raw")));
}

/** Lee un código (con o sin "#c=" adelante). Devuelve {nombre, estado}; lanza Error si no es válido. */
export async function decodificar(codigo) {
  const limpio = codigo.startsWith(PREFIJO_HASH) ? codigo.slice(PREFIJO_HASH.length) : codigo;
  let datos;
  try {
    const bytes = await transformar(desdeBase64Url(limpio), new DecompressionStream("deflate-raw"));
    datos = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("El link está incompleto o dañado.");
  }
  return expandir(datos);
}
