"""Implementación HTTP de Simulador: delega en simulation-service a través de Traefik."""
import asyncio
from collections.abc import Awaitable, Callable

import httpx

from app.application.interfaces.simulator import (
    CircuitoInvalidoError,
    RespuestaInvalidaError,
    SimuladorNoDisponibleError,
)
from app.core.logger import logger

_MSG_NO_DISPONIBLE = "El servicio de simulación no está disponible. Intentá nuevamente."
_MSG_SATURADO = "El servicio de simulación está saturado. Reintentá en unos segundos."
_MSG_RESPUESTA_INVALIDA = "El servicio de simulación devolvió una respuesta inválida."

_INTENTOS = 3
_ESPERA_INICIAL_SEGUNDOS = 0.5
# Solo fallos rápidos: un 503 de cola llena ya esperó y reintentarlo agrava la saturación.
_ERRORES_REINTENTABLES = (httpx.ConnectError, httpx.RemoteProtocolError)
_ESTADOS_REINTENTABLES = {429, 502, 504}
_CLAVES_OBLIGATORIAS = ("node_voltages", "components", "power", "kcl_max_residual", "stats")


class SimuladorHttp:
    def __init__(
        self,
        url_base: str,
        timeout: float = 30.0,
        cliente: httpx.AsyncClient | None = None,
        esperar: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._cliente = cliente or httpx.AsyncClient(base_url=url_base.rstrip("/"), timeout=timeout)
        self._esperar = esperar

    async def simular(self, circuito: dict) -> dict:
        respuesta = await self._enviar_con_reintentos(circuito)
        estado = respuesta.status_code
        if estado == 200:
            return self._leer_resultado(respuesta)

        detalle = self._detalle(respuesta)
        if estado == 429 or detalle.get("code") == "overloaded":
            raise SimuladorNoDisponibleError(_MSG_SATURADO, respuesta.headers.get("retry-after"))
        if estado >= 500:
            raise SimuladorNoDisponibleError(_MSG_NO_DISPONIBLE)
        if estado in (413, 422) and isinstance(detalle.get("code"), str):
            detalles = detalle.get("details")
            raise CircuitoInvalidoError(
                detalle["code"], str(detalle.get("message", "Circuito inválido.")),
                detalles if isinstance(detalles, dict) else {},
            )
        if estado == 422:
            # Error de validación de FastAPI: el circuito no respeta el esquema.
            raise CircuitoInvalidoError(
                "invalid_schema", "El circuito no respeta el formato esperado."
            )
        logger.warning("Respuesta inesperada del simulador: HTTP %s", estado)
        raise RespuestaInvalidaError(_MSG_RESPUESTA_INVALIDA)

    async def _enviar_con_reintentos(self, circuito: dict) -> httpx.Response:
        for intento in range(1, _INTENTOS + 1):
            es_el_ultimo = intento == _INTENTOS
            try:
                respuesta = await self._cliente.post("/simulate", json=circuito)
            except _ERRORES_REINTENTABLES as exc:
                logger.warning("Simulador inaccesible (intento %s): %s", intento, exc)
                if es_el_ultimo:
                    raise SimuladorNoDisponibleError(_MSG_NO_DISPONIBLE) from exc
            except httpx.HTTPError as exc:
                logger.warning("Falló la llamada al simulador: %s", exc)
                raise SimuladorNoDisponibleError(_MSG_NO_DISPONIBLE) from exc
            else:
                if es_el_ultimo or respuesta.status_code not in _ESTADOS_REINTENTABLES:
                    return respuesta
                logger.warning(
                    "Simulador respondió %s (intento %s), reintentando.",
                    respuesta.status_code, intento,
                )
            await self._esperar(_ESPERA_INICIAL_SEGUNDOS * 2 ** (intento - 1))
        raise SimuladorNoDisponibleError(_MSG_NO_DISPONIBLE)

    @staticmethod
    def _leer_resultado(respuesta: httpx.Response) -> dict:
        try:
            datos = respuesta.json()
        except ValueError as exc:
            raise RespuestaInvalidaError(_MSG_RESPUESTA_INVALIDA) from exc
        if not isinstance(datos, dict) or any(clave not in datos for clave in _CLAVES_OBLIGATORIAS):
            raise RespuestaInvalidaError(_MSG_RESPUESTA_INVALIDA)
        return datos

    @staticmethod
    def _detalle(respuesta: httpx.Response) -> dict:
        try:
            datos = respuesta.json()
        except ValueError:
            return {}
        detalle = datos.get("detail") if isinstance(datos, dict) else None
        return detalle if isinstance(detalle, dict) else {}

    async def cerrar(self) -> None:
        await self._cliente.aclose()
