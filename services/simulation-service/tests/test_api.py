"""Pruebas HTTP de POST /simulate y /health."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.application import simulation_service
from app.core import config
from app.main import app

client = TestClient(app)

DIVISOR = {
    "components": [
        {"id": "V1", "type": "voltage_source", "a": "1", "b": "0", "value": 12},
        {"id": "R1", "type": "resistor", "a": "1", "b": "2", "value": "1k"},
        {"id": "R2", "type": "resistor", "a": "2", "b": "0", "value": "2k"},
    ]
}


def test_health():
    assert client.get("/health").json() == {"status": "healthy"}


def test_simulate_ok():
    res = client.post("/simulate", json=DIVISOR)
    assert res.status_code == 200
    body = res.json()
    assert body["node_voltages"]["2"] == pytest.approx(8.0)
    assert body["power"]["ok"] is True
    assert {c["id"] for c in body["components"]} == {"V1", "R1", "R2"}
    assert body["stats"]["solver"] == "dense"


def test_cable_devuelve_corriente_nula():
    circuit = {"components": DIVISOR["components"] + [{"id": "W1", "type": "wire", "a": "2", "b": "3"}]}
    body = client.post("/simulate", json=circuit).json()
    wire = next(c for c in body["components"] if c["id"] == "W1")
    assert wire["current"] is None and body["node_voltages"]["3"] == pytest.approx(8.0)


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"id": "R3", "type": "resistor", "a": "7", "b": "8", "value": 10}, "floating_nodes"),
        ({"id": "V2", "type": "voltage_source", "a": "1", "b": "0", "value": 5}, "voltage_source_loop"),
        ({"id": "R3", "type": "resistor", "a": "1", "b": "0", "value": "1x"}, "invalid_component"),
        ({"id": "R3", "type": "resistor", "a": "1", "b": "0"}, "invalid_component"),
        ({"id": "R3", "type": "resistor", "a": "1", "b": "0", "value": 0}, "invalid_component"),
    ],
)
def test_errores_con_codigo(change, code):
    res = client.post("/simulate", json={"components": DIVISOR["components"] + [change]})
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == code


def test_tipo_desconocido_lo_rechaza_pydantic():
    res = client.post("/simulate", json={"components": [{"id": "X", "type": "capacitor", "a": "1", "b": "0"}]})
    assert res.status_code == 422


def test_circuito_demasiado_grande(monkeypatch):
    monkeypatch.setattr(config, "MAX_COMPONENTS", 2)
    res = client.post("/simulate", json=DIVISOR)
    assert res.status_code == 413
    assert res.json()["detail"]["code"] == "too_large"


def test_saturado_responde_503_con_retry_after(monkeypatch):
    monkeypatch.setattr(config, "QUEUE_TIMEOUT_SECONDS", 0.05)
    lleno = asyncio.Semaphore(0)
    monkeypatch.setattr(simulation_service, "_CUPO", lleno)
    res = client.post("/simulate", json=DIVISOR)
    assert res.status_code == 503
    assert res.headers["retry-after"] == str(config.RETRY_AFTER_SECONDS)
    assert res.json()["detail"]["code"] == "overloaded"
