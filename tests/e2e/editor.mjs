// Editor rediseñado: lámpara e interruptor como herramientas, vista ilustrada/esquemática,
// corriente en los cables animada y rendimiento con 50 componentes (también con la CPU 4× más lenta).
// Uso: node tests/e2e/servir.mjs   (en otra terminal)   y   node tests/e2e/editor.mjs capturas
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

import { PREFIJO_HASH, codificar } from "../../frontend/public/js/lib/compartir.js";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:8000/Simulador-2.0/";
const SALIDA = process.argv[2] ?? "capturas";
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "MAL"} ${msg}`); if (!cond) process.exitCode = 1; };
const errores = [];

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
async function abrir(url = URL_BASE, opciones = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...opciones });
  const pagina = await contexto.newPage();
  pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  pagina.on("pageerror", (e) => errores.push(String(e)));
  pagina.on("dialog", (d) => d.accept());
  await pagina.goto(url);
  await pagina.locator("#editor .comp").first().waitFor({ state: "attached" });
  return { contexto, pagina };
}
async function fase(pagina, f) {
  try {
    await pagina.locator(`#estado-simulacion[data-fase="${f}"]`).waitFor({ timeout: 10000 });
  } catch (e) {
    await pagina.screenshot({ path: `${SALIDA}/error-fase.png` });
    throw new Error(`No llegó a la fase ${f}: "${await pagina.locator("#estado-simulacion").innerText()}"`);
  }
}

async function clic(pagina, x, y, doble = false) {
  const p = await pagina.evaluate(([gx, gy]) => {
    const svg = document.getElementById("editor");
    const q = new DOMPoint(gx * 20 + 10, gy * 20 + 10).matrixTransform(svg.getScreenCTM());
    return { x: q.x, y: q.y };
  }, [x, y]);
  if (doble) await pagina.mouse.dblclick(p.x, p.y);
  else await pagina.mouse.click(p.x, p.y);
}
/** Un cable por clics: el siguiente clic seguiría desde la punta, así que Esc lo termina. */
async function cable(pagina, a, b) {
  await clic(pagina, ...a);
  await clic(pagina, ...b);
  await pagina.keyboard.press("Escape");
}
async function canvasCambia(pagina) {
  const foto = () => pagina.evaluate(() => document.querySelector("#contenedor-editor canvas").toDataURL());
  const a = await foto();
  await pagina.waitForTimeout(400);
  return a !== await foto();
}

// --- Armar un circuito con las herramientas nuevas -------------------------------------------
const { contexto, pagina } = await abrir();
await pagina.click("#pestana-circuitos");
await pagina.click("#accion-nuevo");
await pagina.click('[data-herramienta="voltage_source"]');
await pagina.keyboard.press("Space"); // vertical, + arriba
await clic(pagina, 6, 8);
// La rotación es una sola para todas las herramientas: tres giros más vuelven a horizontal.
await pagina.click('[data-herramienta="switch"]');
for (let i = 0; i < 3; i++) await pagina.keyboard.press("Space");
await clic(pagina, 10, 4);
await pagina.click('[data-herramienta="lamp"]');
await pagina.keyboard.press("Space");
await clic(pagina, 16, 8);
await pagina.click('[data-herramienta="wire"]');
await cable(pagina, [6, 6], [6, 4]);
await cable(pagina, [6, 4], [8, 4]);
await cable(pagina, [12, 4], [16, 4]);
await cable(pagina, [16, 4], [16, 6]);
await cable(pagina, [6, 10], [16, 10]);
await pagina.click('[data-herramienta="ground"]');
await clic(pagina, 6, 10);
await pagina.click('[data-herramienta="seleccionar"]');
await fase(pagina, "ok");
await pagina.click("#pestana-resultados");
ok(await pagina.locator('#editor [data-id="L1"].encendida').count() === 1, "lámpara (herramienta 6) encendida con la batería de 10 V");
ok((await pagina.locator(".tabla-componentes").innerText()).includes("L1 · 69 %"), "brillo de la lámpara: 10² / 24 Ω = 4,17 W de 6 W (69 %)");
ok(await canvasCambia(pagina), "los puntos de corriente se mueven por los cables (corriente calculada)");
await pagina.screenshot({ path: `${SALIDA}/e1-armado.png` });

// --- Interruptor: un clic lo abre y otro lo cierra -------------------------------------------
await clic(pagina, 10, 4);
await pagina.locator('#editor [data-id="S1"].abierto').waitFor({ state: "attached" });
ok((await pagina.locator(".tabla-componentes tr", { hasText: "L1" }).innerText()).includes("0 A"), "interruptor abierto: la lámpara se apaga");
await pagina.waitForTimeout(450); // dejar que termine la animación de la palanca
await clic(pagina, 10, 4);
await pagina.locator('#editor [data-id="S1"]:not(.abierto)').waitFor({ state: "attached" });
ok(await pagina.locator('#editor [data-id="L1"].encendida').count() === 1, "interruptor cerrado: vuelve a encender");

// --- Lámpara: dos valores; con potencia nominal baja se quema -----------------------------
await clic(pagina, 16, 8, true);
ok(await pagina.locator("#dialogo-entrada-2").isVisible(), "doble clic en la lámpara pide resistencia y potencia nominal");
await pagina.locator("#dialogo-entrada-2").fill("2");
await pagina.click("#dialogo-aceptar");
await pagina.locator('#editor [data-id="L1"].quemada').waitFor({ state: "attached" });
ok((await pagina.locator("#aviso-lamparas").innerText()).includes("se quemó"), "con 2 W nominales se quema y lo avisa");
await pagina.screenshot({ path: `${SALIDA}/e2-quemada.png` });
await pagina.keyboard.press("Control+z");
await pagina.locator('#editor [data-id="L1"].encendida').waitFor({ state: "attached" });

// --- Vista esquemática y sentido de la corriente -----------------------------------------
await pagina.click("#boton-menu-vista"); // vista, sentido y puntos están en el menú Vista
await pagina.click('#control-vista [data-vista="esquematica"]');
ok(await pagina.locator("#editor .esq-cuchilla").count() === 1 && await pagina.locator("#editor .lam-vidrio").count() === 0,
  "vista esquemática: símbolos IEC");
await pagina.screenshot({ path: `${SALIDA}/e3-esquematica.png` });
await pagina.keyboard.press("v");
ok(await pagina.locator("#editor .lam-vidrio").count() === 1, "la tecla V vuelve a la vista ilustrada");
if (await pagina.locator("#menu-vista").isHidden()) await pagina.click("#boton-menu-vista");
await pagina.click('#control-sentido [data-sentido="electrones"]');
ok(await pagina.locator('#control-sentido [data-sentido="electrones"][aria-pressed="true"]').count() === 1, "sentido: flujo de electrones");
await pagina.click("#accion-pausa");
ok(!(await canvasCambia(pagina)), "Pausa detiene las animaciones");
await pagina.click("#accion-pausa");
ok(await canvasCambia(pagina), "y se reanudan");
await contexto.close();

// --- Arrastrar: la pieza queda donde se suelta y el circuito se vuelve a simular --------------
const arr = await abrir();
await fase(arr.pagina, "ok");
const punto = async (gx, gy) => arr.pagina.evaluate(([x, y]) => {
  const q = new DOMPoint(x * 20 + 10, y * 20 + 10).matrixTransform(document.getElementById("editor").getScreenCTM());
  return { x: q.x, y: q.y };
}, [gx, gy]);
// R2 del divisor va de (18,6) a (18,10); se lo lleva 3 celdas a la derecha, a (21,6)-(21,10).
const desde = await punto(18, 8);
const hasta = await punto(21, 8);
await arr.pagina.mouse.move(desde.x, desde.y);
await arr.pagina.mouse.down();
await arr.pagina.mouse.move((desde.x + hasta.x) / 2, desde.y, { steps: 3 });
ok(await arr.pagina.locator(".capa-arrastre [data-id=\"R2\"]").count() === 1, "mientras se arrastra, la pieza va en su capa aparte");
await arr.pagina.mouse.move(hasta.x, hasta.y, { steps: 3 });
await arr.pagina.mouse.up();
// Suelta, R2 queda "sin conectar" y el resto (V1 y R1) ya no cierra un circuito: no es un error.
await fase(arr.pagina, "vacio");
const x1 = await arr.pagina.locator('#editor [data-id="R2"] line.comp__seleccion').getAttribute("x1");
ok(x1 === String(21 * 20 + 10) && await arr.pagina.locator(".capa-arrastre").count() === 0
  && await arr.pagina.locator("g.borne-suelto").count() > 0,
  "al soltar, R2 queda 3 celdas a la derecha y se vuelve a simular (quedó suelta: sin conectar)");
await arr.pagina.keyboard.press("Control+z");
await fase(arr.pagina, "ok");
await arr.contexto.close();

// --- Ejemplos con el diseño nuevo ---------------------------------------------------------------
const ejemplos = await abrir();
await ejemplos.pagina.click("#pestana-circuitos");
await ejemplos.pagina.click("#accion-ejemplos");
await ejemplos.pagina.locator(".tarjeta-ejemplo", { hasText: "TP4" }).click();
await ejemplos.pagina.click("#pestana-resultados");
await ejemplos.pagina.locator("text.tension", { hasText: "30.0 V" }).waitFor();
await ejemplos.pagina.screenshot({ path: `${SALIDA}/e4-tp4.png` });
await ejemplos.contexto.close();
for (const [opciones, archivo] of [
  [{ colorScheme: "dark" }, "e5-oscuro.png"],
  [{ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "e6-celular.png"],
]) {
  const v = await abrir(URL_BASE, opciones);
  if (archivo === "e6-celular.png") {
    const desborde = await v.pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(desborde <= 0, `celular: sin scroll horizontal (${desborde} px)`);
    await v.pagina.screenshot({ path: `${SALIDA}/${archivo}`, fullPage: true });
  } else {
    await v.pagina.screenshot({ path: `${SALIDA}/${archivo}` });
  }
  await v.contexto.close();
}
const proyector = await abrir(URL_BASE, { viewport: { width: 1280, height: 720 } });
await proyector.pagina.keyboard.press("p");
await proyector.pagina.waitForTimeout(300);
await proyector.pagina.screenshot({ path: `${SALIDA}/e7-proyector.png` });
await proyector.contexto.close();

// --- Rendimiento con 50 componentes ---------------------------------------------------------
// Cinco ramas en paralelo de diez componentes cada una (resistencias, lámparas e interruptores)
// entre dos rieles, y una batería de 120 V.
function circuitoGrande() {
  const components = [];
  const counters = { R: 0, V: 0, I: 0, W: 0, L: 0, S: 0 };
  const nuevo = (tipo, a, b, extra = {}) => {
    const prefijo = { resistor: "R", voltage_source: "V", wire: "W", lamp: "L", switch: "S" }[tipo];
    counters[prefijo] += 1;
    components.push({ id: `${prefijo}${counters[prefijo]}`, type: tipo, a, b, ...extra });
  };
  const tipos = ["resistor", "lamp", "switch", "lamp", "resistor"];
  for (let fila = 0; fila < 5; fila++) {
    const y = 2 + fila * 6;
    for (let k = 0; k < 10; k++) {
      const a = { x: 4 + k * 4, y };
      const b = { x: 8 + k * 4, y };
      const tipo = tipos[fila] === "switch" && k % 2 ? "resistor" : tipos[fila];
      if (tipo === "lamp") nuevo("lamp", a, b, { value: "24", potencia: "30" });
      else if (tipo === "switch") nuevo("switch", a, b, { closed: true });
      else nuevo("resistor", a, b, { value: "100" });
    }
    if (fila < 4) {
      nuevo("wire", { x: 4, y }, { x: 4, y: y + 6 });
      nuevo("wire", { x: 44, y }, { x: 44, y: y + 6 });
    }
  }
  nuevo("voltage_source", { x: 20, y: 28 }, { x: 24, y: 28 }, { value: "120" });
  nuevo("wire", { x: 4, y: 26 }, { x: 4, y: 28 });
  nuevo("wire", { x: 4, y: 28 }, { x: 20, y: 28 });
  nuevo("wire", { x: 24, y: 28 }, { x: 44, y: 28 });
  nuevo("wire", { x: 44, y: 28 }, { x: 44, y: 26 });
  return { components, ground: { x: 44, y: 28 }, counters };
}
const grande = circuitoGrande();
const piezas = grande.components.filter((c) => c.type !== "wire").length;
const link = `${URL_BASE}${PREFIJO_HASH}${await codificar(grande, "50 componentes")}`;

async function medir(pagina, conArrastre) {
  return pagina.evaluate((arrastrar) => new Promise((listo) => {
    const svg = document.getElementById("editor");
    const destino = (gx, gy) => {
      const q = new DOMPoint(gx * 20 + 10, gy * 20 + 10).matrixTransform(svg.getScreenCTM());
      return { clientX: q.x, clientY: q.y };
    };
    const evento = (tipo, punto) => svg.dispatchEvent(new PointerEvent(tipo, { bubbles: true, button: 0, pointerId: 1, isPrimary: true, ...punto }));
    if (arrastrar) {
      // Arrastrar R1 (de 4,2 a 8,2): se toma del medio y se mueve de a una celda por cuadro.
      const inicio = destino(6, 2);
      document.elementFromPoint(inicio.clientX, inicio.clientY)
        ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, isPrimary: true, ...inicio }));
    }
    let cuadros = 0;
    const t0 = performance.now();
    const paso = (t) => {
      cuadros++;
      if (arrastrar) evento("pointermove", destino(6, 2 + (cuadros % 2)));
      if (t - t0 < 3000) requestAnimationFrame(paso);
      else {
        if (arrastrar) evento("pointerup", destino(6, 2));
        listo(Math.round((cuadros * 1000 * 10) / (t - t0)) / 10);
      }
    };
    requestAnimationFrame(paso);
  }), conArrastre);
}

const escritorio = await abrir(link);
await fase(escritorio.pagina, "ok");
ok(await escritorio.pagina.locator("#editor .comp").count() >= piezas, `circuito de ${piezas} componentes cargado por link`);
await escritorio.pagina.screenshot({ path: `${SALIDA}/e8-50-componentes.png` });
const fpsEscritorio = await medir(escritorio.pagina, false);
const fpsEscritorioArrastre = await medir(escritorio.pagina, true);
await escritorio.contexto.close();

const movil = await abrir(link, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await fase(movil.pagina, "ok");
const cdp = await movil.contexto.newCDPSession(movil.pagina);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const fpsMovil = await medir(movil.pagina, false);
const fpsMovilArrastre = await medir(movil.pagina, true);
await movil.contexto.close();

console.log(`cuadros/s con ${piezas} componentes: escritorio ${fpsEscritorio} (arrastrando ${fpsEscritorioArrastre}), `
  + `celular con CPU 4× más lenta ${fpsMovil} (arrastrando ${fpsMovilArrastre})`);
ok(fpsMovil >= 30, "celular con CPU 4× más lenta: al menos 30 cuadros/s animando");
ok(fpsMovilArrastre >= 30, "celular con CPU 4× más lenta: al menos 30 cuadros/s arrastrando una pieza");
ok(errores.length === 0, `sin errores de consola ni de CSP ${JSON.stringify(errores)}`);
await navegador.close();
