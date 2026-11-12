"""Cliente HTTP del simulador con un transporte simulado: sin red real."""
import httpx
import pytest

from app.application.interfaces.simulator import (
    CircuitoInvalidoError,
    RespuestaInvalidaError,
    SimuladorNoDisponibleError,
)
from app.infrastructure.clients.http_simulator import SimuladorHttp

RESULTADO = {"node_voltages": {"1": 5.0}, "components": [], "power": {},
             "kcl_max_residual": 0.0, "stats": {}}
NETLIST = {"ground": "0", "components": []}


def _simulador(handler):
    pedidos, esperas = [], []

    def registrar(request):
        pedidos.append(request)
        return handler(request)

    async def esperar(segundos):
        esperas.append(segundos)

    cliente = httpx.AsyncClient(base_url="http://traefik", transport=httpx.MockTransport(registrar))
    return SimuladorHttp("http://traefik", cliente=cliente, esperar=esperar), pedidos, esperas


def _error(estado, codigo, mensaje="m", detalles=None, headers=None):
    return httpx.Response(
        estado, headers=headers,
        json={"detail": {"code": codigo, "message": mensaje, "details": detalles or {}}},
    )


async def test_devuelve_el_resultado_y_envia_la_netlist():
    simulador, pedidos, _ = _simulador(lambda r: httpx.Response(200, json=RESULTADO))
    assert await simulador.simular(NETLIST) == RESULTADO
    assert pedidos[0].url.path == "/simulate"
    assert pedidos[0].read() == httpx.Request("POST", "/", json=NETLIST).read()


async def test_error_de_circuito_conserva_codigo_y_detalles():
    simulador, pedidos, _ = _simulador(
        lambda r: _error(422, "floating_nodes", "Nodos sin tierra", {"nodes": ["3", "4"]})
    )
    with pytest.raises(CircuitoInvalidoError) as exc:
        await simulador.simular(NETLIST)
    assert exc.value.codigo == "floating_nodes"
    assert exc.value.detalles == {"nodes": ["3", "4"]}
    assert str(exc.value) == "Nodos sin tierra"
    assert len(pedidos) == 1


async def test_circuito_demasiado_grande():
    simulador, _, _ = _simulador(lambda r: _error(413, "too_large"))
    with pytest.raises(CircuitoInvalidoError) as exc:
        await simulador.simular(NETLIST)
    assert exc.value.codigo == "too_large"


async def test_422_de_validacion_de_fastapi():
    simulador, _, _ = _simulador(lambda r: httpx.Response(422, json={"detail": [{"loc": []}]}))
    with pytest.raises(CircuitoInvalidoError) as exc:
        await simulador.simular(NETLIST)
    assert exc.value.codigo == "invalid_schema"


async def test_503_por_cola_llena_no_se_reintenta_y_conserva_retry_after():
    simulador, pedidos, _ = _simulador(
        lambda r: _error(503, "overloaded", headers={"Retry-After": "2"})
    )
    with pytest.raises(SimuladorNoDisponibleError) as exc:
        await simulador.simular(NETLIST)
    assert exc.value.retry_after == "2"
    assert len(pedidos) == 1


@pytest.mark.parametrize("estado", [429, 502, 504])
async def test_reintenta_estados_transitorios_con_espera_exponencial(estado):
    respuestas = iter([httpx.Response(estado), httpx.Response(estado),
                       httpx.Response(200, json=RESULTADO)])
    simulador, pedidos, esperas = _simulador(lambda r: next(respuestas))
    assert await simulador.simular(NETLIST) == RESULTADO
    assert len(pedidos) == 3
    assert esperas == [0.5, 1.0]


async def test_429_persistente_es_saturacion():
    simulador, pedidos, _ = _simulador(lambda r: httpx.Response(429, headers={"Retry-After": "1"}))
    with pytest.raises(SimuladorNoDisponibleError) as exc:
        await simulador.simular(NETLIST)
    assert exc.value.retry_after == "1"
    assert len(pedidos) == 3


async def test_reintenta_errores_de_conexion():
    intentos = {"n": 0}

    def handler(request):
        intentos["n"] += 1
        if intentos["n"] < 3:
            raise httpx.ConnectError("sin conexión", request=request)
        return httpx.Response(200, json=RESULTADO)

    simulador, _, _ = _simulador(handler)
    assert await simulador.simular(NETLIST) == RESULTADO


async def test_conexion_caida_siempre():
    def handler(request):
        raise httpx.ConnectError("sin conexión", request=request)

    simulador, pedidos, _ = _simulador(handler)
    with pytest.raises(SimuladorNoDisponibleError):
        await simulador.simular(NETLIST)
    assert len(pedidos) == 3


async def test_timeout_no_se_reintenta():
    def handler(request):
        raise httpx.ReadTimeout("lento", request=request)

    simulador, pedidos, _ = _simulador(handler)
    with pytest.raises(SimuladorNoDisponibleError):
        await simulador.simular(NETLIST)
    assert len(pedidos) == 1


async def test_500_es_no_disponible():
    simulador, _, _ = _simulador(lambda r: httpx.Response(500, text="boom"))
    with pytest.raises(SimuladorNoDisponibleError):
        await simulador.simular(NETLIST)


@pytest.mark.parametrize("respuesta", [
    httpx.Response(200, text="no es json"),
    httpx.Response(200, json=[1, 2]),
    httpx.Response(200, json={"node_voltages": {}}),
    httpx.Response(404, json={"detail": "Not Found"}),
])
async def test_respuestas_fuera_de_contrato(respuesta):
    simulador, _, _ = _simulador(lambda r: respuesta)
    with pytest.raises(RespuestaInvalidaError):
        await simulador.simular(NETLIST)


async def test_cerrar_cierra_el_cliente():
    simulador, _, _ = _simulador(lambda r: httpx.Response(200, json=RESULTADO))
    await simulador.cerrar()
    assert simulador._cliente.is_closed
