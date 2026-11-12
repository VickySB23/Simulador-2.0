// Script clásico (no módulo) cargado en <head>: aplica el tema y el modo proyector guardados
// antes de pintar. Sin valor guardado, el tema sigue al sistema operativo (prefers-color-scheme).
(function () {
  try {
    var tema = localStorage.getItem("tema");
    if (tema === "light" || tema === "dark") document.documentElement.dataset.theme = tema;
    if (localStorage.getItem("proyector") === "1") document.documentElement.dataset.proyector = "1";
  } catch (e) {
    // Sin almacenamiento (modo privado): quedan los valores por defecto.
  }
})();
