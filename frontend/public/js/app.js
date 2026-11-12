// Controlador del editor: estado, historial, simulación local y persistencia en el navegador.
import { crearEditor } from "./editor.js";
import { descargar, nombreDeArchivo, pngDelCircuito, svgDelCircuito } from "./exportar.js";
import { Almacen, aArchivo, desdeArchivo } from "./lib/almacen.js";
import { PREFIJO_HASH, codificar, decodificar } from "./lib/compartir.js";
import { EJEMPLOS } from "./lib/ejemplos.js";
import { Historial } from "./lib/historial.js";
import {
  TIPOS, aLayout, agregarCable, agregarPieza, buscar, cambiarValor, circuitoVacio, desdeLayout,
  eliminar, mover, moverTierra, ponerTierra, quitarTierra, restaurar, rotar,
} from "./lib/modelo.js";
import { simularEstado } from "./lib/netlist.js";
import { interpretarValor, normalizarTexto } from "./lib/valores.js";
import { pedirTexto, renderEcuaciones, renderResultados } from "./paneles.js";

const $ = (id) => document.getElementById(id);
const HERRAMIENTAS = ["seleccionar", "wire", "resistor", "voltage_source", "current_source", "ground"];
const PIEZAS = new Set(["resistor", "voltage_source", "current_source"]);
const CLAVE_BORRADOR = "simulador-dc:borrador";

const historial = new Historial();
const almacen = new Almacen();

const ctl = {
  estado: structuredClone(EJEMPLOS[0].estado),
  seleccion: null,
  herramienta: "seleccionar",
  rotacion: 0,
  resultado: null,
  error: null,
  actual: { id: null, name: EJEMPLOS[0].nombre },
  sucio: false,
  _antesDelArrastre: null,

  // --- Acciones que dispara el editor -------------------------------------------------
  colocarPieza(tipo, centro) {
    const { estado, id } = agregarPieza(ctl.estado, tipo, centro, ctl.rotacion);
    if (id) aplicar(estado);
  },
  agregarCable(a, b) {
    aplicar(agregarCable(ctl.estado, a, b).estado);
  },
  ponerTierra(punto) {
    aplicar(ponerTierra(ctl.estado, punto));
  },
  seleccionar(seleccion) {
    ctl.seleccion = seleccion;
    actualizarBotones();
  },
  empezarArrastre() {
    ctl._antesDelArrastre = ctl.estado;
  },
  arrastrar(dx, dy) {
    const antes = ctl._antesDelArrastre;
    if (!antes) return;
    ctl.estado = ctl.seleccion?.tipo === "tierra"
      ? moverTierra(antes, dx, dy)
      : mover(antes, ctl.seleccion.id, dx, dy);
    // La simulación es local e instantánea: se ve el resultado mientras se arrastra.
    simular();
  },
  terminarArrastre() {
    const antes = ctl._antesDelArrastre;
    ctl._antesDelArrastre = null;
    if (antes && antes !== ctl.estado) {
      historial.registrar(antes);
      circuitoCambiado();
    }
  },
  async editarValor(id) {
    const componente = buscar(ctl.estado, id);
    if (!componente || componente.type === "wire") return;
    const { nombre, unidad } = TIPOS[componente.type];
    const texto = await pedirTexto({
      titulo: `Valor de ${id}`,
      etiqueta: `${nombre} (${unidad})`,
      valor: componente.value,
      ayuda: "Acepta prefijos: 10k, 4.7k, 1MEG, 5m, 2.2u.",
      validar: (t) => {
        try {
          const v = interpretarValor(t);
          if (componente.type === "resistor" && v <= 0) {
            return "La resistencia tiene que ser mayor que 0 Ω (para un corto usá un cable).";
          }
          return null;
        } catch (e) {
          return e.message;
        }
      },
    });
    if (texto !== null) aplicar(cambiarValor(ctl.estado, id, normalizarTexto(texto)));
  },
};

const editor = crearEditor($("editor"), $("contenedor-editor"), ctl);

// --- Simulación (en el navegador, al instante) -----------------------------------------------

function simular() {
  const { resultado, error } = simularEstado(ctl.estado);
  ctl.resultado = resultado ?? null;
  ctl.error = error ?? null;
  mostrarEstado();
  editor.render();
  renderResultados(ctl);
  if (!$("vista-ecuaciones").hidden) renderEcuaciones(ctl.estado);
}

function mostrarEstado() {
  const caja = $("estado-simulacion");
  if (ctl.resultado) {
    const s = ctl.resultado.stats;
    caja.dataset.fase = "ok";
    caja.textContent = `Simulación OK · ${s.electrical_nodes} nodos · ${s.unknowns} incógnitas · ${s.total_ms.toFixed(1)} ms`;
  } else {
    caja.dataset.fase = ctl.error?.code === "empty" ? "vacio" : "error";
    caja.textContent = ctl.error?.message ?? "";
  }
}

// --- Cambios del circuito ------------------------------------------------------------------

/** Aplica un estado nuevo guardando el anterior en el historial. */
function aplicar(nuevo) {
  if (nuevo === ctl.estado) return;
  historial.registrar(ctl.estado);
  ctl.estado = nuevo;
  circuitoCambiado();
}

function circuitoCambiado({ sucio = true } = {}) {
  if (sucio) ctl.sucio = true;
  if (ctl.seleccion?.tipo === "componente" && !buscar(ctl.estado, ctl.seleccion.id)) ctl.seleccion = null;
  if (ctl.seleccion?.tipo === "tierra" && !ctl.estado.ground) ctl.seleccion = null;
  simular();
  actualizarEncabezado();
  actualizarBotones();
  programarBorrador();
}

function cargar(estado, actual, { sucio = false } = {}) {
  historial.limpiar();
  ctl.estado = estado;
  ctl.actual = actual;
  ctl.seleccion = null;
  circuitoCambiado({ sucio });
  ctl.sucio = sucio;
  actualizarEncabezado();
  renderLista();
  guardarBorrador();
}

function deshacer() {
  const anterior = historial.deshacer(ctl.estado);
  if (anterior) {
    ctl.estado = restaurar(ctl.estado, anterior);
    circuitoCambiado();
  }
}

function rehacer() {
  const siguiente = historial.rehacer(ctl.estado);
  if (siguiente) {
    ctl.estado = restaurar(ctl.estado, siguiente);
    circuitoCambiado();
  }
}

function rotarAccion() {
  const sel = ctl.seleccion;
  if (sel?.tipo === "componente" && buscar(ctl.estado, sel.id)?.type !== "wire") {
    aplicar(rotar(ctl.estado, sel.id));
  } else if (PIEZAS.has(ctl.herramienta)) {
    ctl.rotacion = (ctl.rotacion + 1) % 4;
    editor.render();
  }
}

function borrarSeleccion() {
  const sel = ctl.seleccion;
  if (!sel) return;
  ctl.seleccion = null;
  aplicar(sel.tipo === "tierra" ? quitarTierra(ctl.estado) : eliminar(ctl.estado, sel.id));
}

function elegirHerramienta(herramienta) {
  ctl.herramienta = herramienta;
  if (herramienta !== "seleccionar") ctl.seleccion = null;
  for (const boton of document.querySelectorAll("[data-herramienta]")) {
    boton.setAttribute("aria-pressed", String(boton.dataset.herramienta === herramienta));
  }
  editor.cancelarCable();
  actualizarBotones();
}

// --- Interfaz --------------------------------------------------------------------------------

function actualizarEncabezado() {
  $("nombre-circuito").textContent = ctl.actual.name;
  $("marca-sucio").hidden = !ctl.sucio;
  document.title = `${ctl.actual.name} · Simulador DC`;
}

function actualizarBotones() {
  const sel = ctl.seleccion;
  const pieza = sel?.tipo === "componente" && PIEZAS.has(buscar(ctl.estado, sel.id)?.type);
  $("accion-rotar").disabled = !pieza && !PIEZAS.has(ctl.herramienta);
  $("accion-valor").disabled = !pieza;
  $("accion-borrar").disabled = !sel;
  $("accion-deshacer").disabled = !historial.puedeDeshacer;
  $("accion-rehacer").disabled = !historial.puedeRehacer;
  const vacio = ctl.estado.components.length === 0;
  $("accion-png").disabled = vacio;
  $("accion-svg").disabled = vacio;
}

let temporizadorAviso = null;

/** Mensaje flotante breve ("Link copiado"). */
function avisar(texto) {
  const aviso = $("aviso");
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 3000);
}

// --- Borrador: el circuito abierto sobrevive a recargar la página --------------------------

let temporizadorBorrador = null;

function guardarBorrador() {
  clearTimeout(temporizadorBorrador);
  temporizadorBorrador = null;
  try {
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
      layout: aLayout(ctl.estado), actual: ctl.actual, sucio: ctl.sucio,
    }));
  } catch {
    // Sin almacenamiento: el borrador no es imprescindible.
  }
}

/** Mientras se edita, el borrador se escribe con una pequeña demora para no hacerlo en cada tecla. */
function programarBorrador() {
  clearTimeout(temporizadorBorrador);
  temporizadorBorrador = setTimeout(guardarBorrador, 400);
}

// Al recargar o cerrar la pestaña se escribe lo pendiente: no se pierde el último cambio.
window.addEventListener("pagehide", () => {
  if (temporizadorBorrador !== null) guardarBorrador();
});

function leerBorrador() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? "null");
    if (!datos) return null;
    return { estado: desdeLayout(datos.layout), actual: datos.actual, sucio: Boolean(datos.sucio) };
  } catch {
    return null;
  }
}

// --- Circuitos guardados en el navegador ----------------------------------------------------

let temporizadorMensaje = null;

function mensajeCircuitos(texto, tipo = "") {
  const caja = $("mensaje-circuitos");
  caja.hidden = false;
  caja.className = `mensaje ${tipo}`;
  caja.textContent = texto;
  clearTimeout(temporizadorMensaje);
  temporizadorMensaje = setTimeout(() => { caja.hidden = true; }, 5000);
}

const validarNombre = (t) => (t ? (t.length > 120 ? "Máximo 120 caracteres." : null) : "Poné un nombre.");

function guardarEnAlmacen(id, name) {
  try {
    ctl.actual = almacen.guardar({ id, name, estado: ctl.estado });
    ctl.sucio = false;
    actualizarEncabezado();
    guardarBorrador();
    mensajeCircuitos(`Guardado en este navegador: ${ctl.actual.name}.`, "mensaje-ok");
    renderLista();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

async function guardar() {
  if (!ctl.actual.id || !existeGuardado(ctl.actual.id)) return guardarComo();
  guardarEnAlmacen(ctl.actual.id, ctl.actual.name);
}

async function guardarComo() {
  const nombre = await pedirTexto({
    titulo: "Guardar circuito", etiqueta: "Nombre", valor: ctl.actual.name, validar: validarNombre,
    ayuda: "Se guarda en este navegador. Para llevarlo a otra compu, usá Exportar .json o Compartir.",
  });
  if (nombre !== null) guardarEnAlmacen(null, nombre);
}

function existeGuardado(id) {
  try {
    return almacen.listar().some((c) => c.id === id);
  } catch {
    return false;
  }
}

function confirmarDescarte() {
  return !ctl.sucio || confirm("Hay cambios sin guardar. ¿Descartarlos?");
}

function abrir(id) {
  if (!confirmarDescarte()) return;
  try {
    const guardado = almacen.obtener(id);
    if (!guardado) throw new Error("Ese circuito ya no existe.");
    cargar(guardado.estado, { id: guardado.id, name: guardado.name });
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

async function renombrar(item) {
  const nombre = await pedirTexto({
    titulo: "Renombrar circuito", etiqueta: "Nombre", valor: item.name, validar: validarNombre,
  });
  if (nombre === null || nombre === item.name) return;
  try {
    almacen.renombrar(item.id, nombre);
    if (ctl.actual.id === item.id) {
      ctl.actual = { ...ctl.actual, name: nombre };
      actualizarEncabezado();
      guardarBorrador();
    }
    renderLista();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

function borrar(item) {
  if (!confirm(`¿Borrar "${item.name}"? No se puede deshacer.`)) return;
  try {
    almacen.borrar(item.id);
    if (ctl.actual.id === item.id) {
      ctl.actual = { id: null, name: ctl.actual.name };
      ctl.sucio = true;
      actualizarEncabezado();
    }
    mensajeCircuitos(`Borrado: ${item.name}.`);
    renderLista();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

function nuevo() {
  if (!confirmarDescarte()) return;
  cargar(circuitoVacio(), { id: null, name: "Sin título" });
}

function exportarJson() {
  const archivo = aArchivo(ctl.actual.name, ctl.estado);
  descargar(JSON.stringify(archivo, null, 2), `${nombreDeArchivo(ctl.actual.name)}.json`, "application/json");
}

async function importarJson(archivo) {
  try {
    const { name, estado } = desdeArchivo(await archivo.text());
    if (!confirmarDescarte()) return;
    cargar(estado, { id: null, name }, { sucio: true });
    mensajeCircuitos(`Importado: ${name}. Guardalo para tenerlo en la lista.`, "mensaje-ok");
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

function boton(texto, alHacerClic, clase = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `boton boton-chico ${clase}`;
  b.textContent = texto;
  b.addEventListener("click", alHacerClic);
  return b;
}

function elemento(nombre, meta, acciones, actual = false) {
  const li = document.createElement("li");
  li.className = actual ? "elemento actual" : "elemento";
  const texto = document.createElement("div");
  texto.className = "elemento-texto";
  const n = document.createElement("div");
  n.className = "elemento-nombre";
  n.textContent = nombre;
  n.title = nombre;
  const m = document.createElement("div");
  m.className = "elemento-meta";
  m.textContent = meta;
  texto.append(n, m);
  const acc = document.createElement("div");
  acc.className = "elemento-acciones";
  acc.append(...acciones);
  li.append(texto, acc);
  return li;
}

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

function renderLista() {
  const lista = $("lista-circuitos");
  let guardados = [];
  try {
    guardados = almacen.listar();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
  if (!guardados.length) {
    const li = document.createElement("li");
    li.className = "nota";
    li.textContent = "Todavía no guardaste circuitos en este navegador.";
    lista.replaceChildren(li);
  } else {
    lista.replaceChildren(...guardados.map((item) => elemento(
      item.name,
      `${item.component_count} componentes · ${FECHA.format(new Date(item.updated_at))}`,
      [
        boton("Abrir", () => abrir(item.id)),
        boton("Renombrar", () => renombrar(item)),
        boton("Borrar", () => borrar(item), "boton-peligro"),
      ],
      item.id === ctl.actual.id,
    )));
  }
  $("lista-ejemplos").replaceChildren(...EJEMPLOS.map((ejemplo) => elemento(
    ejemplo.nombre, ejemplo.descripcion,
    [boton("Abrir", () => {
      if (confirmarDescarte()) cargar(structuredClone(ejemplo.estado), { id: null, name: ejemplo.nombre });
    })],
  )));
}

// --- Compartir por link ----------------------------------------------------------------------

async function compartir() {
  const codigo = await codificar(ctl.estado, ctl.actual.name);
  const url = `${location.href.split("#")[0]}${PREFIJO_HASH}${codigo}`;
  try {
    await navigator.clipboard.writeText(url);
    avisar("Link copiado. Pegalo donde quieras: abre este mismo circuito.");
  } catch {
    // Sin permiso para el portapapeles: se muestra el link para copiarlo a mano.
    await pedirTexto({
      titulo: "Link para compartir", etiqueta: "Copiá este link", valor: url,
      ayuda: "Quien lo abra ve este mismo circuito, sin necesidad de cuenta.",
    });
  }
}

async function cargarDesdeHash() {
  if (!location.hash.startsWith(PREFIJO_HASH)) return false;
  try {
    const { nombre, estado } = await decodificar(location.hash);
    cargar(estado, { id: null, name: nombre });
    return true;
  } catch (e) {
    avisar(e.message);
    return false;
  }
}

// --- Exportar imagen -------------------------------------------------------------------------

function svgActual() {
  // Sin selección ni fantasma en la imagen.
  const seleccion = ctl.seleccion;
  ctl.seleccion = null;
  editor.render();
  const svg = svgDelCircuito($("editor"));
  ctl.seleccion = seleccion;
  editor.render();
  return svg;
}

function exportarSvg() {
  const svg = svgActual();
  if (svg) descargar(svg.texto, `${nombreDeArchivo(ctl.actual.name)}.svg`, "image/svg+xml");
}

async function exportarPng() {
  const svg = svgActual();
  if (!svg) return;
  try {
    descargar(await pngDelCircuito(svg), `${nombreDeArchivo(ctl.actual.name)}.png`);
  } catch (e) {
    avisar(e.message);
  }
}

// --- Tema y modo proyector -----------------------------------------------------------------

const TEMAS = [
  { valor: null, texto: "Auto" }, { valor: "light", texto: "Claro" }, { valor: "dark", texto: "Oscuro" },
];

function temaActual() {
  const t = document.documentElement.dataset.theme ?? null;
  return Math.max(0, TEMAS.findIndex((x) => x.valor === t));
}

function guardarPreferencia(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento: la preferencia dura hasta recargar.
  }
}

function aplicarTema(indice) {
  const { valor, texto } = TEMAS[indice];
  if (valor) document.documentElement.dataset.theme = valor;
  else delete document.documentElement.dataset.theme;
  $("texto-tema").textContent = texto;
  guardarPreferencia("tema", valor);
  editor.render();
}

function alternarProyector() {
  const activo = document.documentElement.dataset.proyector !== "1";
  if (activo) document.documentElement.dataset.proyector = "1";
  else delete document.documentElement.dataset.proyector;
  $("boton-proyector").setAttribute("aria-pressed", String(activo));
  guardarPreferencia("proyector", activo ? "1" : null);
  editor.ajustar();
  editor.render();
}

// --- Eventos ------------------------------------------------------------------------------------

for (const b of document.querySelectorAll("[data-herramienta]")) {
  b.addEventListener("click", () => elegirHerramienta(b.dataset.herramienta));
}
$("accion-rotar").addEventListener("click", rotarAccion);
$("accion-valor").addEventListener("click", () => {
  if (ctl.seleccion?.tipo === "componente") ctl.editarValor(ctl.seleccion.id);
});
$("accion-borrar").addEventListener("click", borrarSeleccion);
$("accion-deshacer").addEventListener("click", deshacer);
$("accion-rehacer").addEventListener("click", rehacer);
$("accion-png").addEventListener("click", exportarPng);
$("accion-svg").addEventListener("click", exportarSvg);
$("zoom-mas").addEventListener("click", () => editor.acercar());
$("zoom-menos").addEventListener("click", () => editor.alejar());
$("zoom-ajustar").addEventListener("click", () => editor.ajustar());
$("accion-guardar").addEventListener("click", guardar);
$("accion-guardar-como").addEventListener("click", guardarComo);
$("accion-nuevo").addEventListener("click", nuevo);
$("accion-exportar").addEventListener("click", exportarJson);
$("accion-importar").addEventListener("click", () => $("entrada-archivo").click());
$("entrada-archivo").addEventListener("change", (evento) => {
  const [archivo] = evento.target.files;
  if (archivo) importarJson(archivo);
  evento.target.value = "";
});
$("boton-compartir").addEventListener("click", compartir);
$("boton-proyector").addEventListener("click", alternarProyector);
$("boton-tema").addEventListener("click", () => aplicarTema((temaActual() + 1) % TEMAS.length));

for (const pestana of document.querySelectorAll(".pestana")) {
  pestana.addEventListener("click", () => {
    for (const otra of document.querySelectorAll(".pestana")) {
      const activa = otra === pestana;
      otra.setAttribute("aria-selected", String(activa));
      $(otra.getAttribute("aria-controls")).hidden = !activa;
    }
    if (pestana.id === "pestana-ecuaciones") renderEcuaciones(ctl.estado);
    if (pestana.id === "pestana-circuitos") renderLista();
  });
}

document.addEventListener("keydown", (evento) => {
  if ($("dialogo").open || evento.target.closest?.("input, textarea, select")) return;
  const tecla = evento.key;
  const control = evento.ctrlKey || evento.metaKey;
  if (control && tecla.toLowerCase() === "z") {
    evento.preventDefault();
    if (evento.shiftKey) rehacer(); else deshacer();
  } else if (control && tecla.toLowerCase() === "y") {
    evento.preventDefault();
    rehacer();
  } else if (control || evento.altKey) {
    return;
  } else if (tecla === "r" || tecla === "R" || tecla === " ") {
    // También con foco en un botón de la barra: el espacio rota en lugar de volver a apretarlo.
    evento.preventDefault();
    rotarAccion();
  } else if (tecla === "Delete" || tecla === "Backspace") {
    evento.preventDefault();
    borrarSeleccion();
  } else if (tecla === "Escape") {
    if (!editor.cancelarCable() && ctl.seleccion) {
      ctl.seleccion = null;
      editor.render();
      actualizarBotones();
    }
  } else if (tecla === "p" || tecla === "P") {
    alternarProyector();
  } else if (/^[1-6]$/.test(tecla)) {
    elegirHerramienta(HERRAMIENTAS[Number(tecla) - 1]);
  }
});

window.addEventListener("hashchange", () => {
  if (location.hash.startsWith(PREFIJO_HASH) && confirmarDescarte()) cargarDesdeHash();
});

// Funciona sin internet una vez cargado: el service worker guarda todos los archivos.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Sin service worker (por ejemplo, abierto como archivo local): funciona igual, pero online.
  });
}

// --- Arranque ------------------------------------------------------------------------------------

$("texto-tema").textContent = TEMAS[temaActual()].texto;
$("boton-proyector").setAttribute("aria-pressed", String(document.documentElement.dataset.proyector === "1"));
editor.ajustar();
renderLista();
if (!(await cargarDesdeHash())) {
  // Sin link compartido: se retoma el último circuito abierto, o el primer ejemplo.
  const borrador = leerBorrador();
  if (borrador) cargar(borrador.estado, borrador.actual, { sucio: borrador.sucio });
  else circuitoCambiado({ sucio: false });
}
