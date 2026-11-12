// Animaciones del circuito en un <canvas> superpuesto al SVG.
//
// Por qué no CSS dentro del SVG: cualquier animación dentro de un SVG obliga al navegador a
// repintar el SVG entero en cada cuadro (grilla, componentes y etiquetas). Medido en la galería
// con la CPU 4× más lenta: 116 cuadros/s con 50 componentes quietos y 15 con todo animado por CSS.
// Acá el SVG queda estático y el canvas dibuja solo lo que se mueve: puntos de corriente, halo de
// las lámparas, brillo cálido de las resistencias y pulso de las baterías.
//
// - Solo se anima lo que está a la vista (IntersectionObserver) y nada si la pestaña está oculta.
// - pausar() congela el cuadro; con prefers-reduced-motion se dibuja un único cuadro quieto.
// - Los colores y tamaños se leen de los tokens (variables CSS) y se releen al cambiar el tema.
import { PASO_PUNTOS } from "./lib/animacion.js";

const PERIODO_PULSO = 1.6; // s
const PERIODO_HALO = 3; // s

function leerTokens() {
  const estilo = getComputedStyle(document.documentElement);
  const v = (nombre) => estilo.getPropertyValue(nombre).trim();
  return {
    convencional: v("--color-puntos-convencional"),
    electrones: v("--color-puntos-electrones"),
    tinta: v("--color-tinta"),
    halo: v("--ilus-lampara-halo"),
    calor: v("--ilus-calor"),
    pulso: v("--ilus-bateria-pulso"),
    puntos: parseFloat(v("--puntos-tamano")) || 6,
    borde: parseFloat(v("--borde")) || 2.5,
  };
}

export class Animador {
  constructor() {
    this.capas = new Set();
    this.pausado = false;
    this.electrones = false;
    this.tiempo = 0; // s de animación acumulados (no avanza en pausa)
    this.ultimo = null;
    this.cuadro = null;
    this.tokens = leerTokens();
    this.movimiento = matchMedia("(prefers-reduced-motion: reduce)");
    this.movimiento.addEventListener("change", () => this._programar());
    this.observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        const capa = [...this.capas].find((c) => c.contenedor === e.target);
        if (capa) capa.visible = e.isIntersecting;
      }
      this._programar();
    });
    this.redimension = new ResizeObserver((entradas) => {
      for (const e of entradas) {
        const capa = [...this.capas].find((c) => c.contenedor === e.target);
        if (capa) this._ajustar(capa);
      }
      this._dibujarTodo();
    });
  }

  /** Superpone un canvas al SVG (que tiene que estar dentro de `contenedor`) y lo anima. */
  registrar(contenedor, svg, elementos = []) {
    contenedor.classList.add("capa-animada");
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    contenedor.append(canvas);
    const capa = { contenedor, svg, canvas, elementos, visible: true, escala: 1 };
    this.capas.add(capa);
    this._ajustar(capa);
    this.observador.observe(contenedor);
    this.redimension.observe(contenedor);
    this._dibujar(capa);
    this._programar();
    return capa;
  }

  actualizar(capa, elementos) {
    capa.elementos = elementos;
    this._dibujar(capa);
    this._programar();
  }

  quitar(capa) {
    this.observador.unobserve(capa.contenedor);
    this.redimension.unobserve(capa.contenedor);
    capa.canvas.remove();
    this.capas.delete(capa);
  }

  pausar(pausado) {
    this.pausado = pausado;
    this.ultimo = null;
    this._programar();
  }

  sentidoElectrones(electrones) {
    this.electrones = electrones;
    this._dibujarTodo();
  }

  /** Releer colores y tamaños (después de cambiar el tema o el modo proyector). */
  releerTokens() {
    this.tokens = leerTokens();
    for (const capa of this.capas) this._ajustar(capa);
    this._dibujarTodo();
  }

  get animando() {
    return this.cuadro !== null;
  }

  _quiereAnimar() {
    if (this.pausado || this.movimiento.matches) return false;
    return [...this.capas].some((c) => c.visible && c.elementos.length);
  }

  _programar() {
    if (this._quiereAnimar()) {
      if (this.cuadro === null) this.cuadro = requestAnimationFrame((t) => this._paso(t));
    } else {
      if (this.cuadro !== null) cancelAnimationFrame(this.cuadro);
      this.cuadro = null;
      this.ultimo = null;
      this._dibujarTodo();
    }
  }

  _paso(ahora) {
    if (this.ultimo !== null) this.tiempo += Math.min(0.1, (ahora - this.ultimo) / 1000);
    this.ultimo = ahora;
    for (const capa of this.capas) if (capa.visible) this._dibujar(capa);
    this.cuadro = null;
    this._programar();
  }

  _ajustar(capa) {
    // Los elementos SVG no tienen offsetTop: la posición se calcula respecto del contenedor.
    const caja = capa.svg.getBoundingClientRect();
    const marco = capa.contenedor.getBoundingClientRect();
    const vista = capa.svg.viewBox.baseVal;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // position: absolute se mide desde adentro del borde del contenedor (clientLeft/clientTop).
    const { contenedor } = capa;
    capa.canvas.style.left = `${caja.left - marco.left - contenedor.clientLeft + contenedor.scrollLeft}px`;
    capa.canvas.style.top = `${caja.top - marco.top - contenedor.clientTop + contenedor.scrollTop}px`;
    capa.canvas.style.width = `${caja.width}px`;
    capa.canvas.style.height = `${caja.height}px`;
    capa.canvas.width = Math.max(1, Math.round(caja.width * dpr));
    capa.canvas.height = Math.max(1, Math.round(caja.height * dpr));
    capa.escala = vista && vista.width ? (caja.width * dpr) / vista.width : dpr;
    capa.origen = { x: vista?.x ?? 0, y: vista?.y ?? 0 };
  }

  _dibujarTodo() {
    for (const capa of this.capas) this._dibujar(capa);
  }

  _dibujar(capa) {
    const ctx = capa.canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, capa.canvas.width, capa.canvas.height);
    ctx.setTransform(capa.escala, 0, 0, capa.escala, -capa.origen.x * capa.escala, -capa.origen.y * capa.escala);
    const t = this.tiempo;
    // Primero lo difuso (halo, calor, pulso) y encima los puntos.
    for (const e of capa.elementos) {
      if (e.tipo === "halo") this._halo(ctx, e, t);
      else if (e.tipo === "calor") this._calor(ctx, e, t);
      else if (e.tipo === "pulso") this._pulso(ctx, e, t);
    }
    for (const e of capa.elementos) if (e.tipo === "puntos") this._puntos(ctx, e, t);
  }

  _puntos(ctx, e, t) {
    const dx = e.hasta.x - e.desde.x;
    const dy = e.hasta.y - e.desde.y;
    const largo = Math.hypot(dx, dy);
    if (largo < 1 || !(e.velocidad > 0)) return;
    const ux = dx / largo;
    const uy = dy / largo;
    const signo = this.electrones ? -1 : 1;
    // Fase común a todos los cables: los puntos de tramos seguidos avanzan alineados.
    const fase = (((signo * e.velocidad * t) % PASO_PUNTOS) + PASO_PUNTOS) % PASO_PUNTOS;
    const radio = this.tokens.puntos / 2;
    ctx.fillStyle = this.electrones ? this.tokens.electrones : this.tokens.convencional;
    ctx.strokeStyle = this.tokens.tinta;
    ctx.lineWidth = this.tokens.borde * 0.6;
    ctx.beginPath();
    // `desfase`: distancia del tramo al inicio del componente, para que el espaciado siga parejo.
    const inicio = (((fase - (e.desfase ?? 0)) % PASO_PUNTOS) + PASO_PUNTOS) % PASO_PUNTOS;
    for (let d = inicio; d <= largo; d += PASO_PUNTOS) {
      const x = e.desde.x + ux * d;
      const y = e.desde.y + uy * d;
      ctx.moveTo(x + radio, y);
      ctx.arc(x, y, radio, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }

  _halo(ctx, e, t) {
    if (!(e.intensidad > 0)) return;
    const respiro = 1 + 0.08 * Math.sin((t / PERIODO_HALO) * Math.PI * 2);
    const radio = e.radio * respiro;
    const gradiente = ctx.createRadialGradient(e.x, e.y, e.radio * 0.2, e.x, e.y, radio);
    gradiente.addColorStop(0, this.tokens.halo);
    gradiente.addColorStop(1, "transparent");
    ctx.globalAlpha = Math.min(1, e.intensidad) * 0.55;
    ctx.fillStyle = gradiente;
    ctx.beginPath();
    ctx.arc(e.x, e.y, radio, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _calor(ctx, e, t) {
    if (!(e.intensidad > 0)) return;
    const latido = 0.75 + 0.25 * Math.sin((t / 2.4) * Math.PI * 2);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angulo);
    ctx.globalAlpha = e.intensidad * 0.45 * latido;
    ctx.fillStyle = this.tokens.calor;
    ctx.beginPath();
    ctx.roundRect(-e.ancho / 2, -e.alto / 2, e.ancho, e.alto, e.alto / 2);
    ctx.fill();
    ctx.restore();
  }

  _pulso(ctx, e, t) {
    const progreso = (t % PERIODO_PULSO) / PERIODO_PULSO;
    const escala = 0.92 + 0.26 * progreso;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angulo);
    ctx.globalAlpha = 0.9 * (1 - progreso);
    ctx.strokeStyle = this.tokens.pulso;
    ctx.lineWidth = this.tokens.borde * 1.4;
    ctx.beginPath();
    ctx.roundRect((-e.ancho / 2) * escala, (-e.alto / 2) * escala, e.ancho * escala, e.alto * escala, 10);
    ctx.stroke();
    ctx.restore();
  }
}
