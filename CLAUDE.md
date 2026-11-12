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
                          ejemplos, almacen (localStorage + .json), compartir (hash), ecuaciones
  js/app.js, editor.js, paneles.js, exportar.js, tema.js     interfaz
  sw.js                   service worker: caché con versión, red primero (4 s) y caché sin conexión
  js/version.js, js/actualizacion.js   versión de la página y aviso "Hay una versión nueva — Actualizar"
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

`parseValue` es el `parse_value` del backend (M y MEG = mega, m = mili); `valores.js` agrega la
coma decimal. Si se cambia el motor, correr `tests/comparacion/comparar.mjs` contra el stack de
`microservicios` (última corrida: 500 circuitos, 0 discrepancias de error, 5,5e-10 de diferencia
relativa a la escala).

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

## Comandos

```bash
cd frontend && node --test                  # 89 tests
node tests/e2e/servir.mjs                   # http://localhost:8000/Simulador-2.0/
cd tests/e2e && npm install && node verificar.mjs capturas   # 31 comprobaciones en Chrome
node tests/e2e/actualizacion.mjs            # aviso de versión nueva (publicar mientras espera)
```

## Cómo trabajar

- Commits chicos y descriptivos en español.
- Verificar en Chrome real (`tests/e2e/verificar.mjs`) antes de dar algo por terminado.
- No versionar `node_modules/`, capturas de `tests/e2e/capturas/` ni resultados crudos.
