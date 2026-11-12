"""Capa HTTP: traduce el JSON al dominio, aplica límites y convierte errores en códigos HTTP."""
from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from app.application.simulation_service import ocupar_cupo, simular
from app.core import config
from app.core.logger import logger
from app.domain.circuit import (
    Circuit,
    CircuitError,
    Component,
    ComponentType,
    InvalidComponentError,
    ServicioSaturadoError,
    parse_value,
)
from app.presentation.schemas import CircuitIn, SimulationOut

router = APIRouter(tags=["simulation"])


def _error(status: int, code: str, message: str, details: dict | None = None,
           headers: dict[str, str] | None = None) -> HTTPException:
    return HTTPException(
        status, {"code": code, "message": message, "details": details or {}}, headers=headers
    )


def to_domain(body: CircuitIn) -> Circuit:
    components = []
    for c in body.components:
        if c.type is ComponentType.WIRE:
            value = 0.0
        elif c.value is None:
            raise InvalidComponentError(f"{c.id}: falta el valor.", {"components": [c.id]})
        else:
            try:
                value = parse_value(c.value)
            except ValueError as exc:
                raise InvalidComponentError(f"{c.id}: {exc}", {"components": [c.id]}) from exc
        components.append(Component(c.id.strip(), c.type, c.a.strip(), c.b.strip(), value))
    return Circuit(components=tuple(components), ground=body.ground.strip())


@router.post("/simulate", response_model=SimulationOut)
async def simulate_endpoint(body: CircuitIn):
    if len(body.components) > config.MAX_COMPONENTS:
        raise _error(413, "too_large",
                     f"El circuito supera el máximo de {config.MAX_COMPONENTS} componentes.")
    try:
        circuit = to_domain(body)
        async with ocupar_cupo():
            result = await simular(circuit)
    except ServicioSaturadoError as exc:
        raise _error(503, "overloaded", "El servicio está saturado. Reintentá en unos segundos.",
                     headers={"Retry-After": str(config.RETRY_AFTER_SECONDS)}) from exc
    except CircuitError as exc:
        logger.info("Circuito rechazado (%s): %s", exc.code, exc)
        raise _error(422, exc.code, str(exc), exc.details) from exc
    return asdict(result)
