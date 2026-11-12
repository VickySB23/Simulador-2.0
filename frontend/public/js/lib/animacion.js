// Cálculos de las animaciones y colores del circuito, sin DOM (con tests).
// Los colores se devuelven como expresiones CSS que usan los tokens (var(--tension-k)), así el
// tema claro, oscuro o proyector cambia la paleta sin recalcular nada.

/** Por debajo de esto la corriente se considera nula: los puntos no se mueven. */
export const CORRIENTE_MINIMA = 1e-9;
const LOG_MIN = -6; // 1 µA
const LOG_MAX = 1; // 10 A
export const VELOCIDAD_MIN = 8; // px/s
export const VELOCIDAD_MAX = 90; // px/s
/** Distancia entre puntos de corriente, en px del dibujo. */
export const PASO_PUNTOS = 14;

/**
 * Velocidad de los puntos de corriente en px/s, en escala logarítmica: 1 µA o menos va a la
 * velocidad mínima, 10 A o más a la máxima y cada década suma lo mismo. 0 si no hay corriente.
 */
export function velocidadCorriente(corriente) {
  const absoluta = Math.abs(corriente ?? 0);
  if (!(absoluta > CORRIENTE_MINIMA)) return 0;
  const t = (Math.log10(absoluta) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  const acotado = Math.min(1, Math.max(0, t));
  return VELOCIDAD_MIN + acotado * (VELOCIDAD_MAX - VELOCIDAD_MIN);
}

/** Duración en segundos de un ciclo de la animación de puntos (lo que tarda en avanzar un paso). */
export function duracionCiclo(corriente, paso = PASO_PUNTOS) {
  const v = velocidadCorriente(corriente);
  return v === 0 ? null : paso / v;
}

/**
 * Brillo de una lámpara: P / Pnominal acotado entre 0 y 1. Si la potencia supera la nominal,
 * la lámpara se muestra quemada.
 */
export function brilloLampara(potencia, potenciaNominal) {
  if (!(potenciaNominal > 0)) throw new Error("La potencia nominal tiene que ser mayor que 0.");
  const p = Math.max(0, potencia ?? 0);
  const relacion = p / potenciaNominal;
  return { brillo: Math.min(1, relacion), quemada: relacion > 1 + 1e-9, relacion };
}

/**
 * Brillo cálido de una resistencia según su potencia, relativo a la que más disipa en el circuito
 * (0 a 1). Raíz cuadrada para que las chicas igual se noten; debajo del 2 % no brilla.
 */
export function calorResistencia(potencia, potenciaMaxima) {
  if (!(potenciaMaxima > 0) || !(potencia > 0)) return 0;
  const relativa = Math.min(1, potencia / potenciaMaxima);
  return relativa < 0.02 ? 0 : Math.sqrt(relativa);
}

/** Posición de una tensión entre la mínima y la máxima del circuito (0 a 1). */
export function posicionTension(tension, minima, maxima) {
  const rango = maxima - minima;
  if (!(rango > 1e-12)) return 0.5;
  return Math.min(1, Math.max(0, (tension - minima) / rango));
}

/**
 * Color de un cable según su tensión: var(--tension-0) (azul oscuro, la más baja) a
 * var(--tension-4) (rojo, la más alta), interpolando entre los cinco tokens con color-mix.
 */
export function colorTension(tension, minima, maxima) {
  const t = posicionTension(tension, minima, maxima) * 4;
  const k = Math.min(3, Math.floor(t));
  const fraccion = t - k;
  if (fraccion < 0.005) return `var(--tension-${k})`;
  if (fraccion > 0.995) return `var(--tension-${k + 1})`;
  const porcentaje = Math.round(fraccion * 100);
  return `color-mix(in oklab, var(--tension-${k + 1}) ${porcentaje}%, var(--tension-${k}))`;
}

/** Una fuente de tensión "entrega" energía si su potencia (convención pasiva) es negativa. */
export function entregaEnergia(potencia) {
  return (potencia ?? 0) < -1e-12;
}
