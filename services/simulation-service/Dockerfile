FROM python:3.12-slim-trixie AS builder
COPY --from=ghcr.io/astral-sh/uv:0.11.14 /uv /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

FROM python:3.12-slim-trixie

WORKDIR /app
# OpenBLAS ve todos los núcleos del host y lanza un hilo por núcleo, pero la réplica tiene cuota
# de 1 CPU: los hilos se frenan entre sí y una factorización densa de 101 incógnitas pasa de
# ~1 ms a ~350 ms (docs/mediciones, Exp. 1 y 2). Un hilo por réplica; el paralelismo sale de
# las réplicas. Se puede cambiar por entorno (0 = automático).
ENV PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1

COPY --from=builder /app/.venv ./.venv
COPY app ./app

# La imagen final no instala paquetes: pip solo sumaría superficie de ataque.
RUN pip uninstall -y pip && useradd --system --uid 10001 --no-create-home app
USER app

EXPOSE 8001
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"]
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
