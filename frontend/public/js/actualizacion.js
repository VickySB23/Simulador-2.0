// Registro del service worker y aviso "Hay una versión nueva — Actualizar".
// Es un módulo aparte de app.js a propósito: si una versión vieja de app.js fallara, el aviso
// para actualizar igual aparece.
import { VERSION } from "./version.js";

const MINUTOS_ENTRE_CHEQUEOS = 30;
let actualizando = false;

function avisoVersion(trabajador) {
  const aviso = document.getElementById("aviso-version");
  if (!aviso) return;
  aviso.hidden = false;
  document.getElementById("boton-actualizar").onclick = () => {
    actualizando = true;
    aviso.querySelector("button").disabled = true;
    trabajador.postMessage({ tipo: "ACTIVAR" });
  };
}

/** Pregunta su versión al service worker que espera. Null si no contesta. */
function versionDe(trabajador) {
  return new Promise((resolver) => {
    const canal = new MessageChannel();
    const tiempo = setTimeout(() => resolver(null), 3000);
    canal.port1.onmessage = (evento) => {
      clearTimeout(tiempo);
      resolver(evento.data?.version ?? null);
    };
    trabajador.postMessage({ tipo: "VERSION" }, [canal.port2]);
  });
}

async function revisarEsperando(registro) {
  const trabajador = registro.waiting;
  if (!trabajador || !navigator.serviceWorker.controller) return;
  // Si la página ya es de esa versión (se cargó de la red después de publicar), se activa sin avisar.
  if ((await versionDe(trabajador)) === VERSION) trabajador.postMessage({ tipo: "ACTIVAR" });
  else avisoVersion(trabajador);
}

function seguirInstalacion(registro) {
  const trabajador = registro.installing;
  if (!trabajador) return;
  trabajador.addEventListener("statechange", () => {
    if (trabajador.state === "installed") revisarEsperando(registro);
  });
}

async function iniciar() {
  if (!("serviceWorker" in navigator)) return;
  let registro;
  try {
    registro = await navigator.serviceWorker.register("./sw.js");
  } catch {
    return; // Sin service worker (por ejemplo, abierto como archivo local): funciona, pero online.
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (actualizando) location.reload();
  });
  registro.addEventListener("updatefound", () => seguirInstalacion(registro));
  seguirInstalacion(registro);
  revisarEsperando(registro);
  // Una pestaña abierta toda la clase también se entera de que se publicó una versión nueva.
  const revisar = () => registro.update().catch(() => {});
  setInterval(revisar, MINUTOS_ENTRE_CHEQUEOS * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revisar();
  });
}

const etiqueta = document.getElementById("version");
if (etiqueta) etiqueta.textContent = VERSION;
iniciar();
