#!/usr/bin/env bash
# k6 spike dentro de la red del stack (contenedor grafana/k6 contra http://traefik).
# Reinicia las réplicas y espera a que Traefik las vea sanas antes de cada corrida.
#
# Uso: tests/stress/run-k6-docker.sh ETIQUETA CORRIDAS REPLICAS [CIRCUITO] [VUS]
#   tests/stress/run-k6-docker.sh 05-replicas-3 3 3 circuitos/escalera-1000.json 100
# La configuración del stack (réplicas, rate limit) se aplica antes con levantar (comun.sh) o
# con docker compose up; este script solo verifica que haya REPLICAS sanas.
source "$(dirname "$0")/comun.sh"

ETIQUETA="${1:?Falta la etiqueta}"
CORRIDAS="${2:-3}"
REPLICAS="${3:-3}"
CIRCUITO="${4:-circuitos/escalera-1000.json}"
VUS="${5:-100}"

guardar_config "$MEDICIONES/$ETIQUETA-config.txt"
echo "circuito=$CIRCUITO vus=$VUS replicas=$REPLICAS" >>"$MEDICIONES/$ETIQUETA-config.txt"

for i in $(seq 1 "$CORRIDAS"); do
  reiniciar_replicas "$REPLICAS"
  desde=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  archivo="$ETIQUETA-run$i-k6.json"
  pid_stats=$(iniciar_stats "$MEDICIONES/$ETIQUETA-run$i-k6-stats.txt" 42)
  docker run --rm --network "$RED" \
    -v "$RAIZ_DOCKER/tests/stress:/work:ro" -v "$RAIZ_DOCKER/docs/mediciones:/out" -w /work \
    -e BASE_URL=http://traefik -e CIRCUITO="$CIRCUITO" -e VUS="$VUS" \
    "$IMAGEN_K6" run --quiet --summary-export "/out/$archivo" k6-spike.js >"$RESULTADOS/$archivo.log" 2>&1 || true
  wait "$pid_stats" 2>/dev/null || true
  criticos=$(checks_criticos_desde "$desde")
  echo "checks críticos de Consul durante la corrida: $criticos" | tee "$MEDICIONES/$ETIQUETA-run$i-k6-consul.txt"
  python tests/stress/resumir.py "docs/mediciones/$archivo"
done
