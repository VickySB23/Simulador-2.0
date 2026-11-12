"""Casos de uso con repositorio y simulador en memoria."""
import uuid
from datetime import UTC, timedelta

import pytest

from app.application.interfaces.simulator import CircuitoInvalidoError
from app.application.services.circuit_service import (
    CircuitoNoEncontradoError,
    ModificacionConcurrenteError,
    ServicioCircuitos,
)
from tests.fakes import RepositorioEnMemoria, SimuladorFalso

NETLIST = {"ground": "0", "components": [
    {"id": "V1", "type": "voltage_source", "a": "1", "b": "0", "value": 5},
    {"id": "R1", "type": "resistor", "a": "1", "b": "0", "value": 100},
]}


@pytest.fixture
def repositorio():
    return RepositorioEnMemoria()


@pytest.fixture
def simulador():
    return SimuladorFalso()


@pytest.fixture
def servicio(repositorio, simulador):
    return ServicioCircuitos(repositorio, simulador)


async def _crear(servicio, name="Divisor"):
    return await servicio.crear(name, "", NETLIST, {"zoom": 2}, ["dc"])


async def test_crear_asigna_id_y_fechas_utc(servicio):
    creado = await _crear(servicio)
    assert isinstance(creado.id, uuid.UUID)
    assert creado.created_at == creado.updated_at
    assert creado.created_at.tzinfo is UTC
    assert creado.component_count == 2
    assert creado.last_simulation is None


async def test_obtener_inexistente(servicio):
    with pytest.raises(CircuitoNoEncontradoError):
        await servicio.obtener(uuid.uuid4())


async def test_actualizar_borra_la_ultima_simulacion(servicio):
    creado = await _crear(servicio)
    await servicio.simular(creado.id)

    editado = await servicio.actualizar(creado.id, "Nuevo", "desc", NETLIST, None, [])

    assert editado.name == "Nuevo"
    assert editado.layout is None
    assert editado.last_simulation is None and editado.simulated_at is None
    assert editado.updated_at > creado.updated_at
    assert editado.created_at == creado.created_at


async def test_actualizar_inexistente(servicio):
    with pytest.raises(CircuitoNoEncontradoError):
        await servicio.actualizar(uuid.uuid4(), "x", "", NETLIST, None, [])


async def test_eliminar(servicio, repositorio):
    creado = await _crear(servicio)
    await servicio.eliminar(creado.id)
    assert repositorio.circuitos == {}
    with pytest.raises(CircuitoNoEncontradoError):
        await servicio.eliminar(creado.id)


async def test_listar_devuelve_resumenes(servicio, repositorio):
    viejo = await _crear(servicio, "Viejo")
    repositorio.circuitos[viejo.id].updated_at -= timedelta(minutes=1)
    nuevo = await _crear(servicio, "Nuevo")
    assert [r.id for r in await servicio.listar()] == [nuevo.id, viejo.id]


async def test_simular_envia_la_netlist_y_guarda_el_resultado(servicio, repositorio, simulador):
    creado = await _crear(servicio)

    simulado = await servicio.simular(creado.id)

    assert simulador.recibidos == [NETLIST]
    assert simulado.last_simulation == simulador.resultado
    assert repositorio.circuitos[creado.id].last_simulation == simulador.resultado
    assert repositorio.circuitos[creado.id].simulated_at == simulado.simulated_at


async def test_las_fechas_tienen_la_precision_de_la_base(servicio):
    """Lo que devuelve simular() tiene que coincidir con lo que después se lee de Mongo."""
    creado = await _crear(servicio)
    simulado = await servicio.simular(creado.id)
    editado = await servicio.actualizar(creado.id, "x", "", NETLIST, None, [])
    for fecha in (creado.created_at, simulado.simulated_at, editado.updated_at):
        assert fecha.microsecond % 1000 == 0


async def test_editar_en_el_mismo_milisegundo_igual_avanza_updated_at(servicio, monkeypatch):
    creado = await _crear(servicio)
    monkeypatch.setattr("app.application.services.circuit_service._ahora",
                        lambda: creado.updated_at)
    editado = await servicio.actualizar(creado.id, "x", "", NETLIST, None, [])
    assert editado.updated_at == creado.updated_at + timedelta(milliseconds=1)


async def test_simular_detecta_una_edicion_concurrente(servicio, repositorio):
    creado = await _crear(servicio)

    async def editar_en_el_medio():
        await servicio.actualizar(creado.id, "Editado", "", NETLIST, None, [])

    repositorio.antes_de_guardar_simulacion = editar_en_el_medio
    with pytest.raises(ModificacionConcurrenteError):
        await servicio.simular(creado.id)
    assert repositorio.circuitos[creado.id].last_simulation is None


async def test_simular_inexistente_no_llama_al_simulador(servicio, simulador):
    with pytest.raises(CircuitoNoEncontradoError):
        await servicio.simular(uuid.uuid4())
    assert simulador.recibidos == []


async def test_simular_propaga_los_errores_del_simulador(repositorio):
    error = CircuitoInvalidoError("floating_nodes", "Nodos flotantes", {"nodes": ["3"]})
    servicio = ServicioCircuitos(repositorio, SimuladorFalso(error=error))
    creado = await _crear(servicio)
    with pytest.raises(CircuitoInvalidoError):
        await servicio.simular(creado.id)
    assert repositorio.circuitos[creado.id].last_simulation is None


async def test_esta_sano_consulta_el_repositorio(servicio, repositorio):
    assert await servicio.esta_sano() is True
    repositorio.sano = False
    assert await servicio.esta_sano() is False
