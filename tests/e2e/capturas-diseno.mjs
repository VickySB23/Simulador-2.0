// Capturas para comparar el diseño antes y después (escritorio, diálogo, panel, celular,
// proyector, interruptor en las dos vistas y etiquetas sobre lámparas y baterías).
// Abre los circuitos por link (#c=…), así funciona igual con cualquier versión de la interfaz.
// Uso: node tests/e2e/servir.mjs   (en otra terminal)   y   node tests/e2e/capturas-diseno.mjs carpeta
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

import { codificar } from "../../frontend/public/js/lib/compartir.js";
import { EJEMPLOS } from "../../frontend/public/js/lib/ejemplos.js";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:8000/Simulador-2.0/";
const SALIDA = process.argv[2] ?? "capturas-diseno";
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });

const link = async (id) => {
  const ejemplo = EJEMPLOS.find((e) => e.id === id);
  return `${URL_BASE}#c=${await codificar(ejemplo.estado, ejemplo.nombre)}`;
};
const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
async function abrir(url, opciones = {}, preferencias = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...opciones });
  await contexto.addInitScript((p) => {
    localStorage.setItem("simulador-dc:tutorial", JSON.stringify({ paso: 0, modo: "cerrado", empezado: false }));
    for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v);
  }, preferencias);
  const pagina = await contexto.newPage();
  await pagina.goto(url);
  await pagina.locator("#estado-simulacion[data-fase='ok']").waitFor();
  await pagina.waitForTimeout(400);
  return { contexto, pagina };
}
async function recorte(pagina, selector, nombre, margen = 40) {
  const caja = await pagina.locator(selector).first().boundingBox();
  await pagina.screenshot({
    path: `${SALIDA}/${nombre}.png`,
    clip: { x: Math.max(0, caja.x - margen), y: Math.max(0, caja.y - margen), width: caja.width + 2 * margen, height: caja.height + 2 * margen },
  });
}

// Escritorio con el TP4: barra, lienzo y panel.
{
  const { contexto, pagina } = await abrir(await link("tp4"));
  await pagina.screenshot({ path: `${SALIDA}/1-escritorio.png` });
  await pagina.screenshot({ path: `${SALIDA}/2-escritorio-pagina-entera.png`, fullPage: true });
  // Diálogo "Valor de V1" (doble clic en la batería).
  const v1 = await pagina.locator('#editor [data-id="V1"] line.comp__seleccion').boundingBox();
  await pagina.mouse.dblclick(v1.x + v1.width / 2, v1.y + v1.height / 2);
  await pagina.locator("#dialogo[open]").waitFor();
  await recorte(pagina, "#dialogo", "3-dialogo-valor", 24);
  await contexto.close();
}
// Interruptor en las dos vistas y etiquetas sobre lámparas horizontales.
for (const vista of ["ilustrada", "esquematica"]) {
  const { contexto, pagina } = await abrir(await link("linterna"), {}, { vista });
  await recorte(pagina, '#editor [data-id="S1"]', `4-interruptor-cerrado-${vista}`, 30);
  const s1 = await pagina.locator('#editor [data-id="S1"] line.comp__seleccion').boundingBox();
  await pagina.mouse.click(s1.x + s1.width / 2, s1.y + s1.height / 2);
  await pagina.waitForTimeout(500);
  await recorte(pagina, '#editor [data-id="S1"]', `5-interruptor-abierto-${vista}`, 30);
  await contexto.close();
}
{
  const { contexto, pagina } = await abrir(await link("serie-contra-paralelo"));
  await recorte(pagina, '#editor [data-id="L1"]', "6-etiqueta-lampara", 60);
  await contexto.close();
}
// Celular y proyector.
{
  const { contexto, pagina } = await abrir(await link("tp4"), { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pagina.screenshot({ path: `${SALIDA}/7-celular.png` });
  await contexto.close();
}
{
  const { contexto, pagina } = await abrir(await link("tp4"), {}, { proyector: "1" });
  await pagina.screenshot({ path: `${SALIDA}/8-proyector.png` });
  await contexto.close();
}
await navegador.close();
console.log(`Capturas en ${SALIDA}/`);
