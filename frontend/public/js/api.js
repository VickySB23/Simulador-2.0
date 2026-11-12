// Cliente de /api/circuits (circuit-service a través de Traefik).
import { errorDeRespuesta } from "./lib/netlist.js";

export class ErrorApi extends Error {
  constructor(estado, error) {
    super(error.message);
    this.estado = estado;
    this.code = error.code;
    this.details = error.details;
  }
}

async function pedir(metodo, ruta, cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: cuerpo === undefined ? {} : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, { code: "network", message: "No se pudo contactar al servidor.", details: {} });
  }
  if (respuesta.status === 204) return null;
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }
  if (!respuesta.ok) {
    if (respuesta.status === 429) {
      throw new ErrorApi(429, { code: "rate_limited", message: "Demasiados pedidos: esperá unos segundos.", details: {} });
    }
    throw new ErrorApi(respuesta.status, errorDeRespuesta(respuesta.status, datos));
  }
  return datos;
}

const BASE = "/api/circuits";

export const api = {
  listar: () => pedir("GET", BASE),
  obtener: (id) => pedir("GET", `${BASE}/${id}`),
  crear: (cuerpo) => pedir("POST", BASE, cuerpo),
  actualizar: (id, cuerpo) => pedir("PUT", `${BASE}/${id}`, cuerpo),
  borrar: (id) => pedir("DELETE", `${BASE}/${id}`),
};
