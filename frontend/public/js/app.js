// Controlador del editor: estado, historial, simulación local y persistencia en el navegador.
import { Animador } from "./animador.js";
import { crearEditor } from "./editor.js";
import { colocarIconos, icono } from "./iconos.js";
import { crearGaleriaEjemplos } from "./galeria-ejemplos.js";
import { crearMenu } from "./menu.js";
import { crearPanel } from "./panel.js";
import { descargar, nombreDeArchivo, pngDelCircuito, svgDelCircuito } from "./exportar.js";
import { Almacen, aArchivo, desdeArchivo } from "./lib/almacen.js";
import { PREFIJO_HASH, codificar, decodificar } from "./lib/compartir.js";
import { EJEMPLOS } from "./lib/ejemplos.js";
import { Historial } from "./lib/historial.js";
import {
  TIPOS, aLayout, agregarCableEnL, agregarPieza, alternarInterruptor, buscar, cambiarPotencia, cambiarValor,
  circuitoVacio, desdeLayout, estirarCable, insertarEnCable, ponerTierra, restaurar, rotar, tieneValor,
} from "./lib/modelo.js";
import { conTierrasAutomaticas, recordarTierrasBorradas, simularHoja } from "./lib/netlist.js";
import {
  SELECCION_VACIA, copiarSeleccion, eliminarSeleccion, moverSeleccion, pegar, rotarSeleccion, seleccionVacia,
} from "./lib/seleccion.js";
import { interpretarValor, normalizarTexto } from "./lib/valores.js";
import { pedirTexto, pedirValores, renderEcuaciones, renderResultados } from "./paneles.js";
import { crearTutorial } from "./tutorial.js";

const $ = (id) => document.getElementById(id);
const HERRAMIENTAS = ["seleccionar", "wire", "resistor", "voltage_source", "current_source", "lamp", "switch", "ground"];
const PIEZAS = new Set(["resistor", "voltage_source", "current_source", "lamp", "switch"]);
/** Atajos de una letra para las herramientas (también en los tooltips de la barra). */
const ATAJOS = {
  c: "wire", r: "resistor", b: "voltage_source", i: "current_source", l: "lamp", s: "switch", g: "ground",
};

function leerPreferencia(clave, porDefecto) {
  try {
    return localStorage.getItem(clave) ?? porDefecto;
  } catch {
    return porDefecto;
  }
}
const CLAVE_BORRADOR = "simulador-dc:borrador";

const historial = new Historial();
const almacen = new Almacen();

const ctl = {
  estado: structuredClone(EJEMPLOS[0].estado),
  /** {ids}: lo seleccionado (ver lib/seleccion.js); las tierras son componentes G1, G2… */
  seleccion: SELECCION_VACIA,
  herramienta: "seleccionar",
  rotacion: 0,
  /** Resultados de todos los circuitos que dieron, combinados (para el dibujo). */
  resultado: null,
  /** Errores por circuito: [{numero, code, message, details}]. */
  errores: [],
  /** Cada circuito de la hoja con su resultado o su error (lib/netlist.js simularHoja). */
  circuitos: [],
  vacio: null,
  /** Circuito resaltado al tocar su grupo en Resultados o Ecuaciones. */
  circuitoResaltado: null,
  /** En el celular: tocar suma o saca piezas y un dedo sobre el fondo dibuja el rectángulo. */
  modoVarios: false,
  /** Puntos de los bornes al aire, que el editor marca "sin conectar". */
  bornesSueltos: [],
  sinConectar: new Set(),
  actual: { id: null, name: EJEMPLOS[0].nombre },
  sucio: false,
  vista: leerPreferencia("vista", "ilustrada") === "esquematica" ? "esquematica" : "ilustrada",
  interruptorRecienCambiado: null,
  _antesDelArrastre: null,

  // --- Acciones que dispara el editor -------------------------------------------------
  /** Coloca una pieza y vuelve a Seleccionar (con Shift apretado se sigue con la misma herramienta). */
  colocarPieza(tipo, centro, { mantener = false } = {}) {
    const { estado, id } = agregarPieza(ctl.estado, tipo, centro, ctl.rotacion);
    if (!id) return;
    if (!mantener) elegirHerramienta("seleccionar");
    // Sobre un cable, la pieza queda en serie: el cable se corta en sus bornes.
    aplicar(insertarEnCable(estado, id));
  },
  /** Cable de a hasta b, doblado en L si no están alineados. */
  agregarCable(a, b, horizontalPrimero = true) {
    aplicar(agregarCableEnL(ctl.estado, a, b, horizontalPrimero).estado);
  },
  estirarCable(id, extremo, punto) {
    aplicar(estirarCable(ctl.estado, id, extremo, punto));
  },
  ponerTierra(punto) {
    if (ctl.herramienta === "ground") elegirHerramienta("seleccionar");
    aplicar(ponerTierra(ctl.estado, punto).estado);
  },
  /** Resalta un circuito en el dibujo (o lo deja de resaltar si ya estaba). */
  resaltarCircuito(numero) {
    ctl.circuitoResaltado = ctl.circuitoResaltado === numero ? null : numero;
    editor.render();
    renderResultados(ctl);
    if (!$("vista-ecuaciones").hidden) renderEcuaciones(ctl);
  },
  /** Menú contextual sobre lo seleccionado. */
  abrirMenu(x, y) {
    const unica = unicaSeleccionada();
    const tipo = unica ? buscar(ctl.estado, unica)?.type : null;
    actualizarBotones();
    menu.abrir(x, y, {
      rotar: !$("accion-rotar").disabled && ctl.seleccion.ids.length > 0,
      valor: Boolean(tipo && tieneValor(tipo)),
      duplicar: ctl.seleccion.ids.length > 0,
      borrar: !seleccionVacia(ctl.seleccion),
    });
  },
  seleccionar(seleccion) {
    ctl.seleccion = seleccion ?? SELECCION_VACIA;
    actualizarBotones();
    renderResultados(ctl);
  },
  empezarArrastre() {
    ctl._antesDelArrastre = ctl.estado;
  },
  /**
   * Mueve lo seleccionado sin simular ni redibujar (el editor lo desplaza con transform); al
   * soltar se simula una vez. Devuelve false si el movimiento sale del mundo.
   */
  arrastrar(dx, dy) {
    const antes = ctl._antesDelArrastre;
    if (!antes) return false;
    const nuevo = moverSeleccion(antes, ctl.seleccion, dx, dy);
    if (nuevo === antes && (dx !== 0 || dy !== 0)) return false;
    ctl.estado = nuevo;
    return true;
  },
  /** Devuelve true si el circuito cambió (y entonces ya se simuló y redibujó). */
  terminarArrastre() {
    const antes = ctl._antesDelArrastre;
    ctl._antesDelArrastre = null;
    if (antes && antes !== ctl.estado) {
      // Una sola pieza soltada sobre un cable queda en serie.
      const { ids } = ctl.seleccion;
      let estado = ids.length === 1 ? insertarEnCable(ctl.estado, ids[0]) : ctl.estado;
      // Una tierra que el usuario movió ya no es la automática.
      const movidas = new Set(ids);
      estado = { ...estado, components: estado.components.map((c) => (c.auto && movidas.has(c.id) ? { ...c, auto: false } : c)) };
      ctl.estado = normalizar(estado);
      historial.registrar(antes);
      circuitoCambiado();
      return true;
    }
    return false;
  },
  alternarInterruptor(id) {
    ctl.interruptorRecienCambiado = id;
    aplicar(alternarInterruptor(ctl.estado, id));
  },
  async editarValor(id) {
    const componente = buscar(ctl.estado, id);
    if (!componente || !tieneValor(componente.type)) return;
    if (componente.type === "lamp") return editarLampara(componente);
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

/** Valida un valor positivo con prefijos; devuelve el mensaje de error o null. */
function validarPositivo(t, que) {
  try {
    return interpretarValor(t) > 0 ? null : `${que} tiene que ser mayor que 0.`;
  } catch (e) {
    return e.message;
  }
}

async function editarLampara(lampara) {
  const valores = await pedirValores({
    titulo: `Lámpara ${lampara.id}`,
    ayuda: "Si la potencia que disipa supera la nominal, la lámpara se quema y abre el circuito.",
    campos: [
      { etiqueta: "Resistencia (Ω)", valor: lampara.value, validar: (t) => validarPositivo(t, "La resistencia") },
      { etiqueta: "Potencia nominal (W)", valor: lampara.potencia, validar: (t) => validarPositivo(t, "La potencia nominal") },
    ],
  });
  if (!valores) return;
  const [resistencia, potencia] = valores.map(normalizarTexto);
  aplicar(cambiarPotencia(cambiarValor(ctl.estado, lampara.id, resistencia), lampara.id, potencia));
}

const animador = new Animador();
const editor = crearEditor($("editor"), $("contenedor-editor"), ctl, animador, $("info-flotante"));
const panelLateral = crearPanel({ alCambiar: () => {} });
const galeria = crearGaleriaEjemplos({
  ejemplos: EJEMPLOS,
  vista: () => ctl.vista,
  alAbrir: (ejemplo) => {
    if (confirmarDescarte()) cargar(structuredClone(ejemplo.estado), { id: null, name: ejemplo.nombre });
  },
});
const menu = crearMenu({
  rotar: () => rotarAccion(),
  valor: () => { const unica = unicaSeleccionada(); if (unica) ctl.editarValor(unica); },
  duplicar: () => duplicar(),
  borrar: () => borrarSeleccion(),
});
const tutorial = crearTutorial({ lienzoVacio: () => nuevo() });

// --- Simulación (en el navegador, al instante) -----------------------------------------------

function simular() {
  const hoja = simularHoja(ctl.estado);
  ctl.resultado = hoja.resultado;
  ctl.errores = hoja.errores;
  ctl.circuitos = hoja.circuitos;
  ctl.vacio = hoja.vacio;
  ctl.sinConectar = hoja.sinConectar;
  ctl.bornesSueltos = hoja.bornesSueltos;
  if (ctl.circuitoResaltado && !hoja.circuitos.some((c) => c.numero === ctl.circuitoResaltado)) ctl.circuitoResaltado = null;
  mostrarEstado();
  editor.render();
  renderResultados(ctl);
  if (!$("vista-ecuaciones").hidden) renderEcuaciones(ctl);
  tutorial.actualizar({ estado: ctl.estado, resultado: ctl.resultado });
}

function mostrarEstado() {
  const caja = $("estado-simulacion");
  const varios = ctl.circuitos.length > 1;
  if (ctl.errores.length) {
    // Un error en un circuito no frena a los demás: se nombra el circuito y se avisa si los otros dan.
    caja.dataset.fase = "error";
    const sinPunto = (t) => t.replace(/\.$/, "");
    caja.textContent = ctl.errores.map((e) => sinPunto(varios ? `Circuito ${e.numero}: ${e.message}` : e.message)).join(" · ")
      + (ctl.resultado ? " · los demás circuitos dan resultados" : "");
  } else if (ctl.resultado) {
    const s = ctl.resultado.stats;
    caja.dataset.fase = "ok";
    const sueltos = ctl.sinConectar.size;
    caja.textContent = `Simulación OK · ${varios ? `${ctl.circuitos.length} circuitos · ` : ""}`
      + `${s.electrical_nodes} nodos · ${s.unknowns} incógnitas · ${s.total_ms.toFixed(1)} ms`
      + (sueltos ? ` · ${sueltos === 1 ? "1 componente sin conectar" : `${sueltos} componentes sin conectar`}` : "");
  } else {
    caja.dataset.fase = "vacio";
    caja.textContent = ctl.vacio ?? "";
  }
}

// --- Cambios del circuito ------------------------------------------------------------------

/** Aplica un estado nuevo guardando el anterior en el historial. */
function aplicar(nuevo) {
  if (nuevo === ctl.estado) return;
  // Si se borró una tierra automática, ese circuito queda sin tierra hasta que cambie.
  const siguiente = normalizar(recordarTierrasBorradas(ctl.estado, nuevo));
  historial.registrar(ctl.estado);
  ctl.estado = siguiente;
  circuitoCambiado();
}

/** Pone la tierra automática en los circuitos que no tienen (y avisa), saca las que sobran. */
function normalizar(estado) {
  const { estado: conTierras, colocadas } = conTierrasAutomaticas(estado);
  if (colocadas.length) avisarTierra(colocadas, conTierras);
  return conTierras;
}

function avisarTierra(colocadas, estado) {
  const varios = simularHoja(estado).circuitos.length > 1;
  const partes = colocadas.map((c) => `${c.fuente}${varios ? ` (circuito ${c.numero})` : ""}`);
  $("aviso-tierra-texto").textContent = `Se puso GND en el borne − de ${partes.join(", ")}. `
    + "Podés arrastrarla a cualquier nodo o borrarla.";
  $("aviso-tierra").hidden = false;
}

function circuitoCambiado({ sucio = true } = {}) {
  if (sucio) ctl.sucio = true;
  const { ids } = ctl.seleccion;
  const quedan = ids.filter((id) => buscar(ctl.estado, id));
  if (quedan.length !== ids.length) ctl.seleccion = { ids: quedan };
  simular();
  actualizarEncabezado();
  actualizarBotones();
  programarBorrador();
}

function cargar(estado, actual, { sucio = false } = {}) {
  historial.limpiar();
  $("aviso-tierra").hidden = true;
  ctl.estado = normalizar(estado);
  ctl.actual = actual;
  ctl.seleccion = SELECCION_VACIA;
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

/** Un solo componente seleccionado: su id, o null. */
function unicaSeleccionada() {
  const { ids } = ctl.seleccion;
  return ids.length === 1 ? ids[0] : null;
}

function rotarAccion() {
  const { ids } = ctl.seleccion;
  const unica = unicaSeleccionada();
  if (unica && PIEZAS.has(buscar(ctl.estado, unica)?.type)) {
    aplicar(rotar(ctl.estado, unica));
  } else if (ids.length > 1 || (ids.length === 1 && !unica)) {
    aplicar(rotarSeleccion(ctl.estado, ctl.seleccion));
  } else if (PIEZAS.has(ctl.herramienta)) {
    ctl.rotacion = (ctl.rotacion + 1) % 4;
    editor.render();
  }
}

function borrarSeleccion() {
  const sel = ctl.seleccion;
  if (seleccionVacia(sel)) return;
  ctl.seleccion = SELECCION_VACIA;
  aplicar(eliminarSeleccion(ctl.estado, sel));
}

// --- Portapapeles propio (Ctrl+C, Ctrl+V, Ctrl+D) ------------------------------------------------

let portapapeles = [];
let pegadas = 0;

function copiar() {
  const copia = copiarSeleccion(ctl.estado, ctl.seleccion);
  if (!copia.length) return;
  portapapeles = copia;
  pegadas = 0;
  avisar(copia.length === 1 ? "Copiado 1 componente." : `Copiados ${copia.length} componentes.`);
}

/** Pega lo copiado corrido 2 celdas por cada vez que se pegó, y lo deja seleccionado. */
function pegarCopiado(copiados = portapapeles, veces = pegadas + 1) {
  if (!copiados.length) return;
  const { estado, seleccion } = pegar(ctl.estado, copiados, { x: 2 * veces, y: 2 * veces });
  if (estado === ctl.estado) return;
  if (copiados === portapapeles) pegadas = veces;
  ctl.seleccion = seleccion;
  elegirHerramienta("seleccionar");
  aplicar(estado);
}

function duplicar() {
  pegarCopiado(copiarSeleccion(ctl.estado, ctl.seleccion), 1);
}

function seleccionarTodo() {
  ctl.seleccion = { ids: ctl.estado.components.map((c) => c.id) };
  elegirHerramienta("seleccionar");
  editor.render();
  renderResultados(ctl);
}

function elegirHerramienta(herramienta) {
  ctl.herramienta = herramienta;
  if (herramienta !== "seleccionar") ctl.seleccion = SELECCION_VACIA;
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
  const unica = unicaSeleccionada();
  const tipo = unica ? buscar(ctl.estado, unica)?.type : null;
  $("accion-rotar").disabled = !sel.ids.length && !PIEZAS.has(ctl.herramienta);
  $("accion-valor").disabled = !tieneValor(tipo) || tipo === "wire" || !tipo;
  $("accion-borrar").disabled = seleccionVacia(sel);
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
    mensajeCircuitos(`Guardado en este navegador: ${ctl.actual.name}.`, "mensaje--ok");
    renderLista();
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje--error");
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
    mensajeCircuitos(e.message, "mensaje--error");
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
    mensajeCircuitos(e.message, "mensaje--error");
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
    mensajeCircuitos(e.message, "mensaje--error");
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
    mensajeCircuitos(`Importado: ${name}. Guardalo para tenerlo en la lista.`, "mensaje--ok");
  } catch (e) {
    mensajeCircuitos(e.message, "mensaje--error");
  }
}

function boton(texto, alHacerClic, clase = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `boton boton--chico ${clase}`;
  b.textContent = texto;
  b.addEventListener("click", alHacerClic);
  return b;
}

function elemento(nombre, meta, acciones, actual = false) {
  const li = document.createElement("li");
  li.className = actual ? "elemento elemento--actual" : "elemento";
  const texto = document.createElement("div");
  texto.className = "elemento__texto";
  const n = document.createElement("div");
  n.className = "elemento__nombre";
  n.textContent = nombre;
  n.title = nombre;
  const m = document.createElement("div");
  m.className = "elemento__meta";
  m.textContent = meta;
  texto.append(n, m);
  const acc = document.createElement("div");
  acc.className = "acciones";
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
    mensajeCircuitos(e.message, "mensaje--error");
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
        boton("Borrar", () => borrar(item), "boton--peligro"),
      ],
      item.id === ctl.actual.id,
    )));
  }
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
  ctl.seleccion = SELECCION_VACIA;
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
  animador.releerTokens();
  editor.render();
}

function alternarProyector() {
  const activo = document.documentElement.dataset.proyector !== "1";
  if (activo) document.documentElement.dataset.proyector = "1";
  else delete document.documentElement.dataset.proyector;
  $("boton-proyector").setAttribute("aria-pressed", String(activo));
  guardarPreferencia("proyector", activo ? "1" : null);
  animador.releerTokens();
  editor.ajustar();
  editor.render();
}

// --- Vista y animaciones ------------------------------------------------------------------------

function pulsar(grupo, boton) {
  for (const b of grupo.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === boton));
}

function elegirVista(vista) {
  ctl.vista = vista;
  pulsar($("control-vista"), $("control-vista").querySelector(`[data-vista="${vista}"]`));
  guardarPreferencia("vista", vista);
  editor.render();
}

/** Muestra u oculta los puntos de corriente (con movimiento reducido se ven quietos). */
function elegirPuntos(mostrar) {
  pulsar($("control-puntos"), $("control-puntos").querySelector(`[data-puntos="${mostrar ? "si" : "no"}"]`));
  animador.mostrarPuntos(mostrar);
  guardarPreferencia("puntos", mostrar ? null : "no");
}

/** Si el sistema pide reducir el movimiento, se avisa por qué los puntos están quietos. */
function avisarMovimiento() {
  const reducido = animador.movimientoReducido;
  $("aviso-movimiento").hidden = !reducido;
  $("accion-pausa").title = reducido
    ? "Tu sistema pide reducir el movimiento: los puntos ya se muestran quietos"
    : "Pausar o reanudar las animaciones";
}

// --- Menús desplegables de la barra ----------------------------------------------------------------

function cerrarDesplegables(excepto = null) {
  for (const b of document.querySelectorAll(".desplegable > [aria-expanded]")) {
    if (b === excepto) continue;
    b.setAttribute("aria-expanded", "false");
    $(b.getAttribute("aria-controls")).hidden = true;
  }
}

for (const boton of document.querySelectorAll(".desplegable > [aria-expanded]")) {
  boton.addEventListener("click", () => {
    const abrir = boton.getAttribute("aria-expanded") !== "true";
    cerrarDesplegables(boton);
    boton.setAttribute("aria-expanded", String(abrir));
    const lista = $(boton.getAttribute("aria-controls"));
    lista.hidden = !abrir;
    if (!abrir) return;
    // Fijo en la pantalla (la barra se desplaza de costado en el celular y lo recortaría).
    const caja = boton.getBoundingClientRect();
    lista.style.top = `${caja.bottom + 6}px`;
    lista.style.left = `${Math.max(8, Math.min(caja.right - lista.offsetWidth, innerWidth - lista.offsetWidth - 8))}px`;
  });
}
// Un clic fuera o Esc los cierran; elegir una exportación también.
document.addEventListener("pointerdown", (evento) => {
  if (!evento.target.closest?.(".desplegable")) cerrarDesplegables();
});
addEventListener("resize", () => cerrarDesplegables());
$("menu-exportar").addEventListener("click", (evento) => {
  if (evento.target.closest("button")) cerrarDesplegables();
});

function elegirSentido(sentido) {
  pulsar($("control-sentido"), $("control-sentido").querySelector(`[data-sentido="${sentido}"]`));
  animador.sentidoElectrones(sentido === "electrones");
}

function alternarPausa() {
  const boton = $("accion-pausa");
  const pausadas = boton.getAttribute("aria-pressed") !== "true";
  boton.setAttribute("aria-pressed", String(pausadas));
  boton.querySelector("svg").replaceWith(icono(pausadas ? "reproducir" : "pausa"));
  boton.querySelector("span").textContent = pausadas ? "Reanudar" : "Pausa";
  animador.pausar(pausadas);
}

// --- Eventos ------------------------------------------------------------------------------------

let ignorarClic = false;
for (const b of document.querySelectorAll("[data-herramienta]")) {
  b.addEventListener("click", () => {
    if (ignorarClic) return;
    elegirHerramienta(b.dataset.herramienta);
  });
  const tipo = b.dataset.herramienta;
  if (PIEZAS.has(tipo) || tipo === "ground") arrastrableDesdeBarra(b, tipo);
}

/** Las piezas también se arrastran desde la barra hasta el circuito; un clic elige la herramienta. */
function arrastrableDesdeBarra(boton, tipo) {
  boton.addEventListener("pointerdown", (evento) => {
    if (evento.button !== 0) return;
    const inicio = { x: evento.clientX, y: evento.clientY };
    let arrastrando = false;
    boton.setPointerCapture(evento.pointerId);
    const mover = (e) => {
      if (!arrastrando && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 8) return;
      if (!arrastrando) {
        arrastrando = true;
        document.documentElement.classList.add("arrastrando-pieza");
      }
      editor.mostrarPieza(tipo, e.clientX, e.clientY);
    };
    const terminar = (e, soltar) => {
      boton.removeEventListener("pointermove", mover);
      boton.removeEventListener("pointerup", alSoltar);
      boton.removeEventListener("pointercancel", alCancelar);
      document.documentElement.classList.remove("arrastrando-pieza");
      if (!arrastrando) return;
      // El clic que sigue a un arrastre no tiene que elegir la herramienta.
      ignorarClic = true;
      setTimeout(() => { ignorarClic = false; }, 0);
      if (soltar) editor.soltarPieza(tipo, e.clientX, e.clientY);
      else editor.mostrarPieza(null, -1, -1);
    };
    const alSoltar = (e) => terminar(e, true);
    const alCancelar = (e) => terminar(e, false);
    boton.addEventListener("pointermove", mover);
    boton.addEventListener("pointerup", alSoltar);
    boton.addEventListener("pointercancel", alCancelar);
  });
}
$("accion-rotar").addEventListener("click", rotarAccion);
$("accion-valor").addEventListener("click", () => {
  const unica = unicaSeleccionada();
  if (unica) ctl.editarValor(unica);
});
$("accion-borrar").addEventListener("click", borrarSeleccion);
$("accion-deshacer").addEventListener("click", deshacer);
$("accion-rehacer").addEventListener("click", rehacer);
$("accion-png").addEventListener("click", exportarPng);
$("accion-svg").addEventListener("click", exportarSvg);
$("zoom-mas").addEventListener("click", () => editor.acercar());
$("zoom-menos").addEventListener("click", () => editor.alejar());
$("zoom-ajustar").addEventListener("click", () => editor.ajustarCircuito());
$("accion-ajustar").addEventListener("click", () => editor.ajustarCircuito());
$("accion-ejemplos").addEventListener("click", () => galeria.abrir());
$("control-puntos").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) elegirPuntos(b.dataset.puntos === "si");
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", avisarMovimiento);
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
$("control-vista").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) elegirVista(b.dataset.vista);
});
$("control-sentido").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) elegirSentido(b.dataset.sentido);
});
$("accion-pausa").addEventListener("click", alternarPausa);
$("aviso-tierra-cerrar").addEventListener("click", () => { $("aviso-tierra").hidden = true; });
$("accion-varios").addEventListener("click", () => {
  ctl.modoVarios = !ctl.modoVarios;
  $("accion-varios").setAttribute("aria-pressed", String(ctl.modoVarios));
  if (ctl.modoVarios) elegirHerramienta("seleccionar");
});
$("boton-proyector").addEventListener("click", alternarProyector);
$("boton-tema").addEventListener("click", () => aplicarTema((temaActual() + 1) % TEMAS.length));

for (const pestana of document.querySelectorAll(".pestana")) {
  pestana.addEventListener("click", () => {
    for (const otra of document.querySelectorAll(".pestana")) {
      const activa = otra === pestana;
      otra.setAttribute("aria-selected", String(activa));
      $(otra.getAttribute("aria-controls")).hidden = !activa;
    }
    if (pestana.id === "pestana-ecuaciones") renderEcuaciones(ctl);
    if (pestana.id === "pestana-circuitos") renderLista();
    panelLateral.alElegirPestana();
  });
}

document.addEventListener("keydown", (evento) => {
  if ($("dialogo").open || $("galeria-ejemplos").open || evento.target.closest?.("input, textarea, select")) return;
  const tecla = evento.key;
  const control = evento.ctrlKey || evento.metaKey;
  if (control && tecla.toLowerCase() === "z") {
    evento.preventDefault();
    if (evento.shiftKey) rehacer(); else deshacer();
  } else if (control && tecla.toLowerCase() === "y") {
    evento.preventDefault();
    rehacer();
  } else if (control && tecla.toLowerCase() === "c") {
    if (window.getSelection()?.toString()) return; // texto seleccionado: copia del navegador
    evento.preventDefault();
    copiar();
  } else if (control && tecla.toLowerCase() === "v") {
    evento.preventDefault();
    pegarCopiado();
  } else if (control && tecla.toLowerCase() === "d") {
    evento.preventDefault();
    duplicar();
  } else if (control && tecla.toLowerCase() === "a") {
    evento.preventDefault();
    seleccionarTodo();
  } else if (control || evento.altKey) {
    return;
  } else if (tecla === " ") {
    // También con foco en un botón de la barra: el espacio rota en lugar de volver a apretarlo.
    evento.preventDefault();
    rotarAccion();
  } else if (ATAJOS[tecla.toLowerCase()]) {
    elegirHerramienta(ATAJOS[tecla.toLowerCase()]);
  } else if (tecla === "Delete" || tecla === "Backspace") {
    evento.preventDefault();
    borrarSeleccion();
  } else if (tecla === "Escape") {
    // Esc deshace lo último en curso: un menú, el cable a medio dibujar, la herramienta elegida
    // (vuelve a Seleccionar) y por último la selección.
    if (document.querySelector('.desplegable > [aria-expanded="true"]')) return cerrarDesplegables();
    if (menu.cerrar() || editor.cancelarCable()) return;
    if (ctl.herramienta !== "seleccionar") {
      elegirHerramienta("seleccionar");
    } else if (!seleccionVacia(ctl.seleccion)) {
      ctl.seleccion = SELECCION_VACIA;
      editor.render();
      actualizarBotones();
      renderResultados(ctl);
    }
  } else if (tecla === "f" || tecla === "F") {
    editor.ajustarCircuito();
  } else if (tecla === "p" || tecla === "P") {
    alternarProyector();
  } else if (tecla === "v" || tecla === "V") {
    elegirVista(ctl.vista === "ilustrada" ? "esquematica" : "ilustrada");
  } else if (/^[1-8]$/.test(tecla)) {
    elegirHerramienta(HERRAMIENTAS[Number(tecla) - 1]);
  }
});

window.addEventListener("hashchange", () => {
  if (location.hash.startsWith(PREFIJO_HASH) && confirmarDescarte()) cargarDesdeHash();
});

// --- Arranque ------------------------------------------------------------------------------------

colocarIconos();
$("texto-tema").textContent = TEMAS[temaActual()].texto;
pulsar($("control-vista"), $("control-vista").querySelector(`[data-vista="${ctl.vista}"]`));
elegirPuntos(leerPreferencia("puntos", "si") !== "no");
avisarMovimiento();
$("boton-proyector").setAttribute("aria-pressed", String(document.documentElement.dataset.proyector === "1"));
editor.ajustar();
renderLista();
if (!(await cargarDesdeHash())) {
  // Sin link compartido: se retoma el último circuito abierto, o el primer ejemplo.
  const borrador = leerBorrador();
  if (borrador) cargar(borrador.estado, borrador.actual, { sucio: borrador.sucio });
  else circuitoCambiado({ sucio: false });
}
