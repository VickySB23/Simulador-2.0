"""Implementación HTTP de Simulator: delega en simulation-service a través de Traefik."""
import asyncio
from collections.abc import Awaitable, Callable

import httpx

from app.application.interfaces.simulator import (
    InvalidCircuitError,
    SimulatorProtocolError,
    SimulatorUnavailableError,
)

_MSG_UNAVAILABLE = "El servicio de simulación no está disponible. Intentá nuevamente."
_MSG_OVERLOADED = "El servicio de simulación está saturado. Reintentá en unos segundos."
_MSG_PROTOCOL = "El servicio de simulación devolvió una respuesta inválida."

_ATTEMPTS = 3
_BACKOFF_SECONDS = 0.5
# Solo fallos rápidos: un 503 de cola llena ya esperó y reintentarlo agrava la saturación.
_RETRYABLE_ERRORS = (httpx.ConnectError, httpx.RemoteProtocolError)
_RETRYABLE_STATUS = {429, 502, 504}
_REQUIRED_KEYS = ("node_voltages", "components", "power", "kcl_max_residual", "stats")


class HttpSimulator:
    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        client: httpx.AsyncClient | None = None,
        wait: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._client = client or httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout)
        self._wait = wait

    async def simulate(self, circuit: dict) -> dict:
        response = await self._post_with_retry(circuit)
        status = response.status_code
        if status == 200:
            return self._parse_success(response)

        detail = self._detail(response)
        if status == 429 or detail.get("code") == "overloaded":
            raise SimulatorUnavailableError(_MSG_OVERLOADED, response.headers.get("retry-after"))
        if status >= 500:
            raise SimulatorUnavailableError(_MSG_UNAVAILABLE)
        if status in (413, 422) and isinstance(detail.get("code"), str):
            details = detail.get("details")
            raise InvalidCircuitError(
                detail["code"], str(detail.get("message", "Circuito inválido.")),
                details if isinstance(details, dict) else {},
            )
        if status == 422:
            # Error de validación de FastAPI: el circuito no respeta el esquema.
            raise InvalidCircuitError("invalid_schema", "El circuito no respeta el formato esperado.")
        raise SimulatorProtocolError(_MSG_PROTOCOL)

    async def _post_with_retry(self, circuit: dict) -> httpx.Response:
        for attempt in range(1, _ATTEMPTS + 1):
            is_last = attempt == _ATTEMPTS
            try:
                response = await self._client.post("/simulate", json=circuit)
            except _RETRYABLE_ERRORS as exc:
                if is_last:
                    raise SimulatorUnavailableError(_MSG_UNAVAILABLE) from exc
            except httpx.HTTPError as exc:
                raise SimulatorUnavailableError(_MSG_UNAVAILABLE) from exc
            else:
                if is_last or response.status_code not in _RETRYABLE_STATUS:
                    return response
            await self._wait(_BACKOFF_SECONDS * 2 ** (attempt - 1))
        raise SimulatorUnavailableError(_MSG_UNAVAILABLE)

    @staticmethod
    def _parse_success(response: httpx.Response) -> dict:
        try:
            data = response.json()
        except ValueError as exc:
            raise SimulatorProtocolError(_MSG_PROTOCOL) from exc
        if not isinstance(data, dict) or any(key not in data for key in _REQUIRED_KEYS):
            raise SimulatorProtocolError(_MSG_PROTOCOL)
        return data

    @staticmethod
    def _detail(response: httpx.Response) -> dict:
        try:
            data = response.json()
        except ValueError:
            return {}
        detail = data.get("detail") if isinstance(data, dict) else None
        return detail if isinstance(detail, dict) else {}

    async def aclose(self) -> None:
        await self._client.aclose()
