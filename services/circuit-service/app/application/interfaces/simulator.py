"""Puerto hacia el simulador y sus errores de dominio."""
from typing import Protocol


class SimulacionError(Exception):
    """Base de los errores al simular."""


class CircuitoInvalidoError(SimulacionError):
    """El simulador rechazó el circuito (nodo flotante, lazo de fuentes, etc.).

    `codigo` es el de simulation-service (`floating_nodes`, `too_large`...) y se reenvía tal cual.
    """

    def __init__(self, codigo: str, mensaje: str, detalles: dict | None = None):
        super().__init__(mensaje)
        self.codigo = codigo
        self.detalles = detalles or {}


class SimuladorNoDisponibleError(SimulacionError):
    def __init__(self, mensaje: str, retry_after: str | None = None):
        super().__init__(mensaje)
        self.retry_after = retry_after


class RespuestaInvalidaError(SimulacionError):
    """La respuesta del simulador no respeta el contrato."""


class Simulador(Protocol):
    async def simular(self, circuito: dict) -> dict: ...
    async def cerrar(self) -> None: ...
