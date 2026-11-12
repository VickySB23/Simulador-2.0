// Simulación en vivo contra POST /simulate: debounce, cancelación de pedidos viejos y reintento
// respetando Retry-After ante 503 o 429. Sin DOM: fetch y temporizadores se inyectan.
import { errorDeRespuesta } from "./netlist.js";

export const DEMORA_MS = 300;
const REINTENTO_RED_SEGUNDOS = 3;

/** "2" -> 2; una fecha HTTP -> segundos hasta esa fecha. Entre 1 y 60 s; null si no se entiende. */
export function segundosDeRetryAfter(valor, ahora = Date.now()) {
  if (valor === null || valor === undefined || valor === "") return null;
  let segundos = Number(valor);
  if (!Number.isFinite(segundos)) {
    const fecha = Date.parse(valor);
    if (Number.isNaN(fecha)) return null;
    segundos = (fecha - ahora) / 1000;
  }
  return Math.min(60, Math.max(1, Math.ceil(segundos)));
}

export class SimulacionEnVivo {
  /**
   * @param {object} opciones
   * @param {(estado: object) => void} opciones.alCambiar recibe {fase, resultado?, error?, reintentoEn?}
   *   con fase: "esperando" | "simulando" | "ok" | "error" | "saturado".
   */
  constructor({
    alCambiar,
    url = "/simulate",
    fetch = globalThis.fetch.bind(globalThis),
    programar = (fn, ms) => setTimeout(fn, ms),
    desprogramar = (id) => clearTimeout(id),
    demoraMs = DEMORA_MS,
  }) {
    Object.assign(this, { alCambiar, url, fetch, programar, desprogramar, demoraMs });
    this.version = 0;
    this.temporizador = null;
    this.controlador = null;
  }

  /** Pide simular este netlist; si llega otro antes de la demora, solo se manda el último. */
  pedir(netlist) {
    const version = this._nuevaVersion();
    this.alCambiar({ fase: "esperando" });
    this.temporizador = this.programar(() => this._enviar(netlist, version), this.demoraMs);
  }

  /** Descarta lo pendiente (por ejemplo, si el circuito quedó vacío). */
  cancelar() {
    this._nuevaVersion();
  }

  _nuevaVersion() {
    this.version += 1;
    if (this.temporizador !== null) this.desprogramar(this.temporizador);
    this.temporizador = null;
    this.controlador?.abort();
    this.controlador = null;
    return this.version;
  }

  _reintentar(netlist, version, segundos) {
    this.temporizador = this.programar(() => this._enviar(netlist, version), segundos * 1000);
  }

  async _enviar(netlist, version) {
    this.temporizador = null;
    const controlador = new AbortController();
    this.controlador = controlador;
    this.alCambiar({ fase: "simulando" });

    let respuesta;
    try {
      respuesta = await this.fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(netlist),
        signal: controlador.signal,
      });
    } catch {
      if (version !== this.version) return;
      this.alCambiar({
        fase: "saturado",
        reintentoEn: REINTENTO_RED_SEGUNDOS,
        error: { code: "network", message: "No se pudo contactar al simulador.", details: {} },
      });
      this._reintentar(netlist, version, REINTENTO_RED_SEGUNDOS);
      return;
    }
    if (version !== this.version) return;

    if (respuesta.status === 503 || respuesta.status === 429) {
      const segundos = segundosDeRetryAfter(respuesta.headers.get("Retry-After")) ?? 1;
      const message = respuesta.status === 429
        ? "Demasiados pedidos al simulador."
        : "El simulador está saturado.";
      this.alCambiar({
        fase: "saturado", reintentoEn: segundos,
        error: { code: respuesta.status === 429 ? "rate_limited" : "overloaded", message, details: {} },
      });
      this._reintentar(netlist, version, segundos);
      return;
    }

    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    if (version !== this.version) return;
    this.controlador = null;
    if (respuesta.ok && cuerpo) {
      this.alCambiar({ fase: "ok", resultado: cuerpo });
    } else {
      this.alCambiar({ fase: "error", error: errorDeRespuesta(respuesta.status, cuerpo) });
    }
  }
}
