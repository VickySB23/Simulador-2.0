# Pruebas de la página en el navegador

`verificar.mjs` maneja un Chrome real (headless) y recorre la página como lo haría un usuario
(38 comprobaciones):

- los trece ejemplos simulan; el TP4 da 30 V y la fuente entrega 12,5 A, el Wheatstone equilibrado no tiene
  corriente en el galvanómetro y las dos mallas dan 7,5 V;
- el panel de ecuaciones (KCL con valores, matriz MNA y solución);
- una pieza suelta se marca "sin conectar" sin frenar el resto;
- un segundo circuito recibe su tierra automática (con aviso que se cierra), se nombra en el dibujo
  y en Resultados; un lazo de fuentes en él se marca en rojo solo ahí mientras el TP4 sigue dando
  30 V, y tocar un grupo resalta su circuito; la tierra se arrastra a otro nodo;
- deshacer y rehacer (con la tierra) e ids que no se repiten;
- edición de valores con validación;
- **Compartir:** el link abierto en otro navegador reproduce el circuito exacto (componentes,
  posiciones, textos y tierra);
- guardar en el navegador, recargar, renombrar, borrar, exportar e importar `.json`;
- exportar PNG y SVG;
- **sin internet:** recarga y abre un link compartido sin red, desde el service worker;
- modo proyector (1280×720) y celular (390 px, sin scroll horizontal);
- sin errores de consola ni violaciones de la CSP.

No corre en la CI: necesita un Chrome instalado. Usa `playwright-core`, que no descarga navegadores.

```bash
node tests/e2e/servir.mjs               # en una terminal: http://localhost:8000/Simulador-2.0/
cd tests/e2e && npm install
node verificar.mjs capturas             # capturas en tests/e2e/capturas/ (ignorado por git)
```

Variables opcionales:

- `BASE_URL`: dónde está la página (por defecto `http://localhost:8000/Simulador-2.0/`). Sirve para
  probar la publicada: `BASE_URL=https://vickysb23.github.io/Simulador-2.0/ node verificar.mjs`.
- `CHROME_PATH`: ejecutable de Chrome o Edge, si no está en la ruta por defecto del sistema.

Imprime una línea `OK` o `MAL` por comprobación y termina con código 1 si alguna falla.

`actualizacion.mjs` comprueba el aviso de versión nueva: abre la página, espera a que la
controle el service worker y revisa cada 10 s si hay versión nueva (como hace la página cada 30
minutos o al volver a la pestaña). Mientras espera, publicá cualquier cambio (el workflow pone una versión nueva
con el hash del commit; en local, cambiá `simulador-dc-dev` en `sw.js` y `js/version.js`); el script tiene que ver
"Hay una versión nueva — Actualizar", tocarlo y terminar con la versión nueva activa.
`ESPERA_MINUTOS` fija cuánto espera (por defecto 15).

`editor.mjs` prueba el editor rediseñado: arma con las herramientas un circuito con batería,
interruptor y lámpara, abre y cierra el interruptor con un clic, quema la lámpara bajando su
potencia nominal, alterna la vista ilustrada/esquemática y el sentido de la corriente, arrastra
una pieza y mide cuadros por segundo con 50 componentes, animando y arrastrando, también con la
CPU 4× más lenta.

`interaccion.mjs` prueba lo de la etapa de interacción: colocar o arrastrar una pieza sobre un
cable la inserta en serie; selección con rectángulo y con Ctrl/Shift + clic, mover, rotar y borrar
en grupo; Ctrl+C, Ctrl+V y Ctrl+D; la ficha de una lámpara que casi no brilla y el tutorial
completo hecho con el mouse (saltear, cerrar y reabrir con "?").

`sin-modos.mjs` prueba la interacción sin cambiar de modo: los atajos de una letra (y que estén
en los tooltips), arrastrar una pieza desde la barra, volver solo a Seleccionar, cables desde un
borne doblados en L y siguiendo desde la punta, encadenar tramos con la herramienta Cable,
estirar un cable por su punta, el cartel con tensión y corriente, el menú con clic derecho
(también con el teclado), el zoom con la rueda, mover la vista arrastrando el fondo y, en un
celular emulado, la presión larga, el zoom con dos dedos y mover la vista con un dedo.

`estados.mjs` revisa la barra en claro, oscuro y proyector: el botón activo no se corre, queda
centrado en su grupo, sin doble borde (también "Reanudar"), y el foco con teclado se ve sin
salirse del grupo. Guarda capturas de cada estado.

`galeria.mjs` saca capturas de `galeria.html` (claro, oscuro, proyector y celular), comprueba que
los canvas de animación queden sobre su SVG, que las animaciones se pausen y respeten
`prefers-reduced-motion`, y mide cuadros por segundo con 50 componentes animados, también con la
CPU 4× más lenta (como un celular de gama media).

`servir.mjs` sirve `frontend/public/` en la raíz y en `/Simulador-2.0/`, como GitHub Pages, para
comprobar que todas las rutas sean relativas.
