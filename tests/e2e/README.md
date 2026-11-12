# Pruebas del editor en el navegador

`verificar.mjs` maneja un Chrome real (headless) contra el stack levantado y comprueba el editor de
punta a punta: el TP4 da 30 V, un nodo suelto se marca en rojo, deshacer/rehacer (con la tierra),
ids que no se repiten, edición de valores, guardar/abrir/renombrar/borrar en `/api/circuits`, modo
oscuro, pantalla chica y que no haya errores de consola ni violaciones de CSP. Guarda capturas.

No corre en la CI: necesita el stack completo y un Chrome instalado. Usa `playwright-core`, que no
descarga navegadores.

```bash
docker compose up --build -d --wait     # desde la raíz del repo
cd tests/e2e
npm install
node verificar.mjs capturas             # capturas en tests/e2e/capturas/ (ignorado por git)
```

Variables opcionales:

- `BASE_URL`: dónde está el stack (por defecto `http://localhost:8080/`).
- `CHROME_PATH`: ejecutable de Chrome o Edge, si no está en la ruta por defecto del sistema.

Imprime una línea `OK` o `MAL` por comprobación y termina con código 1 si alguna falla. Crea un
circuito llamado "TP4 verificado" y lo borra al final.
