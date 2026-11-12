// Capturas de la galería (claro, oscuro, proyector y celular), errores de consola y cuadros por
// segundo con 50 componentes animados, también con la CPU frenada como en un celular.
// Uso: node tests/e2e/servir.mjs   (en otra terminal)   y   node tests/e2e/galeria.mjs capturas
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

async function abrir(opciones = {}, preparar = null) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...opciones });
  const pagina = await contexto.newPage();
  pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  pagina.on("pageerror", (e) => errores.push(String(e)));
  if (preparar) await contexto.addInitScript(preparar);
  await pagina.goto(`${URL_BASE}galeria.html`);
  await pagina.locator("#carga-lienzo svg").waitFor({ state: "attached" });
  await pagina.evaluate(() => document.fonts.ready.then(() => true));
  return { contexto, pagina };
}

// Captura sobre la página completa: recortar el elemento hace que el encabezado fijo aparezca en el medio.
async function seccion(pagina, id, archivo) {
  await pagina.locator(`#${id}`).scrollIntoViewIfNeeded();
  await pagina.waitForTimeout(200);
  // Arriba de todo: así el encabezado fijo queda al principio de la página y no en la captura.
  await pagina.evaluate(() => scrollTo(0, 0));
  const clip = await pagina.evaluate((i) => {
    const r = document.getElementById(i).getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
  }, id);
  await pagina.screenshot({ path: `${SALIDA}/${archivo}`, fullPage: true, clip });
}

async function medirFps(pagina) {
  await pagina.locator("#rendimiento").scrollIntoViewIfNeeded();
  await pagina.evaluate(() => document.getElementById("medir").click());
  await pagina.locator("#medidor[data-fps]").waitFor({ timeout: 15000 });
  return Number(await pagina.locator("#medidor").getAttribute("data-fps"));
}

// --- Claro --------------------------------------------------------------------------------
const claro = await abrir();
// El canvas de animación queda exactamente sobre su SVG.
const desfase = await claro.pagina.evaluate(() => Math.max(...[...document.querySelectorAll(".capa-animada")].map((m) => {
  const a = m.querySelector("svg").getBoundingClientRect();
  const b = m.querySelector("canvas").getBoundingClientRect();
  return Math.abs(a.top - b.top) + Math.abs(a.left - b.left) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height);
})));
ok(desfase < 1, `cada canvas de animación está sobre su SVG (desfase máximo ${desfase.toFixed(2)} px)`);
const fuente = await claro.pagina.evaluate(() => document.fonts.check("16px Nunito"));
ok(fuente, "Nunito cargada desde el repo (sin CDN)");
ok(await claro.pagina.locator(".comp").count() > 150, `componentes dibujados: ${await claro.pagina.locator(".comp").count()}`);
for (const [id, archivo] of [["tokens", "g1-tokens.png"], ["interfaz", "g2-interfaz.png"], ["componentes", "g3-componentes.png"],
  ["animaciones", "g4-animaciones.png"], ["demo", "g5-demo.png"]]) {
  await seccion(claro.pagina, id, archivo);
}
// Interruptor del circuito de prueba: al cerrarlo, la rama de R1 conduce.
const antes = await claro.pagina.locator("#demo-tabla tr", { hasText: "R1" }).innerText();
await claro.pagina.locator('#demo-lienzo [data-id="S2"]').click();
const despues = await claro.pagina.locator("#demo-tabla tr", { hasText: "R1" }).innerText();
ok(antes.includes("0 A") && despues.includes("250 mA"), `clic en S2: R1 pasa de 0 A a 250 mA (${despues.replaceAll("\t", " ")})`);
await claro.pagina.locator('#demo-tension [data-tension="18"]').click();
ok(await claro.pagina.locator("#demo-lienzo .comp--lamp.quemada").count() === 1, "con 18 V la lámpara de 6 W se quema");
const filaL1 = await claro.pagina.locator("#demo-tabla tr", { hasText: "L1" }).innerText();
const filaR1 = await claro.pagina.locator("#demo-tabla tr", { hasText: "R1" }).innerText();
ok(filaL1.includes("0 A") && filaR1.includes("375 mA"), "la lámpara quemada abre su rama y R1 sigue (375 mA)");
// Serie: con 18 V se quema L1 y se apagan las dos.
await seccion(claro.pagina, "serie-paralelo", "g5-serie-paralelo.png");
await claro.pagina.locator('#serie-tension [data-tension="18"]').click();
ok(await claro.pagina.locator("#serie-lienzo .comp--lamp.quemada").count() === 1
  && await claro.pagina.locator("#serie-lienzo .comp--lamp.encendida").count() === 0,
  `serie con 18 V: L1 se quema y se apagan todas (${await claro.pagina.locator("#serie-lectura").innerText()})`);
// Paralelo: con 18 V se quema L1 y L2 sigue encendida.
await claro.pagina.locator('#paralelo-tension [data-tension="18"]').click();
ok(await claro.pagina.locator("#paralelo-lienzo .comp--lamp.quemada").count() === 1
  && await claro.pagina.locator("#paralelo-lienzo .comp--lamp.encendida").count() === 1,
  `paralelo con 18 V: L1 se quema y L2 sigue encendida (${await claro.pagina.locator("#paralelo-lectura").innerText()})`);
await seccion(claro.pagina, "serie-paralelo", "g5-serie-paralelo-quemadas.png");
await seccion(claro.pagina, "demo", "g5-demo-quemada.png");
const fpsEscritorio = await medirFps(claro.pagina);
await seccion(claro.pagina, "rendimiento", "g6-rendimiento.png");
await claro.contexto.close();

// --- Oscuro y proyector -----------------------------------------------------------------------
const oscuro = await abrir({ colorScheme: "dark" });
await seccion(oscuro.pagina, "componentes", "g7-componentes-oscuro.png");
await seccion(oscuro.pagina, "interfaz", "g7-interfaz-oscuro.png");
await oscuro.contexto.close();

const proyector = await abrir({ viewport: { width: 1280, height: 720 } }, () => localStorage.setItem("proyector", "1"));
await seccion(proyector.pagina, "demo", "g8-demo-proyector.png");
await proyector.pagina.screenshot({ path: `${SALIDA}/g8-proyector-encabezado.png` });
await proyector.contexto.close();

// --- Celular, con la CPU frenada 4× (como un celular de gama media) ---------------------------
const movil = await abrir({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const desborde = await movil.pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(desborde <= 0, `celular: sin scroll horizontal de la página (${desborde} px)`);
await movil.pagina.screenshot({ path: `${SALIDA}/g9-celular.png` });
const cdp = await movil.contexto.newCDPSession(movil.pagina);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const fpsMovil = await medirFps(movil.pagina);
await movil.contexto.close();

// --- Movimiento: se anima, se pausa y respeta prefers-reduced-motion ----------------------------
// Dos capturas del canvas de la prueba de 50 componentes, separadas medio segundo.
async function cambia(pagina) {
  await pagina.locator("#carga-lienzo canvas").scrollIntoViewIfNeeded();
  const foto = () => pagina.evaluate(() => document.querySelector("#carga-lienzo canvas").toDataURL());
  const a = await foto();
  await pagina.waitForTimeout(500);
  return a !== await foto();
}
const movimiento = await abrir();
ok(await cambia(movimiento.pagina), "los puntos de corriente se mueven");
await movimiento.pagina.evaluate(() => document.getElementById("control-animaciones").click());
ok(!(await cambia(movimiento.pagina)), "Pausar animaciones las detiene");
await movimiento.pagina.evaluate(() => document.getElementById("control-animaciones").click());
ok(await cambia(movimiento.pagina), "Reanudar las vuelve a mover");
await movimiento.contexto.close();
const reducido = await abrir({ reducedMotion: "reduce" });
ok(!(await cambia(reducido.pagina)), "prefers-reduced-motion: nada se mueve");
const puntosQuietos = await reducido.pagina.evaluate(() => {
  const c = document.querySelector("#carga-lienzo canvas");
  const datos = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let pintados = 0;
  for (let i = 3; i < datos.length; i += 4) if (datos[i] > 0) pintados++;
  return pintados;
});
ok(puntosQuietos > 0, "con movimiento reducido igual se ven los puntos (quietos)");
await reducido.contexto.close();

console.log(`cuadros/s con 50 componentes animados: escritorio ${fpsEscritorio}, celular con CPU 4× más lenta ${fpsMovil}`);
ok(fpsMovil >= 30, "celular con CPU 4× más lenta: al menos 30 cuadros/s");
ok(errores.length === 0, `sin errores de consola ni de CSP ${JSON.stringify(errores)}`);
await navegador.close();
