"""Casos de uso de los circuitos guardados: orquesta repositorio y simulador."""
import uuid
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID

from app.application.interfaces.circuit_repository import CircuitRecord, CircuitRepository
from app.application.interfaces.simulator import Simulator
from app.core.logger import logger

LIST_LIMIT = 100


class CircuitNotFoundError(Exception):
    pass


class ConcurrentModificationError(Exception):
    """El circuito cambió mientras se simulaba: el resultado ya no le corresponde."""


class CircuitService:
    def __init__(self, repository: CircuitRepository, simulator: Simulator):
        self._repository = repository
        self._simulator = simulator

    async def create(self, name: str, description: str, circuit: dict, layout: dict | None,
                     tags: list[str]) -> CircuitRecord:
        now = datetime.now(UTC)
        record = CircuitRecord(
            id=uuid.uuid4(), name=name, description=description, circuit=circuit,
            layout=layout, created_at=now, updated_at=now, tags=tags,
        )
        saved = await self._repository.save(record)
        logger.info("Circuito creado: %s (%s componentes)", saved.id, saved.component_count)
        return saved

    async def get(self, circuit_id: UUID) -> CircuitRecord:
        record = await self._repository.get_by_id(circuit_id)
        if record is None:
            raise CircuitNotFoundError()
        return record

    async def list(self) -> list[CircuitRecord]:
        return await self._repository.list(LIST_LIMIT)

    async def update(self, circuit_id: UUID, name: str, description: str, circuit: dict,
                     layout: dict | None, tags: list[str]) -> CircuitRecord:
        current = await self.get(circuit_id)
        # Un circuito editado invalida su última simulación.
        updated = replace(
            current, name=name, description=description, circuit=circuit, layout=layout,
            tags=tags, updated_at=datetime.now(UTC), last_simulation=None, simulated_at=None,
        )
        saved = await self._repository.replace(updated)
        if saved is None:
            raise CircuitNotFoundError()
        logger.info("Circuito actualizado: %s", circuit_id)
        return saved

    async def delete(self, circuit_id: UUID) -> None:
        if not await self._repository.delete(circuit_id):
            raise CircuitNotFoundError()
        logger.info("Circuito eliminado: %s", circuit_id)

    async def simulate(self, circuit_id: UUID) -> CircuitRecord:
        record = await self.get(circuit_id)
        result = await self._simulator.simulate(record.circuit)
        simulated_at = datetime.now(UTC)
        if not await self._repository.save_simulation(
            circuit_id, record.updated_at, result, simulated_at
        ):
            raise ConcurrentModificationError()
        logger.info("Circuito %s simulado en %s ms", circuit_id,
                    result.get("stats", {}).get("total_ms"))
        return replace(record, last_simulation=result, simulated_at=simulated_at)

    async def is_healthy(self) -> bool:
        return await self._repository.ping()
