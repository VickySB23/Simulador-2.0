"""Ensamblado real de la aplicación, sin reemplazar dependencias."""
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI

from app.application.services.circuit_service import ServicioCircuitos
from app.core import obtener_configuracion
from app.infrastructure.clients.consul_registry import RegistroConsul
from app.infrastructure.repositories.mongo_repository import RepositorioMongo
from app.main import ciclo_de_vida, crear_servicios


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    monkeypatch.setenv("SIMULATION_URL", "http://traefik-test:8080")
    monkeypatch.setenv("SIMULATION_TIMEOUT_SECONDS", "7")
    monkeypatch.delenv("CONSUL_URL", raising=False)
    obtener_configuracion.cache_clear()
    yield
    obtener_configuracion.cache_clear()


async def test_crear_servicios_usa_la_configuracion():
    servicio, cliente_mongo, simulador, repositorio = crear_servicios()
    try:
        assert isinstance(servicio, ServicioCircuitos)
        assert isinstance(repositorio, RepositorioMongo)
        assert cliente_mongo.codec_options.tz_aware is True
        assert str(simulador._cliente.base_url) == "http://traefik-test:8080"
        assert simulador._cliente.timeout.read == 7
    finally:
        await cliente_mongo.close()
        await simulador.cerrar()


async def test_la_uri_de_mongo_no_se_registra(monkeypatch, caplog):
    monkeypatch.setenv("MONGO_URI", "mongodb://usuario:secreto@db:27017")
    obtener_configuracion.cache_clear()

    _, cliente_mongo, simulador, _ = crear_servicios()

    await cliente_mongo.close()
    await simulador.cerrar()
    assert "secreto" not in caplog.text


async def test_ciclo_de_vida_prepara_indices_y_cierra_conexiones(monkeypatch):
    asegurar_indices = AsyncMock()
    monkeypatch.setattr(RepositorioMongo, "asegurar_indices", asegurar_indices)
    app = FastAPI()

    async with ciclo_de_vida(app):
        asegurar_indices.assert_awaited_once()
        cliente_http = app.state.servicio_circuitos._simulador._cliente
        assert not cliente_http.is_closed

    assert cliente_http.is_closed


async def test_ciclo_de_vida_se_registra_en_consul_si_hay_url(monkeypatch):
    monkeypatch.setenv("CONSUL_URL", "http://consul:8500")
    obtener_configuracion.cache_clear()
    monkeypatch.setattr(RepositorioMongo, "asegurar_indices", AsyncMock())
    monkeypatch.setattr(RegistroConsul, "__init__", lambda self, url: None)
    registrar, desregistrar = AsyncMock(), AsyncMock()
    monkeypatch.setattr(RegistroConsul, "registrar", registrar)
    monkeypatch.setattr(RegistroConsul, "desregistrar", desregistrar)

    async with ciclo_de_vida(FastAPI()):
        registrar.assert_awaited_once()
        desregistrar.assert_not_awaited()

    desregistrar.assert_awaited_once()
