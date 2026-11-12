"""Puerto de persistencia: la capa de aplicación no conoce MongoDB.

Los nombres de los campos son los del contrato JSON de la API (name, circuit, layout...).
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol
from uuid import UUID


@dataclass
class CircuitoGuardado:
    id: UUID
    name: str
    description: str
    circuit: dict
    """Netlist en el formato de simulation-service: {"ground": ..., "components": [...]}."""
    layout: dict | None
    """Posiciones del editor web. El backend lo guarda sin interpretarlo."""
    created_at: datetime
    updated_at: datetime
    last_simulation: dict | None = None
    simulated_at: datetime | None = None
    tags: list[str] = field(default_factory=list)

    @property
    def component_count(self) -> int:
        return len(self.circuit.get("components", []))


@dataclass
class ResumenCircuito:
    """Lo que muestra el listado: sin netlist, layout ni resultados, que pueden ser grandes."""

    id: UUID
    name: str
    description: str
    tags: list[str]
    component_count: int
    created_at: datetime
    updated_at: datetime
    simulated_at: datetime | None


class RepositorioCircuitos(Protocol):
    async def asegurar_indices(self) -> None: ...
    async def guardar(self, circuito: CircuitoGuardado) -> CircuitoGuardado: ...
    async def obtener(self, id_circuito: UUID) -> CircuitoGuardado | None: ...
    async def listar(self, limite: int) -> list[ResumenCircuito]: ...
    async def reemplazar(self, circuito: CircuitoGuardado) -> CircuitoGuardado | None: ...
    async def eliminar(self, id_circuito: UUID) -> bool: ...
    async def guardar_simulacion(
        self, id_circuito: UUID, updated_at_esperado: datetime, resultado: dict,
        simulated_at: datetime,
    ) -> bool:
        """Guarda el resultado solo si el circuito no cambió mientras se simulaba."""
        ...
    async def responde(self) -> bool: ...
