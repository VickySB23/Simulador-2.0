"""Endpoints REST de los circuitos guardados: traducen errores del dominio a códigos HTTP.

Todos los errores tienen la misma forma que los de simulation-service:
`{"detail": {"code", "message", "details"}}`, así el frontend los maneja igual.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.application.interfaces.simulator import (
    CircuitoInvalidoError,
    RespuestaInvalidaError,
    SimuladorNoDisponibleError,
)
from app.application.services.circuit_service import (
    CircuitoNoEncontradoError,
    ModificacionConcurrenteError,
    ServicioCircuitos,
)
from app.core import obtener_configuracion
from app.presentation.schemas.circuit_schema import CircuitoEntrada, CircuitoSalida, ResumenSalida

router = APIRouter(prefix="/api/circuits", tags=["circuits"])

_NO_ENCONTRADO = "Circuito no encontrado."


def obtener_servicio(request: Request) -> ServicioCircuitos:
    """Inyecta el servicio en los endpoints para desacoplar las capas."""
    return request.app.state.servicio_circuitos


def _error(estado: int, codigo: str, mensaje: str, detalles: dict | None = None,
           headers: dict[str, str] | None = None) -> HTTPException:
    return HTTPException(
        estado, {"code": codigo, "message": mensaje, "details": detalles or {}}, headers=headers
    )


def _no_encontrado() -> HTTPException:
    return _error(404, "not_found", _NO_ENCONTRADO)


def _validar_tamano(cuerpo: CircuitoEntrada) -> None:
    maximo = obtener_configuracion().max_components
    if len(cuerpo.circuit.components) > maximo:
        raise _error(413, "too_large", f"El circuito supera el máximo de {maximo} componentes.")


def _datos(cuerpo: CircuitoEntrada) -> dict:
    return {
        "name": cuerpo.name,
        "description": cuerpo.description,
        "circuit": cuerpo.circuit.model_dump(mode="json"),
        "layout": cuerpo.layout,
        "tags": cuerpo.tags,
    }


@router.post("", response_model=CircuitoSalida, status_code=201)
async def crear_circuito(cuerpo: CircuitoEntrada,
                         servicio: ServicioCircuitos = Depends(obtener_servicio)):
    _validar_tamano(cuerpo)
    return await servicio.crear(**_datos(cuerpo))


@router.get("", response_model=list[ResumenSalida])
async def listar_circuitos(servicio: ServicioCircuitos = Depends(obtener_servicio)):
    """Hasta 100 circuitos, los modificados más recientemente primero."""
    return await servicio.listar()


@router.get("/{id_circuito}", response_model=CircuitoSalida)
async def obtener_circuito(id_circuito: UUID,
                           servicio: ServicioCircuitos = Depends(obtener_servicio)):
    try:
        return await servicio.obtener(id_circuito)
    except CircuitoNoEncontradoError as exc:
        raise _no_encontrado() from exc


@router.put("/{id_circuito}", response_model=CircuitoSalida)
async def actualizar_circuito(id_circuito: UUID, cuerpo: CircuitoEntrada,
                              servicio: ServicioCircuitos = Depends(obtener_servicio)):
    """Reemplaza el circuito y borra su última simulación."""
    _validar_tamano(cuerpo)
    try:
        return await servicio.actualizar(id_circuito, **_datos(cuerpo))
    except CircuitoNoEncontradoError as exc:
        raise _no_encontrado() from exc


@router.delete("/{id_circuito}", status_code=204)
async def eliminar_circuito(id_circuito: UUID,
                            servicio: ServicioCircuitos = Depends(obtener_servicio)):
    try:
        await servicio.eliminar(id_circuito)
    except CircuitoNoEncontradoError as exc:
        raise _no_encontrado() from exc
    return Response(status_code=204)


@router.post("/{id_circuito}/simulate", response_model=CircuitoSalida)
async def simular_circuito(id_circuito: UUID,
                           servicio: ServicioCircuitos = Depends(obtener_servicio)):
    """Simula el circuito guardado y guarda el resultado en `last_simulation`."""
    try:
        return await servicio.simular(id_circuito)
    except CircuitoNoEncontradoError as exc:
        raise _no_encontrado() from exc
    except ModificacionConcurrenteError as exc:
        raise _error(409, "concurrent_modification",
                     "El circuito cambió o se borró mientras se simulaba. "
                     "Volvé a simularlo.") from exc
    except CircuitoInvalidoError as exc:
        estado = 413 if exc.codigo == "too_large" else 422
        raise _error(estado, exc.codigo, str(exc), exc.detalles) from exc
    except SimuladorNoDisponibleError as exc:
        headers = {"Retry-After": exc.retry_after} if exc.retry_after else None
        raise _error(503, "simulator_unavailable", str(exc), headers=headers) from exc
    except RespuestaInvalidaError as exc:
        raise _error(502, "simulator_bad_response", str(exc)) from exc
