#!/usr/bin/env bash
# Vegeta a tasa constante dentro de la red del stack (modelo abierto: las peticiones llegan a
# la tasa fijada aunque las anteriores no hayan terminado).
#
# Uso: tests/stress/run-vegeta-docker.sh ETIQUETA CORRIDAS REPLICAS TASA [CIRCUITO] [DURACION]
#   tests/stress/run-vegeta-docker.sh 05-replicas-3 3 3 40 circuitos/escalera-1000.json 30s
source "$(dirname "$0")/comun.sh"

ETIQUETA="${1:?Falta la etiqueta}"
CORRIDAS="${2:-3}"
REPLICAS="${3:-3}"
TASA="${4:-40}"
CIRCUITO="${5:-circuitos/escalera-1000.json}"
DURACION="${6:-30s}"

guardar_config "$MEDICIONES/$ETIQUETA-vegeta-config.txt"
echo "circuito=$CIRCUITO tasa=$TASA/s duracion=$DURACION timeout=30s replicas=$REPLICAS" \
  >>"$MEDICIONES/$ETIQUETA-vegeta-config.txt"

for i in $(seq 1 "$CORRIDAS"); do
  reiniciar_replicas "$REPLICAS"
  desde=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  base="$ETIQUETA-run$i-vegeta"
  pid_stats=$(iniciar_stats "$MEDICIONES/$base-stats.txt" 33)
  docker run --rm --network "$RED" \
    -v "$RAIZ_DOCKER/tests/stress:/work:ro" -v "$RAIZ_DOCKER/results:/res" \
    --entrypoint /bin/sh "$IMAGEN_VEGETA" -c \
    "echo 'POST http://traefik/simulate' | vegeta attack -rate=$TASA -duration=$DURACION \
       -timeout=30s -body=/work/$CIRCUITO -header='Content-Type: application/json' \
       -output=/res/$base.bin && vegeta report /res/$base.bin && \
     vegeta report -type=json /res/$base.bin > /res/$base.json" \
    >"$MEDICIONES/$base.txt" 2>&1 || true
  cp "$RESULTADOS/$base.json" "$MEDICIONES/$base.json" 2>/dev/null || true
  wait "$pid_stats" 2>/dev/null || true
  criticos=$(checks_criticos_desde "$desde")
  echo "checks críticos de Consul durante la corrida: $criticos" | tee "$MEDICIONES/$ETIQUETA-run$i-vegeta-consul.txt"
  python tests/stress/resumir.py "docs/mediciones/$base.json"
done
