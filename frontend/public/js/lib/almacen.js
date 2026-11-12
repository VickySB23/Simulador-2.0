// Circuitos guardados en el navegador (localStorage) y archivos .json para exportar e importar.
// Sin DOM: el almacenamiento se inyecta, así se prueba con un objeto en memoria.
import { aLayout, desdeLayout } from "./modelo.js";

export const CLAVE = "simulador-dc:circuitos";
export const FORMATO = "simulador-dc";
export const VERSION_ARCHIVO = 1;
const LARGO_NOMBRE = 120;

function validarNombre(nombre) {
  const limpio = String(nombre ?? "").trim();
  if (!limpio) throw new Error("Poné un nombre.");
  if (limpio.length > LARGO_NOMBRE) throw new Error(`Máximo ${LARGO_NOMBRE} caracteres.`);
  return limpio;
}

export class Almacen {
  constructor({
    almacenamiento = globalThis.localStorage,
    reloj = () => new Date().toISOString(),
    nuevoId = () => globalThis.crypto.randomUUID(),
  } = {}) {
    Object.assign(this, { almacenamiento, reloj, nuevoId });
  }

  _leer() {
    let texto;
    try {
      texto = this.almacenamiento.getItem(CLAVE);
    } catch {
      throw new Error("Este navegador no permite guardar datos (¿modo privado?). Usá Exportar.");
    }
    try {
      const lista = JSON.parse(texto ?? "[]");
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }

  _escribir(lista) {
    try {
      this.almacenamiento.setItem(CLAVE, JSON.stringify(lista));
    } catch {
      throw new Error("No se pudo guardar: el navegador no tiene espacio o no permite guardar. Usá Exportar.");
    }
  }

  /** Resúmenes, los modificados más recientemente primero. */
  listar() {
    return this._leer()
      .map(({ id, name, updated_at, layout }) => ({
        id, name, updated_at, component_count: layout?.components?.length ?? 0,
      }))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
  }

  /** {id, name, estado} o null. */
  obtener(id) {
    const guardado = this._leer().find((c) => c.id === id);
    return guardado ? { id: guardado.id, name: guardado.name, estado: desdeLayout(guardado.layout) } : null;
  }

  /** Crea (sin id) o reemplaza (con id) un circuito. Devuelve {id, name}. */
  guardar({ id = null, name, estado }) {
    const nombre = validarNombre(name);
    const lista = this._leer();
    const ahora = this.reloj();
    const existente = id ? lista.find((c) => c.id === id) : null;
    if (existente) {
      Object.assign(existente, { name: nombre, layout: aLayout(estado), updated_at: ahora });
      this._escribir(lista);
      return { id: existente.id, name: nombre };
    }
    const nuevo = { id: this.nuevoId(), name: nombre, layout: aLayout(estado), created_at: ahora, updated_at: ahora };
    this._escribir([...lista, nuevo]);
    return { id: nuevo.id, name: nombre };
  }

  renombrar(id, name) {
    const nombre = validarNombre(name);
    const lista = this._leer();
    const guardado = lista.find((c) => c.id === id);
    if (!guardado) throw new Error("Ese circuito ya no existe.");
    Object.assign(guardado, { name: nombre, updated_at: this.reloj() });
    this._escribir(lista);
  }

  borrar(id) {
    const lista = this._leer();
    const resto = lista.filter((c) => c.id !== id);
    if (resto.length === lista.length) return false;
    this._escribir(resto);
    return true;
  }
}

/** Contenido del archivo .json que se descarga con Exportar. */
export function aArchivo(nombre, estado, fecha = new Date().toISOString()) {
  return { formato: FORMATO, version: VERSION_ARCHIVO, name: nombre, exportado: fecha, layout: aLayout(estado) };
}

/** Lee un archivo exportado. Devuelve {name, estado}; lanza Error con un mensaje para mostrar. */
export function desdeArchivo(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  if (datos?.formato !== FORMATO) throw new Error("El archivo no es un circuito del Simulador DC.");
  if (datos.version !== VERSION_ARCHIVO) {
    throw new Error(`El archivo es de una versión que este editor no conoce (${datos.version}).`);
  }
  return { name: validarNombre(datos.name ?? "Importado"), estado: desdeLayout(datos.layout) };
}
