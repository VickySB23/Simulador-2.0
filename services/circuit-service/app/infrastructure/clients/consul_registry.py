"""Registro del servicio en Consul: Traefik descubre las rutas desde sus tags."""
import asyncio
import socket
from collections.abc import Awaitable, Callable
from urllib.parse import urlsplit

import httpx

from app.core import obtener_configuracion
from app.core.logger import logger

NOMBRE_SERVICIO = "circuit-service"
PUERTO = 8000
# El 503 queda afuera: es el simulador saturado que se reenvía, no una falla de este servicio.
_EXPRESION_CORTE = "NetworkErrorRatio() > 0.5 || ResponseCodeRatio(500, 503, 0, 600) > 0.25"
TAGS = [
    "traefik.enable=true",
    "traefik.http.routers.circuits.rule=PathPrefix(`/api/circuits`) || Path(`/health`)",
    "traefik.http.routers.circuits.entrypoints=web",
    "traefik.http.routers.circuits.middlewares=circuits-limit,circuits-breaker",
    f"traefik.http.middlewares.circuits-breaker.circuitbreaker.expression={_EXPRESION_CORTE}",
]

_INTENTOS = 10
_ESPERA_SEGUNDOS = 1.0


def ip_propia(consul_url: str) -> str:
    """Devuelve la IP con la que este contenedor llega a Consul: está en dos redes."""
    destino = urlsplit(consul_url)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.connect((destino.hostname, destino.port or 80))
        return sock.getsockname()[0]


class RegistroConsul:
    def __init__(
        self,
        consul_url: str,
        cliente: httpx.AsyncClient | None = None,
        ip: str | None = None,
        id_instancia: str | None = None,
        esperar: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._cliente = cliente or httpx.AsyncClient(base_url=consul_url, timeout=5.0)
        self._ip = ip or ip_propia(consul_url)
        self._id = id_instancia or f"{NOMBRE_SERVICIO}-{socket.gethostname()}"
        self._esperar = esperar

    def _definicion(self) -> dict:
        configuracion = obtener_configuracion()
        return {
            "ID": self._id,
            "Name": NOMBRE_SERVICIO,
            "Address": self._ip,
            "Port": PUERTO,
            "Tags": [
                *TAGS,
                "traefik.http.middlewares.circuits-limit.ratelimit.average="
                f"{configuracion.rate_limit_average}",
                "traefik.http.middlewares.circuits-limit.ratelimit.burst="
                f"{configuracion.rate_limit_burst}",
            ],
            "Check": {
                "HTTP": f"http://{self._ip}:{PUERTO}/health",
                "Interval": "5s",
                "Timeout": "3s",
                "DeregisterCriticalServiceAfter": "1m",
            },
        }

    async def registrar(self) -> None:
        for intento in range(1, _INTENTOS + 1):
            try:
                respuesta = await self._cliente.put(
                    "/v1/agent/service/register", json=self._definicion()
                )
                respuesta.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("Consul no disponible (intento %s): %s", intento, exc)
                await self._esperar(_ESPERA_SEGUNDOS)
                continue
            logger.info("Servicio registrado en Consul: %s", self._id)
            return
        raise RuntimeError(f"No se pudo registrar {self._id} en Consul.")

    async def desregistrar(self) -> None:
        try:
            respuesta = await self._cliente.put(f"/v1/agent/service/deregister/{self._id}")
            respuesta.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("No se pudo dar de baja %s en Consul: %s", self._id, exc)
        finally:
            await self._cliente.aclose()
