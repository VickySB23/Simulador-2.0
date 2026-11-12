"""Genera circuitos escalera para las pruebas de carga.

Una escalera de N nodos: fuente de 10 V entre el nodo 1 y tierra, una resistencia serie de 1 kΩ
entre cada par de nodos consecutivos y una resistencia de 10 kΩ de cada nodo (desde el 2) a tierra.
Tiene N nodos sin contar tierra y N + 1 incógnitas en el MNA (N tensiones y la corriente de la
fuente), así que con DENSE_LIMIT = 200 las de 10 y 100 nodos se resuelven densas y la de 1000,
dispersa.

Uso: python tests/stress/generar_circuitos.py [carpeta]      (por defecto tests/stress/circuitos)
Solo usa la biblioteca estándar.
"""
import json
import sys
from pathlib import Path

TAMANOS = (10, 100, 1000)
# Tamaños extra solo para el benchmark del solver (cruce entre denso y disperso).
TAMANOS_BENCH = (50, 200, 500, 2000)


def escalera(nodos: int) -> dict:
    if nodos < 2:
        raise ValueError("La escalera necesita al menos 2 nodos.")
    componentes = [{"id": "V1", "type": "voltage_source", "a": "1", "b": "0", "value": 10}]
    for k in range(1, nodos):
        componentes.append(
            {"id": f"RS{k}", "type": "resistor", "a": str(k), "b": str(k + 1), "value": "1k"}
        )
        componentes.append(
            {"id": f"RP{k + 1}", "type": "resistor", "a": str(k + 1), "b": "0", "value": "10k"}
        )
    return {"ground": "0", "components": componentes}


def main() -> None:
    carpeta = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "circuitos"
    carpeta.mkdir(parents=True, exist_ok=True)
    for nodos in TAMANOS + TAMANOS_BENCH:
        circuito = escalera(nodos)
        ruta = carpeta / f"escalera-{nodos}.json"
        ruta.write_text(json.dumps(circuito, separators=(",", ":")), encoding="utf-8")
        print(f"{ruta}: {nodos} nodos, {len(circuito['components'])} componentes, "
              f"{ruta.stat().st_size} bytes")


if __name__ == "__main__":
    main()
