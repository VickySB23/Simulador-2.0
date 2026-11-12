#!/usr/bin/env bash
# Costo del solver por tamaño dentro del contenedor de simulation-service, con su mismo límite
# de recursos (1 CPU, 512 MiB). Corre bench_solver.py sobre la imagen ya construida.
#
# Uso: tests/stress/run-bench-solver.sh ETIQUETA [CORRIDAS] [VAR=valor ...]
#   tests/stress/run-bench-solver.sh 02-solver-1-hilo 3
#   tests/stress/run-bench-solver.sh 01-solver-hilos-auto 3 OPENBLAS_NUM_THREADS=
# Las variables extra se pasan al contenedor (por ejemplo, para quitar OPENBLAS_NUM_THREADS).
source "$(dirname "$0")/comun.sh"

ETIQUETA="${1:?Falta la etiqueta}"
CORRIDAS="${2:-3}"
shift $(( $# >= 2 ? 2 : 1 ))
IMAGEN="simulador-simulation-service:v1.0.0"

[ -f tests/stress/circuitos/escalera-1000.json ] || python tests/stress/generar_circuitos.py >/dev/null

ENTORNO=()
for var in "$@"; do ENTORNO+=(-e "$var"); done

for i in $(seq 1 "$CORRIDAS"); do
  salida="$MEDICIONES/$ETIQUETA-run$i.csv"
  docker run --rm --cpus 1 --memory 512m "${ENTORNO[@]}" \
    -v "$RAIZ_DOCKER/tests/stress:/work:ro" "$IMAGEN" \
    /app/.venv/bin/python /work/bench_solver.py /work/circuitos 20 >"$salida"
  echo "$ETIQUETA corrida $i -> $salida"
done
