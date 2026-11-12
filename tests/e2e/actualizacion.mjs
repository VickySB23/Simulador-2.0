// Comprueba el aviso "Hay una versión nueva — Actualizar" con una pestaña que queda abierta
// mientras se publica una versión nueva (como la del profesor durante la clase).
//
// Uso: node tests/e2e/actualizacion.mjs [carpeta-capturas]
//   1. El script abre BASE_URL y espera.
//   2. Mientras tanto, publicá una versión nueva (subí VERSION en sw.js y js/version.js).
//   3. El script ve el aviso, toca Actualizar y verifica que la página recargó con la versión nueva.
// Variables: BASE_URL, CHROME_PATH, ESPERA_MINUTOS (por defecto 15).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:8000/Simulador-2.0/";
const SALIDA = process.argv[2] ?? "capturas";
const ESPERA_MS = Number(process.env.ESPERA_MINUTOS ?? 15) * 60_000;
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
  : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "MAL"} ${msg}`); if (!cond) process.exitCode = 1; };
const hora = () => new Date().toLocaleTimeString("es-AR");

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
const pagina = await (await navegador.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(String(e)));

await pagina.goto(URL_BASE);
await pagina.locator('#estado-simulacion[data-fase="ok"]').waitFor();
await pagina.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await pagina.reload(); // ahora la página está controlada por el service worker
await pagina.locator('#estado-simulacion[data-fase="ok"]').waitFor();
const controlada = await pagina.evaluate(() => Boolean(navigator.serviceWorker.controller));
const inicial = await pagina.locator("#version").textContent();
ok(controlada, `${hora()} página abierta y controlada por el service worker, versión ${inicial}`);
ok(await pagina.locator("#aviso-version").isHidden(), "sin aviso mientras no hay versión nueva");
console.log(`${hora()} Esperando una versión nueva (hasta ${ESPERA_MS / 60_000} min). Publicala ahora.`);

const limite = Date.now() + ESPERA_MS;
let apareció = false;
while (Date.now() < limite) {
  // Lo mismo que hace la página cada 30 minutos o al volver a la pestaña.
  await pagina.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {}));
  try {
    await pagina.locator("#aviso-version").waitFor({ state: "visible", timeout: 10_000 });
    apareció = true;
    break;
  } catch {
    // Todavía no hay versión nueva.
  }
}
ok(apareció, `${hora()} aparece "Hay una versión nueva — Actualizar"`);
if (apareció) {
  await pagina.screenshot({ path: `${SALIDA}/07-aviso-version.png` });
  ok((await pagina.locator("#version").textContent()) === inicial, "antes de actualizar sigue la versión vieja");
  await Promise.all([pagina.waitForEvent("load"), pagina.click("#boton-actualizar")]);
  await pagina.locator('#estado-simulacion[data-fase="ok"]').waitFor();
  const final = await pagina.locator("#version").textContent();
  ok(final !== inicial, `${hora()} Actualizar recarga con la versión nueva: ${inicial} → ${final}`);
  ok(await pagina.locator("#aviso-version").isHidden(), "después de actualizar el aviso desaparece");
  const sw = await pagina.evaluate(() => new Promise((resolver) => {
    const canal = new MessageChannel();
    canal.port1.onmessage = (e) => resolver(e.data.version);
    navigator.serviceWorker.controller.postMessage({ tipo: "VERSION" }, [canal.port2]);
  }));
  ok(sw === final, `el service worker activo es el nuevo (${sw})`);
}
ok(errores.length === 0, `sin errores en la página ${JSON.stringify(errores)}`);
await navegador.close();
