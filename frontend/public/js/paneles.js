// Paneles de resultados y ecuaciones, y diálogos de texto.
import { colorTension } from "./lib/animacion.js";
import { MAXIMO_MATRIZ, ecuacionesDe, numeroCorto } from "./lib/ecuaciones.js";
import { PASOS, escalaDe, posicionDeValor, rangoDe, textoDeValor, valorDePosicion } from "./lib/deslizador.js";
import { fichaDe } from "./lib/ficha.js";
import { TIPOS, buscar, nombreNodo, nodosElectricos, tieneValor, tierrasDe } from "./lib/modelo.js";
import { puntosDeEtiqueta, tensionesPorPunto } from "./lib/netlist.js";
import { nombresDeCorrientes, nombresDeNodos } from "./lib/nombres.js";
import { formatearSI, interpretarValor } from "./lib/valores.js";

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
function renderFicha(ctl) {
  const { estado, resultado, seleccion } = ctl;
  const ficha = $("ficha");
  const id = seleccion && seleccion.ids.length === 1 ? seleccion.ids[0] : null;
  const componente = id ? buscar(estado, id) : null;
  ficha.hidden = !componente;
  renderControl(ctl, componente);
  if (!componente) return;
  const nombres = nombresDeNodos(estado).porPunto;
  const datos = fichaDe(componente, resultado?.components.find((c) => c.id === id), {
    nombreCorriente: nombresDeCorrientes(estado).get(id),
    nodos: componente.type === "ground" ? null : [nombres.get(nombreNodo(componente.a)), nombres.get(nombreNodo(componente.b))],
    lectura: ctl.lecturas?.get(id),
  });
  $("ficha-titulo").textContent = datos.titulo;
  $("ficha-datos").replaceChildren(...datos.filas.flatMap(([clave, valor]) => {
    const dt = document.createElement("dt");
    dt.textContent = clave;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    // Un valor largo (la lectura del código de colores) va en su propio renglón, a todo el ancho.
    if (valor.length > 22) for (const e of [dt, dd]) e.classList.add("ficha__largo");
    return [dt, dd];
  }));
  $("ficha-avisos").replaceChildren(...datos.avisos.map(({ tipo, texto }) => {
    const p = document.createElement("p");
    p.className = `mensaje ${tipo === "error" ? "mensaje--error" : "mensaje--aviso"}`;
    p.textContent = texto;
    return p;
  }));
}

// --- Control de la ficha: deslizador, selector del multímetro y resistencia interna -----------------

const numeroDe = (texto) => {
  try {
    return interpretarValor(String(texto ?? ""));
  } catch {
    return NaN;
  }
};
let controlActual = null;

function elemento(etiqueta, atributos = {}, texto = "") {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === "className") e.className = v;
    else e.setAttribute(k, v);
  }
  if (texto) e.textContent = texto;
  return e;
}

/**
 * Lo que se maneja desde la ficha. Se reconstruye solo si cambia la pieza (o el modo, o el rango):
 * mientras se arrastra el deslizador el circuito se recalcula y la ficha se vuelve a pintar, pero
 * el deslizador no se reemplaza (si no, se cortaría el arrastre).
 */
function renderControl(ctl, c) {
  const caja = $("ficha-control");
  if (!c) {
    caja.replaceChildren();
    controlActual = null;
    return;
  }
  const clave = [c.id, c.type, c.modo, JSON.stringify(c.rango ?? null)].join("|");
  if (controlActual?.clave === clave) return actualizarControl(c);
  controlActual = { clave };
  const partes = [];
  if (c.type === "multimeter") {
    const selector = elemento("div", { className: "conmutador", role: "group", "aria-label": "Selector del multímetro" });
    for (const [modo, nombre] of [["V", "Tensión"], ["A", "Corriente"], ["Ω", "Resistencia"]]) {
      const b = elemento("button", {
        type: "button", "data-modo": modo, "aria-pressed": String(c.modo === modo), title: nombre, "aria-label": `${modo}: ${nombre}`,
      }, modo);
      b.addEventListener("click", () => ctl.cambiarModo(c.id, modo));
      selector.append(b);
    }
    partes.push(selector);
  } else if (c.type === "potentiometer") {
    partes.push(...deslizador({
      etiqueta: "Cursor", posicion: Math.round((c.posicion ?? 0.5) * PASOS),
      texto: (pos) => `${Math.round((pos / PASOS) * 100)} %`,
      alMover: (pos) => ctl.valorEnVivo(c.id, "posicion", pos / PASOS),
      alSoltar: () => ctl.confirmarValor(),
    }));
  } else if (tieneValor(c.type)) {
    const escala = escalaDe(c);
    const rango = rangoDe(c);
    const unidad = TIPOS[c.type].unidad;
    partes.push(...deslizador({
      etiqueta: `Valor (${escala === "log" ? "escala logarítmica" : "escala lineal"})`,
      posicion: posicionDeValor(numeroDe(c.value), rango, escala),
      texto: (pos) => formatearSI(valorDePosicion(pos, rango, escala), unidad),
      extremos: [formatearSI(rango.min, unidad), formatearSI(rango.max, unidad)],
      alMover: (pos) => ctl.valorEnVivo(c.id, "value", textoDeValor(valorDePosicion(pos, rango, escala))),
      alSoltar: () => ctl.confirmarValor(),
    }));
    const botonRango = elemento("button", { type: "button", className: "boton boton--chico" }, c.rango ? "Rango fijado…" : "Fijar el rango…");
    botonRango.title = "Elegir el mínimo y el máximo del deslizador";
    botonRango.addEventListener("click", () => ctl.fijarRango(c.id));
    partes.push(botonRango);
  }
  if (c.type === "voltage_source") {
    const fila = elemento("label", { className: "ficha__interna" });
    fila.append(elemento("span", {}, "Resistencia interna"));
    const entrada = elemento("input", { id: "ficha-interna", value: c.rInterna ?? "0", inputmode: "decimal", autocomplete: "off" });
    entrada.addEventListener("change", () => ctl.cambiarResistenciaInterna(c.id, entrada.value));
    fila.append(entrada, elemento("span", {}, "Ω"));
    partes.push(fila);
  }
  caja.replaceChildren(...partes);
}

/** Un deslizador con su lectura: alMover en cada paso, alSoltar al terminar. */
function deslizador({ etiqueta, posicion, texto, extremos, alMover, alSoltar }) {
  const titulo = elemento("div", { className: "ficha__deslizador-titulo" });
  const salida = elemento("output", { className: "ficha__lectura" }, texto(posicion));
  titulo.append(elemento("span", {}, etiqueta), salida);
  const barra = elemento("input", { type: "range", id: "ficha-deslizador", min: "0", max: String(PASOS), step: "1", value: String(posicion) });
  barra.setAttribute("aria-label", etiqueta);
  barra.addEventListener("input", () => {
    salida.textContent = texto(Number(barra.value));
    alMover(Number(barra.value));
  });
  barra.addEventListener("change", alSoltar);
  const partes = [titulo, barra];
  if (extremos) {
    const pie = elemento("div", { className: "ficha__extremos" });
    pie.append(elemento("span", {}, extremos[0]), elemento("span", {}, extremos[1]));
    partes.push(pie);
  }
  controlActual.barra = barra;
  controlActual.salida = salida;
  controlActual.texto = texto;
  return partes;
}

/** Misma pieza: solo se acomoda la lectura (y la barra, si no la está moviendo el usuario). */
function actualizarControl(c) {
  const { barra, salida, texto } = controlActual;
  if (barra && document.activeElement !== barra) {
    const posicion = c.type === "potentiometer" ? Math.round((c.posicion ?? 0.5) * PASOS)
      : posicionDeValor(numeroDe(c.value), rangoDe(c), escalaDe(c));
    barra.value = String(posicion);
    salida.textContent = texto(posicion);
  }
  for (const b of $("ficha-control").querySelectorAll("[data-modo]")) b.setAttribute("aria-pressed", String(b.dataset.modo === c.modo));
  const interna = $("ficha-interna");
  if (interna && document.activeElement !== interna) interna.value = c.rInterna ?? "0";
}

function celda(etiqueta, texto, clase) {
  const c = document.createElement(etiqueta);
  c.textContent = texto;
  if (clase) c.className = clase;
  return c;
}

/** Clona la plantilla de un grupo; el título resalta el circuito en el dibujo al tocarlo. */
function grupoDe(plantilla, circuito, ctl, varios, estado) {
  const grupo = $(plantilla).content.firstElementChild.cloneNode(true);
  grupo.dataset.circuito = circuito.numero;
  const titulo = grupo.querySelector(".grupo__titulo");
  titulo.hidden = !varios;
  titulo.setAttribute("aria-pressed", String(ctl.circuitoResaltado === circuito.numero));
  titulo.title = "Resaltar este circuito en el dibujo";
  grupo.querySelector(".grupo__nombre").textContent = `Circuito ${circuito.numero}`;
  grupo.querySelector(".grupo__estado").textContent = estado;
  grupo.classList.toggle("grupo--error", Boolean(circuito.error && circuito.error.code !== "empty"));
  titulo.addEventListener("click", () => ctl.resaltarCircuito(circuito.numero));
  return grupo;
}

const estadoDe = (circuito) => {
  if (circuito.resultado) return "OK";
  return circuito.error?.code === "empty" ? "incompleto" : "con error";
};

/** Subestado con solo los componentes de un circuito. */
const soloCircuito = (estado, circuito) => {
  const ids = new Set(circuito.ids);
  return { ...estado, components: estado.components.filter((c) => ids.has(c.id)) };
};

function llenarResultados(grupo, circuito, estado, escala, nombres) {
  const { resultado, error } = circuito;
  const errorReal = error && !SIN_MENSAJE.has(error.code);
  const caja = grupo.querySelector(".grupo__error");
  caja.hidden = !errorReal;
  if (errorReal) caja.textContent = error.message;
  const nota = grupo.querySelector(".grupo__nota");
  nota.hidden = !error || errorReal;
  if (error && !errorReal) nota.textContent = error.message;
  grupo.querySelector(".grupo__contenido").hidden = !resultado;
  if (!resultado) return;

  const { power, kcl_max_residual: kcl, stats } = resultado;
  const $g = (clase) => grupo.querySelector(`.${clase}`);
  $g("potencia-entregada").textContent = formatearSI(power.supplied, "W");
  $g("potencia-absorbida").textContent = formatearSI(power.absorbed, "W");
  const balance = $g("potencia-balance");
  // Con balance OK el neto es ruido de punto flotante: va al tooltip, no a la tarjeta.
  balance.textContent = power.ok ? "OK" : `Neto ${formatearSI(power.net, "W")}`;
  balance.title = `Entregada − absorbida = ${power.net.toExponential(2)} W`;
  balance.classList.add(power.ok ? "metrica__valor--ok" : "metrica__valor--mal");
  const residuo = $g("residuo-kcl");
  residuo.textContent = `${kcl.toExponential(1)} A`;
  residuo.classList.add(kcl < 1e-6 ? "metrica__valor--ok" : "metrica__valor--mal");

  $g("tabla-componentes").replaceChildren(...resultado.components
    .filter((c) => c.type !== "wire" && c.type !== "switch")
    .map((c) => {
      const potencia = formatearSI(c.power, "W") + (c.power < -1e-15 ? " ↑" : "");
      const corriente = nombres.corrientes.get(c.id);
      let nombre = corriente ? `${c.id} (${corriente})` : c.id;
      if (c.type === "lamp") nombre += ` · ${c.burned ? "quemada" : `${Math.round(Math.min(1, c.brightness) * 100)} %`}`;
      if (c.type === "fuse" && c.blown) nombre += " · quemado";
      if (c.unconnected) nombre = `${c.id} · sin conectar`;
      return fila([
        { contenido: nombre },
        { contenido: c.voltage === null ? "—" : formatearSI(c.voltage, "V"), num: true },
        { contenido: formatearSI(c.current, "A"), num: true },
        { contenido: potencia, num: true },
      ]);
    }));

  // Una fila por nodo eléctrico, con el mismo color que en el dibujo.
  const sub = soloCircuito(estado, circuito);
  const tensiones = new Map([...tensionesPorPunto(resultado)].filter(([, v]) => v !== null));
  const tierras = tierrasDe(sub);
  const nodos = nodosElectricos(sub);
  const deTierra = new Set(tierras.map((t) => nodos.get(nombreNodo(t.a))));
  const puntos = [...tierras.slice(0, 1).map((t) => t.a), ...puntosDeEtiqueta(sub)];
  $g("tabla-nodos").replaceChildren(...puntos
    .filter((p) => tensiones.has(nombreNodo(p)))
    .map((p) => {
      const v = tensiones.get(nombreNodo(p));
      const muestra = document.createElement("span");
      muestra.className = "muestra";
      muestra.style.background = colorTension(v, escala.minimo, escala.maximo);
      const nombre = deTierra.has(nodos.get(nombreNodo(p))) ? "GND" : nombres.nodos.get(nombreNodo(p)) ?? `(${p.x}, ${p.y})`;
      return fila([{ nodo: muestra, contenido: nombre }, { contenido: formatearSI(v, "V"), num: true }]);
    }));

  $g("estadisticas").textContent =
    `${stats.electrical_nodes} nodos · ${stats.unknowns} incógnitas · solver ${stats.solver} · ` +
    `${stats.total_ms} ms. ↑ = entrega potencia.`;
}

export function renderResultados(ctl) {
  const { estado, resultado, circuitos = [] } = ctl;
  renderFicha(ctl);
  const sueltos = [...(ctl.sinConectar ?? [])];
  const avisoSueltos = $("aviso-sueltos");
  avisoSueltos.hidden = !sueltos.length || !resultado;
  avisoSueltos.textContent = sueltos.length === 1
    ? `${sueltos[0]} tiene un borne sin conectar: no circula corriente por él.`
    : `${sueltos.join(", ")} tienen bornes sin conectar: no circula corriente por ellos.`;

  // Lámparas quemadas: abrieron el circuito.
  const quemadas = resultado?.stats.burned_lamps ?? [];
  const avisoLamparas = $("aviso-lamparas");
  avisoLamparas.hidden = !quemadas.length;
  avisoLamparas.textContent = quemadas.length
    ? `${quemadas.length === 1 ? `La lámpara ${quemadas[0]} se quemó` : `Se quemaron ${quemadas.join(", ")}`}: `
      + "superó su potencia nominal y abrió el circuito."
    : "";

  const vacios = $("resultados-vacios");
  vacios.hidden = circuitos.some((c) => c.resultado || (c.error && !SIN_MENSAJE.has(c.error.code)));
  if (ctl.vacio) vacios.textContent = ctl.vacio;

  // La escala de colores es una sola para toda la hoja (como en el dibujo).
  const valores = [...tensionesPorPunto(resultado).values()].filter((v) => v !== null);
  const escala = { minimo: Math.min(0, ...valores), maximo: Math.max(0, ...valores) };
  $("leyenda").hidden = !resultado;
  $("leyenda-minima").textContent = `${formatearSI(escala.minimo, "V")} (más bajo)`;
  $("leyenda-maxima").textContent = `${formatearSI(escala.maximo, "V")} (más alto)`;

  const varios = circuitos.length > 1;
  const nombres = { nodos: nombresDeNodos(estado).porPunto, corrientes: nombresDeCorrientes(estado) };
  // Con un solo circuito incompleto el aviso general alcanza; si no, un grupo por circuito.
  const mostrar = circuitos.filter((c) => varios || c.error?.code !== "empty");
  $("grupos-resultados").replaceChildren(...mostrar.map((c) => {
    const grupo = grupoDe("plantilla-resultados", c, ctl, varios, estadoDe(c));
    llenarResultados(grupo, c, estado, escala, nombres);
    return grupo;
  }));
}

function llenarEcuaciones(grupo, e) {
  const caja = grupo.querySelector(".grupo__error");
  caja.hidden = !e.error;
  grupo.querySelector(".grupo__contenido").hidden = Boolean(e.error);
  if (e.error) {
    caja.textContent = e.error.code === "empty" ? e.error.message : `No se pueden plantear las ecuaciones: ${e.error.message}`;
    caja.classList.toggle("mensaje--error", e.error.code !== "empty");
    return;
  }
  const $g = (clase) => grupo.querySelector(`.${clase}`);
  const lista = (clase, items) => $g(clase).replaceChildren(...items.map(({ nombre, ecuacion }) => {
    const li = document.createElement("li");
    li.append(celda("span", `${nombre}: `, "ecuacion-nombre"), celda("code", ecuacion));
    return li;
  }));
  lista("ecuaciones-nodos", e.nodos);
  lista("ecuaciones-fuentes", e.fuentes.length ? e.fuentes : [{ nombre: "—", ecuacion: "no hay fuentes de tensión" }]);

  const contenedor = $g("matriz-mna");
  const solucion = $g("solucion-mna");
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
  const cuerpo = e.A.map((filaA, i) => {
    const tr = document.createElement("tr");
    tr.append(celda("th", i < e.nodos.length ? `KCL ${e.nodos[i].nombre}` : e.fuentes[i - e.nodos.length].nombre),
      ...filaA.map((v) => celda("td", numeroCorto(v), v === 0 ? "num cero" : "num")),
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

/** Panel "Ecuaciones": por cada circuito, KCL por nodo, las fuentes y el sistema MNA con valores. */
export function renderEcuaciones(ctl) {
  const { estado, circuitos = [] } = ctl;
  const varios = circuitos.length > 1;
  const mostrar = circuitos.filter((c) => varios || c.error?.code !== "empty");
  const vacias = $("ecuaciones-vacias");
  vacias.hidden = mostrar.length > 0;
  vacias.textContent = ctl.vacio ?? "Todavía no hay un circuito para plantear.";
  const grupos = mostrar.map((c) => {
    const e = ecuacionesDe(soloCircuito(estado, c));
    const grupo = grupoDe("plantilla-ecuaciones", c, ctl, varios, estadoDe(c));
    llenarEcuaciones(grupo, e);
    return { grupo, ok: !e.error };
  });
  $("ecuaciones-notas").hidden = !grupos.some((g) => g.ok);
  $("grupos-ecuaciones").replaceChildren(...grupos.map((g) => g.grupo));
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
