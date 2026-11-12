# Pruebas de la página en el navegador

`verificar.mjs` maneja un Chrome real (headless) y recorre la página como lo haría un usuario
(31 comprobaciones):

- los seis ejemplos: el TP4 da 30 V y la fuente entrega 12,5 A, el Wheatstone equilibrado no tiene
  corriente en el galvanómetro y las dos mallas dan 7,5 V;
- el panel de ecuaciones (KCL con valores, matriz MNA y solución);
- un nodo suelto se marca en rojo con el mensaje del motor;
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
minutos o al volver a la pestaña). Mientras espera, publicá un cambio subiendo `VERSION` en
`frontend/public/sw.js` y `frontend/public/js/version.js`; el script tiene que ver
"Hay una versión nueva — Actualizar", tocarlo y terminar con la versión nueva activa.
`ESPERA_MINUTOS` fija cuánto espera (por defecto 15).

`servir.mjs` sirve `frontend/public/` en la raíz y en `/Simulador-2.0/`, como GitHub Pages, para
comprobar que todas las rutas sean relativas.
