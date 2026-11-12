"""Registro en Consul con un transporte simulado: sin red real."""
import json

import httpx
import pytest

from app.infrastructure.clients.consul_registry import TAGS, RegistroConsul


def _registro(handler):
    cliente = httpx.AsyncClient(base_url="http://consul:8500", transport=httpx.MockTransport(handler))
    esperas = []

    async def esperar(segundos):
        esperas.append(segundos)

    registro = RegistroConsul("http://consul:8500", cliente=cliente, ip="10.0.0.7",
                              id_instancia="circuit-service-a", esperar=esperar)
    return registro, esperas


async def test_registra_rutas_rate_limit_y_chequeo():
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200)

    registro, _ = _registro(handler)
    await registro.registrar()

    definicion = json.loads(pedidos[0].read())
    assert pedidos[0].url.path == "/v1/agent/service/register"
    assert definicion["ID"] == "circuit-service-a"
    assert definicion["Address"] == "10.0.0.7" and definicion["Port"] == 8000
    assert definicion["Check"]["HTTP"] == "http://10.0.0.7:8000/health"
    assert set(TAGS) <= set(definicion["Tags"])
    assert "traefik.http.middlewares.circuits-limit.ratelimit.average=50" in definicion["Tags"]
    assert "traefik.http.middlewares.circuits-limit.ratelimit.burst=100" in definicion["Tags"]


async def test_reintenta_si_consul_no_responde():
    intentos = {"n": 0}

    def handler(request):
        intentos["n"] += 1
        return httpx.Response(500) if intentos["n"] < 3 else httpx.Response(200)

    registro, esperas = _registro(handler)
    await registro.registrar()
    assert intentos["n"] == 3
    assert esperas == [1.0, 1.0]


async def test_falla_despues_de_agotar_los_intentos():
    registro, esperas = _registro(lambda r: httpx.Response(500))
    with pytest.raises(RuntimeError, match="circuit-service-a"):
        await registro.registrar()
    assert len(esperas) == 10


async def test_desregistrar_da_de_baja_y_cierra_el_cliente():
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200)

    registro, _ = _registro(handler)
    await registro.desregistrar()
    assert pedidos[0].url.path == "/v1/agent/service/deregister/circuit-service-a"
    assert registro._cliente.is_closed


async def test_desregistrar_no_falla_si_consul_no_responde():
    registro, _ = _registro(lambda r: httpx.Response(500))
    await registro.desregistrar()
    assert registro._cliente.is_closed
