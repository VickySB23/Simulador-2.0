// Interacción: soltar sobre un cable inserta en serie, selección múltiple (Ctrl/Shift + clic y
// rectángulo) para mover, rotar y borrar, Ctrl+C / Ctrl+V / Ctrl+D, la ficha con el aviso de
// corriente baja y el tutorial paso a paso hecho con el mouse.
// Uso: node tests/e2e/servir.mjs   (en otra terminal)   y   node tests/e2e/interaccion.mjs capturas
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
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
const pagina = await contexto.newPage();
pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
pagina.on("pageerror", (e) => errores.push(String(e)));
pagina.on("dialog", (d) => d.accept());

const fase = (f) => pagina.locator(`#estado-simulacion[data-fase="${f}"]`).waitFor({ timeout: 10000 });

async function enPantalla(x, y) {
  return pagina.evaluate(([gx, gy]) => {
    const svg = document.getElementById("editor");
    const q = new DOMPoint(gx * 20 + 10, gy * 20 + 10).matrixTransform(svg.getScreenCTM());
    return { x: q.x, y: q.y };
  }, [x, y]);
}
async function clic(x, y, { doble = false, modificador = null } = {}) {
  const p = await enPantalla(x, y);
  if (modificador) await pagina.keyboard.down(modificador);
  if (doble) await pagina.mouse.dblclick(p.x, p.y);
  else await pagina.mouse.click(p.x, p.y);
  if (modificador) await pagina.keyboard.up(modificador);
}
async function arrastrar(desde, hasta, modificador = null) {
  const a = await enPantalla(...desde);
  const b = await enPantalla(...hasta);
  if (modificador) await pagina.keyboard.down(modificador);
  await pagina.mouse.move(a.x, a.y);
  await pagina.mouse.down();
  await pagina.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await pagina.mouse.move(b.x, b.y, { steps: 4 });
  await pagina.mouse.up();
  if (modificador) await pagina.keyboard.up(modificador);
}
async function abrirEjemplo(texto) {
  await pagina.click("#pestana-circuitos");
  await pagina.locator("#lista-ejemplos li")
    .filter({ has: pagina.locator(".elemento__nombre", { hasText: texto }) })
    .first().getByRole("button", { name: "Abrir" }).click();
  await fase("ok");
  await pagina.click("#pestana-resultados");
}
const ids = () => pagina.locator("#editor g[data-id]").evaluateAll((gs) => gs.map((g) => g.dataset.id));
const seleccionados = () => pagina.locator("#editor .comp.seleccionado").evaluateAll(
  (gs) => gs.map((g) => g.dataset.id ?? "GND").sort());
const posicion = (id) => pagina.locator(`#editor g[data-id="${id}"] line.comp__seleccion`).evaluate(
  (l) => ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k))));
const corriente = async (id) => (await pagina.locator(".tabla-componentes tr", { hasText: id }).first().innerText()).split("\t")[2];

await pagina.goto(URL_BASE);
await fase("ok");

// --- Soltar sobre un cable lo inserta en serie --------------------------------------------
await abrirEjemplo("Linterna");
const cablesAntes = (await ids()).filter((i) => i.startsWith("W")).length;
await pagina.click('[data-herramienta="resistor"]');
await clic(22, 7); // centro del cable vertical de la derecha (22,4)-(22,10)
await pagina.locator('#editor g[data-id="R1"]').waitFor({ state: "attached" });
await fase("ok");
const r1 = await corriente("R1");
ok(r1 && r1 !== "0 A" && (await ids()).filter((i) => i.startsWith("W")).length === cablesAntes + 1,
  `colocar sobre un cable: R1 queda en serie y conduce (${r1}); el cable se parte en dos`);
await pagina.screenshot({ path: `${SALIDA}/i1-insertar-en-cable.png` });
await pagina.keyboard.press("Control+z");
await pagina.locator('#editor g[data-id="R1"]').waitFor({ state: "detached" });

// Arrastrar una pieza suelta hasta un cable también la inserta.
await pagina.keyboard.press("3");
await clic(30, 16); // R2, suelta: horizontal (28,16)-(32,16)
await pagina.locator("#estado-simulacion", { hasText: "sin conectar" }).waitFor();
await pagina.click('[data-herramienta="seleccionar"]');
await arrastrar([30, 16], [14, 10]); // centro sobre el cable de abajo (22,10)-(6,10)
await pagina.locator("#estado-simulacion", { hasText: "sin conectar" }).waitFor({ state: "detached" }).catch(() => {});
const r2 = await corriente("R2");
ok(!(await pagina.locator("#estado-simulacion").innerText()).includes("sin conectar") && r2 !== "0 A",
  `arrastrar sobre un cable: R2 queda en serie (${r2})`);

// --- Selección múltiple ---------------------------------------------------------------------
await abrirEjemplo("Serie");
await pagina.click('[data-herramienta="seleccionar"]');
await arrastrar([7, 2], [20, 5], "Shift"); // Shift + arrastrar: rectángulo alrededor de R1, R2 y el cable W3 que las une
ok(JSON.stringify(await seleccionados()) === JSON.stringify(["R1", "R2", "W3"]), `Shift + arrastrar: rectángulo con R1, R2 y el cable entre ellas (${await seleccionados()})`);
await clic(22, 8, { modificador: "Control" });
ok((await seleccionados()).length === 4, "Ctrl + clic suma R3");
await clic(22, 8, { modificador: "Shift" });
ok((await seleccionados()).length === 3, "Shift + clic la vuelve a sacar");
const antes1 = await posicion("R1");
const antes2 = await posicion("R2");
await arrastrar([10, 4], [10, 14]);
await fase("ok").catch(() => {});
const despues1 = await posicion("R1");
const despues2 = await posicion("R2");
ok(despues1[1] - antes1[1] === 200 && despues2[1] - antes2[1] === 200 && (await seleccionados()).length === 3,
  "arrastrar mueve el grupo entero (R1 y R2 bajan 10 celdas)");
await pagina.screenshot({ path: `${SALIDA}/i2-grupo-movido.png` });
await pagina.keyboard.press("Space");
const rotado = await posicion("R1");
ok(rotado[0] === rotado[2], "R rota el grupo (R1 queda vertical)");
await pagina.keyboard.press("Delete");
await pagina.locator('#editor g[data-id="R1"]').waitFor({ state: "detached" });
ok(!(await ids()).includes("R2"), "Suprimir borra el grupo");
await pagina.keyboard.press("Control+z");
await pagina.locator('#editor g[data-id="R1"]').waitFor({ state: "attached" });
ok((await ids()).includes("R2"), "Ctrl+Z repone el grupo");

// Copiar, pegar y duplicar.
await abrirEjemplo("Serie");
await pagina.click('[data-herramienta="seleccionar"]');
await arrastrar([7, 2], [20, 5], "Shift");
await pagina.keyboard.press("Control+c");
await pagina.locator("#aviso", { hasText: "Copiados 3" }).waitFor();
await pagina.keyboard.press("Control+v");
await pagina.locator('#editor g[data-id="R4"]').waitFor({ state: "attached" });
ok(JSON.stringify(await seleccionados()) === JSON.stringify(["R4", "R5", "W7"]), `Ctrl+V pega con ids nuevos y los deja seleccionados (${await seleccionados()})`);
await pagina.keyboard.press("Control+d");
await pagina.locator('#editor g[data-id="R7"]').waitFor({ state: "attached" });
ok(JSON.stringify(await seleccionados()) === JSON.stringify(["R6", "R7", "W8"]), "Ctrl+D duplica la selección");
const p4 = await posicion("R4");
const p6 = await posicion("R6");
ok(p6[0] - p4[0] === 40 && p6[1] - p4[1] === 40, "lo duplicado aparece corrido 2 celdas");
await pagina.screenshot({ path: `${SALIDA}/i3-copiar-pegar.png` });

// --- Ficha: aviso de corriente baja ---------------------------------------------------------
await abrirEjemplo("distintas potencias");
await pagina.click('[data-herramienta="seleccionar"]');
await clic(15, 4);
await pagina.locator("#ficha").waitFor();
const ficha = await pagina.locator("#ficha").innerText();
ok(ficha.includes("La corriente es muy baja para esta lámpara (444 mA de 4.00 A nominales)"),
  "ficha de L2: avisa que la corriente es muy baja");
await pagina.screenshot({ path: `${SALIDA}/i4-ficha-corriente-baja.png` });
await clic(8, 4);
ok(!(await pagina.locator("#ficha").innerText()).includes("muy baja"), "ficha de L1 (79 %): sin aviso");

// --- Tutorial -------------------------------------------------------------------------------
await pagina.evaluate(() => localStorage.removeItem("simulador-dc:tutorial"));
await pagina.reload();
await fase("ok");
ok(await pagina.locator("#tutorial-pestana").isVisible() && !(await pagina.locator("#tutorial-cuerpo").isVisible()),
  "tutorial: arranca como una pestaña chica, plegada");
await pagina.click("#tutorial-pestana");
await pagina.locator("#tutorial-cuerpo").waitFor();
const progreso = () => pagina.locator("#tutorial-progreso").innerText();
await pagina.click("#tutorial-vacio");
await pagina.locator("#editor g[data-id]").first().waitFor({ state: "detached" });
ok((await progreso()) === "Paso 1 de 7", "tutorial: paso 1 con el lienzo vacío");
await pagina.screenshot({ path: `${SALIDA}/i5-tutorial-paso-1.png` });

await pagina.click('[data-herramienta="voltage_source"]');
await pagina.keyboard.press("Space");
await clic(4, 6);
await pagina.locator("#tutorial-progreso", { hasText: "Paso 2" }).waitFor();
await pagina.click('[data-herramienta="lamp"]');
await clic(12, 6);
await pagina.locator("#tutorial-progreso", { hasText: "Paso 3" }).waitFor();
await pagina.click('[data-herramienta="wire"]');
await arrastrar([4, 4], [12, 4]);
ok((await progreso()) === "Paso 3 de 7", "tutorial: con un cable solo, espera");
await arrastrar([4, 8], [12, 8]);
// La tierra ya se puso sola en el borne − al colocar la batería: al cerrar el circuito se cumplen
// "tierra" y "encender" juntos.
await pagina.locator("#tutorial-progreso", { hasText: "Paso 6" }).waitFor();
ok((await pagina.locator("#tutorial-logro").innerText()).includes("Encendé"), "tutorial: con la tierra automática, al cerrar el circuito la lámpara se enciende y lo festeja");
await pagina.screenshot({ path: `${SALIDA}/i6-tutorial-interruptor.png` });
await pagina.click('[data-herramienta="switch"]');
await clic(8, 4);
await pagina.click('[data-herramienta="seleccionar"]');
await clic(8, 4);
await pagina.locator("#tutorial-progreso", { hasText: "Paso 7" }).waitFor();
await clic(8, 4);
await clic(12, 6, { doble: true });
await pagina.locator("#dialogo-entrada-2").fill("1");
await pagina.click("#dialogo-aceptar");
await pagina.locator("#tutorial-progreso", { hasText: "Tutorial completo" }).waitFor();
ok(true, "tutorial: los 7 pasos se completan con el mouse (batería, lámpara, cables, GND, encender, interruptor, quemar)");
await pagina.screenshot({ path: `${SALIDA}/i7-tutorial-completo.png` });

await pagina.click("#tutorial-reiniciar");
await pagina.click("#tutorial-saltear");
ok((await progreso()) !== "Paso 1 de 7", "tutorial: un paso se puede saltear");
await pagina.click("#tutorial-cerrar");
ok(!(await pagina.locator("#tutorial").isVisible()), "tutorial: se cierra del todo");
await pagina.click("#boton-ayuda");
ok(await pagina.locator("#tutorial-cuerpo").isVisible(), "tutorial: el botón ? lo vuelve a abrir");

ok(errores.length === 0, `sin errores en consola ni violaciones de CSP ${JSON.stringify(errores)}`);
await navegador.close();
console.log(process.exitCode ? "Hay comprobaciones que fallaron." : "Todas las comprobaciones pasaron.");
