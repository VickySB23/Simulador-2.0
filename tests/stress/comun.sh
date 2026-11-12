# Funciones comunes de las pruebas de carga. Se incluye con: source "$(dirname "$0")/comun.sh"
# Funciona en Linux, macOS y Git Bash (Windows). Necesita docker y curl.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Docker Desktop en Windows necesita rutas C:/...; en Linux, pwd -W no existe.
RAIZ_DOCKER="$(cd "$RAIZ" && (pwd -W 2>/dev/null || pwd))"
export MSYS_NO_PATHCONV=1 PYTHONIOENCODING=utf-8
MEDICIONES="$RAIZ/docs/mediciones"
RESULTADOS="$RAIZ/results"
RED="simulador-traefik-net"
# Imágenes de las herramientas, fijadas para que las corridas sean comparables.
IMAGEN_K6="grafana/k6:0.55.0"
IMAGEN_VEGETA="peterevans/vegeta@sha256:eb65f499cd1b0f1402a56794d7711c49121db6ff8ea7d878513d76601ee0d502"
# API de Traefik publicada por docker-compose.override.yml.
TRAEFIK_API="${TRAEFIK_API:-http://localhost:8081}"
mkdir -p "$MEDICIONES" "$RESULTADOS"
cd "$RAIZ"

# Cantidad de servidores UP que Traefik tiene para /simulate.
servidores_up() {
  curl -s "$TRAEFIK_API/api/http/services/simulate@consulcatalog" |
    python -c "import sys,json
try: print(sum(1 for v in json.load(sys.stdin).get('serverStatus',{}).values() if v=='UP'))
except Exception: print(0)"
}

# Espera a que Traefik tenga exactamente N réplicas sanas de simulation-service.
esperar_replicas() {
  local n="$1" intento
  for intento in $(seq 1 60); do
    if [ "$(servidores_up)" = "$n" ]; then
      sleep 3
      echo "Traefik: $n réplicas UP." >&2
      return 0
    fi
    sleep 2
  done
  echo "Traefik no llegó a $n réplicas UP." >&2
  return 1
}

# Aplica la configuración del experimento (variables de entorno del compose) y espera.
#   levantar REPLICAS [VAR=valor ...]
levantar() {
  local replicas="$1"
  shift
  env SIMULATION_REPLICAS="$replicas" "$@" docker compose up -d --wait >/dev/null 2>&1
  esperar_replicas "$replicas"
}

# Reinicia las réplicas entre corridas para que el atraso de una no contamine la siguiente.
reiniciar_replicas() {
  local replicas="$1"
  docker compose restart simulation-service >/dev/null 2>&1
  esperar_replicas "$replicas"
}

# Muestra docker stats cada 3 s durante SEGUNDOS, en segundo plano. Devuelve el PID.
iniciar_stats() {
  local archivo="$1" segundos="$2"
  : >"$archivo"
  (
    fin=$((SECONDS + segundos))
    while [ $SECONDS -lt $fin ]; do
      date +%H:%M:%S >>"$archivo"
      docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" >>"$archivo" 2>/dev/null
      sleep 3
    done
  ) &
  echo $!
}

# Deja registrada la configuración efectiva de las réplicas (log de arranque).
guardar_config() {
  local archivo="$1"
  {
    echo "# $(date '+%Y-%m-%d %H:%M:%S')"
    docker compose ps --format '{{.Name}}\t{{.Image}}\t{{.Status}}'
    docker compose logs simulation-service 2>/dev/null | grep "Configuración:" | tail -n 1
    curl -s "$TRAEFIK_API/api/http/middlewares/simulate-limit@consulcatalog" | python -c "import sys,json
try: print('rate limit de Traefik:', json.load(sys.stdin).get('rateLimit'))
except Exception: print('rate limit de Traefik: (no disponible)')"
    docker compose exec -T simulation-service printenv OPENBLAS_NUM_THREADS 2>/dev/null |
      sed 's/^/OPENBLAS_NUM_THREADS=/' || echo "OPENBLAS_NUM_THREADS=(sin definir)"
  } >"$archivo"
}

# Cuántas veces Consul marcó una réplica como crítica desde DESDE (fecha UTC ISO-8601).
# Si un health check falla, Traefik saca la réplica y responde 503 sin llegar al servicio.
checks_criticos_desde() {
  docker compose logs consul --since "$1" 2>/dev/null | grep -c "Check is now critical: check=service:simulation-service" || true
}
