"""Capa HTTP con el servicio real y puertos en memoria: valida contrato y códigos de error."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.application.interfaces.simulator import (
    CircuitoInvalidoError,
    RespuestaInvalidaError,
    SimuladorNoDisponibleError,
)
from app.application.services.circuit_service import ServicioCircuitos
from app.core import obtener_configuracion
from app.main import app
from app.presentation.routers.circuit_router import obtener_servicio
from tests.fakes import RepositorioEnMemoria, SimuladorFalso

CUERPO = {
    "name": "Divisor",
    "description": "12 V sobre 1k y 2k",
    "circuit": {"ground": "0", "components": [
        {"id": "V1", "type": "voltage_source", "a": "1", "b": "0", "value": 12},
        {"id": "R1", "type": "resistor", "a": "1", "b": "2", "value": "1k"},
        {"id": "R2", "type": "resistor", "a": "2", "b": "0", "value": "2k"},
        {"id": "W1", "type": "wire", "a": "2", "b": "3"},
    ]},
    "layout": {"zoom": 1.5, "posiciones": {"R1": [3, 4]}},
    "tags": [" divisor ", "dc"],
}


@pytest.fixture
def repositorio():
    return RepositorioEnMemoria()


@pytest.fixture
def simulador():
    return SimuladorFalso()


@pytest.fixture
def cliente(repositorio, simulador):
    servicio = ServicioCircuitos(repositorio, simulador)
    app.dependency_overrides[obtener_servicio] = lambda: servicio
    yield TestClient(app)
    app.dependency_overrides.clear()


def _crear(cliente, cuerpo=CUERPO):
    respuesta = cliente.post("/api/circuits", json=cuerpo)
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def test_crear_y_obtener(cliente):
    creado = _crear(cliente)

    assert creado["name"] == "Divisor"
    assert creado["component_count"] == 4
    assert creado["tags"] == ["divisor", "dc"]
    assert creado["layout"] == CUERPO["layout"]
    assert creado["last_simulation"] is None
    assert creado["circuit"]["components"][1]["value"] == "1k"
    assert creado["circuit"]["components"][3]["value"] is None
    assert cliente.get(f"/api/circuits/{creado['id']}").json() == creado


def test_listar_devuelve_resumenes_sin_netlist(cliente):
    creado = _crear(cliente)
    lista = cliente.get("/api/circuits").json()
    assert [c["id"] for c in lista] == [creado["id"]]
    assert "circuit" not in lista[0] and "layout" not in lista[0]
    assert lista[0]["component_count"] == 4


def test_actualizar_reemplaza_y_borra_la_simulacion(cliente):
    creado = _crear(cliente)
    cliente.post(f"/api/circuits/{creado['id']}/simulate")

    respuesta = cliente.put(f"/api/circuits/{creado['id']}",
                            json={**CUERPO, "name": "Otro", "layout": None})

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["name"] == "Otro" and datos["layout"] is None
    assert datos["last_simulation"] is None and datos["simulated_at"] is None


def test_eliminar(cliente):
    creado = _crear(cliente)
    assert cliente.delete(f"/api/circuits/{creado['id']}").status_code == 204
    assert cliente.get(f"/api/circuits/{creado['id']}").status_code == 404


@pytest.mark.parametrize("metodo,sufijo", [
    ("get", ""), ("put", ""), ("delete", ""), ("post", "/simulate"),
])
def test_inexistente_devuelve_404_con_codigo(cliente, metodo, sufijo):
    kwargs = {"json": CUERPO} if metodo == "put" else {}
    respuesta = getattr(cliente, metodo)(f"/api/circuits/{uuid.uuid4()}{sufijo}", **kwargs)
    assert respuesta.status_code == 404
    assert respuesta.json()["detail"]["code"] == "not_found"


def test_id_que_no_es_uuid(cliente):
    assert cliente.get("/api/circuits/no-es-un-uuid").status_code == 422


def test_simular_guarda_y_devuelve_el_resultado(cliente, simulador):
    creado = _crear(cliente)

    respuesta = cliente.post(f"/api/circuits/{creado['id']}/simulate")

    assert respuesta.status_code == 200
    assert respuesta.json()["last_simulation"] == simulador.resultado
    assert respuesta.json()["simulated_at"] is not None
    assert simulador.recibidos == [creado["circuit"]]
    guardado = cliente.get(f"/api/circuits/{creado['id']}").json()
    assert guardado["last_simulation"] == simulador.resultado


def test_simular_con_edicion_concurrente_devuelve_409(cliente, repositorio):
    creado = _crear(cliente)

    async def editar():
        cliente.put(f"/api/circuits/{creado['id']}", json={**CUERPO, "name": "Editado"})

    repositorio.antes_de_guardar_simulacion = editar
    respuesta = cliente.post(f"/api/circuits/{creado['id']}/simulate")
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"]["code"] == "concurrent_modification"


@pytest.mark.parametrize("error,estado,codigo,headers", [
    (CircuitoInvalidoError("floating_nodes", "Nodos sin tierra", {"nodes": ["3"]}),
     422, "floating_nodes", {}),
    (CircuitoInvalidoError("too_large", "Muy grande"), 413, "too_large", {}),
    (SimuladorNoDisponibleError("Saturado", retry_after="2"), 503, "simulator_unavailable",
     {"retry-after": "2"}),
    (SimuladorNoDisponibleError("Caído"), 503, "simulator_unavailable", {}),
    (RespuestaInvalidaError("Basura"), 502, "simulator_bad_response", {}),
])
def test_errores_del_simulador(cliente, simulador, error, estado, codigo, headers):
    creado = _crear(cliente)
    simulador.error = error

    respuesta = cliente.post(f"/api/circuits/{creado['id']}/simulate")

    assert respuesta.status_code == estado
    detalle = respuesta.json()["detail"]
    assert detalle["code"] == codigo
    assert detalle["message"] == str(error)
    if isinstance(error, CircuitoInvalidoError):
        assert detalle["details"] == error.detalles
    for clave, valor in headers.items():
        assert respuesta.headers[clave] == valor
    if not headers:
        assert "retry-after" not in respuesta.headers


@pytest.mark.parametrize("cambio", [
    {"name": ""},
    {"name": "   "},
    {"name": "x" * 121},
    {"circuit": {"ground": "0", "components": [{"id": "R1", "type": "capacitor", "a": "1", "b": "0"}]}},
    {"circuit": {"ground": "0", "components": [{"id": "R1", "type": "resistor", "a": "$x", "b": "0"}]}},
    {"circuit": {"ground": "", "components": []}},
    {"tags": ["x"] * 21},
    {"layout": [1, 2]},
])
def test_cuerpos_invalidos_dan_422(cliente, cambio):
    assert cliente.post("/api/circuits", json={**CUERPO, **cambio}).status_code == 422


def test_se_puede_guardar_un_circuito_vacio(cliente):
    creado = _crear(cliente, {"name": "Borrador", "circuit": {"components": []}})
    assert creado["component_count"] == 0
    assert creado["circuit"]["ground"] == "0"
    assert creado["tags"] == [] and creado["layout"] is None


def test_circuito_demasiado_grande_da_413(cliente, monkeypatch):
    monkeypatch.setenv("MAX_COMPONENTS", "3")
    obtener_configuracion.cache_clear()
    try:
        respuesta = cliente.post("/api/circuits", json=CUERPO)
    finally:
        obtener_configuracion.cache_clear()
    assert respuesta.status_code == 413
    assert respuesta.json()["detail"]["code"] == "too_large"


def test_health_sano(cliente):
    assert cliente.get("/health").json() == {"status": "healthy"}


def test_health_sin_mongo_da_503(cliente, repositorio):
    repositorio.sano = False
    respuesta = cliente.get("/health")
    assert respuesta.status_code == 503
    assert respuesta.json() == {"status": "unhealthy"}
