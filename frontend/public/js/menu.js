// Menú contextual del circuito (clic derecho, o mantener presionado con el dedo): rotar, editar
// valor, duplicar y borrar lo seleccionado. Se maneja con el teclado (flechas, Enter, Esc).
const $ = (id) => document.getElementById(id);

/**
 * @param {Record<string, () => void>} acciones  una función por data-accion de los botones
 */
export function crearMenu(acciones) {
  const menu = $("menu-contextual");
  const botones = () => [...menu.querySelectorAll("button:not(:disabled)")];
  let foco = null;

  function cerrar({ devolverFoco = true } = {}) {
    if (menu.hidden) return false;
    menu.hidden = true;
    if (devolverFoco) foco?.focus?.();
    return true;
  }

  /** Abre el menú en (x, y) de la pantalla. `habilitadas`: data-accion → boolean. */
  function abrir(x, y, habilitadas) {
    for (const b of menu.querySelectorAll("button")) b.disabled = habilitadas[b.dataset.accion] === false;
    foco = document.activeElement;
    menu.hidden = false;
    // Que no se salga de la pantalla.
    const ancho = menu.offsetWidth;
    const alto = menu.offsetHeight;
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - ancho - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - alto - 4))}px`;
    botones()[0]?.focus();
  }

  menu.addEventListener("click", (evento) => {
    const boton = evento.target.closest("button");
    if (!boton || boton.disabled) return;
    cerrar({ devolverFoco: false });
    acciones[boton.dataset.accion]?.();
  });
  menu.addEventListener("keydown", (evento) => {
    const lista = botones();
    const i = lista.indexOf(document.activeElement);
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      const paso = evento.key === "ArrowDown" ? 1 : -1;
      lista[(i + paso + lista.length) % lista.length]?.focus();
    } else if (evento.key === "Escape" || evento.key === "Tab") {
      evento.preventDefault();
      evento.stopPropagation();
      cerrar();
    }
  });
  // Un toque o clic fuera, la rueda o cambiar el tamaño lo cierran.
  document.addEventListener("pointerdown", (evento) => {
    if (!menu.hidden && !menu.contains(evento.target)) cerrar({ devolverFoco: false });
  }, true);
  addEventListener("resize", () => cerrar({ devolverFoco: false }));
  addEventListener("wheel", () => cerrar({ devolverFoco: false }), { passive: true });

  return { abrir, cerrar, abierto: () => !menu.hidden };
}
