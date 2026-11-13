# Simulador DC: versión web estática (rama `web`)

Contexto para Claude Code. Simulador de circuitos de corriente continua que corre entero en el
navegador y se publica en GitHub Pages (<https://vickysb23.github.io/Simulador-2.0/>). Es para uso
personal de la autora y para que su profesor lo use en clase: el README está escrito para él.

Autora: Victoria Sanchez Bujaldon. Idioma del código, comentarios y documentación: español rioplatense.

## Ramas

- `main`: la app de escritorio Tkinter original (Simulador-2.0).
- `microservicios`: la versión con FastAPI, MongoDB, Consul y Traefik. **No se toca.**
- `carga-wip` (también en GitHub): pruebas de carga sin terminar sobre `microservicios` (experimentos
  01–04 y el arreglo de `OPENBLAS_NUM_THREADS=1`), abandonadas por el cambio a la versión web.
- `web`: esta versión. Sin backend: se quitaron `services/`, el compose, Traefik y nginx.

## Estructura

```text
frontend/public/          lo que se publica (HTML + CSS + JS vanilla con módulos ES, sin build)
  js/lib/                 lógica sin DOM, con tests: mna, modelo, netlist, historial, valores,
                          ejemplos, almacen (localStorage + .json), compartir (hash), ecuaciones,
                          seleccion (grupo: mover, rotar, borrar, copiar, pegar), ficha, tutorial
  js/app.js, editor.js, paneles.js, exportar.js, tema.js     interfaz (css/editor.css)
  js/tutorial.js          pestaña del tutorial (progreso en localStorage; botón "?" del encabezado)
  js/menu.js              menú contextual (rotar, editar valor, duplicar, borrar)
  js/panel.js             panel: ancho arrastrando el borde, ocultar, hoja inferior en pantallas chicas
  js/galeria-ejemplos.js  diálogo con una tarjeta (y miniatura) por ejemplo
  sw.js                   service worker: caché con versión, red primero (4 s) y caché sin conexión
  js/version.js, js/actualizacion.js   versión de la página y aviso "Hay una versión nueva — Actualizar"
  css/tokens.css          sistema de diseño (único lugar con valores literales): claro, oscuro, proyector
  css/ui.css, circuito.css, galeria.css   interfaz nueva y dibujo del circuito, solo con tokens (test)
  fonts/                  Nunito (OFL), subconjunto latino, sin CDN
  galeria.html, js/galeria.js   galería del sistema de diseño (aprobada; el editor usa el mismo diseño)
  js/dibujo.js            componentes en vista ilustrada y esquemática (IEC); describe lo animado
  js/animador.js          animaciones en un canvas sobre el SVG (puntos, halo, calor, pulso)
  js/iconos.js            íconos propios; js/lib/animacion.js: velocidad, brillo, calor y color (tests)
  js/lib/corrientes.js    corriente de cada cable e interruptor cerrado por KCL (lazos: por largo)
frontend/tests/           node --test (sin dependencias)
tests/e2e/                verificar.mjs (Chrome real con playwright-core) y servir.mjs
tests/comparacion/        motor JS contra POST /simulate de la rama microservicios
.github/workflows/pages.yml   tests + publicación de frontend/public en GitHub Pages
```

## Decisiones del motor (`js/lib/mna.js`, no revertir)

Port de `services/simulation-service/app/domain` de la rama `microservicios`, con los mismos
códigos de error (`invalid_component`, `no_ground`, `floating_nodes` con `details.nodes`,
`voltage_source_loop`, `shorted_voltage_source`, `singular_circuit`, `invalid_circuit`) y los
mismos mensajes. Corrigen bugs confirmados de Simulador-2.0:

1. **Cables ideales con union-find**, no resistencias de 1e-9 Ω.
2. **Sin GMIN**: se revisa la topología antes de resolver (antes un nodo alimentado solo por una
   fuente de corriente daba 1 GV).
3. **Detección de lazos de fuentes de tensión** (antes dos fuentes en paralelo daban resultados vacíos).
4. **R ≤ 0 es un error** (antes R = 0 se convertía en 1e-9 Ω).
5. Densa hasta `DENSE_LIMIT = 200` incógnitas, dispersa (LU con pivoteo parcial sobre filas
   dispersas) por encima.
6. Convención pasiva: potencia positiva = absorbe.
7. Componentes solo de la versión web: `lamp` (resistencia + `rated_power`; el resultado agrega
   `brightness` = P/Pnom y `burned`) y `switch` (`closed`: cerrado = cable, abierto = fuera del
   circuito). **Una lámpara con P > Pnom se quema y abre el circuito**: se quema primero la más
   sobrecargada y se vuelve a resolver (cascada); las quemadas van en `stats.burned_lamps`. Una
   parte que queda sin camino a tierra por un interruptor abierto o una lámpara quemada se resuelve
   con una referencia propia: corrientes y tensiones entre bornes válidas, tensión de nodo `null`
   (con una fuente de corriente adentro sigue siendo error). Sin lámparas ni interruptores todo
   sigue igual que el backend (la comparación de 500 circuitos da idéntico).

`parseValue` es el `parse_value` del backend (M y MEG = mega, m = mili); `valores.js` agrega la
coma decimal. Si se cambia el motor, correr `tests/comparacion/comparar.mjs` contra el stack de
`microservicios` (última corrida: 500 circuitos, 0 discrepancias de error, 5,5e-10 de diferencia
relativa a la escala).

## Interacción (no revertir)

- **Bornes sueltos:** `analizarConexiones` (netlist.js) saca de la simulación, en cascada, los
  componentes con un borne al aire (punto con una sola conexión; la tierra cuenta como una). Se
  simula el resto; los sacados vuelven con corriente 0 y `unconnected: true`, y el editor marca
  "sin conectar" solo los bornes que estaban al aire. Un lazo cerrado sin tierra sigue siendo
  `floating_nodes` (en rojo). Ecuaciones usa el mismo estado activo.
- **Insertar en un cable:** al colocar una pieza, o al soltar una sola arrastrada, con el centro
  sobre un cable, `insertarEnCable` la alinea y corta el cable en sus bornes.
- **Selección:** `ctl.seleccion = {ids}` (lib/seleccion.js); operaciones todo o nada.
- **Tierras:** son componentes `type: "ground"` de un solo punto (a = b, ids G1, G2…; contador G).
  `armarNetlist` usa la primera como referencia y une las demás con cables ideales (`~G2`). Los
  layouts y links viejos con `ground` se convierten en G1. `conTierrasAutomaticas` (netlist.js) pone
  una `auto` en el borne − de la batería de cada circuito sin tierra y saca las automáticas
  sueltas; `recordarTierrasBorradas` guarda en `estado.sinTierraAuto` la firma del circuito cuya
  automática se borró (no vuelve hasta que la firma cambia). app.js lo aplica en `aplicar`,
  `terminarArrastre` y `cargar` (`normalizar`).
- **Varios circuitos:** `simularHoja` parte la hoja en circuitos (`circuitosDe`: lo que se toca por
  bornes o cables, numerados de izquierda a derecha) y simula cada uno con `simularEstado`. Un
  error queda en su circuito (`ctl.errores` con `numero`); `ctl.resultado` combina los que dieron.
  Sin fuente ni tierra un circuito es "incompleto", no un error. Los paneles clonan
  `<template id="plantilla-resultados">` / `plantilla-ecuaciones` por circuito (clases, no ids).
- **Sin modos (editor.js, un gesto por vez en `gesto`):** con Seleccionar, apretar cerca de un
  borne o punta (9 px con mouse, 16 con el dedo) y arrastrar dibuja un cable (`agregarCableEnL`,
  dobla según el primer movimiento y parte el cable sobre el que termina); sobre una pieza la
  mueve; sobre el fondo mueve la vista (scroll del contenedor); Shift/Ctrl + fondo es el
  rectángulo. Las puntas de un cable seleccionado (`.asa`) lo estiran (`estirarCable`). Colocar
  una pieza o la tierra vuelve a Seleccionar (Shift la mantiene). La herramienta Cable encadena
  tramos por clics hasta Esc. R es la herramienta Resistencia: girar es con espacio.
- **Zoom:** rueda y dos dedos alrededor del punto (`zoomEn`); en escritorio `body` mide 100vh
  y en el celular el lienzo 60vh, para que se desplace el lienzo y no la página.
- **Menú contextual** (`js/menu.js`): clic derecho, o presión larga de 550 ms con el dedo (no se
  usa `contextmenu` con el dedo porque iOS no lo dispara).
- **Tutorial:** no se adelanta solo sobre un circuito ya armado: empieza a contar desde el lienzo
  vacío o desde que se saltea el primer paso.
- **Lámpara en su potencia nominal:** no se quema (tolerancia relativa 1e-9 en `mna.js`).
- **Escala compacta:** tokens.css tiene la escala de antes al 80 % (letra base 12,5 px, controles
  de 30 px); el bloque proyector repite los valores grandes y con `pointer: coarse` los controles
  miden 40 px. Sin `zoom` ni `transform`.
- **Barra en tres grupos** (Componentes, Edición, Vista); edición solo con íconos (aria-label).
  Vista, sentido, puntos y PNG/SVG van en menús `.desplegable` con `position: fixed` (la barra se
  desplaza de costado en el celular y los recortaría). F o Ajustar: `editor.ajustarCircuito()`
  (no se ajusta solo al abrir: las pruebas hacen clic en puntos fijos de la grilla).
- **Etiquetas de tensión:** `lugarDeEtiqueta` (editor.js) prueba seis lugares alrededor del nodo y
  usa el primero que no tapa una pieza (`cajaDePieza`) ni otra etiqueta.
- **Dos GND en los bornes de una batería:** `explicarError` (netlist.js) cambia el
  `shorted_voltage_source` por "Los dos GND ponen en corto a V1".
- **Barra:** el botón activo no usa transform y dentro de `.barra__grupo` no tiene borde propio
  (lo verifica `tests/e2e/estados.mjs` en claro, oscuro y proyector).

## Interfaz: bugs de Simulador-2.0 que no deben volver

Rehacer con dos pilas que guardan el estado actual; el historial incluye la tierra; el símbolo GND
se dibuja donde está la tierra; resaltado de selección por clase CSS; ids que no se repiten (los
contadores solo crecen, también al deshacer); la fuente de corriente muestra su sentido y el "+ −"
queda derecho en fuentes verticales. El doble clic se detecta a mano en `pointerdown` porque cada
render reemplaza los elementos del SVG.

## Restricciones

- **CSP estricta** en un `<meta>` de `index.html` (GitHub Pages no permite headers): nada de
  scripts ni estilos en línea, ni `eval`. Colores dinámicos con `element.style.x = ...` (CSSOM) o
  atributos de presentación SVG. Las pruebas de navegador usan locators, no `waitForFunction`.
- **Rutas relativas** en todo: Pages publica en `/Simulador-2.0/`.
- **Archivo nuevo en `public/`** → agregarlo a `ARCHIVOS` en `sw.js` (lo verifica un test).
- **Versión:** en el repo, `VERSION` vale `simulador-dc-dev` en `sw.js` y en `js/version.js` (un
  test exige que coincidan). El workflow la reemplaza por `simulador-dc-<hash>` al publicar, así no
  se sube a mano. El service worker nuevo no se activa solo: espera a que el usuario toque Actualizar. Si la página
  ya cargó la versión nueva desde la red, se activa sin avisar.
- Sin librerías externas ni CDN.
- **Rediseño:** `ui.css`, `circuito.css`, `galeria.css` y `editor.css` usan solo variables de `tokens.css` (sin
  colores ni px/rem literales; lo verifica `tests/tokens.test.js`).
- **Animaciones en canvas, no en el SVG:** animar dentro del SVG lo repinta entero en cada cuadro
  (medido: 116 → 15 cuadros/s con 50 componentes y la CPU 4× más lenta). El SVG queda estático y
  `animador.js` dibuja lo que se mueve; solo anima lo visible, se pausa y respeta
  `prefers-reduced-motion`.
- **Arrastrar sin redibujar:** al arrastrar, la pieza pasa a un SVG superpuesto (`.capa-arrastre`)
  que se mueve con transform de CSS; al soltar se simula y se redibuja una vez. Reconstruir el SVG
  en cada movimiento daba 3,6 cuadros/s con 50 componentes y la CPU 4× más lenta; así, ~60.

## Comandos

```bash
cd frontend && node --test                  # 166 tests
node tests/e2e/servir.mjs                   # http://localhost:8000/Simulador-2.0/
cd tests/e2e && npm install && node verificar.mjs capturas   # 38 comprobaciones en Chrome
node tests/e2e/actualizacion.mjs            # aviso de versión nueva (publicar mientras espera)
node tests/e2e/galeria.mjs capturas         # capturas de la galería y cuadros/s con 50 componentes
node tests/e2e/editor.mjs capturas          # editor: lámpara, interruptor, vista, arrastre y cuadros/s
node tests/e2e/interaccion.mjs capturas     # insertar en cable, selección múltiple, copiar/pegar, ficha, tutorial
node tests/e2e/estados.mjs capturas         # estados de la barra en claro, oscuro y proyector
node tests/e2e/sin-modos.mjs capturas       # barra→circuito, cables desde bornes, menú, zoom y vista
node tests/e2e/diseno.mjs capturas          # escala, barra y menús, puntos, panel, galería, etiquetas, F
node tests/e2e/capturas-diseno.mjs carpeta  # capturas para comparar el diseño (abre los ejemplos por link)
```

## Cómo trabajar

- Commits chicos y descriptivos en español.
- Verificar en Chrome real (`tests/e2e/verificar.mjs`) antes de dar algo por terminado.
- No versionar `node_modules/`, capturas de `tests/e2e/capturas/` ni resultados crudos.
