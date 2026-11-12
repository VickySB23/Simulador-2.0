// Para funcionar sin internet, el service worker tiene que guardar todos los archivos de public/.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

const PUBLICO = new URL("../public/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function archivos(carpeta) {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [relative(PUBLICO, ruta).split(sep).join("/")];
  });
}

test("ARCHIVOS del service worker coincide con el contenido de public/", () => {
  const fuente = readFileSync(join(PUBLICO, "sw.js"), "utf-8");
  const lista = [...fuente.match(/const ARCHIVOS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const enDisco = archivos(PUBLICO).filter((a) => a !== "sw.js").sort();
  assert.deepEqual(lista.filter((a) => a !== "./").sort(), enDisco);
});

test("index.html solo usa rutas relativas (GitHub Pages publica en /Simulador-2.0/)", () => {
  const html = readFileSync(join(PUBLICO, "index.html"), "utf-8");
  const rutas = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(rutas.length > 0);
  for (const ruta of rutas) assert.ok(!ruta.startsWith("/") && !ruta.includes("://"), ruta);
});

test("la versión de la página y la del service worker coinciden", () => {
  const sw = readFileSync(join(PUBLICO, "sw.js"), "utf-8").match(/const VERSION = "([^"]+)"/)[1];
  const pagina = readFileSync(join(PUBLICO, "js/version.js"), "utf-8").match(/VERSION = "([^"]+)"/)[1];
  assert.equal(pagina, sw);
});

test("en el repo la versión es el marcador que reemplaza el workflow", () => {
  const sw = readFileSync(join(PUBLICO, "sw.js"), "utf-8");
  assert.match(sw, /const VERSION = "simulador-dc-dev";/);
  const workflow = readFileSync(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf-8");
  assert.ok(workflow.includes("simulador-dc-dev") && workflow.includes("GITHUB_SHA"));
});

test("el service worker no se activa solo: espera a que el usuario toque Actualizar", () => {
  const fuente = readFileSync(join(PUBLICO, "sw.js"), "utf-8");
  const install = fuente.slice(fuente.indexOf('addEventListener("install"'), fuente.indexOf('addEventListener("activate"'));
  assert.ok(!/skipWaiting\(\)/.test(install.replace(/\/\/.*$/gm, "")), "install no debe llamar a skipWaiting");
  assert.ok(fuente.includes('evento.data?.tipo === "ACTIVAR") self.skipWaiting()'));
});
