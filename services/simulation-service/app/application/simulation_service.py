"""Caso de uso: simular un circuito respetando el cupo de la réplica (backpressure)."""
import asyncio
from contextlib import asynccontextmanager

from app.core import config
from app.core.logger import logger
from app.domain.circuit import Circuit, ServicioSaturadoError, SimulationResult
from app.domain.mna import simulate

_CUPO = asyncio.Semaphore(config.MAX_CONCURRENT)


@asynccontextmanager
async def ocupar_cupo():
    """Espera un lugar hasta QUEUE_TIMEOUT_SECONDS; si no lo consigue, rechaza con 503."""
    try:
        await asyncio.wait_for(_CUPO.acquire(), timeout=config.QUEUE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        logger.warning(
            "Petición rechazada (overloaded): cola de %s s agotada.", config.QUEUE_TIMEOUT_SECONDS
        )
        raise ServicioSaturadoError() from exc
    try:
        yield
    finally:
        _CUPO.release()


async def simular(circuit: Circuit) -> SimulationResult:
    # El cálculo es CPU: corre en un hilo para no bloquear el event loop (health checks).
    return await asyncio.to_thread(simulate, circuit)
