// Paneles de resultados y ecuaciones, y diálogos de texto.
import { colorTension } from "./lib/animacion.js";
import { MAXIMO_MATRIZ, ecuacionesDe, numeroCorto } from "./lib/ecuaciones.js";
import { fichaDe } from "./lib/ficha.js";
import { buscar, nombreNodo, nodosElectricos } from "./lib/modelo.js";
import { puntosDeEtiqueta, tensionesPorPunto } from "./lib/netlist.js";
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

/** Ficha de la pieza seleccionada (solo con una sola seleccionada). */
function renderFicha({ estado, resultado, seleccion }) {
  const ficha = $("ficha");
  const id = seleccion && seleccion.ids.length === 1 && !seleccion.tierra ? seleccion.ids[0] : null;
  const componente = id ? buscar(estado, id) : null;
  ficha.hidden = !componente;
  if (!componente) return;
  const datos = fichaDe(componente, resultado?.components.find((c) => c.id === id));
  $("ficha-titulo").textContent = datos.titulo;
  $("ficha-datos").replaceChildren(...datos.filas.flatMap(([clave, valor]) => {
    const dt = document.createElement("dt");
    dt.textContent = clave;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    return [dt, dd];
  }));
  $("ficha-avisos").replaceChildren(...datos.avisos.map(({ tipo, texto }) => {
    const p = document.createElement("p");
    p.className = `mensaje ${tipo === "error" ? "mensaje--error" : "mensaje--aviso"}`;
    p.textContent = texto;
    return p;
  }));
}

export function renderResultados(ctl) {
  const { estado, resultado, error } = ctl;
  renderFicha(ctl);
  const sueltos = [...(ctl.sinConectar ?? [])];
  const avisoSueltos = $("aviso-sueltos");
  avisoSueltos.hidden = !sueltos.length || !resultado;
  avisoSueltos.textContent = sueltos.length === 1
    ? `${sueltos[0]} tiene un borne sin conectar: no circula corriente por él.`
    : `${sueltos.join(", ")} tienen bornes sin conectar: no circula corriente por ellos.`;
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
  balance.className = `metrica__valor ${power.ok ? "metrica__valor--ok" : "metrica__valor--mal"}`;
  const residuo = $("residuo-kcl");
  residuo.textContent = `${kcl.toExponential(1)} A`;
  residuo.className = `metrica__valor ${kcl < 1e-6 ? "metrica__valor--ok" : "metrica__valor--mal"}`;

  // Lámparas quemadas: abrieron el circuito.
  const quemadas = resultado.stats.burned_lamps ?? [];
  const avisoLamparas = $("aviso-lamparas");
  avisoLamparas.hidden = !quemadas.length;
  avisoLamparas.textContent = quemadas.length
    ? `${quemadas.length === 1 ? `La lámpara ${quemadas[0]} se quemó` : `Se quemaron ${quemadas.join(", ")}`}: `
      + "superó su potencia nominal y abrió el circuito."
    : "";

  const conError = new Set(error?.details?.components ?? []);
  const cuerpo = $("tabla-componentes");
  cuerpo.replaceChildren(...resultado.components
    .filter((c) => c.type !== "wire" && c.type !== "switch")
    .map((c) => {
      const potencia = formatearSI(c.power, "W") + (c.power < -1e-15 ? " ↑" : "");
      let nombre = c.type !== "lamp" ? c.id
        : `${c.id} · ${c.burned ? "quemada" : `${Math.round(Math.min(1, c.brightness) * 100)} %`}`;
      if (c.unconnected) nombre = `${c.id} · sin conectar`;
      return fila([
        { contenido: nombre },
        { contenido: c.voltage === null ? "—" : formatearSI(c.voltage, "V"), num: true },
        { contenido: formatearSI(c.current, "A"), num: true },
        { contenido: potencia, num: true },
      ], conError.has(c.id) ? "con-error" : "");
    }));

  // Una fila por nodo eléctrico, con el mismo color que en el dibujo.
  const tensiones = new Map([...tensionesPorPunto(resultado)].filter(([, v]) => v !== null));
  const valores = [...tensiones.values()];
  const minimo = Math.min(0, ...valores);
  const maximo = Math.max(0, ...valores);
  $("leyenda-minima").textContent = `${formatearSI(minimo, "V")} (más bajo)`;
  $("leyenda-maxima").textContent = `${formatearSI(maximo, "V")} (más alto)`;
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

function celda(etiqueta, texto, clase) {
  const c = document.createElement(etiqueta);
  c.textContent = texto;
  if (clase) c.className = clase;
  return c;
}

/** Panel "Ecuaciones": KCL por nodo, restricciones de las fuentes y el sistema MNA con valores. */
export function renderEcuaciones(estado) {
  const e = ecuacionesDe(estado);
  const error = $("ecuaciones-error");
  error.hidden = !e.error;
  $("ecuaciones").hidden = Boolean(e.error);
  if (e.error) {
    error.textContent = e.error.code === "empty"
      ? e.error.message
      : `No se pueden plantear las ecuaciones: ${e.error.message}`;
    error.className = e.error.code === "empty" ? "mensaje" : "mensaje mensaje--error";
    return;
  }
  const lista = (id, items) => $(id).replaceChildren(...items.map(({ nombre, ecuacion }) => {
    const li = document.createElement("li");
    li.append(celda("span", `${nombre}: `, "ecuacion-nombre"), celda("code", ecuacion));
    return li;
  }));
  lista("ecuaciones-nodos", e.nodos);
  lista("ecuaciones-fuentes", e.fuentes.length ? e.fuentes : [{ nombre: "—", ecuacion: "no hay fuentes de tensión" }]);

  const contenedor = $("matriz-mna");
  const solucion = $("solucion-mna");
  if (e.recortada) {
    contenedor.replaceChildren(celda("p",
      `El sistema tiene ${e.incognitas.length} incógnitas; la matriz se muestra hasta ${MAXIMO_MATRIZ}.`, "nota"));
    solucion.replaceChildren();
    return;
  }
  const unidad = (nombre) => (nombre.startsWith("I(") ? "A" : "V");
  solucion.replaceChildren(...e.incognitas.map((nombre, i) => {
    const li = document.createElement("li");
    li.append(celda("code", `${nombre} = ${numeroCorto(e.x[i])} ${unidad(nombre)}`));
    return li;
  }));
  const tabla = document.createElement("table");
  tabla.className = "tabla matriz";
  const cabecera = document.createElement("tr");
  cabecera.append(celda("th", ""), ...e.incognitas.map((n) => celda("th", n, "num")),
    celda("th", "z", "num separador"));
  const cuerpo = e.A.map((fila, i) => {
    const tr = document.createElement("tr");
    tr.append(celda("th", i < e.nodos.length ? `KCL ${e.nodos[i].nombre}` : e.fuentes[i - e.nodos.length].nombre),
      ...fila.map((v) => celda("td", numeroCorto(v), v === 0 ? "num cero" : "num")),
      celda("td", numeroCorto(e.z[i]), "num separador"));
    return tr;
  });
  const thead = document.createElement("thead");
  thead.append(cabecera);
  const tbody = document.createElement("tbody");
  tbody.append(...cuerpo);
  tabla.append(thead, tbody);
  contenedor.replaceChildren(tabla);
}

/**
 * Pide varios valores en el diálogo (por ahora, hasta dos campos). Devuelve la lista de textos o
 * null si se cancela. Cada campo: {etiqueta, valor, validar(texto) -> mensaje | null}.
 */
export function pedirValores({ titulo, ayuda = "", campos }) {
  const [primero, segundo] = campos;
  const etiqueta2 = $("dialogo-campo-2");
  const entrada2 = $("dialogo-entrada-2");
  etiqueta2.hidden = !segundo;
  if (segundo) {
    $("dialogo-etiqueta-2").textContent = segundo.etiqueta;
    entrada2.value = segundo.valor;
  }
  const limpiar = () => {
    etiqueta2.hidden = true;
    entrada2.removeAttribute("aria-invalid");
  };
  return pedirTexto({
    titulo, etiqueta: primero.etiqueta, valor: primero.valor, ayuda,
    validar: (t) => {
      const problema = primero.validar(t);
      if (problema || !segundo) return problema;
      const otro = segundo.validar(entrada2.value.trim());
      if (otro) entrada2.setAttribute("aria-invalid", "true");
      else entrada2.removeAttribute("aria-invalid");
      return otro;
    },
  }).then((texto) => {
    const valores = texto === null ? null : segundo ? [texto, entrada2.value.trim()] : [texto];
    limpiar();
    return valores;
  });
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
