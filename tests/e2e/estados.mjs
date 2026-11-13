// Estados de los botones de la barra en los tres temas (claro, oscuro y proyector): activo,
// pausa ("Reanudar"), hover, foco con teclado y deshabilitado. Comprueba que el botón activo no se
// corre (sin transform y centrado en su grupo) y que dentro de un grupo no hay doble borde.
// Uso: node tests/e2e/servir.mjs   (en otra terminal)   y   node tests/e2e/estados.mjs capturas
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:8000/Simulador-2.0/";
const SALIDA = process.argv[2] ?? "capturas";
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "MAL"} ${msg}`); if (!cond) process.exitCode = 1; };

const TEMAS = [
  { nombre: "claro", tema: "light", proyector: null },
  { nombre: "oscuro", tema: "dark", proyector: null },
  { nombre: "proyector", tema: "light", proyector: "1" },
];

/** Medidas de cada botón presionado de la barra respecto de su grupo. */
function medir(pagina) {
  return pagina.evaluate(() => [...document.querySelectorAll(".barra--editor .boton[aria-pressed='true']")].map((b) => {
    const estilo = getComputedStyle(b);
    const caja = b.getBoundingClientRect();
    const grupo = b.closest(".barra__grupo");
    const cajaGrupo = grupo?.getBoundingClientRect();
    const bordeGrupo = grupo ? parseFloat(getComputedStyle(grupo).borderTopWidth) : 0;
    const contenido = [...b.children].filter((h) => getComputedStyle(h).display !== "none")
      .map((h) => h.getBoundingClientRect());
    const arriba = Math.min(...contenido.map((r) => r.top));
    const abajo = Math.max(...contenido.map((r) => r.bottom));
    return {
      nombre: b.textContent.trim() || b.title,
      transform: estilo.transform,
      bordeTransparente: estilo.borderTopColor === "rgba(0, 0, 0, 0)" || estilo.borderTopStyle === "none",
      enGrupo: Boolean(grupo),
      // Distancia del centro del botón al centro del interior del grupo, y del contenido al botón.
      descentradoEnGrupo: grupo ? Math.abs((caja.top + caja.bottom) / 2 - (cajaGrupo.top + cajaGrupo.bottom) / 2) : 0,
      margenArriba: grupo ? caja.top - cajaGrupo.top - bordeGrupo : 0,
      margenAbajo: grupo ? cajaGrupo.bottom - bordeGrupo - caja.bottom : 0,
      descentradoContenido: Math.abs((arriba + abajo) / 2 - (caja.top + caja.bottom) / 2),
    };
  }));
}

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
for (const { nombre, tema, proyector } of TEMAS) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  await contexto.addInitScript(([t, p]) => {
    localStorage.setItem("tema", t);
    if (p) localStorage.setItem("proyector", p);
    else localStorage.removeItem("proyector");
  }, [tema, proyector]);
  const pagina = await contexto.newPage();
  await pagina.goto(URL_BASE);
  await pagina.locator("#estado-simulacion[data-fase='ok']").waitFor();
  await pagina.click('[data-herramienta="lamp"]');
  await pagina.click("#accion-pausa");
  await pagina.locator("#accion-pausa", { hasText: "Reanudar" }).waitFor();
  await pagina.mouse.move(0, 0);

  const medidas = await medir(pagina);
  ok(medidas.length >= 2, `${nombre}: hay botones activos (${medidas.map((m) => m.nombre).join(", ")})`);
  ok(medidas.every((m) => m.transform === "none"), `${nombre}: el botón activo no se corre (transform none)`);
  ok(medidas.every((m) => !m.enGrupo || m.bordeTransparente),
    `${nombre}: dentro de un grupo el botón activo no tiene un segundo borde (Reanudar incluido)`);
  ok(medidas.every((m) => m.descentradoEnGrupo <= 0.75 && Math.abs(m.margenArriba - m.margenAbajo) <= 0.75),
    `${nombre}: el botón activo queda centrado en su grupo (${medidas.map((m) => m.descentradoEnGrupo.toFixed(2)).join(", ")} px)`);
  ok(medidas.every((m) => m.descentradoContenido <= 1.5),
    `${nombre}: ícono y texto centrados en el botón (${medidas.map((m) => m.descentradoContenido.toFixed(2)).join(", ")} px)`);

  const barra = pagina.locator(".barra--editor");
  await barra.screenshot({ path: `${SALIDA}/estados-${nombre}-activo.png` });
  await pagina.hover('[data-herramienta="wire"]');
  await barra.screenshot({ path: `${SALIDA}/estados-${nombre}-hover.png` });
  await pagina.mouse.move(0, 0);
  await pagina.focus('[data-herramienta="resistor"]');
  await pagina.keyboard.press("Shift+Tab");
  await pagina.keyboard.press("Tab");
  await barra.screenshot({ path: `${SALIDA}/estados-${nombre}-foco.png` });
  const foco = await pagina.evaluate(() => {
    const b = document.activeElement;
    const caja = b.getBoundingClientRect();
    const grupo = b.closest(".barra__grupo").getBoundingClientRect();
    const estilo = getComputedStyle(b);
    const offset = parseFloat(estilo.outlineOffset);
    const ancho = parseFloat(estilo.outlineWidth);
    // El contorno del foco no tiene que salirse del grupo.
    return { dentro: caja.top - offset - ancho >= grupo.top - 0.5 && caja.bottom + offset + ancho <= grupo.bottom + 0.5, estilo: estilo.outlineStyle };
  });
  ok(foco.estilo !== "none" && foco.dentro, `${nombre}: el foco con teclado se ve y no se sale del grupo`);
  await pagina.press("body", "Escape");
  await pagina.click('[data-herramienta="seleccionar"]');
  const deshabilitados = await pagina.locator(".barra--editor .boton:disabled").count();
  ok(deshabilitados >= 2, `${nombre}: botones deshabilitados (Valor, Borrar…): ${deshabilitados}`);
  await barra.screenshot({ path: `${SALIDA}/estados-${nombre}-deshabilitado.png` });
  await contexto.close();
}
await navegador.close();
console.log(process.exitCode ? "Hay comprobaciones que fallaron." : "Todas las comprobaciones pasaron.");
