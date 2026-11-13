// Etapa 2A en Chrome: nombres de nodos y corrientes (y renombrar con doble clic), deslizador en vivo
// con rango fijo, multímetro (V, A, Ω) arrastrado desde la barra, fusible que se quema y se
// reemplaza con un clic, potenciómetro, resistencia interna y los ejemplos nuevos.
// Uso: node tests/e2e/servir.mjs   (en otra terminal)   y   node tests/e2e/medir.mjs capturas
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

import { codificar } from "../../frontend/public/js/lib/compartir.js";
import { EJEMPLOS } from "../../frontend/public/js/lib/ejemplos.js";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:8000/Simulador-2.0/";
const SALIDA = process.argv[2] ?? "capturas";
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "MAL"} ${msg}`); if (!cond) process.exitCode = 1; };
const errores = [];
const link = async (id) => {
  const e = EJEMPLOS.find((x) => x.id === id);
  return `${URL_BASE}#c=${await codificar(e.estado, e.nombre)}`;
};
const navegador = await chromium.launch({ executablePath: CHROME, headless: true });

async function abrir(url) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  await contexto.addInitScript(() => {
    localStorage.setItem("simulador-dc:tutorial", JSON.stringify({ paso: 0, modo: "cerrado", empezado: false }));
    localStorage.setItem("etiquetas", "todo");
  });
  const pagina = await contexto.newPage();
  pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  pagina.on("pageerror", (e) => errores.push(String(e)));
  pagina.on("dialog", (d) => d.accept());
  await pagina.goto(url);
  await pagina.locator("#estado-simulacion[data-fase='ok']").waitFor();
  return { contexto, pagina };
}
const enPantalla = (pagina, x, y) => pagina.evaluate(([gx, gy]) => {
  const q = new DOMPoint(gx * 20 + 10, gy * 20 + 10).matrixTransform(document.getElementById("editor").getScreenCTM());
  return { x: q.x, y: q.y };
}, [x, y]);
async function clicEnPieza(pagina, id) {
  const caja = await pagina.locator(`#editor [data-id="${id}"] line.comp__seleccion, #editor [data-id="${id}"] .mm-caja`).first().boundingBox();
  await pagina.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
}
async function arrastrar(pagina, desde, hasta) {
  await pagina.mouse.move(desde.x, desde.y);
  await pagina.mouse.down();
  await pagina.mouse.move((desde.x + hasta.x) / 2, (desde.y + hasta.y) / 2, { steps: 5 });
  await pagina.mouse.move(hasta.x, hasta.y, { steps: 5 });
  await pagina.mouse.up();
}
/** Mueve el deslizador de la ficha (como si se arrastrara) y lo suelta. */
async function deslizar(pagina, valor) {
  await pagina.locator("#ficha-deslizador").evaluate((barra, v) => {
    barra.value = String(v);
    barra.dispatchEvent(new Event("input", { bubbles: true }));
    barra.dispatchEvent(new Event("change", { bubbles: true }));
  }, valor);
}
const tension = (pagina, nombre) => pagina.locator("#editor text.tension", { has: pagina.locator(".nombre-nodo", { hasText: new RegExp(`^${nombre}$`) }) })
  .locator(".valor-nodo").textContent();

// --- Nombres de nodos y corrientes -------------------------------------------------------------
{
  const { contexto, pagina } = await abrir(await link("divisor"));
  const nombres = await pagina.locator("#editor .nombre-nodo").allTextContents();
  ok(nombres.includes("A") && nombres.includes("B"), `los nodos se llaman A, B… en el dibujo (${nombres})`);
  ok((await tension(pagina, "B")).includes("8.00 V"), "el nodo B (entre R1 y R2) está a 8 V");
  // Doble clic en la etiqueta de B: renombrarlo.
  const etiqueta = await pagina.locator("#editor text.tension", { has: pagina.locator(".nombre-nodo", { hasText: /^B$/ }) }).boundingBox();
  await pagina.mouse.dblclick(etiqueta.x + 4, etiqueta.y + etiqueta.height / 2);
  await pagina.locator("#dialogo[open]").waitFor();
  await pagina.locator("#dialogo-entrada").fill("Vout");
  await pagina.click("#dialogo-aceptar");
  await pagina.locator("#editor .nombre-nodo", { hasText: "Vout" }).waitFor();
  ok(true, "doble clic en la etiqueta del nodo: se renombra (B → Vout)");
  await pagina.locator('#grupos-resultados details[data-seccion="nodos"] summary').click();
  ok((await pagina.locator("#grupos-resultados .tabla-nodos").innerText()).includes("Vout"), "Resultados usa el nombre del nodo");
  ok((await pagina.locator("#grupos-resultados .tabla-componentes").innerText()).includes("R1 (I₂)"), "y las corrientes I₁, I₂… de cada pieza");
  await pagina.click("#pestana-ecuaciones");
  ok((await pagina.locator("#grupos-ecuaciones .ecuaciones-nodos").innerText()).includes("V(Vout)"), "Ecuaciones también: V(Vout)");
  await pagina.click("#pestana-resultados");
  const r1 = await pagina.locator('#editor [data-id="R1"] line.comp__seleccion').boundingBox();
  await pagina.mouse.move(r1.x + r1.width / 2, r1.y + r1.height / 2);
  await pagina.locator("#info-flotante", { hasText: "I₂ =" }).waitFor();
  ok(true, "el cartel nombra la corriente (I₂ = 4.00 mA)");
  await pagina.screenshot({ path: `${SALIDA}/m1-nombres.png` });

  // Deslizador: R1 de 1 kΩ al máximo del rango (10 kΩ) → Vout = 12 × 2 / 12 = 2 V.
  await pagina.mouse.click(r1.x + r1.width / 2, r1.y + r1.height / 2);
  await pagina.locator("#ficha-deslizador").waitFor();
  ok((await pagina.locator("#ficha-control").innerText()).includes("escala logarítmica"), "la ficha de una resistencia tiene un deslizador logarítmico");
  await deslizar(pagina, 1000);
  await pagina.locator("#editor text.tension .valor-nodo", { hasText: "2.00 V" }).waitFor();
  ok(true, "al mover el deslizador el circuito se recalcula (R1 = 10 kΩ: Vout = 2 V)");
  await pagina.screenshot({ path: `${SALIDA}/m2-deslizador.png` });
  await pagina.keyboard.press("Control+z");
  await pagina.locator("#editor text.tension .valor-nodo", { hasText: "8.00 V" }).waitFor();
  ok(true, "todo el arrastre del deslizador se deshace con un solo Ctrl+Z");
  // Rango fijo.
  await pagina.locator("#ficha-control button").filter({ hasText: /rango/i }).click();
  await pagina.locator("#dialogo-entrada").fill("500");
  await pagina.locator("#dialogo-entrada-2").fill("2k");
  await pagina.click("#dialogo-aceptar");
  await pagina.locator("#ficha-control .ficha__extremos", { hasText: "500 Ω" }).waitFor();
  ok((await pagina.locator("#ficha-control .ficha__extremos").innerText()).includes("2.00 kΩ"), "el rango del deslizador se fija entre un mínimo y un máximo");

  // Resistencia interna de la batería.
  await clicEnPieza(pagina, "V1");
  await pagina.locator("#ficha-interna").fill("100");
  await pagina.locator("#ficha-interna").press("Enter");
  await pagina.locator("#ficha", { hasText: "Tensión en bornes" }).waitFor();
  const ficha = await pagina.locator("#ficha").innerText();
  ok(/Tensión en bornes\s+11\.6 V/.test(ficha), `con 100 Ω de resistencia interna, la tensión en bornes baja (12 V → 11,6 V)`);
  await contexto.close();
}

// --- Multímetro arrastrado desde la barra ------------------------------------------------------
{
  const { contexto, pagina } = await abrir(await link("divisor"));
  const boton = await pagina.locator('[data-herramienta="multimeter"]').boundingBox();
  await arrastrar(pagina, { x: boton.x + boton.width / 2, y: boton.y + boton.height / 2 }, await enPantalla(pagina, 30, 6));
  await pagina.locator('#editor [data-id="M1"]').waitFor({ state: "attached" });
  ok((await pagina.locator('#editor [data-id="M1"] .mm-lectura').textContent()) === "- - -", "el multímetro aparece con las puntas sueltas («- - -»)");
  await clicEnPieza(pagina, "M1");
  ok((await pagina.locator("#ficha").innerText()).includes("puntas"), "la ficha avisa que hay que apoyar las puntas");
  // Las puntas: roja al nodo de 8 V (18,4) y negra a GND (6,10).
  const punta = async (cual) => {
    const caja = await pagina.locator(`#editor [data-punta="${cual}"] .mm-punta__cuerpo`).boundingBox();
    return { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 };
  };
  await arrastrar(pagina, await punta("roja"), await enPantalla(pagina, 18, 4));
  await arrastrar(pagina, await punta("negra"), await enPantalla(pagina, 6, 10));
  await pagina.locator('#editor [data-id="M1"] .mm-lectura', { hasText: "+8.00 V" }).waitFor();
  ok(true, "V: con las puntas en B y GND el display marca +8.00 V");
  await pagina.screenshot({ path: `${SALIDA}/m3-voltimetro.png` });
  await clicEnPieza(pagina, "M1");
  await pagina.locator("#ficha-control [data-modo='Ω']").click();
  await pagina.locator('#editor [data-id="M1"] .mm-lectura', { hasText: "Ω" }).waitFor();
  ok((await pagina.locator('#editor [data-id="M1"] .mm-lectura').textContent()) === "667 Ω",
    "Ω: entre B y GND, con la batería apagada, R2 ∥ R1 = 667 Ω");
  await pagina.locator("#ficha-control [data-modo='A']").click();
  await pagina.locator("#ficha", { hasText: "borne suelto" }).waitFor();
  ok(true, "A: fuera de una rama, avisa que hay que intercalarlo");
  await contexto.close();
}

// --- Ejemplos nuevos: multímetro y fusible ---------------------------------------------------------
{
  const { contexto, pagina } = await abrir(await link("multimetro"));
  ok((await pagina.locator('#editor [data-id="M1"] .mm-lectura').textContent()) === "+8.00 V"
    && (await pagina.locator('#editor [data-id="M2"] .mm-lectura').textContent()) === "+4.00 mA",
  "ejemplo del multímetro: el voltímetro marca +8.00 V y el amperímetro +4.00 mA");
  await pagina.screenshot({ path: `${SALIDA}/m4-ejemplo-multimetro.png` });
  await contexto.close();
}
{
  const { contexto, pagina } = await abrir(await link("fusible"));
  await clicEnPieza(pagina, "S1"); // cierra S1: pasan 4 A
  await pagina.locator('#editor [data-id="F1"].quemada').waitFor({ state: "attached" });
  ok(true, "al cerrar S1 el fusible de 2 A se quema");
  await pagina.screenshot({ path: `${SALIDA}/m5-fusible-quemado.png` });
  await clicEnPieza(pagina, "S1"); // abre S1 de nuevo
  await pagina.waitForTimeout(300);
  ok(await pagina.locator('#editor [data-id="F1"].quemada').count() === 1, "abrir S1 no lo arregla: el fusible queda quemado");
  await clicEnPieza(pagina, "F1");
  await pagina.locator('#editor [data-id="F1"].quemada').waitFor({ state: "detached" });
  ok(await pagina.locator('#editor [data-id="L1"].encendida').count() === 1, "un clic en el fusible lo reemplaza y la lámpara vuelve a encender");
  // Galería: los dos ejemplos nuevos.
  await pagina.click("#pestana-circuitos");
  await pagina.click("#accion-ejemplos");
  ok(await pagina.locator(".tarjeta-ejemplo", { hasText: "multímetro" }).count() === 1
    && await pagina.locator(".tarjeta-ejemplo", { hasText: "Fusible" }).count() === 1, "la galería tiene los ejemplos del multímetro y del fusible");
  await pagina.keyboard.press("Escape");
  await contexto.close();
}

// --- Potenciómetro ------------------------------------------------------------------------------
{
  const { contexto, pagina } = await abrir(await link("divisor"));
  await pagina.keyboard.press("o");
  const destino = await enPantalla(pagina, 30, 14);
  await pagina.mouse.click(destino.x, destino.y);
  await pagina.locator('#editor [data-id="P1"]').waitFor({ state: "attached" });
  ok(await pagina.locator('#editor [data-id="P1"] .pot-punta').count() === 1, "el potenciómetro tiene su cursor (tercer borne)");
  await clicEnPieza(pagina, "P1");
  await pagina.locator("#ficha-control", { hasText: "Cursor" }).waitFor();
  await deslizar(pagina, 200);
  await pagina.locator("#ficha", { hasText: "20 % desde el borne a" }).waitFor();
  ok(true, "el deslizador de la ficha mueve la perilla (20 %)");
  await pagina.screenshot({ path: `${SALIDA}/m6-potenciometro.png` });
  await contexto.close();
}

ok(errores.length === 0, `sin errores en consola ni violaciones de CSP ${JSON.stringify(errores)}`);
await navegador.close();
console.log(process.exitCode ? "Hay comprobaciones que fallaron." : "Todas las comprobaciones pasaron.");
