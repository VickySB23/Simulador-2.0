"""Resume los resultados crudos de k6 (--summary-export) y de Vegeta (report -type=json).

Uso:
    python tests/stress/resumir.py docs/mediciones/05-replicas-3-run1-k6.json      # una corrida
    python tests/stress/resumir.py docs/mediciones/05-replicas-3-run*-k6.json      # y la media
    python tests/stress/resumir.py --markdown docs/mediciones/05-*-k6.json         # fila de tabla
Solo usa la biblioteca estándar.
"""
import json
import statistics
import sys
from pathlib import Path


def k6(datos: dict) -> dict:
    m = datos["metrics"]
    d = m["http_req_duration"]
    contar = lambda nombre: m.get(nombre, {}).get("count", 0)  # noqa: E731
    exitosa = m.get("duracion_200", {})
    return {
        "peticiones": m["http_reqs"]["count"],
        "req_s": m["http_reqs"]["rate"],
        "ok_s": contar("respuestas_200") / 40.0,
        "error_pct": 100 * m["http_req_failed"]["value"],
        "p50_ms": d["med"], "p95_ms": d["p(95)"], "max_ms": d["max"],
        "p50_200_ms": exitosa.get("med"), "p95_200_ms": exitosa.get("p(95)"),
        "max_200_ms": exitosa.get("max"),
        "200": contar("respuestas_200"), "429": contar("respuestas_429"),
        "503": contar("respuestas_503"), "503_retry_after": contar("respuestas_503_con_retry_after"),
        "otras": contar("respuestas_otras"),
    }


def vegeta(datos: dict) -> dict:
    lat = datos["latencies"]
    codigos = datos.get("status_codes", {})
    return {
        "peticiones": datos["requests"],
        "req_s": datos["rate"],
        "ok_s": datos["throughput"],
        "error_pct": 100 * (1 - datos["success"]),
        "p50_ms": lat["50th"] / 1e6, "p95_ms": lat["95th"] / 1e6, "max_ms": lat["max"] / 1e6,
        "200": codigos.get("200", 0), "429": codigos.get("429", 0), "503": codigos.get("503", 0),
        "timeout": codigos.get("0", 0),
        "otras": sum(v for k, v in codigos.items() if k not in ("200", "429", "503", "0")),
    }


def leer(ruta: Path) -> dict:
    datos = json.loads(ruta.read_text(encoding="utf-8-sig"))
    return k6(datos) if "metrics" in datos else vegeta(datos)


def formato(r: dict) -> str:
    partes = [f"{r['peticiones']} pet.", f"{r['req_s']:.2f} req/s enviadas",
              f"{r['ok_s']:.2f} req/s exitosas", f"error {r['error_pct']:.1f} %",
              f"p50 {r['p50_ms']:.0f} ms", f"p95 {r['p95_ms']:.0f} ms", f"máx {r['max_ms']:.0f} ms"]
    if r.get("p50_200_ms") is not None:
        partes.append(f"(solo 200: p50 {r['p50_200_ms']:.0f} / p95 {r['p95_200_ms']:.0f} / "
                      f"máx {r['max_200_ms']:.0f} ms)")
    codigos = {k: r[k] for k in ("200", "429", "503", "503_retry_after", "timeout", "otras")
               if r.get(k)}
    return ", ".join(partes) + f" | códigos {codigos}"


def main() -> None:
    args = sys.argv[1:]
    markdown = "--markdown" in args
    rutas = [Path(a) for a in args if a != "--markdown"]
    resultados = [leer(r) for r in rutas]
    if not markdown:
        for ruta, r in zip(rutas, resultados):
            print(f"{ruta.name}: {formato(r)}")
    if len(resultados) > 1 or markdown:
        claves = [k for k, v in resultados[0].items() if isinstance(v, (int, float))]
        media = {k: statistics.mean(r[k] for r in resultados if r.get(k) is not None)
                 for k in claves if all(r.get(k) is not None for r in resultados)}
        rango = lambda k: f"{min(r[k] for r in resultados):.2f}–{max(r[k] for r in resultados):.2f}"  # noqa: E731
        if markdown:
            print(f"| {media['ok_s']:.2f} ({rango('ok_s')}) | {media['error_pct']:.1f} % | "
                  f"{media['p50_ms']:.0f} | {media['p95_ms']:.0f} | {media['max_ms']:.0f} |")
        else:
            print(f"MEDIA de {len(resultados)}: {formato(media)} | rango req/s exitosas {rango('ok_s')}")


if __name__ == "__main__":
    main()
