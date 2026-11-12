"""Pruebas del motor MNA contra resultados calculados a mano."""
import pytest

from app.domain.circuit import (
    Circuit,
    CircuitError,
    Component,
    ComponentType,
    FloatingNodesError,
    InvalidComponentError,
    NoGroundError,
    ShortedVoltageSourceError,
    VoltageSourceLoopError,
    parse_value,
)
from app.domain.mna import DENSE_LIMIT, simulate

R, V, I, W = (ComponentType.RESISTOR, ComponentType.VOLTAGE_SOURCE,
              ComponentType.CURRENT_SOURCE, ComponentType.WIRE)


def circuit(*parts, ground="0"):
    return Circuit(tuple(Component(*p) if len(p) == 5 else Component(*p, 0.0) for p in parts), ground)


def by_id(result):
    return {c.id: c for c in result.components}


def test_divisor_de_tension():
    r = simulate(circuit(("V1", V, "1", "0", 12.0), ("R1", R, "1", "2", 1e3), ("R2", R, "2", "0", 2e3)))
    assert r.node_voltages["2"] == pytest.approx(8.0)
    comps = by_id(r)
    assert comps["R1"].current == pytest.approx(4e-3)
    # La fuente entrega energía: corriente de a hacia b negativa y potencia negativa.
    assert comps["V1"].current == pytest.approx(-4e-3)
    assert comps["V1"].power == pytest.approx(-48e-3)
    assert r.power.ok and r.power.supplied == pytest.approx(48e-3)


def test_ejercicio_tp4_mixto():
    # (3 Ω || 12 Ω) en serie con (6 Ω || 4 Ω): 2,4 Ω + 2,4 Ω con 60 V -> V2 = 30 V, I = 12,5 A.
    r = simulate(circuit(
        ("V1", V, "1", "0", 60.0),
        ("R_3", R, "1", "2", 3.0), ("R_12", R, "1", "2", 12.0),
        ("R_6", R, "2", "0", 6.0), ("R_4", R, "2", "0", 4.0),
    ))
    assert r.node_voltages["2"] == pytest.approx(30.0)
    assert by_id(r)["V1"].current == pytest.approx(-12.5)
    assert r.power.absorbed == pytest.approx(750.0)


def test_fuente_de_corriente_sentido_de_a_hacia_b():
    # 1 mA entra al nodo 1 desde tierra: V1 = 1 mA * 1 kΩ = 1 V.
    r = simulate(circuit(("I1", I, "0", "1", 1e-3), ("R1", R, "1", "0", 1e3)))
    assert r.node_voltages["1"] == pytest.approx(1.0)
    assert by_id(r)["I1"].power == pytest.approx(-1e-3)
    assert r.power.ok


def test_superposicion_con_ambas_fuentes():
    # example.net: V1=10 V en 1, R1 1-2 100, R2 2-0 200, R3 1-0 1k, I1 2->0 5 mA.
    r = simulate(circuit(
        ("V1", V, "1", "0", 10.0), ("R1", R, "1", "2", 100.0), ("R2", R, "2", "0", 200.0),
        ("R3", R, "1", "0", 1000.0), ("I1", I, "2", "0", 5e-3),
    ))
    # KCL en el nodo 2: (10 - V2)/100 = V2/200 + 0,005 -> 0,095 = 0,015 V2 -> V2 = 19/3 V.
    assert r.node_voltages["2"] == pytest.approx(19 / 3)
    assert r.power.ok
    assert r.kcl_max_residual < 1e-12


def test_cables_ideales_no_degradan_la_precision():
    parts = [("V1", V, "a", "0", 12.0)]
    prev = "a"
    for k in range(50):
        parts.append((f"W{k}", W, prev, f"w{k}"))
        prev = f"w{k}"
    parts += [("R1", R, prev, "m", 1e3), ("R2", R, "m", "0", 2e3)]
    r = simulate(circuit(*parts))
    assert r.node_voltages["m"] == 8.0
    assert r.node_voltages["w49"] == 12.0
    assert r.stats["electrical_nodes"] == 3


def test_alias_de_tierra_y_tierra_personalizada():
    r = simulate(circuit(("V1", V, "1", "GND", 5.0), ("R1", R, "1", "gnd", 10.0)))
    assert r.node_voltages["GND"] == 0.0 and r.node_voltages["1"] == 5.0
    r = simulate(circuit(("V1", V, "top", "base", 5.0), ("R1", R, "top", "base", 10.0), ground="base"))
    assert r.node_voltages["top"] == 5.0


def test_resistencia_en_corto_no_conduce():
    r = simulate(circuit(("V1", V, "1", "0", 5.0), ("R1", R, "1", "0", 10.0),
                         ("R2", R, "x", "y", 10.0), ("W1", W, "x", "y"), ("W2", W, "x", "1")))
    assert by_id(r)["R2"].current == 0.0


def test_escalera_grande_usa_matriz_dispersa():
    n = DENSE_LIMIT * 3
    parts = [("V1", V, "n0", "0", float(n))]
    parts += [(f"R{k}", R, f"n{k}", f"n{k + 1}", 1.0) for k in range(n - 1)]
    parts.append(("Rlast", R, f"n{n - 1}", "0", 1.0))
    r = simulate(circuit(*parts))
    assert r.stats["solver"] == "sparse"
    # n resistencias de 1 Ω en serie con n voltios: cada una cae 1 V.
    assert r.node_voltages["n10"] == pytest.approx(n - 10)
    assert r.power.ok


@pytest.mark.parametrize(
    ("parts", "error", "detail_key", "detail"),
    [
        ([("V1", V, "1", "2", 5.0), ("R1", R, "1", "2", 1.0)], NoGroundError, None, None),
        ([("V1", V, "1", "0", 5.0), ("R1", R, "1", "0", 1.0), ("R2", R, "5", "6", 1.0)],
         FloatingNodesError, "nodes", ["5", "6"]),
        # Nodo alimentado solo por una fuente de corriente: antes daba 1 GV.
        ([("V1", V, "1", "0", 5.0), ("R1", R, "1", "0", 1.0), ("I1", I, "0", "5", 1e-3)],
         FloatingNodesError, "nodes", ["5"]),
        ([("V1", V, "1", "0", 10.0), ("V2", V, "1", "0", 5.0), ("R1", R, "1", "0", 1.0)],
         VoltageSourceLoopError, "components", ["V2"]),
        ([("V1", V, "1", "0", 10.0), ("W1", W, "1", "0")],
         ShortedVoltageSourceError, "components", ["V1"]),
        ([("V1", V, "1", "0", 10.0), ("R1", R, "1", "0", 0.0)], InvalidComponentError, "components", ["R1"]),
        ([("V1", V, "1", "0", 10.0), ("R1", R, "1", "0", -5.0)], InvalidComponentError, "components", ["R1"]),
        ([("V1", V, "1", "0", 10.0), ("V1", R, "1", "0", 5.0)], InvalidComponentError, "components", ["V1"]),
        ([("V1", V, "1", "0", 10.0), ("R1", R, "1", "1", 5.0)], InvalidComponentError, "components", ["R1"]),
        ([], CircuitError, None, None),
    ],
)
def test_errores_explicitos(parts, error, detail_key, detail):
    with pytest.raises(error) as info:
        simulate(circuit(*parts))
    if detail_key:
        assert info.value.details[detail_key] == detail


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(10, 10.0), ("10", 10.0), ("4.7k", 4700.0), ("1MEG", 1e6), ("1meg", 1e6), ("2M", 2e6),
     ("5m", 5e-3), ("5mA", 5e-3), ("10 kΩ", 1e4), ("3u", 3e-6), ("2.2n", 2.2e-9), ("-12V", -12.0),
     (".5", 0.5), ("1e3", 1000.0)],
)
def test_parse_value(raw, expected):
    assert parse_value(raw) == pytest.approx(expected)


@pytest.mark.parametrize("raw", ["1x", "abc", "", "k", "nan", True, float("inf")])
def test_parse_value_invalido(raw):
    with pytest.raises(ValueError):
        parse_value(raw)
