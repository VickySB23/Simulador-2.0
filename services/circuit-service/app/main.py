"""Ensamblado de la aplicación."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pymongo import AsyncMongoClient

from app.application.services.circuit_service import ServicioCircuitos
from app.core import obtener_configuracion
from app.core.logger import logger
from app.infrastructure.clients.consul_registry import RegistroConsul
from app.infrastructure.clients.http_simulator import SimuladorHttp
from app.infrastructure.repositories.mongo_repository import RepositorioMongo, crear_cliente_mongo
from app.presentation.routers.circuit_router import router as circuit_router
from app.presentation.routers.health_router import router as health_router


def crear_servicios() -> tuple[ServicioCircuitos, AsyncMongoClient, SimuladorHttp, RepositorioMongo]:
    """Crea los servicios y les inyecta sus dependencias de infraestructura."""
    configuracion = obtener_configuracion()
    # La URI puede tener usuario y contraseña: no se registra en el log.
    logger.info("Conectando a MongoDB (base: %s)", configuracion.mongo_db_name)
    cliente_mongo = crear_cliente_mongo(configuracion.mongo_uri)
    repositorio = RepositorioMongo(cliente_mongo[configuracion.mongo_db_name])
    simulador = SimuladorHttp(
        configuracion.simulation_url, timeout=configuracion.simulation_timeout_seconds
    )
    logger.info("Simulador en %s", configuracion.simulation_url)
    return ServicioCircuitos(repositorio, simulador), cliente_mongo, simulador, repositorio


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    """Arranque y apagado: índices, registro en Consul y cierre de conexiones."""
    servicio, cliente_mongo, simulador, repositorio = crear_servicios()
    app.state.servicio_circuitos = servicio
    consul_url = obtener_configuracion().consul_url
    registro = RegistroConsul(consul_url) if consul_url else None
    try:
        await repositorio.asegurar_indices()
        if registro:
            await registro.registrar()
        yield
    finally:
        if registro:
            await registro.desregistrar()
        await simulador.cerrar()
        await cliente_mongo.close()
        logger.info("circuit-service apagado.")


app = FastAPI(
    title="circuit-service",
    version="1.0.0",
    description="Circuitos guardados en MongoDB; delega la simulación en simulation-service.",
    lifespan=ciclo_de_vida,
)
app.include_router(health_router)
app.include_router(circuit_router)
