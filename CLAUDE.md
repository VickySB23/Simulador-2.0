# Simulador de circuitos DC en microservicios

Contexto para Claude Code. Este proyecto reescribe **Simulador-2.0** (app de escritorio Tkinter,
https://github.com/VickySB23/Simulador-2.0) como microservicios, con la misma arquitectura y
convenciones que **pdf-extractext-microservicios** (https://github.com/VickySB23/pdf-extractext-microservicios).
Antes de escribir código nuevo, mirá cómo lo resolvió ese repo y seguí el mismo estilo.

Autora: Victoria Sanchez Bujaldon. Idioma del código, comentarios, README e informe: español rioplatense.

## Arquitectura objetivo

```text
Navegador / k6 / Vegeta
        |
        v
Traefik :8080  <-- rutas -- Consul :8500 <-- se registra cada réplica
   |-- /            --> frontend (nginx, editor web estático; ruta por file provider de Traefik)
   |-- /simulate    --> N réplicas de simulation-service (sin estado, p2c, rate limit, circuit breaker)
   |-- /api/circuits, /health --> circuit-service --> MongoDB
                                      |
                                      +--> /simulate vía Traefik (reintentos 429/502/504 y conexión)
```

- **simulation-service** (puerto 8001): `POST /simulate` recibe `{"ground": "0", "components": [...]}`
  y devuelve tensiones de nodo, corriente y potencia por componente, balance de potencias, residuo KCL y
  estadísticas. Tipos: `resistor`, `voltage_source` (a = +, b = −), `current_source` (sentido de a hacia b
  por dentro de la fuente), `wire`. Los valores aceptan número o texto (`4.7k`, `1MEG`, `5m`).
  Backpressure: semáforo `MAX_CONCURRENT` por réplica, cola `QUEUE_TIMEOUT_SECONDS`, `503` con `Retry-After`.
  Errores de circuito: `422` con `{"code", "message", "details"}`; códigos: `invalid_component`,
  `no_ground`, `floating_nodes` (details.nodes), `voltage_source_loop`, `shorted_voltage_source`,
  `singular_circuit`, `invalid_circuit`. Circuito demasiado grande: `413 too_large`.
- **circuit-service** (puerto 8000): CRUD en MongoDB de circuitos guardados (`name`, `description`,
  `circuit`, `layout` opaco del editor, `tags`, `last_simulation`, `simulated_at`) y
  `POST /api/circuits/{id}/simulate`, que llama a simulation-service y guarda el resultado solo si el
  circuito no cambió mientras se simulaba (filtro por `updated_at`). Editar un circuito borra su última simulación.
- **frontend**: editor web en el navegador que reemplaza la GUI Tkinter (grilla con snap, herramientas
  cable/R/V/I/GND, rotar, borrar, deshacer/rehacer, editar valor con `10k`, simulación en vivo con
  debounce contra `/simulate`, color por tensión, flechas de corriente, tabla de resultados, balance de
  potencias, KCL, marcar en rojo los nodos que devuelva `floating_nodes`, guardar/abrir vía `/api/circuits`).
  Sin paso de build: HTML + JS vanilla servido por nginx.

Cada servicio en capas `core`, `domain` (simulation), `application`, `infrastructure`, `presentation`.
Python 3.12, FastAPI, uvicorn, uv con `uv.lock`, Dockerfile en dos etapas sin pip y con usuario sin
privilegios (copiar el de pdf-extractext).

## Estado

| Parte | Estado |
| --- | --- |
| `services/simulation-service` | **Terminado.** 53 tests pasan (`uv run pytest -q`). |
| `services/circuit-service` | **Terminado.** 84 tests pasan (`uv run pytest -q`); los del repositorio usan un MongoDB real (`MONGO_TEST_URI`, por defecto `localhost:27017`) y se saltean si no hay. Nombres en español como simulation-service; los campos del JSON quedan en inglés. |
| `frontend/` | **Terminado.** nginx con headers de seguridad y CSP estricta (sin `eval` ni scripts en línea: las pruebas de navegador tienen que usar locators, no `waitForFunction`). Lógica pura en `public/js/lib/` con 42 tests (`cd frontend && node --test`). Capturas en `docs/capturas/`. |
| `docker-compose.yml`, `docker-compose.override.yml`, `.env.example`, `traefik/dynamic/frontend.yml` | **Hechos** y probados con `docker compose up --build -d --wait`. La ruta `/` → `frontend:80` (prioridad 1) ya está; da 502 hasta que exista el servicio `frontend` en el compose. |
| `.github/workflows/ci.yml` | **Hecho.** Matriz con ambos servicios, service `mongo:8.0` y `MONGO_TEST_REQUIRED=1`; job de build con `docker compose`. |
| `tests/stress/` (k6 y Vegeta con circuitos generados de 10, 100 y 1000 nodos), `docs/mediciones/`, `docs/informe/INFORME.md`, `docs/ecuaciones.md`, `README.md` | Faltan. Las mediciones tienen que ser reales: no inventar números. |

## Decisiones del motor MNA (no revertir)

Estas decisiones corrigen bugs confirmados en Simulador-2.0:

1. **Cables ideales con union-find**: los nodos unidos por cables son un solo nodo eléctrico. Simulador-2.0
   los modelaba como resistencias de 1e-9 Ω sumadas a GMIN = 1e-12, lo que deja la matriz mal condicionada.
2. **Sin GMIN**: en lugar de regularizar, se revisa la topología antes de resolver. Simulador-2.0 mostraba
   1 000 000 000 V en un nodo alimentado solo por una fuente de corriente y lo presentaba como válido.
3. **Detección de lazos de fuentes de tensión**: dos fuentes en paralelo devolvían resultados vacíos
   en silencio y la GUI decía "Cálculo Automático OK".
4. **R ≤ 0 es un error**: antes R = 0 se convertía en silencio en 1e-9 Ω (100 GW disipados).
5. Matriz armada en formato disperso; resolución densa hasta 200 incógnitas y `spsolve` por encima.
6. Convención pasiva: potencia positiva = absorbe; una fuente que entrega tiene potencia negativa.

## Otros bugs de la GUI de Simulador-2.0 (a evitar en el frontend nuevo)

Todos reproducidos con la app real:

- **Rehacer no funciona**: `HistoryManager.redo` vuelve a aplicar el estado anterior. Usar dos pilas que
  guarden el estado *actual* al deshacer o rehacer.
- **Deshacer pierde la tierra**: `save_state` no guarda `tierra_idx`.
- **El símbolo de GND no se mueve** al elegir otro nodo como tierra; queda dibujado en el primer nodo.
- **El resaltado de selección no funciona** para R, V e I: se aplica `outline` a una línea y el error se
  oculta con un `except: pass`.
- **Nombres duplicados** (`W2`, `W2`) después de borrar, y como los resultados se indexan por nombre,
  se pisan entre sí.
- La fuente de corriente no muestra su sentido, y "+ −" queda horizontal en fuentes verticales.
- Además, el repo versiona `build/` y `dist/` (16 MB, incluido un .exe), el README menciona
  `docs/ecuaciones.md`, que no existe, y `requirements.txt` está casi vacío.

## Comandos

```bash
cd services/simulation-service && uv sync && uv run pytest -q
uv run uvicorn app.main:app --port 8001      # sin CONSUL_URL corre solo
cd services/circuit-service && uv sync && uv run pytest -q   # necesita MongoDB para los tests de integración
docker compose up --build -d --wait           # stack completo (cuando exista el compose)
```

## Cómo trabajar

- Al terminar cada servicio, correr sus tests y probarlo con HTTP real.
- No agregar `build/`, `dist/`, `.venv/` ni resultados de carga sin procesar al repo.
- Commits chicos y descriptivos en español.
