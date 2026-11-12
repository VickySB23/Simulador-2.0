"""Puerto hacia el simulador y sus errores de dominio."""
from typing import Protocol


class SimulationError(Exception):
    """Base de los errores al simular."""


class InvalidCircuitError(SimulationError):
    """El simulador rechazó el circuito (nodo flotante, lazo de fuentes, etc.)."""

    def __init__(self, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class SimulatorUnavailableError(SimulationError):
    def __init__(self, message: str, retry_after: str | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class SimulatorProtocolError(SimulationError):
    """La respuesta del simulador no respeta el contrato."""


class Simulator(Protocol):
    async def simulate(self, circuit: dict) -> dict: ...
    async def aclose(self) -> None: ...
