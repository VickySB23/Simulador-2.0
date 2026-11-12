// Controlador del editor: estado, historial, simulación en vivo y persistencia.
import { api } from "./api.js";
import { crearEditor } from "./editor.js";
import { EJEMPLOS } from "./lib/ejemplos.js";
import { Historial } from "./lib/historial.js";
import {
  TIPOS, aLayout, agregarCable, agregarPieza, buscar, cambiarValor, circuitoVacio, desdeLayout,
  eliminar, mover, moverTierra, ponerTierra, quitarTierra, restaurar, rotar,
} from "./lib/modelo.js";
import { armarNetlist, problemaLocal } from "./lib/netlist.js";
import { SimulacionEnVivo } from "./lib/simulacion.js";
import { interpretarValor, normalizarTexto } from "./lib/valores.js";
import { pedirTexto, renderResultados } from "./paneles.js";

const $ = (id) => document.getElementById(id);
const HERRAMIENTAS = ["seleccionar", "wire", "resistor", "voltage_source", "current_source", "ground"];
const PIEZAS = new Set(["resistor", "voltage_source", "current_source"]);

const historial = new Historial();

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
    editor.render();
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

const simulacion = new SimulacionEnVivo({
  alCambiar(cambio) {
    if (cambio.fase === "ok") {
      ctl.resultado = cambio.resultado;
      ctl.error = null;
    } else if (cambio.fase === "error") {
      ctl.resultado = null;
      ctl.error = cambio.error;
    }
    mostrarEstado(cambio);
    if (cambio.fase === "ok" || cambio.fase === "error") {
      editor.render();
      renderResultados(ctl);
    }
  },
});

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
  editor.render();
  actualizarEncabezado();
  actualizarBotones();
  programarSimulacion();
}

function programarSimulacion() {
  const problema = problemaLocal(ctl.estado);
  if (problema) {
    simulacion.cancelar();
    ctl.resultado = null;
    ctl.error = { ...problema, details: {} };
    mostrarEstado({ fase: problema.code === "empty" ? "vacio" : "error", error: ctl.error });
    editor.render();
    renderResultados(ctl);
    return;
  }
  simulacion.pedir(armarNetlist(ctl.estado));
}

function cargar(estado, actual) {
  simulacion.cancelar();
  historial.limpiar();
  ctl.estado = estado;
  ctl.actual = actual;
  ctl.seleccion = null;
  ctl.resultado = null;
  ctl.error = null;
  circuitoCambiado({ sucio: false });
  ctl.sucio = false;
  actualizarEncabezado();
  renderLista();
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

function mostrarEstado({ fase, error, reintentoEn }) {
  const caja = $("estado-simulacion");
  caja.dataset.fase = fase;
  if (fase === "esperando" || fase === "simulando") {
    caja.textContent = "Simulando…";
  } else if (fase === "ok") {
    const s = ctl.resultado.stats;
    caja.textContent = `Simulación OK · ${s.unknowns} incógnitas · ${s.total_ms} ms`;
  } else if (fase === "saturado") {
    caja.textContent = `${error.message} Reintento en ${reintentoEn} s…`;
  } else {
    caja.textContent = error?.message ?? "";
  }
}

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
}

// --- Persistencia ---------------------------------------------------------------------------

let guardados = [];
let temporizadorMensaje = null;

function mensajeCircuitos(texto, tipo = "") {
  const caja = $("mensaje-circuitos");
  caja.hidden = false;
  caja.className = `mensaje ${tipo}`;
  caja.textContent = texto;
  clearTimeout(temporizadorMensaje);
  temporizadorMensaje = setTimeout(() => { caja.hidden = true; }, 5000);
}

function cuerpoGuardado(name) {
  return {
    name,
    description: "",
    circuit: armarNetlist(ctl.estado),
    layout: aLayout(ctl.estado),
    tags: [],
  };
}

const validarNombre = (t) => (t ? (t.length > 120 ? "Máximo 120 caracteres." : null) : "Poné un nombre.");

async function guardar() {
  if (!ctl.actual.id) return guardarComo();
  try {
    const guardado = await api.actualizar(ctl.actual.id, cuerpoGuardado(ctl.actual.name));
    ctl.sucio = false;
    actualizarEncabezado();
    mensajeCircuitos(`Guardado: ${guardado.name}.`, "mensaje-ok");
    await refrescarLista();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

async function guardarComo() {
  const nombre = await pedirTexto({
    titulo: "Guardar circuito", etiqueta: "Nombre", valor: ctl.actual.name, validar: validarNombre,
  });
  if (nombre === null) return;
  try {
    const creado = await api.crear(cuerpoGuardado(nombre));
    ctl.actual = { id: creado.id, name: creado.name };
    ctl.sucio = false;
    actualizarEncabezado();
    mensajeCircuitos(`Guardado: ${creado.name}.`, "mensaje-ok");
    await refrescarLista();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

function confirmarDescarte() {
  return !ctl.sucio || confirm("Hay cambios sin guardar. ¿Descartarlos?");
}

async function abrir(id) {
  if (!confirmarDescarte()) return;
  try {
    const circuito = await api.obtener(id);
    cargar(desdeLayout(circuito.layout), { id: circuito.id, name: circuito.name });
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
    // PUT reemplaza el circuito completo: se parte del guardado, no del que está en el editor.
    const actual = await api.obtener(item.id);
    await api.actualizar(item.id, {
      name: nombre, description: actual.description, circuit: actual.circuit,
      layout: actual.layout, tags: actual.tags,
    });
    if (ctl.actual.id === item.id) {
      ctl.actual.name = nombre;
      actualizarEncabezado();
    }
    await refrescarLista();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

async function borrar(item) {
  if (!confirm(`¿Borrar "${item.name}"? No se puede deshacer.`)) return;
  try {
    await api.borrar(item.id);
    if (ctl.actual.id === item.id) {
      ctl.actual = { id: null, name: ctl.actual.name };
      ctl.sucio = true;
      actualizarEncabezado();
    }
    mensajeCircuitos(`Borrado: ${item.name}.`);
    await refrescarLista();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje-error");
  }
}

function nuevo() {
  if (!confirmarDescarte()) return;
  cargar(circuitoVacio(), { id: null, name: "Sin título" });
}

async function refrescarLista() {
  try {
    guardados = await api.listar();
  } catch (e) {
    guardados = [];
    mensajeCircuitos(`No se pudo leer la lista: ${e.message}`, "mensaje-error");
  }
  renderLista();
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
  const textoDiv = document.createElement("div");
  textoDiv.className = "elemento-texto";
  const n = document.createElement("div");
  n.className = "elemento-nombre";
  n.textContent = nombre;
  n.title = nombre;
  const m = document.createElement("div");
  m.className = "elemento-meta";
  m.textContent = meta;
  textoDiv.append(n, m);
  const accionesDiv = document.createElement("div");
  accionesDiv.className = "elemento-acciones";
  accionesDiv.append(...acciones);
  li.append(textoDiv, accionesDiv);
  return li;
}

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

function renderLista() {
  const lista = $("lista-circuitos");
  if (!guardados.length) {
    const li = document.createElement("li");
    li.className = "nota";
    li.textContent = "Todavía no hay circuitos guardados.";
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

// --- Tema -------------------------------------------------------------------------------------

const TEMAS = [
  { valor: null, texto: "Auto" }, { valor: "light", texto: "Claro" }, { valor: "dark", texto: "Oscuro" },
];

function temaActual() {
  const t = document.documentElement.dataset.theme ?? null;
  return Math.max(0, TEMAS.findIndex((x) => x.valor === t));
}

function aplicarTema(indice) {
  const { valor, texto } = TEMAS[indice];
  if (valor) document.documentElement.dataset.theme = valor;
  else delete document.documentElement.dataset.theme;
  $("texto-tema").textContent = texto;
  try {
    if (valor) localStorage.setItem("tema", valor);
    else localStorage.removeItem("tema");
  } catch {
    // Sin almacenamiento: el tema dura hasta recargar.
  }
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
$("zoom-mas").addEventListener("click", () => editor.acercar());
$("zoom-menos").addEventListener("click", () => editor.alejar());
$("zoom-ajustar").addEventListener("click", () => editor.ajustar());
$("accion-guardar").addEventListener("click", guardar);
$("accion-guardar-como").addEventListener("click", guardarComo);
$("accion-nuevo").addEventListener("click", nuevo);
$("accion-refrescar").addEventListener("click", refrescarLista);
$("boton-tema").addEventListener("click", () => aplicarTema((temaActual() + 1) % TEMAS.length));

for (const pestana of document.querySelectorAll(".pestana")) {
  pestana.addEventListener("click", () => {
    for (const otra of document.querySelectorAll(".pestana")) {
      const activa = otra === pestana;
      otra.setAttribute("aria-selected", String(activa));
      $(otra.getAttribute("aria-controls")).hidden = !activa;
    }
    if (pestana.id === "pestana-circuitos") refrescarLista();
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
  } else if (/^[1-6]$/.test(tecla)) {
    elegirHerramienta(HERRAMIENTAS[Number(tecla) - 1]);
  }
});

window.addEventListener("beforeunload", (evento) => {
  if (ctl.sucio) evento.preventDefault();
});

// --- Arranque ------------------------------------------------------------------------------------

$("texto-tema").textContent = TEMAS[temaActual()].texto;
editor.ajustar();
renderLista();
circuitoCambiado({ sucio: false });
