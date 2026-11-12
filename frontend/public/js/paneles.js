// Paneles de resultados y diálogo de texto.
import { nombreNodo, nodosElectricos } from "./lib/modelo.js";
import { colorTension, puntosDeEtiqueta, tensionesPorPunto } from "./lib/netlist.js";
import { formatearSI } from "./lib/valores.js";

const $ = (id) => document.getElementById(id);

function fila(celdas, clase) {
  const tr = document.createElement("tr");
  if (clase) tr.className = clase;
  for (const { contenido, num, nodo } of celdas) {
    const td = document.createElement("td");
    if (num) td.className = "num";
    if (nodo) td.append(nodo);
    if (contenido !== undefined) td.append(contenido);
    tr.append(td);
  }
  return tr;
}

/** Errores que no se muestran como mensaje rojo: el circuito simplemente está incompleto. */
const SIN_MENSAJE = new Set(["empty"]);

export function renderResultados({ estado, resultado, error }) {
  const mensaje = $("mensaje-error");
  const mostrarError = error && !SIN_MENSAJE.has(error.code);
  mensaje.hidden = !mostrarError;
  if (mostrarError) mensaje.textContent = error.message;

  $("resultados").hidden = !resultado;
  $("resultados-vacios").hidden = Boolean(resultado) || Boolean(mostrarError);
  if (error && SIN_MENSAJE.has(error.code)) $("resultados-vacios").textContent = error.message;
  if (!resultado) return;

  const { power, kcl_max_residual: kcl, stats } = resultado;
  $("potencia-entregada").textContent = formatearSI(power.supplied, "W");
  $("potencia-absorbida").textContent = formatearSI(power.absorbed, "W");
  const balance = $("potencia-balance");
  // Con balance OK el neto es ruido de punto flotante: va al tooltip, no a la tarjeta.
  balance.textContent = power.ok ? "OK" : `Neto ${formatearSI(power.net, "W")}`;
  balance.title = `Entregada − absorbida = ${power.net.toExponential(2)} W`;
  balance.className = `tarjeta-valor ${power.ok ? "ok" : "mal"}`;
  const residuo = $("residuo-kcl");
  residuo.textContent = `${kcl.toExponential(1)} A`;
  residuo.className = `tarjeta-valor ${kcl < 1e-6 ? "ok" : "mal"}`;

  const conError = new Set(error?.details?.components ?? []);
  const cuerpo = $("tabla-componentes");
  cuerpo.replaceChildren(...resultado.components
    .filter((c) => c.type !== "wire")
    .map((c) => {
      const potencia = formatearSI(c.power, "W") + (c.power < -1e-15 ? " ↑" : "");
      return fila([
        { contenido: c.id },
        { contenido: formatearSI(c.voltage, "V"), num: true },
        { contenido: formatearSI(c.current, "A"), num: true },
        { contenido: potencia, num: true },
      ], conError.has(c.id) ? "con-error" : "");
    }));

  // Una fila por nodo eléctrico, con el mismo color que en el dibujo.
  const tensiones = tensionesPorPunto(resultado);
  const valores = [...tensiones.values()];
  const minimo = Math.min(0, ...valores);
  const maximo = Math.max(0, ...valores);
  const puntos = puntosDeEtiqueta(estado);
  if (estado.ground) puntos.unshift(estado.ground);
  const nodos = nodosElectricos(estado);
  const tierra = estado.ground ? nodos.get(nombreNodo(estado.ground)) : null;
  $("tabla-nodos").replaceChildren(...puntos
    .filter((p) => tensiones.has(nombreNodo(p)))
    .map((p) => {
      const v = tensiones.get(nombreNodo(p));
      const muestra = document.createElement("span");
      muestra.className = "muestra";
      muestra.style.background = colorTension(v, minimo, maximo);
      const nombre = nodos.get(nombreNodo(p)) === tierra ? `GND (${p.x}, ${p.y})` : `(${p.x}, ${p.y})`;
      return fila([{ nodo: muestra, contenido: nombre }, { contenido: formatearSI(v, "V"), num: true }]);
    }));

  $("estadisticas").textContent =
    `${stats.electrical_nodes} nodos · ${stats.unknowns} incógnitas · solver ${stats.solver} · ` +
    `${stats.total_ms} ms. ↑ = entrega potencia.`;
}

/**
 * Pide un texto en un diálogo modal. Devuelve el texto o null si se cancela.
 * `validar(texto)` devuelve un mensaje de error o null.
 */
export function pedirTexto({ titulo, etiqueta, valor = "", ayuda = "", validar = () => null }) {
  const dialogo = $("dialogo");
  const formulario = $("formulario-dialogo");
  const entrada = $("dialogo-entrada");
  const error = $("dialogo-error");
  $("dialogo-titulo").textContent = titulo;
  $("dialogo-etiqueta").textContent = etiqueta;
  $("dialogo-ayuda").textContent = ayuda;
  error.textContent = "";
  entrada.value = valor;
  entrada.removeAttribute("aria-invalid");
  dialogo.returnValue = "";

  return new Promise((resolver) => {
    const alEnviar = (evento) => {
      if (evento.submitter?.value !== "aceptar") return;
      const problema = validar(entrada.value.trim());
      if (problema) {
        evento.preventDefault();
        error.textContent = problema;
        entrada.setAttribute("aria-invalid", "true");
        entrada.focus();
      }
    };
    const alEscribir = () => {
      error.textContent = "";
      entrada.removeAttribute("aria-invalid");
    };
    const alCerrar = () => {
      formulario.removeEventListener("submit", alEnviar);
      entrada.removeEventListener("input", alEscribir);
      resolver(dialogo.returnValue === "aceptar" ? entrada.value.trim() : null);
    };
    formulario.addEventListener("submit", alEnviar);
    entrada.addEventListener("input", alEscribir);
    dialogo.addEventListener("close", alCerrar, { once: true });
    dialogo.showModal();
    entrada.select();
  });
}
