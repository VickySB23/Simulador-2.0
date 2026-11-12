"""Conceptos del dominio: componentes, resultado y errores de la simulación."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from enum import Enum


class ComponentType(str, Enum):
    RESISTOR = "resistor"
    VOLTAGE_SOURCE = "voltage_source"
    CURRENT_SOURCE = "current_source"
    WIRE = "wire"


# Nombres que siempre se interpretan como tierra, además del que indique el circuito.
GROUND_ALIASES = frozenset({"0", "GND", "TIERRA"})

_SI_PREFIXES = {
    "T": 1e12, "G": 1e9, "MEG": 1e6, "M": 1e6, "k": 1e3, "K": 1e3,
    "m": 1e-3, "u": 1e-6, "µ": 1e-6, "n": 1e-9, "p": 1e-12,
}
_VALUE_RE = re.compile(
    r"\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*"
    r"(MEG|Meg|meg|[TGMkKmuµnp])?\s*(Ω|ohm|Ohm|ohms|V|A)?\s*"
)


class CircuitError(Exception):
    """El circuito no se puede simular. `code` es estable y lo consume el frontend."""

    code = "invalid_circuit"

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.details = details or {}


class InvalidComponentError(CircuitError):
    code = "invalid_component"


class NoGroundError(CircuitError):
    code = "no_ground"


class FloatingNodesError(CircuitError):
    code = "floating_nodes"


class VoltageSourceLoopError(CircuitError):
    code = "voltage_source_loop"


class ShortedVoltageSourceError(CircuitError):
    code = "shorted_voltage_source"


class SingularCircuitError(CircuitError):
    code = "singular_circuit"


class ServicioSaturadoError(Exception):
    """La petición agotó su tiempo de espera en la cola."""


def parse_value(raw: float | int | str) -> float:
    """Convierte 10, '10', '4.7k', '1MEG', '5mA' o '10 kΩ' a float.

    Convención: `M` y `MEG` son mega (como en la cátedra), `m` es mili.
    """
    if isinstance(raw, bool):
        raise ValueError("Valor inválido: booleano")
    if isinstance(raw, (int, float)):
        value = float(raw)
    else:
        match = _VALUE_RE.fullmatch(str(raw))
        if not match:
            raise ValueError(f"Valor inválido: '{raw}'")
        prefix = match.group(2)
        if not prefix:
            factor = 1.0
        elif prefix.upper() == "MEG":
            factor = _SI_PREFIXES["MEG"]
        else:
            factor = _SI_PREFIXES[prefix]
        value = float(match.group(1)) * factor
    if not math.isfinite(value):
        raise ValueError(f"Valor no finito: '{raw}'")
    return value


@dataclass(frozen=True)
class Component:
    id: str
    type: ComponentType
    a: str
    b: str
    value: float = 0.0


@dataclass(frozen=True)
class Circuit:
    components: tuple[Component, ...]
    ground: str = "0"


@dataclass(frozen=True)
class ComponentResult:
    id: str
    type: ComponentType
    voltage: float
    """Tensión V(a) - V(b)."""
    current: float | None
    """Corriente que entra por `a`, atraviesa el componente y sale por `b`.

    En los cables vale None: un cable ideal no tiene ecuación propia.
    """
    power: float
    """Convención pasiva: positiva si absorbe, negativa si entrega energía."""


@dataclass(frozen=True)
class PowerBalance:
    supplied: float
    absorbed: float
    net: float
    ok: bool


@dataclass(frozen=True)
class SimulationResult:
    node_voltages: dict[str, float]
    components: list[ComponentResult]
    power: PowerBalance
    kcl_max_residual: float
    stats: dict = field(default_factory=dict)
