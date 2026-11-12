"""Configuración leída del entorno y validada al arrancar (Twelve-Factor III)."""
import os

from app.core.logger import logger


def _read_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
    except ValueError:
        value = 0
    if value <= 0:
        raise RuntimeError(
            f"Variable de entorno inválida: {name}={raw!r} (se espera un entero positivo)."
        )
    return value


# Simulaciones simultáneas por réplica. El cálculo usa CPU: con 1 CPU por réplica, 1.
MAX_CONCURRENT = _read_positive_int("MAX_CONCURRENT", 1)
# Debe ser menor que el timeout de los clientes (circuit-service y k6 usan 30 s).
QUEUE_TIMEOUT_SECONDS = _read_positive_int("QUEUE_TIMEOUT_SECONDS", 10)
RETRY_AFTER_SECONDS = _read_positive_int("RETRY_AFTER_SECONDS", 1)
# Tamaño máximo de un circuito: acota memoria y tiempo de CPU por petición.
MAX_COMPONENTS = _read_positive_int("MAX_COMPONENTS", 20000)

RATE_LIMIT_AVERAGE = _read_positive_int("RATE_LIMIT_AVERAGE", 100)
RATE_LIMIT_BURST = _read_positive_int("RATE_LIMIT_BURST", 200)

# Sin esta variable el servicio corre solo, por ejemplo en desarrollo local.
CONSUL_URL = os.getenv("CONSUL_URL")

logger.info(
    "Configuración: MAX_CONCURRENT=%s QUEUE_TIMEOUT_SECONDS=%s RETRY_AFTER_SECONDS=%s "
    "MAX_COMPONENTS=%s",
    MAX_CONCURRENT,
    QUEUE_TIMEOUT_SECONDS,
    RETRY_AFTER_SECONDS,
    MAX_COMPONENTS,
)
