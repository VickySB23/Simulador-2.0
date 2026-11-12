"""Ensamblado de la aplicación."""
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app.core import config
from app.infrastructure.consul_client import crear_registro
from app.presentation.health_router import router as health_router
from app.presentation.simulate_router import router as simulate_router


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI):
    if config.CONSUL_URL is None:
        yield
        return
    async with httpx.AsyncClient(base_url=config.CONSUL_URL, timeout=5.0) as cliente:
        registro = crear_registro(cliente, config.CONSUL_URL)
        await registro.registrar()
        try:
            yield
        finally:
            await registro.desregistrar()


app = FastAPI(
    title="simulation-service",
    version="1.0.0",
    description="Simulador DC sin estado: recibe un circuito y devuelve tensiones, corrientes y potencias (MNA).",
    lifespan=ciclo_de_vida,
)
app.include_router(health_router)
app.include_router(simulate_router)
