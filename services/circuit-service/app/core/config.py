"""Configuración leída de variables de entorno y validada al arrancar (Twelve-Factor III).

Los nombres de los campos coinciden con las variables de entorno (MONGO_URI, SIMULATION_URL...).
"""
from functools import lru_cache

from pydantic import PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "circuits"
    # En el stack apunta a Traefik, que balancea entre las réplicas de simulation-service.
    simulation_url: str = "http://localhost:8001"
    simulation_timeout_seconds: PositiveInt = 30
    consul_url: str | None = None
    max_components: PositiveInt = 20000
    rate_limit_average: PositiveInt = 50
    rate_limit_burst: PositiveInt = 100

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def obtener_configuracion() -> Configuracion:
    return Configuracion()
