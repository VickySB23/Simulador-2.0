// Verificación del editor web en Chrome real contra el stack levantado.
// Uso: ver tests/e2e/README.md. Modifica datos: guarda un circuito de prueba y lo borra al final.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const URL = process.env.BASE_URL ?? "http://localhost:8080/";
const SALIDA = process.argv[2] ?? "capturas";
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
  : process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });
const errores = [];
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "MAL"} ${msg}`); if (!cond) process.exitCode = 1; };

const navegador = await chromium.launch({
  executablePath: CHROME, headless: true,
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
const pagina = await contexto.newPage();
// La CSP no permite eval: las esperas usan locators, nunca waitForFunction.
// Los 422 son respuestas esperadas (nodo suelto); Chrome loguea toda respuesta con error.
pagina.on("console", (m) => { if (m.type() === "error" && !m.text().includes("status of 422")) errores.push(m.text()); });
pagina.on("pageerror", (e) => errores.push(String(e)));
pagina.on("dialog", (d) => d.accept());

async function clicEnGrilla(x, y, opciones = {}) {
  const punto = await pagina.evaluate(([gx, gy]) => {
    const svg = document.getElementById("editor");
    const p = new DOMPoint(gx * 20 + 10, gy * 20 + 10).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, [x, y]);
  if (opciones.doble) await pagina.mouse.dblclick(punto.x, punto.y);
  else await pagina.mouse.click(punto.x, punto.y);
}
async function esperarFase(fase) {
  await pagina.locator(`#estado-simulacion[data-fase="${fase}"]`).waitFor({ timeout: 10000 });
}
const etiquetasTension = () => pagina.locator("text.tension").allTextContents();

await pagina.goto(URL);
await esperarFase("ok");
ok(true, "carga con el divisor y simula");
ok((await etiquetasTension()).includes("8.00 V"), `divisor: V del medio = 8 V (${await etiquetasTension()})`);
await pagina.screenshot({ path: `${SALIDA}/01-divisor.png` });

// --- TP4 -----------------------------------------------------------------------------
await pagina.click("#pestana-circuitos");
await pagina.locator("#lista-ejemplos li", { hasText: "TP4" }).getByRole("button", { name: "Abrir" }).click();
await esperarFase("ok");
const tp4 = await etiquetasTension();
ok(tp4.includes("30.0 V") && tp4.includes("60.0 V"), `TP4: etiquetas ${JSON.stringify(tp4)}`);
await pagina.click("#pestana-resultados");
const filaV1 = await pagina.locator("#tabla-componentes tr", { hasText: "V1" }).allInnerTexts();
ok(filaV1[0].includes("-12.5 A"), `TP4: corriente de V1 ${JSON.stringify(filaV1)}`);
ok((await pagina.locator("#potencia-absorbida").innerText()) === "750 W", "TP4: 750 W absorbidos");
ok((await pagina.locator("#potencia-balance").innerText()).startsWith("OK"), "TP4: balance OK");
const flechas = await pagina.locator("path.punta").count();
ok(flechas === 5, `TP4: una flecha de corriente por pieza (${flechas})`);
await pagina.screenshot({ path: `${SALIDA}/02-tp4-30V.png` });

// --- Nodo suelto -----------------------------------------------------------------------
await pagina.click('[data-herramienta="resistor"]');
await clicEnGrilla(30, 18);
await esperarFase("error");
const anillos = await pagina.locator("circle.anillo-error").count();
const mensaje = await pagina.locator("#mensaje-error").innerText();
ok(anillos === 2, `nodo suelto: ${anillos} nodos marcados en rojo`);
ok(mensaje.includes("28_18") && mensaje.includes("32_18"), `mensaje: ${mensaje}`);
await pagina.screenshot({ path: `${SALIDA}/03-nodo-suelto.png` });

// --- Deshacer / rehacer ------------------------------------------------------------------
await pagina.click('[data-herramienta="seleccionar"]');
await pagina.keyboard.press("Control+z");
await esperarFase("ok");
ok(await pagina.locator("circle.anillo-error").count() === 0, "Ctrl+Z quita la resistencia suelta");
await pagina.keyboard.press("Control+y");
await esperarFase("error");
ok(await pagina.locator('[data-id="R5"]').count() === 1, "Ctrl+Y la vuelve a poner (R5)");
await clicEnGrilla(30, 18);
await pagina.keyboard.press("Delete");
await esperarFase("ok");
await pagina.click('[data-herramienta="resistor"]');
await clicEnGrilla(30, 18);
ok(await pagina.locator('[data-id="R6"]').count() === 1, "después de borrar R5, la nueva es R6");
await pagina.keyboard.press("Control+z");
await esperarFase("ok");

// --- Tierra en el historial ------------------------------------------------------------
await pagina.click('[data-herramienta="ground"]');
await clicEnGrilla(18, 4);
await esperarFase("ok");
const tensionesConTierraArriba = await etiquetasTension();
ok(tensionesConTierraArriba.some((t) => t.startsWith("-")), `tierra movida: tensiones negativas ${JSON.stringify(tensionesConTierraArriba)}`);
await pagina.keyboard.press("Control+z");
await esperarFase("ok");
ok((await etiquetasTension()).includes("30.0 V"), "Ctrl+Z devuelve la tierra a su lugar");

// --- Editar valor (doble clic) y rotar ------------------------------------------------
await pagina.click('[data-herramienta="seleccionar"]');
await clicEnGrilla(12, 6, { doble: true });
await pagina.locator("#dialogo-entrada").fill("abc");
await pagina.click("#dialogo-aceptar");
ok((await pagina.locator("#dialogo-error").innerText()).includes("inválido"), "valor inválido: el diálogo avisa");
await pagina.locator("#dialogo-entrada").fill("4,7k");
await pagina.click("#dialogo-aceptar");
await esperarFase("ok");
ok((await pagina.locator("text", { hasText: "4.7 kΩ" }).count()) === 1, "R1 = 4,7k aceptado y mostrado como 4.7 kΩ");
await pagina.keyboard.press("Control+z");
await esperarFase("ok");

// --- Persistencia ----------------------------------------------------------------------
await pagina.click("#pestana-circuitos");
await pagina.click("#accion-guardar-como");
await pagina.locator("#dialogo-entrada").fill("TP4 verificado");
await pagina.click("#dialogo-aceptar");
await pagina.locator("#lista-circuitos li", { hasText: "TP4 verificado" }).waitFor();
ok(true, "guardar como: aparece en la lista");
ok(!(await pagina.locator("#marca-sucio").isVisible()), "sin cambios pendientes después de guardar");
await pagina.locator("#lista-ejemplos li", { hasText: "Divisor" }).getByRole("button", { name: "Abrir" }).click();
await esperarFase("ok");
await pagina.locator("#lista-circuitos li", { hasText: "TP4 verificado" }).getByRole("button", { name: "Abrir" }).click();
await pagina.locator("text.tension", { hasText: "30.0 V" }).waitFor({ timeout: 10000 });
ok((await pagina.locator("#nombre-circuito").innerText()) === "TP4 verificado", "abrir desde circuit-service restaura el layout y da 30 V");
await pagina.locator("#lista-circuitos li", { hasText: "TP4 verificado" }).getByRole("button", { name: "Renombrar" }).click();
await pagina.locator("#dialogo-entrada").fill("TP4 renombrado");
await pagina.click("#dialogo-aceptar");
await pagina.locator("#lista-circuitos li", { hasText: "TP4 renombrado" }).waitFor();
ok((await pagina.locator("#nombre-circuito").innerText()) === "TP4 renombrado", "renombrar actualiza el encabezado");
await pagina.screenshot({ path: `${SALIDA}/04-circuitos.png` });
await pagina.locator("#lista-circuitos li", { hasText: "TP4 renombrado" }).getByRole("button", { name: "Borrar" }).click();
await pagina.locator("#lista-circuitos li", { hasText: "TP4 renombrado" }).waitFor({ state: "detached" });
ok(true, "borrar lo quita de la lista");

// --- Tema oscuro y pantalla chica ------------------------------------------------------
await pagina.click("#pestana-resultados");
await pagina.click("#boton-tema"); // Auto -> Claro
await pagina.click("#boton-tema"); // Claro -> Oscuro
ok(await pagina.evaluate(() => document.documentElement.dataset.theme) === "dark", "tema oscuro aplicado");
await pagina.screenshot({ path: `${SALIDA}/05-oscuro.png` });
await pagina.reload();
await esperarFase("ok");
ok(await pagina.evaluate(() => document.documentElement.dataset.theme) === "dark", "el tema se recuerda al recargar");

const movil = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", hasTouch: true, isMobile: true });
const pm = await movil.newPage();
pm.on("pageerror", (e) => errores.push(String(e)));
await pm.goto(URL);
await pm.locator('#estado-simulacion[data-fase="ok"]').waitFor();
const desborde = await pm.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(desborde <= 0, `pantalla chica: sin scroll horizontal de la página (${desborde}px)`);
await pm.screenshot({ path: `${SALIDA}/06-movil.png`, fullPage: true });

ok(errores.length === 0, `sin errores en consola ni violaciones de CSP ${JSON.stringify(errores)}`);
await navegador.close();

console.log(process.exitCode ? "Hay comprobaciones que fallaron." : "Todas las comprobaciones pasaron.");
