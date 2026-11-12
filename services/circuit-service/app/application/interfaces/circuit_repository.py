"""Puerto de persistencia: la capa de aplicación no conoce MongoDB."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol
from uuid import UUID


@dataclass
class CircuitRecord:
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


class CircuitRepository(Protocol):
    async def ensure_indexes(self) -> None: ...
    async def save(self, record: CircuitRecord) -> CircuitRecord: ...
    async def get_by_id(self, circuit_id: UUID) -> CircuitRecord | None: ...
    async def list(self, limit: int) -> list[CircuitRecord]: ...
    async def replace(self, record: CircuitRecord) -> CircuitRecord | None: ...
    async def delete(self, circuit_id: UUID) -> bool: ...
    async def save_simulation(
        self, circuit_id: UUID, expected_updated_at: datetime, result: dict, simulated_at: datetime
    ) -> bool:
        """Guarda el resultado solo si el circuito no cambió mientras se simulaba."""
        ...
    async def ping(self) -> bool: ...
