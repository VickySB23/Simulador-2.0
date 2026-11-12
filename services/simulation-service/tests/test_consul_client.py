"""Registro en Consul con un transporte simulado: sin red real."""
import asyncio

import httpx
import pytest

from app.infrastructure.consul_client import TAGS, RegistroConsul


def _registro(handler):
    cliente = httpx.AsyncClient(base_url="http://consul:8500", transport=httpx.MockTransport(handler))
    esperas = []

    async def esperar(segundos):
        esperas.append(segundos)

    return RegistroConsul(cliente, "10.0.0.5", "simulation-service-a", esperar), esperas


def test_registra_rutas_y_chequeo():
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200)

    registro, _ = _registro(handler)
    asyncio.run(registro.registrar())
    cuerpo = pedidos[0].read().decode()
    assert pedidos[0].url.path == "/v1/agent/service/register"
    assert "Path(`/simulate`)" in cuerpo and "http://10.0.0.5:8001/health" in cuerpo
    assert all(tag.split("=")[0] in cuerpo for tag in TAGS)


def test_reintenta_si_consul_no_responde():
    intentos = {"n": 0}

    def handler(request):
        intentos["n"] += 1
        return httpx.Response(500) if intentos["n"] < 3 else httpx.Response(200)

    registro, esperas = _registro(handler)
    asyncio.run(registro.registrar())
    assert intentos["n"] == 3 and len(esperas) == 2


def test_falla_si_consul_nunca_responde():
    registro, _ = _registro(lambda request: httpx.Response(500))
    with pytest.raises(RuntimeError):
        asyncio.run(registro.registrar())
