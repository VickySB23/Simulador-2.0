// Versión de la página. Tiene que coincidir con VERSION de sw.js (lo verifica tests/sw.test.js).
// En el repo vale "simulador-dc-dev": el workflow de publicación la reemplaza en los dos archivos
// por "simulador-dc-<hash del commit>", así cada publicación instala un service worker nuevo y la
// página muestra "Hay una versión nueva — Actualizar".
export const VERSION = "simulador-dc-dev";
