"""Casos de uso de los circuitos guardados: orquesta repositorio y simulador."""
import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.application.interfaces.circuit_repository import (
    CircuitoGuardado,
    RepositorioCircuitos,
    ResumenCircuito,
)
from app.application.interfaces.simulator import Simulador
from app.core.logger import logger

LIMITE_LISTADO = 100


def _ahora() -> datetime:
    """Hora UTC en milisegundos, la precisión de la base: lo que se devuelve es lo que se guarda."""
    ahora = datetime.now(UTC)
    return ahora.replace(microsecond=ahora.microsecond // 1000 * 1000)


class CircuitoNoEncontradoError(Exception):
    pass


class ModificacionConcurrenteError(Exception):
    """El circuito cambió o se borró mientras se simulaba: el resultado ya no le corresponde."""


class ServicioCircuitos:
    def __init__(self, repositorio: RepositorioCircuitos, simulador: Simulador):
        self._repositorio = repositorio
        self._simulador = simulador

    async def crear(self, name: str, description: str, circuit: dict, layout: dict | None,
                    tags: list[str]) -> CircuitoGuardado:
        ahora = _ahora()
        circuito = CircuitoGuardado(
            id=uuid.uuid4(), name=name, description=description, circuit=circuit,
            layout=layout, created_at=ahora, updated_at=ahora, tags=tags,
        )
        guardado = await self._repositorio.guardar(circuito)
        logger.info("Circuito creado: %s (%s componentes)", guardado.id, guardado.component_count)
        return guardado

    async def obtener(self, id_circuito: UUID) -> CircuitoGuardado:
        circuito = await self._repositorio.obtener(id_circuito)
        if circuito is None:
            raise CircuitoNoEncontradoError()
        return circuito

    async def listar(self) -> list[ResumenCircuito]:
        return await self._repositorio.listar(LIMITE_LISTADO)

    async def actualizar(self, id_circuito: UUID, name: str, description: str, circuit: dict,
                         layout: dict | None, tags: list[str]) -> CircuitoGuardado:
        actual = await self.obtener(id_circuito)
        # updated_at siempre avanza: si la edición cae en el mismo milisegundo, una simulación
        # empezada antes encontraría la misma fecha y guardaría un resultado viejo.
        updated_at = max(_ahora(), actual.updated_at + timedelta(milliseconds=1))
        # Un circuito editado invalida su última simulación.
        editado = replace(
            actual, name=name, description=description, circuit=circuit, layout=layout,
            tags=tags, updated_at=updated_at, last_simulation=None, simulated_at=None,
        )
        guardado = await self._repositorio.reemplazar(editado)
        if guardado is None:
            raise CircuitoNoEncontradoError()
        logger.info("Circuito actualizado: %s", id_circuito)
        return guardado

    async def eliminar(self, id_circuito: UUID) -> None:
        if not await self._repositorio.eliminar(id_circuito):
            raise CircuitoNoEncontradoError()
        logger.info("Circuito eliminado: %s", id_circuito)

    async def simular(self, id_circuito: UUID) -> CircuitoGuardado:
        circuito = await self.obtener(id_circuito)
        resultado = await self._simulador.simular(circuito.circuit)
        simulated_at = _ahora()
        if not await self._repositorio.guardar_simulacion(
            id_circuito, circuito.updated_at, resultado, simulated_at
        ):
            raise ModificacionConcurrenteError()
        logger.info("Circuito %s simulado en %s ms", id_circuito,
                    resultado.get("stats", {}).get("total_ms"))
        return replace(circuito, last_simulation=resultado, simulated_at=simulated_at)

    async def esta_sano(self) -> bool:
        return await self._repositorio.responde()
