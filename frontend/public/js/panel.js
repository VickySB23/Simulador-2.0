// Panel de resultados: en escritorio se agranda o achica arrastrando su borde (o con las flechas)
// y se puede ocultar; en pantallas chicas es una hoja inferior que se desliza con el asa, con tres
// alturas (plegada, media y completa). El ancho, el estado y la altura quedan en localStorage.
const $ = (id) => document.getElementById(id);
const ANCHO_MINIMO = 260;
const ANCHO_MAXIMO = 680;
const CHICA = matchMedia("(max-width: 960px)");
/** Alturas de la hoja inferior, en fracción de la ventana. */
const ALTURAS = { plegada: 0, media: 0.5, completa: 0.88 };

function leer(clave, porDefecto) {
  try {
    return localStorage.getItem(clave) ?? porDefecto;
  } catch {
    return porDefecto;
  }
}
function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento: dura hasta recargar.
  }
}

/**
 * @param {{alCambiar: () => void}} opciones  alCambiar: el lienzo cambió de tamaño (para reajustar)
 */
export function crearPanel({ alCambiar }) {
  const raiz = document.documentElement;
  const panel = $("panel");
  const borde = $("panel-borde");
  const asa = $("panel-asa");
  let altura = leer("panel-altura", "plegada");
  if (!(altura in ALTURAS)) altura = "plegada";

  function aplicarAncho(ancho) {
    const limite = Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, Math.round(ancho)));
    raiz.style.setProperty("--ancho-panel-usuario", `${limite}px`);
    borde.setAttribute("aria-valuenow", String(limite));
    return limite;
  }

  function aplicarOculto(oculto) {
    raiz.classList.toggle("panel-oculto", oculto);
    $("boton-mostrar-panel").hidden = !oculto;
    guardar("panel-oculto", oculto ? "1" : "0");
    alCambiar();
  }

  /** Altura de la hoja inferior: la cabecera con las pestañas siempre queda a la vista. */
  function aplicarAltura(nombre) {
    altura = nombre;
    panel.dataset.altura = nombre;
    asa.setAttribute("aria-expanded", String(nombre !== "plegada"));
    raiz.style.removeProperty("--alto-hoja");
    guardar("panel-altura", nombre);
  }

  const ancho = Number(leer("ancho-panel", "0"));
  if (ancho) aplicarAncho(ancho);
  borde.setAttribute("aria-valuemin", String(ANCHO_MINIMO));
  borde.setAttribute("aria-valuemax", String(ANCHO_MAXIMO));
  if (leer("panel-oculto", "0") === "1") aplicarOculto(true);
  aplicarAltura(altura);

  // --- Borde: arrastrar o flechas para cambiar el ancho (escritorio) ---
  borde.addEventListener("pointerdown", (evento) => {
    if (evento.button !== 0) return;
    borde.setPointerCapture(evento.pointerId);
    raiz.classList.add("cambiando-ancho");
    const mover = (e) => aplicarAncho(innerWidth - e.clientX);
    const soltar = (e) => {
      borde.removeEventListener("pointermove", mover);
      borde.removeEventListener("pointerup", soltar);
      borde.removeEventListener("pointercancel", soltar);
      raiz.classList.remove("cambiando-ancho");
      guardar("ancho-panel", String(aplicarAncho(innerWidth - e.clientX)));
      alCambiar();
    };
    borde.addEventListener("pointermove", mover);
    borde.addEventListener("pointerup", soltar);
    borde.addEventListener("pointercancel", soltar);
    evento.preventDefault();
  });
  borde.addEventListener("keydown", (evento) => {
    const paso = evento.shiftKey ? 80 : 20;
    const actual = panel.getBoundingClientRect().width;
    if (evento.key === "ArrowLeft") guardar("ancho-panel", String(aplicarAncho(actual + paso)));
    else if (evento.key === "ArrowRight") guardar("ancho-panel", String(aplicarAncho(actual - paso)));
    else return;
    evento.preventDefault();
    alCambiar();
  });

  $("boton-ocultar-panel").addEventListener("click", () => aplicarOculto(true));
  $("boton-mostrar-panel").addEventListener("click", () => aplicarOculto(false));

  // --- Asa de la hoja inferior: tocar cambia de altura; arrastrar la desliza y queda en la más cercana ---
  asa.addEventListener("pointerdown", (evento) => {
    if (!CHICA.matches || evento.button !== 0) return;
    asa.setPointerCapture(evento.pointerId);
    const y0 = evento.clientY;
    const alto0 = panel.getBoundingClientRect().height;
    let movio = false;
    const mover = (e) => {
      if (Math.abs(e.clientY - y0) > 6) movio = true;
      if (movio) raiz.style.setProperty("--alto-hoja", `${Math.max(0, alto0 + (y0 - e.clientY))}px`);
    };
    const soltar = (e) => {
      asa.removeEventListener("pointermove", mover);
      asa.removeEventListener("pointerup", soltar);
      asa.removeEventListener("pointercancel", soltar);
      if (!movio) {
        aplicarAltura(altura === "plegada" ? "media" : altura === "media" ? "completa" : "plegada");
        return;
      }
      // Queda en la altura más cercana a donde se soltó.
      const fraccion = (alto0 + (y0 - e.clientY)) / innerHeight;
      const [cercana] = Object.entries(ALTURAS).sort((u, v) => Math.abs(u[1] - fraccion) - Math.abs(v[1] - fraccion));
      aplicarAltura(cercana[0]);
    };
    asa.addEventListener("pointermove", mover);
    asa.addEventListener("pointerup", soltar);
    asa.addEventListener("pointercancel", soltar);
    evento.preventDefault();
  });

  return {
    /** Con la hoja plegada, elegir una pestaña la abre a media altura. */
    alElegirPestana() {
      if (CHICA.matches && altura === "plegada") aplicarAltura("media");
    },
    mostrar() {
      if (raiz.classList.contains("panel-oculto")) aplicarOculto(false);
    },
  };
}
