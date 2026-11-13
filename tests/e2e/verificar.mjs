// Verificación de la página en Chrome real (headless). Uso: ver tests/e2e/README.md.
//   node tests/e2e/servir.mjs                     # en otra terminal (o BASE_URL de GitHub Pages)
//   node tests/e2e/verificar.mjs capturas
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

import { codificar } from "../../frontend/public/js/lib/compartir.js";
import { TP4 } from "../../frontend/tests/circuitos-de-prueba.js";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:8000/Simulador-2.0/";
const SALIDA = process.argv[2] ?? "capturas";
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
  : process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });

const errores = [];
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "MAL"} ${msg}`); if (!cond) process.exitCode = 1; };

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });

async function nuevaPagina(opciones = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 900 }, colorScheme: "light", acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"], ...opciones,
  });
  // Estas pruebas leen los números del dibujo: etiquetas "Todo" (por defecto es "Valores").
  await contexto.addInitScript(() => localStorage.setItem("etiquetas", "todo"));
  const pagina = await contexto.newPage();
  pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  pagina.on("pageerror", (e) => errores.push(String(e)));
  pagina.on("dialog", (d) => d.accept());
  return { contexto, pagina };
}

// La CSP no permite eval: las esperas usan locators, nunca waitForFunction.
const esperarFase = (pagina, fase) =>
  pagina.locator(`#estado-simulacion[data-fase="${fase}"]`).waitFor({ timeout: 10000 });
const etiquetas = (pagina) => pagina.locator("text.tension").allTextContents();

async function clicEnGrilla(pagina, x, y, doble = false) {
  const punto = await pagina.evaluate(([gx, gy]) => {
    const svg = document.getElementById("editor");
    const p = new DOMPoint(gx * 20 + 10, gy * 20 + 10).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, [x, y]);
  if (doble) await pagina.mouse.dblclick(punto.x, punto.y);
  else await pagina.mouse.click(punto.x, punto.y);
}

/** Los ejemplos se abren desde la galería (Circuitos → Ejemplos…), con una tarjeta por circuito. */
async function abrirEjemplo(pagina, texto) {
  // El TP4 ya no está entre los ejemplos: se abre por link (como lo compartiría alguien).
  if (texto === "TP4") {
    const hash = `#c=${await codificar(TP4.estado, TP4.nombre)}`;
    await pagina.evaluate(() => { location.hash = ""; });
    await pagina.evaluate((h) => { location.hash = h; }, hash);
    await pagina.locator("#nombre-circuito", { hasText: "TP4" }).waitFor();
    await pagina.locator('#editor [data-id="R4"]').waitFor({ state: "attached" });
    return;
  }
  await pagina.click("#pestana-circuitos");
  await pagina.click("#accion-ejemplos");
  await pagina.locator(".tarjeta-ejemplo").filter({ has: pagina.locator(".tarjeta-ejemplo__nombre", { hasText: texto }) })
    .first().click();
}

/** Lo que se ve del circuito: componentes con su posición, valores, tierra, tensiones y nombre. */
function huella(pagina) {
  return pagina.evaluate(() => ({
    nombre: document.getElementById("nombre-circuito").textContent,
    componentes: [...document.querySelectorAll("#editor g[data-id]:not([data-tierra])")].map((g) => {
      const l = g.querySelector("line.comp__seleccion");
      return [g.dataset.id, l.getAttribute("x1"), l.getAttribute("y1"), l.getAttribute("x2"), l.getAttribute("y2")].join(" ");
    }).sort(),
    textos: [...document.querySelectorAll("#editor text")].map((t) => t.textContent).sort(),
    tierra: [...document.querySelectorAll("#editor [data-tierra] path")].map((t) => t.getAttribute("d")).join(" "),
  }));
}

const { contexto, pagina } = await nuevaPagina();

// --- Carga y ejemplos --------------------------------------------------------------------
await pagina.goto(URL_BASE);
await esperarFase(pagina, "ok");
ok((await etiquetas(pagina)).includes("8.00 V"), "carga con el divisor de tensión: 8 V");

await abrirEjemplo(pagina, "TP4");
await pagina.locator("text.tension", { hasText: "30.0 V" }).waitFor();
ok((await etiquetas(pagina)).includes("30.0 V"), `TP4: V2 = 30 V (${await etiquetas(pagina)})`);
await pagina.click("#pestana-resultados");
const filaV1 = await pagina.locator(".tabla-componentes tr").first().innerText();
ok(filaV1.includes("-12.5 A"), `TP4: la fuente entrega 12,5 A (${filaV1.replaceAll("\t", " ")})`);
ok((await pagina.locator(".potencia-absorbida").innerText()) === "750 W", "TP4: 750 W absorbidos");
await pagina.screenshot({ path: `${SALIDA}/01-tp4.png` });

await pagina.click("#pestana-ecuaciones");
const ecuaciones = await pagina.locator(".ecuaciones-nodos").innerText();
ok(ecuaciones.includes("V(12,8)/6 Ω") && ecuaciones.includes("I(V1)"), "Ecuaciones: KCL con los valores del circuito");
ok((await pagina.locator(".solucion-mna").innerText()).includes("V(12,8) = 30 V"), "Ecuaciones: la solución del sistema da 30 V");
ok(await pagina.locator(".matriz-mna table tbody tr").count() === 3, "Ecuaciones: matriz MNA de 3 × 3");
await pagina.screenshot({ path: `${SALIDA}/02-ecuaciones.png` });

for (const nombre of ["Serie", "Paralelo", "Wheatstone", "Dos mallas", "Linterna", "serie contra paralelo",
  "se apagan todas", "las demás siguen", "Dimmer", "distintas potencias", "Una casa", "Divisor"]) {
  await abrirEjemplo(pagina, nombre);
  await esperarFase(pagina, "ok");
}
await abrirEjemplo(pagina, "Wheatstone");
await esperarFase(pagina, "ok");
const flechaR5 = await pagina.locator("text.texto-corriente").allTextContents();
ok(flechaR5.length === 5, `Wheatstone equilibrado: 5 flechas, ninguna en el galvanómetro (${flechaR5.length})`);
await abrirEjemplo(pagina, "Dos mallas");
await pagina.locator("text.tension", { hasText: "7.50 V" }).waitFor();
ok(true, "los 13 ejemplos simulan; dos mallas da 7,5 V en el medio");

// --- Borne sin conectar, lazo flotante, deshacer/rehacer, ids y tierra ---------------------
await abrirEjemplo(pagina, "TP4");
await esperarFase(pagina, "ok");
await pagina.click('[data-herramienta="resistor"]');
await clicEnGrilla(pagina, 30, 18);
await pagina.locator("#estado-simulacion", { hasText: "1 componente sin conectar" }).waitFor();
await pagina.click("#pestana-resultados");
ok(await pagina.locator("g.borne-suelto").count() === 2 && (await etiquetas(pagina)).includes("30.0 V"),
  "borne suelto: R5 marcada \"sin conectar\" y el resto sigue simulando (30 V)");
ok((await pagina.locator("#aviso-sueltos").innerText()).includes("R5"), "borne suelto: aviso en Resultados");
await pagina.screenshot({ path: `${SALIDA}/03-nodo-suelto.png` });
// Segundo circuito: una batería sobre R5. La tierra se pone sola en su borne − y avisa.
// Después de colocar una pieza se vuelve solo a Seleccionar: hay que volver a elegir la batería.
await pagina.click('[data-herramienta="voltage_source"]');
await clicEnGrilla(pagina, 30, 18); // V2 en paralelo con R5
await pagina.locator("#estado-simulacion", { hasText: "2 circuitos" }).waitFor();
ok(await pagina.locator("#aviso-tierra").isVisible() && (await pagina.locator("#aviso-tierra").innerText()).includes("V2"),
  "circuito sin GND: se pone sola en el borne − de su batería, con un aviso");
ok(await pagina.locator(".marco-circuito__nombre").count() === 2 && await pagina.locator("#grupos-resultados .grupo__titulo:visible").count() === 2,
  "dos circuitos: se nombran en el dibujo y Resultados agrupa por circuito");
await pagina.click("#aviso-tierra-cerrar");
ok(await pagina.locator("#aviso-tierra").isHidden(), "el aviso de la tierra automática se cierra");
// Una segunda batería en paralelo: lazo de fuentes, en rojo solo en el circuito 2.
await pagina.click('[data-herramienta="voltage_source"]');
await clicEnGrilla(pagina, 30, 18);
await esperarFase(pagina, "error");
ok(await pagina.locator(".marco-circuito--error").count() === 1 && await pagina.locator("#grupos-resultados .grupo--error").count() === 1
  && (await etiquetas(pagina)).includes("30.0 V"),
  "un lazo de fuentes marca en rojo solo su circuito; el TP4 sigue dando 30 V");
ok((await pagina.locator("#estado-simulacion").innerText()).includes("Circuito 2"), "el estado nombra el circuito con error");
await pagina.screenshot({ path: `${SALIDA}/03b-dos-circuitos.png` });
await pagina.locator("#grupos-resultados .grupo__titulo", { hasText: "Circuito 1" }).click();
ok(await pagina.locator('.marco-circuito--resaltado[data-circuito="1"]').count() === 1, "tocar un grupo resalta su circuito en el dibujo");
await pagina.locator("#grupos-resultados .grupo__titulo", { hasText: "Circuito 1" }).click();
await pagina.click('[data-herramienta="seleccionar"]');
await pagina.keyboard.press("Control+z");
await esperarFase(pagina, "ok");
await pagina.keyboard.press("Control+y");
await esperarFase(pagina, "error");
ok(await pagina.locator('[data-id="V3"]').count() === 1, "Ctrl+Z / Ctrl+Y quitan y reponen V3");
for (const id of ["V3", "V2", "R5"]) {
  await clicEnGrilla(pagina, 30, 18);
  await pagina.keyboard.press("Delete");
  await pagina.locator(`[data-id="${id}"]`).waitFor({ state: "detached" });
}
ok(await pagina.locator("#editor [data-tierra]").count() === 1, "al borrar el circuito 2, su tierra automática se va con él");
await pagina.click('[data-herramienta="resistor"]');
await clicEnGrilla(pagina, 30, 18);
ok(await pagina.locator('[data-id="R6"]').count() === 1, "los ids no se repiten: después de borrar R5 viene R6");
await pagina.keyboard.press("Control+z");
await esperarFase(pagina, "ok");
// La tierra se arrastra a otro nodo (se toma del símbolo, debajo del punto).
const desdeG = await pagina.evaluate(() => {
  const r = document.querySelector('#editor [data-id="G1"] .golpe').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height * 0.6 };
});
const paso = await pagina.evaluate(() => document.getElementById("editor").getScreenCTM().a * 20);
await pagina.mouse.move(desdeG.x, desdeG.y);
await pagina.mouse.down();
await pagina.mouse.move(desdeG.x + 6 * paso, desdeG.y - 8 * paso, { steps: 6 });
await pagina.mouse.move(desdeG.x + 12 * paso, desdeG.y - 8 * paso, { steps: 6 });
await pagina.mouse.up();
await esperarFase(pagina, "ok");
ok((await etiquetas(pagina)).some((t) => t.startsWith("-")), "mover la tierra cambia las tensiones");
await pagina.keyboard.press("Control+z");
await pagina.locator("text.tension", { hasText: "30.0 V" }).waitFor();
ok(true, "deshacer devuelve la tierra a su lugar");

// --- Editar valor ------------------------------------------------------------------------
await pagina.click('[data-herramienta="seleccionar"]');
await clicEnGrilla(pagina, 12, 6, true);
await pagina.locator("#dialogo-entrada").fill("abc");
await pagina.click("#dialogo-aceptar");
ok((await pagina.locator("#dialogo-error").innerText()).includes("inválido"), "valor inválido: el diálogo avisa");
await pagina.locator("#dialogo-entrada").fill("4,7");
await pagina.click("#dialogo-aceptar");
await esperarFase(pagina, "ok");
ok((await pagina.locator("text", { hasText: "4.7 Ω" }).count()) === 1, "R1 = 4,7 Ω aceptado");

// --- Compartir: el link reproduce el circuito exacto -----------------------------------
await pagina.click('[data-herramienta="current_source"]');
await clicEnGrilla(pagina, 30, 8);
await pagina.click('[data-herramienta="resistor"]');
await pagina.keyboard.press("Space");
await clicEnGrilla(pagina, 32, 8);
await pagina.click('[data-herramienta="seleccionar"]');
const original = await huella(pagina);
await pagina.click("#boton-compartir");
await pagina.locator("#aviso", { hasText: "Link copiado" }).waitFor();
const link = await pagina.evaluate(() => navigator.clipboard.readText());
ok(link.startsWith(URL_BASE) && link.includes("#c="), `Compartir copia un link (${link.length} caracteres)`);
const otro = await nuevaPagina();
await otro.pagina.goto(link);
await otro.pagina.locator("#editor g[data-id]").first().waitFor({ state: "attached" });
await otro.pagina.locator(`#editor g[data-id="${original.componentes.at(-1).split(" ")[0]}"]`).waitFor({ state: "attached" });
const copia = await huella(otro.pagina);
ok(JSON.stringify(copia) === JSON.stringify(original),
  `el link abre el circuito exacto en otro navegador (${original.componentes.length} componentes, mismos textos y tierra)`);
await otro.contexto.close();

// --- Guardar en el navegador, recargar, exportar e importar ------------------------------
await pagina.click("#pestana-circuitos");
await pagina.click("#accion-guardar-como");
await pagina.locator("#dialogo-entrada").fill("TP4 de prueba");
await pagina.click("#dialogo-aceptar");
await pagina.locator("#lista-circuitos li", { hasText: "TP4 de prueba" }).waitFor();
await pagina.reload();
await pagina.click("#pestana-circuitos");
await pagina.locator("#lista-circuitos li", { hasText: "TP4 de prueba" }).waitFor();
ok((await pagina.locator("#nombre-circuito").innerText()) === "TP4 de prueba", "guardado en localStorage: sigue ahí al recargar");
ok(JSON.stringify(await huella(pagina)) === JSON.stringify({ ...original, nombre: "TP4 de prueba" }),
  "al recargar se retoma el mismo circuito");
const [descargaJson] = await Promise.all([pagina.waitForEvent("download"), pagina.click("#accion-exportar")]);
const rutaJson = `${SALIDA}/${descargaJson.suggestedFilename()}`;
await descargaJson.saveAs(rutaJson);
ok(JSON.parse(readFileSync(rutaJson, "utf-8")).formato === "simulador-dc", `Exportar .json (${descargaJson.suggestedFilename()})`);
await abrirEjemplo(pagina, "Serie");
await esperarFase(pagina, "ok");
await pagina.locator("#entrada-archivo").setInputFiles(rutaJson);
await pagina.locator("#mensaje-circuitos", { hasText: "Importado" }).waitFor();
ok(JSON.stringify((await huella(pagina)).componentes) === JSON.stringify(original.componentes), "Importar .json restaura el circuito");
await pagina.locator("#lista-circuitos li", { hasText: "TP4 de prueba" }).getByRole("button", { name: "Renombrar" }).click();
await pagina.locator("#dialogo-entrada").fill("TP4 renombrado");
await pagina.click("#dialogo-aceptar");
await pagina.locator("#lista-circuitos li", { hasText: "TP4 renombrado" }).waitFor();
await pagina.locator("#lista-circuitos li", { hasText: "TP4 renombrado" }).getByRole("button", { name: "Borrar" }).click();
await pagina.locator("#lista-circuitos li", { hasText: "TP4 renombrado" }).waitFor({ state: "detached" });
ok(true, "renombrar y borrar en la lista");

// --- Exportar PNG y SVG ----------------------------------------------------------------
await abrirEjemplo(pagina, "TP4");
await esperarFase(pagina, "ok");
await pagina.click("#boton-menu-exportar"); // PNG y SVG están en el menú Exportar
const [png] = await Promise.all([pagina.waitForEvent("download"), pagina.click("#accion-png")]);
await png.saveAs(`${SALIDA}/04-export-tp4.png`);
const bytes = readFileSync(`${SALIDA}/04-export-tp4.png`);
ok(bytes.subarray(1, 4).toString() === "PNG" && bytes.length > 5000, `PNG exportado (${bytes.length} bytes)`);
await pagina.click("#boton-menu-exportar");
const [svg] = await Promise.all([pagina.waitForEvent("download"), pagina.click("#accion-svg")]);
await svg.saveAs(`${SALIDA}/04-export-tp4.svg`);
const textoSvg = readFileSync(`${SALIDA}/04-export-tp4.svg`, "utf-8");
ok(textoSvg.includes(">30.0 V<") && !textoSvg.includes("class=") && !textoSvg.includes("data-id"),
  "SVG exportado: con resultados y sin clases del editor");

// --- Sin internet ------------------------------------------------------------------------
await pagina.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await pagina.reload();
await esperarFase(pagina, "ok");
await contexto.setOffline(true);
await pagina.reload();
await esperarFase(pagina, "ok");
ok((await etiquetas(pagina)).includes("30.0 V"), "sin internet: recarga y simula desde la caché");
await pagina.goto(link);
await pagina.locator("#editor g[data-id]").first().waitFor({ state: "attached" });
ok(JSON.stringify((await huella(pagina)).componentes) === JSON.stringify(original.componentes),
  "sin internet: un link compartido también abre");
await contexto.setOffline(false);

// --- Modo proyector y celular ------------------------------------------------------------
const proyector = await nuevaPagina({ viewport: { width: 1280, height: 720 } });
await proyector.pagina.goto(URL_BASE);
await esperarFase(proyector.pagina, "ok");
await abrirEjemplo(proyector.pagina, "TP4");
await esperarFase(proyector.pagina, "ok");
await proyector.pagina.keyboard.press("p");
const medidas = await proyector.pagina.evaluate(() => ({
  modo: document.documentElement.dataset.proyector,
  fuente: getComputedStyle(document.body).fontSize,
  ancho: Number(document.getElementById("editor").getAttribute("width")),
}));
ok(medidas.modo === "1" && parseFloat(medidas.fuente) >= 17 && medidas.ancho >= 980 * 1.4,
  `modo proyector: letra ${medidas.fuente}, circuito a ${medidas.ancho} px de ancho`);
await proyector.pagina.click("#pestana-resultados");
await proyector.pagina.screenshot({ path: `${SALIDA}/05-proyector.png` });
await proyector.contexto.close();

const movil = await nuevaPagina({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await movil.pagina.goto(URL_BASE);
await esperarFase(movil.pagina, "ok");
await abrirEjemplo(movil.pagina, "TP4");
await esperarFase(movil.pagina, "ok");
await movil.pagina.click("#pestana-resultados");
const desborde = await movil.pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(desborde <= 0, `celular: sin scroll horizontal de la página (${desborde} px)`);
await movil.pagina.screenshot({ path: `${SALIDA}/06-celular.png`, fullPage: true });
await movil.contexto.close();

ok(errores.length === 0, `sin errores en consola ni violaciones de CSP ${JSON.stringify(errores)}`);
await navegador.close();
console.log(process.exitCode ? "Hay comprobaciones que fallaron." : "Todas las comprobaciones pasaron.");
