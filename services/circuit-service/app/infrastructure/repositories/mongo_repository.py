"""Repositorio de circuitos en MongoDB.

Fechas: BSON guarda milisegundos y PyMongo sin `tz_aware` devuelve fechas sin zona horaria.
Por eso el cliente se crea siempre con `tz_aware=True` y cada fecha se trunca a milisegundos
antes de guardarla: así la fecha que devuelve el repositorio es idéntica a la guardada y el
filtro por `updated_at` de `guardar_simulacion` encuentra el documento.
"""
import asyncio
import uuid
from datetime import UTC, datetime

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.application.interfaces.circuit_repository import CircuitoGuardado, ResumenCircuito

COLECCION = "circuits"
_TIMEOUT_PING_SEGUNDOS = 2.0


def crear_cliente_mongo(uri: str, **opciones) -> AsyncMongoClient:
    """Único lugar donde se crea el cliente: garantiza `tz_aware=True` y UTC."""
    return AsyncMongoClient(uri, tz_aware=True, tzinfo=UTC, **opciones)


def truncar_a_milisegundos(fecha: datetime) -> datetime:
    """Deja la fecha con la precisión de BSON. Una fecha sin zona se toma como UTC."""
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=UTC)
    return fecha.astimezone(UTC).replace(microsecond=fecha.microsecond // 1000 * 1000)


def _truncar_opcional(fecha: datetime | None) -> datetime | None:
    return None if fecha is None else truncar_a_milisegundos(fecha)


class RepositorioMongo:
    def __init__(self, db: AsyncDatabase):
        if not db.codec_options.tz_aware:
            raise ValueError("El cliente de MongoDB debe crearse con tz_aware=True.")
        self._coleccion = db[COLECCION]
        self._db = db

    async def asegurar_indices(self) -> None:
        # El listado ordena por fecha de modificación.
        await self._coleccion.create_index([("updated_at", DESCENDING)])
        await self._coleccion.create_index([("tags", ASCENDING)])

    async def guardar(self, circuito: CircuitoGuardado) -> CircuitoGuardado:
        documento = self._a_documento(circuito)
        await self._coleccion.insert_one(documento)
        return self._a_circuito(documento)

    async def obtener(self, id_circuito: uuid.UUID) -> CircuitoGuardado | None:
        documento = await self._coleccion.find_one({"_id": str(id_circuito)})
        return self._a_circuito(documento) if documento else None

    async def listar(self, limite: int) -> list[ResumenCircuito]:
        # Se cuenta en el servidor para no traer netlists de miles de componentes.
        cursor = await self._coleccion.aggregate([
            {"$sort": {"updated_at": DESCENDING}},
            {"$limit": limite},
            {"$project": {
                "name": 1, "description": 1, "tags": 1, "created_at": 1, "updated_at": 1,
                "simulated_at": 1,
                "component_count": {"$size": {"$ifNull": ["$circuit.components", []]}},
            }},
        ])
        return [
            ResumenCircuito(
                id=uuid.UUID(doc["_id"]),
                name=doc["name"],
                description=doc.get("description", ""),
                tags=doc.get("tags", []),
                component_count=doc["component_count"],
                created_at=doc["created_at"],
                updated_at=doc["updated_at"],
                simulated_at=doc.get("simulated_at"),
            )
            async for doc in cursor
        ]

    async def reemplazar(self, circuito: CircuitoGuardado) -> CircuitoGuardado | None:
        documento = self._a_documento(circuito)
        resultado = await self._coleccion.find_one_and_replace(
            {"_id": documento["_id"]}, documento, return_document=ReturnDocument.AFTER
        )
        return self._a_circuito(resultado) if resultado else None

    async def eliminar(self, id_circuito: uuid.UUID) -> bool:
        resultado = await self._coleccion.delete_one({"_id": str(id_circuito)})
        return resultado.deleted_count > 0

    async def guardar_simulacion(
        self, id_circuito: uuid.UUID, updated_at_esperado: datetime, resultado: dict,
        simulated_at: datetime,
    ) -> bool:
        respuesta = await self._coleccion.update_one(
            {"_id": str(id_circuito), "updated_at": truncar_a_milisegundos(updated_at_esperado)},
            {"$set": {
                "last_simulation": resultado,
                "simulated_at": truncar_a_milisegundos(simulated_at),
            }},
        )
        return respuesta.matched_count == 1

    async def responde(self) -> bool:
        # Sin el límite, con Mongo caído el ping espera la selección de servidor (30 s) y
        # supera el timeout de 3 s del chequeo de Consul.
        try:
            await asyncio.wait_for(self._db.command("ping"), timeout=_TIMEOUT_PING_SEGUNDOS)
        except Exception:
            return False
        return True

    @staticmethod
    def _a_documento(circuito: CircuitoGuardado) -> dict:
        return {
            "_id": str(circuito.id),
            "name": circuito.name,
            "description": circuito.description,
            "circuit": circuito.circuit,
            "layout": circuito.layout,
            "tags": list(circuito.tags),
            "created_at": truncar_a_milisegundos(circuito.created_at),
            "updated_at": truncar_a_milisegundos(circuito.updated_at),
            "last_simulation": circuito.last_simulation,
            "simulated_at": _truncar_opcional(circuito.simulated_at),
        }

    @staticmethod
    def _a_circuito(documento: dict) -> CircuitoGuardado:
        return CircuitoGuardado(
            id=uuid.UUID(documento["_id"]),
            name=documento["name"],
            description=documento.get("description", ""),
            circuit=documento["circuit"],
            layout=documento.get("layout"),
            created_at=documento["created_at"],
            updated_at=documento["updated_at"],
            last_simulation=documento.get("last_simulation"),
            simulated_at=documento.get("simulated_at"),
            tags=documento.get("tags", []),
        )
