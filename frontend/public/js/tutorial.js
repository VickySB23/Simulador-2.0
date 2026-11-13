// Tutorial opcional: una pestaña chica al costado del lienzo que se despliega en una tarjeta con el
// paso actual. Cada paso espera a que el usuario lo haga (lib/tutorial.js decide cuándo); se puede
// saltear, plegar o cerrar, y el botón "?" del encabezado lo vuelve a abrir. El progreso queda en
// localStorage. Sobre un circuito ya armado no se adelanta solo: arranca a contar desde el lienzo
// vacío (o desde que se saltea el primer paso), y cerrado no avanza.
import { PASOS, avanzar, terminado } from "./lib/tutorial.js";

const CLAVE = "simulador-dc:tutorial";
const $ = (id) => document.getElementById(id);

function leer() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    if (datos && Number.isInteger(datos.paso) && ["plegado", "abierto", "cerrado"].includes(datos.modo)) {
      return { paso: datos.paso, modo: datos.modo, empezado: Boolean(datos.empezado) };
    }
  } catch {
    // Sin almacenamiento: empieza plegado.
  }
  return { paso: 0, modo: "plegado", empezado: false };
}

/**
 * @param {{lienzoVacio: () => void}} acciones  lienzoVacio: abre un circuito nuevo (pide confirmar)
 */
export function crearTutorial({ lienzoVacio }) {
  let { paso, modo, empezado } = leer();
  let contexto = null;
  let logro = null;

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ paso, modo, empezado }));
    } catch {
      // Sin almacenamiento: el progreso dura hasta recargar.
    }
  }

  function render() {
    const caja = $("tutorial");
    caja.hidden = modo === "cerrado";
    caja.dataset.modo = modo;
    $("tutorial-cuerpo").hidden = modo !== "abierto";
    $("tutorial-pestana").hidden = modo === "abierto";
    $("tutorial-pestana").setAttribute("aria-expanded", String(modo === "abierto"));
    $("boton-ayuda").setAttribute("aria-pressed", String(modo === "abierto"));
    const fin = terminado(paso);
    $("tutorial-progreso").textContent = fin ? "Tutorial completo" : `Paso ${paso + 1} de ${PASOS.length}`;
    $("tutorial-titulo").textContent = fin ? "¡Terminaste!" : PASOS[paso].titulo;
    $("tutorial-texto").textContent = fin
      ? "Ya sabés armar, encender, cortar y quemar una lámpara. En Circuitos hay ejemplos con lámparas para seguir probando."
      : PASOS[paso].texto;
    const cajaLogro = $("tutorial-logro");
    cajaLogro.hidden = !logro;
    cajaLogro.textContent = logro ? `✓ ${logro}` : "";
    $("tutorial-puntos").replaceChildren(...PASOS.map((p, i) => {
      const li = document.createElement("li");
      li.className = i < paso ? "hecho" : i === paso ? "actual" : "";
      li.title = p.titulo;
      return li;
    }));
    $("tutorial-saltear").hidden = fin;
    $("tutorial-reiniciar").hidden = !fin;
    const vacio = !contexto || contexto.estado.components.length === 0;
    $("tutorial-vacio").hidden = fin || paso > 1 || vacio;
  }

  /** Si corresponde avanzar solo: empezado (lienzo vacío o primer paso salteado) y no cerrado. */
  const puedeAvanzar = () => contexto && empezado && modo !== "cerrado" && !terminado(paso);

  function irA(nuevo, { auto = false } = {}) {
    const antes = paso;
    paso = nuevo;
    if (paso > 0) empezado = true;
    // Lo que ya estaba hecho no se espera: se avanza solo y se felicita por el último paso cumplido.
    if (puedeAvanzar()) paso = avanzar(paso, contexto);
    if (auto && paso > antes) logro = PASOS[paso - 1].titulo;
    else if (!auto) logro = paso > nuevo ? PASOS[paso - 1].titulo : null;
    guardar();
    render();
  }

  function cambiarModo(nuevo) {
    modo = nuevo;
    // Al reabrirlo, lo hecho mientras estaba cerrado cuenta (si ya había empezado).
    if (puedeAvanzar() && avanzar(paso, contexto) > paso) return irA(paso, { auto: true });
    guardar();
    render();
  }

  $("tutorial-pestana").addEventListener("click", () => cambiarModo("abierto"));
  $("tutorial-plegar").addEventListener("click", () => cambiarModo("plegado"));
  $("tutorial-cerrar").addEventListener("click", () => cambiarModo("cerrado"));
  $("tutorial-saltear").addEventListener("click", () => irA(paso + 1));
  $("tutorial-reiniciar").addEventListener("click", () => {
    empezado = Boolean(contexto && contexto.estado.components.length === 0);
    irA(0);
  });
  $("tutorial-vacio").addEventListener("click", lienzoVacio);
  $("boton-ayuda").addEventListener("click", () => cambiarModo(modo === "abierto" ? "plegado" : "abierto"));
  render();

  return {
    /** Después de cada simulación: si el paso actual quedó hecho, pasa al siguiente. */
    actualizar(nuevoContexto) {
      contexto = nuevoContexto;
      if (contexto.estado.components.length === 0 && !empezado) {
        empezado = true;
        guardar();
      }
      if (puedeAvanzar() && avanzar(paso, contexto) > paso) irA(paso, { auto: true });
      else render();
    },
  };
}
