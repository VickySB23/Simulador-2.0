// La interfaz nueva usa solo los tokens de css/tokens.css: ningún color ni tamaño literal fuera de ahí.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = (nombre) => readFileSync(new URL(`../public/css/${nombre}`, import.meta.url), "utf-8");
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "");
const HOJAS = ["ui.css", "circuito.css", "galeria.css", "editor.css"];

test("ui.css, circuito.css, galeria.css y editor.css no tienen colores literales", () => {
  for (const hoja of HOJAS) {
    const texto = sinComentarios(css(hoja));
    const colores = texto.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab)\(/g) ?? [];
    assert.deepEqual(colores, [], `${hoja}: ${colores.join(", ")}`);
    const nombrados = texto.match(/:\s*(?:white|black|red|blue|green|gray|grey|yellow|orange)\b/g) ?? [];
    assert.deepEqual(nombrados, [], `${hoja}: ${nombrados.join(", ")}`);
  }
});

test("ui.css, circuito.css, galeria.css y editor.css no tienen tamaños literales en px o rem (salvo media queries)", () => {
  for (const hoja of HOJAS) {
    const lineas = sinComentarios(css(hoja)).split("\n").filter((l) => !l.trim().startsWith("@media"));
    const tamanos = lineas.join("\n").match(/\b\d+(?:\.\d+)?(?:px|rem)\b/g) ?? [];
    assert.deepEqual(tamanos, [], `${hoja}: ${tamanos.join(", ")}`);
  }
});

test("las familias tipográficas salen de los tokens", () => {
  for (const hoja of HOJAS) {
    const familias = (sinComentarios(css(hoja)).match(/font-family:\s*[^;]+/g) ?? [])
      .filter((d) => !/var\(--fuente(-mono)?\)|inherit/.test(d));
    assert.deepEqual(familias, [], `${hoja}: ${familias.join(", ")}`);
  }
});

test("tokens.css define las variantes clara, oscura y proyector, y la fuente local", () => {
  const tokens = css("tokens.css");
  assert.match(tokens, /:root\s*\{/);
  assert.match(tokens, /prefers-color-scheme:\s*dark/);
  assert.match(tokens, /:root\[data-theme="dark"\]/);
  assert.match(tokens, /:root\[data-proyector="1"\]/);
  assert.match(tokens, /url\("\.\.\/fonts\/nunito\.woff2"\)/);
  assert.ok(!/https?:\/\//.test(tokens.replace(/\/\*[\s\S]*?\*\//g, "")), "sin CDN");
});

test("cada variable usada en las hojas está definida en tokens.css", () => {
  const tokens = css("tokens.css");
  const definidas = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  // Variables por componente que pone js/dibujo.js con CSSOM.
  for (const local of ["--brillo", "--calor", "--duracion"]) definidas.add(local);
  for (const hoja of HOJAS) {
    const usadas = [...sinComentarios(css(hoja)).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
    const faltan = [...new Set(usadas.filter((v) => !definidas.has(v)))];
    assert.deepEqual(faltan, [], `${hoja}: ${faltan.join(", ")}`);
  }
});
