// Deshacer y rehacer con dos pilas de instantáneas completas (componentes, tierra y contadores).
//
// Simulador-2.0 volvía a aplicar el estado anterior al rehacer y no guardaba la tierra. Acá cada
// operación guarda el estado *actual* en la pila contraria, así rehacer devuelve lo deshecho.

const copiar = (estado) => structuredClone(estado);

export class Historial {
  constructor(limite = 200) {
    this.limite = limite;
    this.pilaDeshacer = [];
    this.pilaRehacer = [];
  }

  /** Llamar con el estado de *antes* de un cambio. Invalida lo que se podía rehacer. */
  registrar(estadoAnterior) {
    this.pilaDeshacer.push(copiar(estadoAnterior));
    if (this.pilaDeshacer.length > this.limite) this.pilaDeshacer.shift();
    this.pilaRehacer = [];
  }

  /** Devuelve el estado a restaurar, o null si no hay nada que deshacer. */
  deshacer(estadoActual) {
    if (!this.pilaDeshacer.length) return null;
    this.pilaRehacer.push(copiar(estadoActual));
    return this.pilaDeshacer.pop();
  }

  rehacer(estadoActual) {
    if (!this.pilaRehacer.length) return null;
    this.pilaDeshacer.push(copiar(estadoActual));
    return this.pilaRehacer.pop();
  }

  get puedeDeshacer() {
    return this.pilaDeshacer.length > 0;
  }

  get puedeRehacer() {
    return this.pilaRehacer.length > 0;
  }

  limpiar() {
    this.pilaDeshacer = [];
    this.pilaRehacer = [];
  }
}
