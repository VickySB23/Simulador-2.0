"""Dobles de prueba en memoria para los puertos de la capa de aplicación."""
from dataclasses import replace
from datetime import datetime
from uuid import UUID

from app.application.interfaces.circuit_repository import CircuitoGuardado, ResumenCircuito


class RepositorioEnMemoria:
    def __init__(self):
        self.circuitos: dict[UUID, CircuitoGuardado] = {}
        self.sano = True
        # Permite simular que otro pedido edita el circuito mientras se simula.
        self.antes_de_guardar_simulacion = None

    async def asegurar_indices(self) -> None:
        pass

    async def guardar(self, circuito: CircuitoGuardado) -> CircuitoGuardado:
        self.circuitos[circuito.id] = circuito
        return circuito

    async def obtener(self, id_circuito: UUID) -> CircuitoGuardado | None:
        return self.circuitos.get(id_circuito)

    async def listar(self, limite: int) -> list[ResumenCircuito]:
        ordenados = sorted(self.circuitos.values(), key=lambda c: c.updated_at, reverse=True)
        return [
            ResumenCircuito(c.id, c.name, c.description, c.tags, c.component_count,
                            c.created_at, c.updated_at, c.simulated_at)
            for c in ordenados[:limite]
        ]

    async def reemplazar(self, circuito: CircuitoGuardado) -> CircuitoGuardado | None:
        if circuito.id not in self.circuitos:
            return None
        self.circuitos[circuito.id] = circuito
        return circuito

    async def eliminar(self, id_circuito: UUID) -> bool:
        return self.circuitos.pop(id_circuito, None) is not None

    async def guardar_simulacion(self, id_circuito: UUID, updated_at_esperado: datetime,
                                 resultado: dict, simulated_at: datetime) -> bool:
        if self.antes_de_guardar_simulacion:
            await self.antes_de_guardar_simulacion()
        actual = self.circuitos.get(id_circuito)
        if actual is None or actual.updated_at != updated_at_esperado:
            return False
        self.circuitos[id_circuito] = replace(
            actual, last_simulation=resultado, simulated_at=simulated_at
        )
        return True

    async def responde(self) -> bool:
        return self.sano


class SimuladorFalso:
    def __init__(self, resultado: dict | None = None, error: Exception | None = None):
        self.resultado = resultado or {"node_voltages": {"0": 0.0}, "stats": {"total_ms": 1.0}}
        self.error = error
        self.recibidos: list[dict] = []

    async def simular(self, circuito: dict) -> dict:
        self.recibidos.append(circuito)
        if self.error:
            raise self.error
        return self.resultado

    async def cerrar(self) -> None:
        pass
