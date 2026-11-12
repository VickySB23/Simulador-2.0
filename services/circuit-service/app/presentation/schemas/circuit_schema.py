"""Contrato HTTP de /api/circuits.

La netlist se valida en su forma (mismo formato que POST /simulate de simulation-service), pero
no en su validez eléctrica: se puede guardar un circuito a medio dibujar. Los errores eléctricos
los informa el simulador al simular.
"""
from datetime import datetime
from enum import Enum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

# Un "$" inicial no es válido como nombre de campo en las actualizaciones de MongoDB, y los
# nombres de nodo terminan como claves de `node_voltages` en la última simulación.
_Nombre = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[^$]")]
_Etiqueta = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class TipoComponente(str, Enum):
    RESISTOR = "resistor"
    VOLTAGE_SOURCE = "voltage_source"
    CURRENT_SOURCE = "current_source"
    WIRE = "wire"


class ComponenteEntrada(BaseModel):
    id: _Nombre
    type: TipoComponente
    a: _Nombre
    b: _Nombre
    value: float | str | None = Field(default=None, examples=[1000, "4.7k"])


class NetlistEntrada(BaseModel):
    ground: _Nombre = "0"
    components: list[ComponenteEntrada] = Field(default_factory=list)


class CircuitoEntrada(BaseModel):
    """Cuerpo de POST y PUT: PUT reemplaza el circuito completo."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    description: str = Field(default="", max_length=2000)
    circuit: NetlistEntrada
    layout: dict | None = Field(
        default=None, description="Estado del editor web; el backend no lo interpreta."
    )
    tags: list[_Etiqueta] = Field(default_factory=list, max_length=20)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Divisor de tensión",
                    "description": "12 V sobre 1k y 2k",
                    "circuit": {
                        "ground": "0",
                        "components": [
                            {"id": "V1", "type": "voltage_source", "a": "1", "b": "0", "value": 12},
                            {"id": "R1", "type": "resistor", "a": "1", "b": "2", "value": "1k"},
                            {"id": "R2", "type": "resistor", "a": "2", "b": "0", "value": "2k"},
                        ],
                    },
                    "tags": ["divisor"],
                }
            ]
        }
    }


class CircuitoSalida(BaseModel):
    id: UUID
    name: str
    description: str
    circuit: dict
    layout: dict | None
    tags: list[str]
    component_count: int
    created_at: datetime
    updated_at: datetime
    last_simulation: dict | None
    simulated_at: datetime | None

    model_config = {"from_attributes": True}


class ResumenSalida(BaseModel):
    id: UUID
    name: str
    description: str
    tags: list[str]
    component_count: int
    created_at: datetime
    updated_at: datetime
    simulated_at: datetime | None

    model_config = {"from_attributes": True}
