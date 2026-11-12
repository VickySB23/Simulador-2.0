"""Contrato HTTP de POST /simulate."""
from pydantic import BaseModel, Field

from app.domain.circuit import ComponentType


class ComponentIn(BaseModel):
    id: str = Field(min_length=1, max_length=64, examples=["R1"])
    type: ComponentType
    a: str = Field(min_length=1, max_length=64, description="Terminal a (+ en las fuentes de tensión).")
    b: str = Field(min_length=1, max_length=64, description="Terminal b (- en las fuentes de tensión).")
    value: float | str | None = Field(
        default=None,
        description="Ω, V o A. Acepta números o texto con prefijo: 4.7k, 1MEG, 5m. "
        "En una fuente de corriente, el sentido es de a hacia b por dentro de la fuente.",
        examples=[1000, "4.7k"],
    )


class CircuitIn(BaseModel):
    ground: str = Field(default="0", min_length=1, max_length=64)
    components: list[ComponentIn]

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "ground": "0",
                    "components": [
                        {"id": "V1", "type": "voltage_source", "a": "1", "b": "0", "value": 12},
                        {"id": "R1", "type": "resistor", "a": "1", "b": "2", "value": "1k"},
                        {"id": "R2", "type": "resistor", "a": "2", "b": "0", "value": "2k"},
                    ],
                }
            ]
        }
    }


class ComponentOut(BaseModel):
    id: str
    type: ComponentType
    voltage: float
    current: float | None
    power: float


class PowerOut(BaseModel):
    supplied: float
    absorbed: float
    net: float
    ok: bool


class SimulationOut(BaseModel):
    node_voltages: dict[str, float]
    components: list[ComponentOut]
    power: PowerOut
    kcl_max_residual: float
    stats: dict
