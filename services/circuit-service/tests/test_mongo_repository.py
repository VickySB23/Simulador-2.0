"""Repositorio contra un MongoDB real: el redondeo de fechas solo se ve con un servidor de verdad.

Usa MONGO_TEST_URI (por defecto mongodb://localhost:27017). Si no hay servidor, los tests de
integración se saltean, salvo con MONGO_TEST_REQUIRED=1 (CI). Para levantar uno:
    docker run -d --rm --name mongo-test -p 27017:27017 mongo:8
"""
import os
import time
import uuid
from datetime import UTC, datetime, timedelta, timezone

import pytest
from pymongo import AsyncMongoClient

from app.application.interfaces.circuit_repository import CircuitoGuardado
from app.infrastructure.repositories.mongo_repository import (
    RepositorioMongo,
    crear_cliente_mongo,
    truncar_a_milisegundos,
)

MONGO_TEST_URI = os.getenv("MONGO_TEST_URI", "mongodb://localhost:27017")
# En CI vale 1: si falta Mongo, los tests fallan en vez de saltearse en silencio.
MONGO_TEST_REQUIRED = os.getenv("MONGO_TEST_REQUIRED") == "1"
# Una fecha con microsegundos que BSON no puede guardar.
FECHA_CON_MICROSEGUNDOS = datetime(2026, 11, 12, 15, 30, 45, 123456, tzinfo=UTC)

NETLIST = {
    "ground": "0",
    "components": [
        {"id": "V1", "type": "voltage_source", "a": "1", "b": "0", "value": 12.0},
        {"id": "R1", "type": "resistor", "a": "1", "b": "0", "value": "1k"},
    ],
}


def _circuito(**cambios) -> CircuitoGuardado:
    datos = dict(
        id=uuid.uuid4(), name="Divisor", description="", circuit=NETLIST,
        layout={"zoom": 1, "posiciones": {"R1": [3, 4]}},
        created_at=FECHA_CON_MICROSEGUNDOS, updated_at=FECHA_CON_MICROSEGUNDOS, tags=["dc"],
    )
    datos.update(cambios)
    return CircuitoGuardado(**datos)


@pytest.fixture
async def repositorio():
    cliente = crear_cliente_mongo(MONGO_TEST_URI, serverSelectionTimeoutMS=1500)
    try:
        await cliente.admin.command("ping")
    except Exception:
        await cliente.close()
        if MONGO_TEST_REQUIRED:
            pytest.fail(f"MONGO_TEST_REQUIRED está activo y no hay MongoDB en {MONGO_TEST_URI}")
        pytest.skip(f"No hay MongoDB en {MONGO_TEST_URI}")
    nombre_db = f"test_circuits_{uuid.uuid4().hex[:8]}"
    repo = RepositorioMongo(cliente[nombre_db])
    await repo.asegurar_indices()
    yield repo
    await cliente.drop_database(nombre_db)
    await cliente.close()


# --- Sin servidor ---------------------------------------------------------------------------

def test_truncar_a_milisegundos_descarta_los_microsegundos():
    assert truncar_a_milisegundos(FECHA_CON_MICROSEGUNDOS).microsecond == 123000


def test_truncar_a_milisegundos_pasa_a_utc_y_completa_la_zona():
    gmt_menos_3 = timezone(timedelta(hours=-3))
    local = datetime(2026, 11, 12, 12, 0, 0, 999999, tzinfo=gmt_menos_3)
    assert truncar_a_milisegundos(local) == datetime(2026, 11, 12, 15, 0, 0, 999000, tzinfo=UTC)
    sin_zona = datetime(2026, 11, 12, 15, 0, 0, 1500)
    assert truncar_a_milisegundos(sin_zona).tzinfo is UTC


def test_el_repositorio_exige_un_cliente_tz_aware():
    cliente = AsyncMongoClient(MONGO_TEST_URI, connect=False)
    with pytest.raises(ValueError, match="tz_aware"):
        RepositorioMongo(cliente["x"])


def test_el_cliente_se_crea_tz_aware():
    cliente = crear_cliente_mongo(MONGO_TEST_URI, connect=False)
    assert cliente.codec_options.tz_aware is True


# --- Con MongoDB real -----------------------------------------------------------------------

async def test_guardar_simulacion_encuentra_el_registro_despues_de_leerlo(repositorio):
    """El caso que motivó tz_aware y el truncado: leer, simular y guardar con el updated_at leído."""
    circuito = _circuito()
    await repositorio.guardar(circuito)

    leido = await repositorio.obtener(circuito.id)

    assert leido.updated_at.tzinfo is not None
    assert leido.updated_at == truncar_a_milisegundos(FECHA_CON_MICROSEGUNDOS)
    resultado = {"node_voltages": {"1": 12.0, "0": 0.0}, "stats": {"total_ms": 0.4}}
    simulado = datetime(2026, 11, 12, 15, 31, 0, 654321, tzinfo=UTC)
    assert await repositorio.guardar_simulacion(circuito.id, leido.updated_at, resultado, simulado)

    final = await repositorio.obtener(circuito.id)
    assert final.last_simulation == resultado
    assert final.simulated_at == truncar_a_milisegundos(simulado)


async def test_guardar_simulacion_acepta_la_fecha_original_con_microsegundos(repositorio):
    circuito = await repositorio.guardar(_circuito())
    assert await repositorio.guardar_simulacion(
        circuito.id, FECHA_CON_MICROSEGUNDOS, {"ok": True}, FECHA_CON_MICROSEGUNDOS
    )


async def test_guardar_simulacion_rechaza_si_el_circuito_cambio(repositorio):
    circuito = await repositorio.guardar(_circuito())
    leido = await repositorio.obtener(circuito.id)
    editado = _circuito(id=circuito.id, name="Editado",
                        updated_at=FECHA_CON_MICROSEGUNDOS + timedelta(seconds=1))
    await repositorio.reemplazar(editado)

    assert not await repositorio.guardar_simulacion(
        circuito.id, leido.updated_at, {"ok": True}, FECHA_CON_MICROSEGUNDOS
    )
    assert (await repositorio.obtener(circuito.id)).last_simulation is None


async def test_guardar_simulacion_rechaza_si_el_circuito_no_existe(repositorio):
    assert not await repositorio.guardar_simulacion(
        uuid.uuid4(), FECHA_CON_MICROSEGUNDOS, {"ok": True}, FECHA_CON_MICROSEGUNDOS
    )


async def test_guardar_devuelve_lo_mismo_que_despues_se_lee(repositorio):
    guardado = await repositorio.guardar(_circuito())
    assert await repositorio.obtener(guardado.id) == guardado


async def test_nombres_de_nodo_con_punto_en_la_simulacion(repositorio):
    circuito = await repositorio.guardar(_circuito())
    resultado = {"node_voltages": {"N.1": 5.0, "0": 0.0}}
    assert await repositorio.guardar_simulacion(
        circuito.id, circuito.updated_at, resultado, FECHA_CON_MICROSEGUNDOS
    )
    assert (await repositorio.obtener(circuito.id)).last_simulation == resultado


async def test_obtener_inexistente_devuelve_none(repositorio):
    assert await repositorio.obtener(uuid.uuid4()) is None


async def test_reemplazar_inexistente_devuelve_none(repositorio):
    assert await repositorio.reemplazar(_circuito()) is None


async def test_eliminar(repositorio):
    circuito = await repositorio.guardar(_circuito())
    assert await repositorio.eliminar(circuito.id) is True
    assert await repositorio.eliminar(circuito.id) is False
    assert await repositorio.obtener(circuito.id) is None


async def test_listar_cuenta_componentes_y_ordena_por_modificacion(repositorio):
    viejo = await repositorio.guardar(_circuito(name="Viejo"))
    nuevo = await repositorio.guardar(_circuito(
        name="Nuevo", circuit={"ground": "0", "components": []},
        updated_at=FECHA_CON_MICROSEGUNDOS + timedelta(minutes=5),
    ))

    resumenes = await repositorio.listar(10)

    assert [r.id for r in resumenes] == [nuevo.id, viejo.id]
    assert [r.component_count for r in resumenes] == [0, 2]
    assert resumenes[0].updated_at.tzinfo is not None
    assert await repositorio.listar(1) == resumenes[:1]


async def test_responde(repositorio):
    assert await repositorio.responde() is True


async def test_responde_false_sin_servidor_antes_del_timeout_de_consul():
    # Sin acortar serverSelectionTimeoutMS: el límite tiene que venir del repositorio.
    cliente = crear_cliente_mongo("mongodb://127.0.0.1:1")
    inicio = time.perf_counter()
    try:
        assert await RepositorioMongo(cliente["x"]).responde() is False
    finally:
        await cliente.close()
    assert time.perf_counter() - inicio < 3
