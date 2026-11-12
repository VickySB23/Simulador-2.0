"""Costo del solver por tamaño, dentro del contenedor de simulation-service (1 CPU, 512 MiB).

Para cada escalera mide, con el mismo circuito:
- `denso`: forzando np.linalg.solve (DENSE_LIMIT muy alto).
- `disperso`: forzando spsolve (DENSE_LIMIT = 0).
- `auto`: con el DENSE_LIMIT real del servicio (200), que es lo que corre en producción.
De cada uno informa la mediana de `solve_ms` (solo la resolución) y de `total_ms` (validación,
topología, armado, resolución y resultados), según las estadísticas que devuelve el propio motor.

Uso (desde run-bench-solver.sh):
    python /work/bench_solver.py /work/circuitos REPETICIONES
"""
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, "/app")
from app.domain import mna  # noqa: E402
from app.domain.circuit import Circuit, Component, ComponentType, parse_value  # noqa: E402

MODOS = {"denso": 10**9, "disperso": 0, "auto": mna.DENSE_LIMIT}


def cargar(ruta: Path) -> Circuit:
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    componentes = tuple(
        Component(c["id"], ComponentType(c["type"]), c["a"], c["b"], parse_value(c.get("value", 0)))
        for c in datos["components"]
    )
    return Circuit(components=componentes, ground=datos["ground"])


def medir(circuito: Circuit, limite: int, repeticiones: int) -> tuple[float, float, str]:
    mna.DENSE_LIMIT = limite
    mna.simulate(circuito)  # calentamiento
    solve, total, solver = [], [], ""
    for _ in range(repeticiones):
        r = mna.simulate(circuito)
        solve.append(r.stats["solve_ms"])
        total.append(r.stats["total_ms"])
        solver = r.stats["solver"]
    return statistics.median(solve), statistics.median(total), solver


def main() -> None:
    carpeta = Path(sys.argv[1])
    repeticiones = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    limite_real = mna.DENSE_LIMIT
    rutas = sorted(carpeta.glob("escalera-*.json"), key=lambda p: int(p.stem.split("-")[1]))
    print(f"# DENSE_LIMIT del servicio = {limite_real}; {repeticiones} repeticiones por medición "
          f"(mediana); {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("nodos,componentes,incognitas,modo,solver,solve_ms,total_ms")
    for ruta in rutas:
        circuito = cargar(ruta)
        nodos = int(ruta.stem.split("-")[1])
        for modo, limite in MODOS.items():
            # La factorización densa de 2000+ incógnitas tarda segundos: menos repeticiones.
            reps = repeticiones if not (modo == "denso" and nodos >= 2000) else 3
            solve, total, solver = medir(circuito, limite, reps)
            print(f"{nodos},{len(circuito.components)},{nodos + 1},{modo},{solver},"
                  f"{solve:.3f},{total:.3f}", flush=True)
    mna.DENSE_LIMIT = limite_real


if __name__ == "__main__":
    main()
