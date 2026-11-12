// Script clásico (no módulo) cargado en <head>: aplica el tema guardado antes de pintar.
// Sin valor guardado se sigue al sistema operativo (prefers-color-scheme).
(function () {
  try {
    var tema = localStorage.getItem("tema");
    if (tema === "light" || tema === "dark") document.documentElement.dataset.theme = tema;
  } catch (e) {
    // Sin almacenamiento (modo privado): queda el tema del sistema.
  }
})();
