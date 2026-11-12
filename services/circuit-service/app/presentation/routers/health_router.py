"""Health check: Consul y Docker consultan este endpoint. Sin MongoDB el servicio no sirve."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.application.services.circuit_service import ServicioCircuitos
from app.presentation.routers.circuit_router import obtener_servicio

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(servicio: ServicioCircuitos = Depends(obtener_servicio)):
    if not await servicio.esta_sano():
        return JSONResponse(status_code=503, content={"status": "unhealthy"})
    return {"status": "healthy"}
