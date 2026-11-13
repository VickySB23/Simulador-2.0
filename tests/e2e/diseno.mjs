// Diseño y barra (etapas D y E): interfaz compacta, barra en una fila con menús, puntos de corriente
// que se ocultan (y el aviso de movimiento reducido), interruptor, panel compacto (plegables,
// ancho, ocultar, galería de ejemplos, hoja inferior en el celular), diálogos ajustados, etiquetas
// que no tapan piezas, ajustar a la pantalla (F) y el aviso de dos GND en corto.
// Uso: node tests/e2e/servir.mjs   (en otra terminal)   y   node tests/e2e/diseno.mjs capturas
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

import { codificar } from "../../frontend/public/js/lib/compartir.js";
import { EJEMPLOS } from "../../frontend/public/js/lib/ejemplos.js";
import { TP4 } from "../../frontend/tests/circuitos-de-prueba.js";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:8000/Simulador-2.0/";
const SALIDA = process.argv[2] ?? "capturas";
const CHROME = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
mkdirSync(SALIDA, { recursive: true });
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "MAL"} ${msg}`); if (!cond) process.exitCode = 1; };
const errores = [];
const link = async (id) => {
  const e = id === "tp4" ? TP4 : EJEMPLOS.find((x) => x.id === id);
  return `${URL_BASE}#c=${await codificar(e.estado, e.nombre)}`;
};

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
async function abrir(url, opciones = {}, preferencias = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...opciones });
  await contexto.addInitScript((p) => {
    localStorage.setItem("simulador-dc:tutorial", JSON.stringify({ paso: 0, modo: "cerrado", empezado: false }));
    for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v);
  }, preferencias);
  const pagina = await contexto.newPage();
  pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  pagina.on("pageerror", (e) => errores.push(String(e)));
  pagina.on("dialog", (d) => d.accept());
  await pagina.goto(url);
  await pagina.locator("#estado-simulacion[data-fase='ok']").waitFor();
  return { contexto, pagina };
}
const enPantalla = (p, x, y) => p.evaluate(([gx, gy]) => {
  const q = new DOMPoint(gx * 20 + 10, gy * 20 + 10).matrixTransform(document.getElementById("editor").getScreenCTM());
  return { x: q.x, y: q.y };
}, [x, y]);
const seTocan = (u, v) => u.x < v.x + v.width && v.x < u.x + u.width && u.y < v.y + v.height && v.y < u.y + u.height;

// --- Escritorio --------------------------------------------------------------------------------
{
  const { contexto, pagina } = await abrir(await link("tp4"));
  const medidas = await pagina.evaluate(() => ({
    letra: parseFloat(getComputedStyle(document.body).fontSize),
    alto: document.querySelector(".barra--editor .herramienta").getBoundingClientRect().height,
    filas: new Set([...document.querySelectorAll(".barra--editor > *")].map((e) => Math.round(e.getBoundingClientRect().top))).size,
  }));
  ok(medidas.letra <= 13 && medidas.alto <= 32, `interfaz compacta: letra ${medidas.letra} px, botones de ${medidas.alto} px`);
  ok(medidas.filas === 1, "la barra entra en una sola fila (componentes, edición y vista)");
  const grupos = await pagina.locator(".barra--editor > .barra__grupo").evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label")));
  ok(JSON.stringify(grupos) === JSON.stringify(["Componentes", "Edición", "Vista"]), `grupos de la barra: ${grupos}`);
  ok(await pagina.locator("#accion-png").isHidden() && await pagina.locator("#control-sentido").isHidden(),
    "PNG, SVG, la vista y el sentido de la corriente quedan en menús desplegables");

  // Menú Vista: puntos de corriente.
  await pagina.click("#boton-menu-vista");
  ok(await pagina.locator("#control-vista").isVisible() && await pagina.locator("#control-puntos").isVisible(), "el menú Vista tiene el dibujo, el sentido y los puntos");
  await pagina.screenshot({ path: `${SALIDA}/d1-menu-vista.png` });
  await pagina.click('#control-puntos [data-puntos="no"]');
  ok(await pagina.locator("#aviso-movimiento").isHidden(), "sin movimiento reducido no hay aviso");
  await pagina.keyboard.press("Escape");
  ok(await pagina.locator("#menu-vista").isHidden(), "Esc cierra el menú");
  await pagina.reload();
  await pagina.locator("#estado-simulacion[data-fase='ok']").waitFor();
  ok(await pagina.locator('#control-puntos [data-puntos="no"][aria-pressed="true"]').count() === 1, "ocultar los puntos se recuerda al recargar");
  await pagina.click("#boton-menu-vista");
  await pagina.click('#control-puntos [data-puntos="si"]');
  await pagina.keyboard.press("Escape");
  await pagina.keyboard.press("v");
  ok(await pagina.locator('#control-vista [data-vista="esquematica"][aria-pressed="true"]').count() === 1, "la tecla V sigue cambiando la vista");
  await pagina.keyboard.press("v");

  // Ajustar a la pantalla (F).
  const ancho0 = Number(await pagina.locator("#editor").getAttribute("width"));
  await pagina.keyboard.press("f");
  const ajuste = await pagina.evaluate(() => {
    const marco = document.getElementById("contenedor-editor").getBoundingClientRect();
    const piezas = [...document.querySelectorAll("#editor g[data-id]")].map((g) => g.getBoundingClientRect());
    const adentro = piezas.every((r) => r.left >= marco.left && r.right <= marco.right && r.top >= marco.top && r.bottom <= marco.bottom);
    const x = (Math.min(...piezas.map((r) => r.left)) + Math.max(...piezas.map((r) => r.right))) / 2;
    return { adentro, centrado: Math.abs(x - (marco.left + marco.right) / 2) < 40, ancho: Number(document.getElementById("editor").getAttribute("width")) };
  });
  ok(ajuste.adentro && ajuste.centrado && ajuste.ancho > ancho0, `F ajusta el circuito a la pantalla: entra entero, centrado (${ancho0} → ${ajuste.ancho} px)`);
  await pagina.screenshot({ path: `${SALIDA}/d2-ajustado.png` });

  // Panel compacto: secciones plegables, ancho, ocultar.
  ok(await pagina.locator('#grupos-resultados details[data-seccion="nodos"]:not([open])').count() === 1
    && await pagina.locator('#grupos-resultados details[data-seccion="componentes"][open]').count() === 1,
  "Resultados con secciones plegables (Nodos empieza plegada)");
  await pagina.locator('#grupos-resultados details[data-seccion="nodos"] summary').click();
  ok(await pagina.locator("#grupos-resultados .tabla-nodos tr").first().isVisible(), "se despliega la tabla de nodos");
  const ancho = async () => (await pagina.locator("#panel").boundingBox()).width;
  const a0 = await ancho();
  const borde = await pagina.locator("#panel-borde").boundingBox();
  await pagina.mouse.move(borde.x + borde.width / 2, borde.y + 200);
  await pagina.mouse.down();
  await pagina.mouse.move(borde.x - 120, borde.y + 200, { steps: 6 });
  await pagina.mouse.up();
  const a1 = await ancho();
  ok(a1 > a0 + 100, `arrastrar el borde agranda el panel (${Math.round(a0)} → ${Math.round(a1)} px)`);
  await pagina.click("#boton-ocultar-panel");
  ok(await pagina.locator("#panel").isHidden() && await pagina.locator("#boton-mostrar-panel").isVisible(), "el panel se oculta y queda un botón para volver a mostrarlo");
  await pagina.screenshot({ path: `${SALIDA}/d3-panel-oculto.png` });
  await pagina.click("#boton-mostrar-panel");
  ok(await pagina.locator("#panel").isVisible() && Math.abs((await ancho()) - a1) < 2, "vuelve con el ancho elegido");

  // Galería de ejemplos.
  await pagina.click("#pestana-circuitos");
  await pagina.click("#accion-ejemplos");
  const tarjetas = await pagina.locator(".tarjeta-ejemplo").count();
  const miniaturas = await pagina.locator(".tarjeta-ejemplo svg.miniatura .comp").count();
  ok(tarjetas === EJEMPLOS.length && miniaturas > tarjetas * 3, `galería de ejemplos: ${tarjetas} tarjetas con su miniatura`);
  await pagina.screenshot({ path: `${SALIDA}/d4-galeria-ejemplos.png` });
  await pagina.locator(".tarjeta-ejemplo", { hasText: "Linterna" }).click();
  await pagina.locator('#editor [data-id="S1"]').waitFor({ state: "attached" });
  ok(await pagina.locator("#galeria-ejemplos").isHidden(), "elegir una tarjeta abre el ejemplo y cierra la galería");

  // Interruptor: palanca, contactos y luz de estado.
  const luz = () => pagina.locator('#editor [data-id="S1"] .int-luz').evaluate((c) => getComputedStyle(c).fill);
  const cerrado = await luz();
  const s1 = await pagina.locator('#editor [data-id="S1"] line.comp__seleccion').boundingBox();
  await pagina.mouse.click(s1.x + s1.width / 2, s1.y + s1.height / 2);
  await pagina.waitForTimeout(600);
  const abierto = await luz();
  const giro = await pagina.locator('#editor [data-id="S1"] .int-palanca').evaluate((g) => getComputedStyle(g).transform);
  ok(cerrado !== abierto && giro !== "none", `interruptor abierto: la palanca se levanta y la luz cambia (${cerrado} → ${abierto})`);
  await pagina.screenshot({ path: `${SALIDA}/d5-interruptor-abierto.png` });

  // Diálogo ajustado: sin hueco debajo de la ayuda.
  await pagina.keyboard.press("Control+z");
  const l1 = await pagina.locator('#editor [data-id="V1"] line.comp__seleccion').boundingBox();
  await pagina.mouse.dblclick(l1.x + l1.width / 2, l1.y + l1.height / 2);
  await pagina.locator("#dialogo[open]").waitFor();
  const hueco = await pagina.evaluate(() => document.querySelector("#dialogo .acciones").getBoundingClientRect().top
    - document.getElementById("dialogo-ayuda").getBoundingClientRect().bottom);
  ok(hueco < 24, `el diálogo se ajusta a su contenido (${Math.round(hueco)} px entre la ayuda y los botones)`);
  await pagina.keyboard.press("Escape");

  // Dos GND en los bornes de una batería: mensaje claro.
  await pagina.click("#pestana-resultados");
  await pagina.keyboard.press("g");
  const mas = await enPantalla(pagina, 6, 6); // borne + de V1 (la tierra está en el −)
  await pagina.mouse.click(mas.x, mas.y);
  await pagina.locator("#estado-simulacion", { hasText: "Los dos GND ponen en corto a V1" }).waitFor();
  ok((await pagina.locator("#grupos-resultados .grupo__error").innerText()).includes("Los dos GND ponen en corto a V1"),
    "un segundo GND que deja la batería en corto: «Los dos GND ponen en corto a V1»");
  await contexto.close();
}

// --- Etiquetas: no tapan lámparas ni baterías acostadas ---------------------------------------
for (const id of ["serie-contra-paralelo", "distintas-potencias", "linterna", "tp4"]) {
  const { contexto, pagina } = await abrir(await link(id), {}, { etiquetas: "todo" }); // con todos los números a la vista
  const choques = await pagina.evaluate(() => {
    const etiquetas = [...document.querySelectorAll("#editor text.tension")].map((t) => t.getBoundingClientRect());
    const cuerpos = [...document.querySelectorAll("#editor .comp--lamp .contorno, #editor .comp--voltage_source .contorno, #editor .comp--switch .contorno")]
      .map((e) => e.getBoundingClientRect());
    return etiquetas.filter((t) => cuerpos.some((c) => t.left < c.right && c.left < t.right && t.top < c.bottom && c.top < t.bottom)).length;
  });
  ok(choques === 0, `${id}: ninguna etiqueta de tensión tapa una lámpara, batería o interruptor`);
  if (id === "serie-contra-paralelo") await pagina.screenshot({ path: `${SALIDA}/d6-etiquetas.png` });
  await contexto.close();
}

// --- Movimiento reducido ------------------------------------------------------------------------
{
  const { contexto, pagina } = await abrir(await link("linterna"), { reducedMotion: "reduce" });
  await pagina.click("#boton-menu-vista");
  ok(await pagina.locator("#aviso-movimiento").isVisible(), "con movimiento reducido, el menú explica por qué los puntos están quietos");
  await contexto.close();
}

// --- Celular: botones grandes y hoja inferior ------------------------------------------------------
{
  const { contexto, pagina } = await abrir(await link("tp4"), { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const bajos = await pagina.locator(".barra--editor .boton:visible, .encabezado .boton:visible").evaluateAll((bs) =>
    bs.filter((b) => b.getBoundingClientRect().height < 39.5).length);
  ok(bajos === 0, "en el celular todos los botones miden al menos 40 px de alto");
  const panel = pagina.locator("#panel");
  ok(await panel.getAttribute("data-altura") === "plegada" && (await panel.boundingBox()).height < 140, "el panel es una hoja inferior plegada");
  await pagina.click("#pestana-ecuaciones");
  ok(await panel.getAttribute("data-altura") === "media", "elegir una pestaña la abre a media altura");
  await pagina.locator("#panel-asa").tap();
  await pagina.waitForTimeout(400);
  ok(await panel.getAttribute("data-altura") === "completa", "tocar el asa la agranda");
  await pagina.screenshot({ path: `${SALIDA}/d7-hoja-inferior.png` });
  await pagina.locator("#panel-asa").tap();
  ok(await panel.getAttribute("data-altura") === "plegada", "y otra vez la pliega");
  await pagina.waitForTimeout(400); // que termine de plegarse antes de medir el asa
  const cdp = await contexto.newCDPSession(pagina);
  const asa = await pagina.locator("#panel-asa").boundingBox();
  const toque = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === null ? [] : [{ x: asa.x + asa.width / 2, y, id: 0 }] });
  await toque("touchStart", asa.y + 5);
  for (let i = 1; i <= 8; i++) await toque("touchMove", asa.y + 5 - i * 45);
  await toque("touchEnd", null);
  await pagina.waitForTimeout(400);
  ok(await panel.getAttribute("data-altura") !== "plegada", `arrastrar el asa hacia arriba la desliza (${await panel.getAttribute("data-altura")})`);
  await contexto.close();
}

// --- Bloque F: código de colores, zigzag, etiquetas, bornes sueltos, sin TP4 y el bug de soltar --
{
  const { contexto, pagina } = await abrir(await link("divisor"));
  // Código de colores: 1 kΩ = marrón-negro-rojo-dorado.
  const bandas = await pagina.locator('#editor [data-id="R1"] .res-banda').evaluateAll((rs) =>
    rs.map((r) => [...r.classList].find((c) => c.startsWith("banda--")).slice(7)));
  ok(JSON.stringify(bandas) === JSON.stringify(["marron", "negro", "rojo", "dorado"]), `R1 (1 kΩ): bandas ${bandas.join("-")}`);
  const r1 = await pagina.locator('#editor [data-id="R1"] line.comp__seleccion').boundingBox();
  await pagina.mouse.click(r1.x + r1.width / 2, r1.y + r1.height / 2);
  ok((await pagina.locator("#ficha").innerText()).includes("marrón-negro-rojo = 10 × 100 = 1 kΩ"), "la ficha de R1 lee el código de colores");
  await pagina.screenshot({ path: `${SALIDA}/f1-ficha-codigo.png` });
  await pagina.keyboard.press("Escape");

  // Zigzag por defecto en la vista esquemática, rectángulo IEC como opción.
  await pagina.keyboard.press("v");
  ok(await pagina.locator("#editor .comp--resistor .esq-zigzag").count() === 2 && await pagina.locator("#editor .comp--resistor .esq-cuerpo").count() === 0,
    "vista esquemática: resistencias en zigzag por defecto");
  await pagina.click("#boton-menu-vista");
  await pagina.click('#control-simbolo [data-simbolo="iec"]');
  ok(await pagina.locator("#editor .comp--resistor .esq-cuerpo").count() === 2, "el menú Vista cambia al rectángulo IEC");
  await pagina.click('#control-simbolo [data-simbolo="zigzag"]');
  await pagina.keyboard.press("Escape");
  await pagina.keyboard.press("v");

  // Soltar una resistencia sobre un cable corto: no queda suelta encima (explica por qué).
  const boton = await pagina.locator('[data-herramienta="resistor"]').boundingBox();
  const soltarEn = async (gx, gy) => {
    const destino = await enPantalla(pagina, gx, gy);
    await pagina.mouse.move(boton.x + boton.width / 2, boton.y + boton.height / 2);
    await pagina.mouse.down();
    await pagina.mouse.move(destino.x, destino.y - 30, { steps: 6 });
    await pagina.mouse.move(destino.x, destino.y, { steps: 3 });
    await pagina.mouse.up();
  };
  await soltarEn(6, 5); // cable de 6_6 a 6_4, mide 2
  await pagina.locator("#aviso", { hasText: "No entra" }).waitFor();
  ok(await pagina.locator('#editor [data-id="R3"]').count() === 0, "soltar sobre un cable corto: no se coloca y avisa «No entra en ese cable»");
  await soltarEn(12, 10); // cable largo de abajo
  await pagina.locator('#editor [data-id="R3"]').waitFor({ state: "attached" });
  await pagina.locator("#estado-simulacion[data-fase='ok']").waitFor();
  ok(!(await pagina.locator("#estado-simulacion").innerText()).includes("sin conectar")
    && !(await pagina.locator("#estado-simulacion").innerText()).includes("circuitos"),
  "soltar sobre un cable largo la inserta en serie (sin «Circuito 2» ni bornes sueltos)");

  // Sin TP4 entre los ejemplos.
  await pagina.click("#pestana-circuitos");
  await pagina.click("#accion-ejemplos");
  ok(await pagina.locator(".tarjeta-ejemplo", { hasText: "TP4" }).count() === 0, "el ejemplo del TP4 ya no está en la galería");
  await pagina.keyboard.press("Escape");
  await contexto.close();
}
{
  // Etiquetas: Valores por defecto en el Wheatstone; al pasar el mouse se ven los números de esa pieza.
  const { contexto, pagina } = await abrir(await link("wheatstone"));
  const visibles = (sel) => pagina.locator(sel).evaluateAll((es) => es.filter((e) => e.getBoundingClientRect().width > 0).length);
  ok(await visibles("#editor text.tension .valor-nodo") === 0 && await visibles("#editor .nombre-nodo") >= 3
    && await visibles("#editor .texto-corriente") === 0
    && await visibles("#editor .punta") > 0 && await visibles("#editor .comp__textos .etiqueta") >= 6,
  "Etiquetas «Valores» por defecto: nombres de piezas y nodos y valores, flechas sin número");
  await pagina.screenshot({ path: `${SALIDA}/f2-wheatstone-valores.png` });
  const r1 = await pagina.locator('#editor [data-id="R1"] line.comp__seleccion').boundingBox();
  await pagina.mouse.move(r1.x + r1.width / 2, r1.y + r1.height / 2);
  await pagina.locator('#editor [data-de="R1"].con-foco').waitFor({ state: "attached" });
  ok(await visibles('#editor [data-de="R1"] .texto-corriente') === 1 && await visibles("#editor text.tension .valor-nodo") >= 1,
    "al pasar el mouse por R1 se ven su corriente y las tensiones de sus nodos");
  await pagina.screenshot({ path: `${SALIDA}/f3-wheatstone-foco.png` });
  await pagina.mouse.move(5, 5);
  await pagina.click("#boton-menu-vista");
  await pagina.click('#control-etiquetas [data-etiquetas="todo"]');
  ok(await visibles("#editor text.tension .valor-nodo") >= 3 && await visibles("#editor .texto-corriente") >= 5, "«Todo» muestra todos los números (para proyectar)");
  await pagina.click('#control-etiquetas [data-etiquetas="nada"]');
  ok(await visibles("#editor .comp__textos .etiqueta") === 0, "«Nada» deja solo el dibujo");
  await pagina.click('#control-etiquetas [data-etiquetas="valores"]');
  await pagina.keyboard.press("Escape");
  await contexto.close();
}
{
  // Bornes sueltos: un símbolo chico y el texto solo en el cartel.
  const divisor = EJEMPLOS.find((e) => e.id === "divisor").estado;
  const estado = { ...divisor, components: [...divisor.components, { id: "R9", type: "resistor", a: { x: 26, y: 8 }, b: { x: 30, y: 8 }, value: "470" }] };
  const { contexto, pagina } = await abrir(`${URL_BASE}#c=${await codificar(estado, "Con una suelta")}`);
  ok(await pagina.locator("#editor .borne-suelto").count() === 2 && await pagina.locator("#editor text", { hasText: "sin conectar" }).count() === 0,
    "bornes sueltos: dos círculos punteados, sin texto en el dibujo");
  const borne = await enPantalla(pagina, 30, 8);
  await pagina.mouse.move(borne.x, borne.y);
  await pagina.locator("#info-flotante", { hasText: "Sin conectar" }).waitFor();
  ok(true, "al pasar el mouse por un borne suelto, el cartel dice «Sin conectar»");
  await pagina.screenshot({ path: `${SALIDA}/f4-borne-suelto.png` });
  await contexto.close();
}

ok(errores.length === 0, `sin errores en consola ni violaciones de CSP ${JSON.stringify(errores)}`);
await navegador.close();
console.log(process.exitCode ? "Hay comprobaciones que fallaron." : "Todas las comprobaciones pasaron.");
