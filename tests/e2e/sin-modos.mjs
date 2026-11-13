// Interacción sin modos: arrastrar piezas desde la barra, volver solo a Seleccionar, dibujar cables
// desde un borne (en L y siguiendo desde la punta), estirar un cable por su punta, atajos de una
// letra, cartel con tensión y corriente, menú con clic derecho y con presión larga, zoom con la
// rueda y con dos dedos, y mover la vista arrastrando el fondo.
// Uso: node tests/e2e/servir.mjs   (en otra terminal)   y   node tests/e2e/sin-modos.mjs capturas
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:8000/Simulador-2.0/";
const SALIDA = process.argv[2] ?? "capturas";
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "MAL"} ${msg}`); if (!cond) process.exitCode = 1; };
const errores = [];
const navegador = await chromium.launch({ executablePath: CHROME, headless: true });

async function abrir(opciones = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...opciones });
  // Sin el tutorial plegado encima del lienzo.
  await contexto.addInitScript(() => localStorage.setItem("simulador-dc:tutorial", JSON.stringify({ paso: 0, modo: "cerrado", empezado: false })));
  const pagina = await contexto.newPage();
  pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  pagina.on("pageerror", (e) => errores.push(String(e)));
  pagina.on("dialog", (d) => d.accept());
  await pagina.goto(URL_BASE);
  await pagina.locator("#estado-simulacion[data-fase='ok']").waitFor();
  return { contexto, pagina };
}

const { contexto, pagina } = await abrir();
const fase = (f) => pagina.locator(`#estado-simulacion[data-fase="${f}"]`).waitFor({ timeout: 10000 });
const enPantalla = (x, y, p = pagina) => p.evaluate(([gx, gy]) => {
  const q = new DOMPoint(gx * 20 + 10, gy * 20 + 10).matrixTransform(document.getElementById("editor").getScreenCTM());
  return { x: q.x, y: q.y };
}, [x, y]);
async function clic(x, y, opciones = {}) {
  const p = await enPantalla(x, y);
  await pagina.mouse.click(p.x, p.y, opciones);
}
/** Arrastra pasando por los puntos de la grilla dados (el primer tramo decide hacia dónde dobla). */
async function arrastrarPor(...puntos) {
  const ps = [];
  for (const [x, y] of puntos) ps.push(await enPantalla(x, y));
  await pagina.mouse.move(ps[0].x, ps[0].y);
  await pagina.mouse.down();
  for (const p of ps.slice(1)) await pagina.mouse.move(p.x, p.y, { steps: 6 });
  await pagina.mouse.up();
}
const herramienta = () => pagina.locator("[data-herramienta][aria-pressed='true']").getAttribute("data-herramienta");
const cables = () => pagina.locator("#editor g[data-id^='W'] line.comp__seleccion").evaluateAll((ls) => ls.map((l) =>
  ["x1", "y1", "x2", "y2"].map((k) => (Number(l.getAttribute(k)) - 10) / 20).join(",")));
const corriente = async (id) => (await pagina.locator(".tabla-componentes tr", { hasText: id }).first().innerText()).split("\t")[2];

// --- Tooltips con los atajos -------------------------------------------------------------------
const titulos = await pagina.locator("[data-herramienta]").evaluateAll((bs) => Object.fromEntries(bs.map((b) => [b.dataset.herramienta, b.title])));
const esperados = { seleccionar: "(Esc)", wire: "(C)", resistor: "(R)", voltage_source: "(B)", current_source: "(I)", lamp: "(L)", switch: "(S)", ground: "(G)" };
ok(Object.entries(esperados).every(([h, t]) => titulos[h].includes(t)), "los tooltips muestran los atajos: Esc, C, R, B, I, L, S, G");
const atajos = { c: "wire", r: "resistor", b: "voltage_source", i: "current_source", l: "lamp", s: "switch", g: "ground" };
let todos = true;
for (const [tecla, h] of Object.entries(atajos)) {
  await pagina.keyboard.press(tecla);
  if ((await herramienta()) !== h) todos = false;
  await pagina.keyboard.press("Escape");
  if ((await herramienta()) !== "seleccionar") todos = false;
}
ok(todos, "cada letra elige su herramienta y Esc vuelve a Seleccionar");

// --- Arrastrar desde la barra y volver solo a Seleccionar ----------------------------------------
await pagina.click("#pestana-circuitos");
await pagina.click("#accion-nuevo");
await pagina.click("#pestana-resultados");
const boton = pagina.locator('[data-herramienta="voltage_source"]');
const caja = await boton.boundingBox();
const destino = await enPantalla(6, 8);
await pagina.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
await pagina.mouse.down();
await pagina.mouse.move(destino.x, destino.y - 40, { steps: 8 });
await pagina.mouse.move(destino.x, destino.y, { steps: 4 });
const fantasma = await pagina.locator("#editor .fantasma .comp").count();
await pagina.mouse.up();
await pagina.locator('#editor g[data-id="V1"]').waitFor({ state: "attached" });
ok(await pagina.locator('#editor g[data-id="G1"]').count() === 1 && await pagina.locator("#aviso-tierra").isVisible(),
  "la batería sola ya recibe su tierra en el borne −, con un aviso");
await pagina.click("#aviso-tierra-cerrar");
ok(fantasma === 1 && (await herramienta()) === "seleccionar",
  "arrastrar la batería desde la barra la coloca (con fantasma mientras se arrastra) y la herramienta sigue en Seleccionar");

await pagina.click('[data-herramienta="lamp"]');
await clic(16, 8); // (14,8)-(18,8)
await pagina.locator('#editor g[data-id="L1"]').waitFor({ state: "attached" });
ok((await herramienta()) === "seleccionar", "después de colocar la lámpara se vuelve solo a Seleccionar");

// --- Cables desde un borne, en L y siguiendo desde la punta --------------------------------------
await arrastrarPor([8, 8], [14, 8]);
await arrastrarPor([4, 8], [4, 12]);
ok((await cables()).length === 2, `arrastrar desde un borne dibuja un cable, sin elegir herramienta (${await cables()})`);
await arrastrarPor([4, 12], [10, 12], [18, 8]); // desde la punta del anterior, primero horizontal
const lista = await cables();
ok(lista.includes("4,12,18,12") && lista.includes("18,12,18,8"),
  `desde la punta de un cable se sigue dibujando, y se dobla solo en L (${lista})`);
await fase("ok");
ok((await corriente("L1")) !== "0 A", `con la tierra automática la lámpara ya se enciende (${await corriente("L1")})`);
// Otra tierra en el mismo nodo (G): todas valen 0 V, así que nada cambia.
await pagina.keyboard.press("g");
await clic(14, 8);
await pagina.locator('#editor g[data-id="G2"]').waitFor({ state: "attached" });
await fase("ok");
ok((await herramienta()) === "seleccionar" && (await corriente("L1")) !== "0 A",
  "con G se pone otra tierra (en el mismo nodo no cambia nada) y se vuelve a Seleccionar");
await pagina.screenshot({ path: `${SALIDA}/b1-cables-desde-borne.png` });

// Con la herramienta Cable, cada clic agrega un tramo desde la punta anterior; Esc termina.
await pagina.keyboard.press("c");
await clic(26, 20);
await clic(32, 20);
await clic(32, 24);
await pagina.keyboard.press("Escape");
const conCadena = await cables();
ok(conCadena.includes("26,20,32,20") && conCadena.includes("32,20,32,24"), "con la herramienta Cable los clics encadenan tramos");
await pagina.keyboard.press("Escape");

// --- Estirar un cable por su punta -------------------------------------------------------------
await clic(29, 20); // selecciona el tramo 26,20-32,20
ok(await pagina.locator("#editor .asa").count() === 2, "un cable seleccionado muestra sus dos puntas");
const antes = (await cables()).length;
await arrastrarPor([26, 20], [26, 17], [22, 17]); // la punta 26,20 hasta 22,17: se dobla
const estirado = await cables();
ok(estirado.length === antes + 1 && estirado.some((c) => c.endsWith("22,17") || c.startsWith("22,17")),
  `arrastrar la punta estira el cable y lo dobla en L (${estirado.length - antes} tramo nuevo)`);
await pagina.screenshot({ path: `${SALIDA}/b2-estirar.png` });

// --- Cartel con tensión y corriente --------------------------------------------------------------
const lamp = await enPantalla(16, 8);
await pagina.mouse.move(lamp.x, lamp.y - 2);
await pagina.locator("#info-flotante").waitFor();
const textoInfo = await pagina.locator("#info-flotante").innerText();
ok(textoInfo.includes("L1") && /V/.test(textoInfo) && /A/.test(textoInfo), `al pasar el mouse sobre la lámpara: ${textoInfo.replace(/\n/g, " · ")}`);
const cableP = await enPantalla(11, 8);
await pagina.mouse.move(cableP.x, cableP.y);
await pagina.locator("#info-flotante", { hasText: "Cable" }).waitFor();
ok((await pagina.locator("#info-flotante").innerText()).includes("respecto de GND"), "sobre un cable: su tensión y su corriente");
await pagina.screenshot({ path: `${SALIDA}/b3-cartel.png` });

// --- Menú con clic derecho -----------------------------------------------------------------------
await pagina.mouse.click(lamp.x, lamp.y - 2, { button: "right" });
await pagina.locator("#menu-contextual").waitFor();
await pagina.screenshot({ path: `${SALIDA}/b4-menu.png` });
const habilitados = await pagina.locator("#menu-contextual button:not(:disabled)").evaluateAll((bs) => bs.map((b) => b.dataset.accion));
ok(JSON.stringify(habilitados) === JSON.stringify(["rotar", "valor", "duplicar", "borrar"]), `clic derecho: menú con rotar, editar valor, duplicar y borrar (${habilitados})`);
await pagina.click('#menu-contextual [data-accion="duplicar"]');
await pagina.locator('#editor g[data-id="L2"]').waitFor({ state: "attached" });
ok(await pagina.locator("#menu-contextual").isHidden(), "Duplicar desde el menú crea L2 y cierra el menú");
const l2 = await enPantalla(18, 10);
await pagina.mouse.click(l2.x, l2.y, { button: "right" });
await pagina.keyboard.press("ArrowUp"); // el menú se maneja con el teclado: de Rotar sube a Borrar
await pagina.keyboard.press("Enter");
await pagina.locator('#editor g[data-id="L2"]').waitFor({ state: "detached" });
ok(true, "Borrar desde el menú (con flechas y Enter)");
await pagina.mouse.click(lamp.x, lamp.y - 2, { button: "right" });
await pagina.keyboard.press("Escape");
ok(await pagina.locator("#menu-contextual").isHidden(), "Esc cierra el menú");

// --- Zoom con la rueda y mover la vista ----------------------------------------------------------
const ancho = async () => Number(await pagina.locator("#editor").getAttribute("width"));
const ancho0 = await ancho();
const centro = await enPantalla(30, 15);
await pagina.mouse.move(centro.x, centro.y);
await pagina.mouse.wheel(0, -500);
await pagina.waitForTimeout(100);
const ancho1 = await ancho();
const bajoElPuntero = await enPantalla(30, 15);
ok(ancho1 > ancho0 * 1.5 && Math.abs(bajoElPuntero.x - centro.x) < 25,
  `la rueda acerca alrededor del puntero (${ancho0} → ${ancho1} px)`);
const scroll = () => pagina.locator("#contenedor-editor").evaluate((c) => [c.scrollLeft, c.scrollTop]);
const s0 = await scroll();
const vacio = await enPantalla(35, 12); // fondo vacío, a la vista después del zoom
await pagina.mouse.move(vacio.x, vacio.y);
await pagina.mouse.down();
await pagina.mouse.move(vacio.x - 150, vacio.y - 80, { steps: 6 });
await pagina.mouse.up();
const s1 = await scroll();
ok(s1[0] > s0[0] + 100 && s1[1] > s0[1] + 40, `arrastrar el fondo vacío mueve la vista (${s0} → ${s1})`);
await pagina.mouse.wheel(0, 800);
await contexto.close();

// --- Celular: dos dedos y presión larga ----------------------------------------------------------
const movil = await abrir({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pm = movil.pagina;
await pm.click("#pestana-circuitos");
await pm.click("#accion-ejemplos");
await pm.locator(".tarjeta-ejemplo", { hasText: "Linterna" }).first().click();
await pm.locator("#estado-simulacion[data-fase='ok']").waitFor();
await pm.evaluate(() => window.scrollTo(0, 0));
await pm.locator("#editor g[data-id='L1']").waitFor({ state: "attached" });
const cdp = await movil.contexto.newCDPSession(pm);
const toque = (tipo, puntos) => cdp.send("Input.dispatchTouchEvent", {
  type: tipo, touchPoints: puntos.map((p, i) => ({ x: p.x, y: p.y, id: i })),
});
const lampara = await enPantalla(17, 4, pm);
await toque("touchStart", [lampara]);
await pm.waitForTimeout(800);
await toque("touchEnd", []);
await pm.locator("#menu-contextual").waitFor({ timeout: 3000 });
ok(true, "mantener presionada la lámpara abre su menú en el celular");
await pm.screenshot({ path: `${SALIDA}/b5-menu-celular.png` });
await pm.keyboard.press("Escape");
// "Seleccionar varios": con un dedo sobre el fondo se dibuja el rectángulo.
ok(await pm.locator("#accion-varios").isVisible(), "en el celular aparece el botón Seleccionar varios");
await pm.click("#accion-varios");
const r0 = await enPantalla(7, 2, pm);
const r1 = await enPantalla(20, 5, pm);
await toque("touchStart", [r0]);
for (let i = 1; i <= 6; i++) await toque("touchMove", [{ x: r0.x + (r1.x - r0.x) * i / 6, y: r0.y + (r1.y - r0.y) * i / 6 }]);
await toque("touchEnd", []);
const elegidos = await pm.locator("#editor .comp.seleccionado").evaluateAll((gs) => gs.map((g) => g.dataset.id).sort());
ok(elegidos.includes("S1") && elegidos.includes("L1"), `Seleccionar varios: un dedo dibuja el rectángulo (${elegidos})`);
await pm.click("#accion-varios");
const anchoMovil = async () => Number(await pm.locator("#editor").getAttribute("width"));
const am0 = await anchoMovil();
const m = await enPantalla(12, 7, pm);
await toque("touchStart", [{ x: m.x - 30, y: m.y }, { x: m.x + 30, y: m.y }]);
for (let i = 1; i <= 8; i++) await toque("touchMove", [{ x: m.x - 30 - i * 12, y: m.y }, { x: m.x + 30 + i * 12, y: m.y }]);
await toque("touchEnd", []);
const am1 = await anchoMovil();
ok(am1 > am0 * 1.5, `zoom con dos dedos (${am0} → ${am1} px)`);
const sm0 = await pm.locator("#contenedor-editor").evaluate((c) => c.scrollLeft);
const v = await enPantalla(12, 7, pm);
await toque("touchStart", [v]);
for (let i = 1; i <= 6; i++) await toque("touchMove", [{ x: v.x - i * 25, y: v.y }]);
await toque("touchEnd", []);
const sm1 = await pm.locator("#contenedor-editor").evaluate((c) => c.scrollLeft);
ok(sm1 > sm0 + 80, `con un dedo sobre el fondo se mueve la vista (${Math.round(sm0)} → ${Math.round(sm1)})`);
await movil.contexto.close();

ok(errores.length === 0, `sin errores en consola ni violaciones de CSP ${JSON.stringify(errores)}`);
await navegador.close();
console.log(process.exitCode ? "Hay comprobaciones que fallaron." : "Todas las comprobaciones pasaron.");
