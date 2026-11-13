// Pasos del tutorial y cómo se reconoce que cada uno está hecho. Sin DOM.
// Cada paso espera a que el usuario lo haga: `cumplido` mira el circuito y el resultado de la
// simulación ({estado, resultado}); cuando da true, el tutorial pasa al siguiente.
import { nombreNodo, nodosElectricos } from "./modelo.js";

const BRILLO_VISIBLE = 0.02;

const de = (estado, tipo) => estado.components.filter((c) => c.type === tipo);
const filas = (resultado, tipo) => (resultado?.components ?? []).filter((c) => c.type === tipo);

/** Nodos eléctricos contando los interruptores cerrados como cables. */
function nodosConInterruptores(estado) {
  const components = estado.components.map((c) => (c.type === "switch" && c.closed !== false ? { ...c, type: "wire" } : c));
  return nodosElectricos({ ...estado, components });
}

/** Alguna lámpara tiene sus bornes unidos a los dos bornes de una batería. */
function lamparaConectada(estado) {
  const nodos = nodosConInterruptores(estado);
  const par = (c) => [nodos.get(nombreNodo(c.a)), nodos.get(nombreNodo(c.b))];
  return de(estado, "lamp").some((l) => {
    const [la, lb] = par(l);
    return la !== lb && de(estado, "voltage_source").some((v) => {
      const [va, vb] = par(v);
      return (la === va && lb === vb) || (la === vb && lb === va);
    });
  });
}

export const PASOS = [
  {
    id: "bateria",
    titulo: "Poné una batería",
    texto: "Arrastrá la Batería desde la barra hasta el lienzo (o tocala, o apretá B, y hacé clic donde va).",
    cumplido: ({ estado }) => de(estado, "voltage_source").length > 0,
  },
  {
    id: "lampara",
    titulo: "Agregá una lámpara",
    texto: "Traé una Lámpara (tecla L) y dejala a un costado de la batería, sin tocarla.",
    cumplido: ({ estado }) => de(estado, "lamp").length > 0,
  },
  {
    id: "cables",
    titulo: "Uní con cables",
    texto: "Arrastrá desde cada borne de la batería hasta un borne de la lámpara: el cable se dobla solo. "
      + "Un borne suelto queda marcado \"sin conectar\".",
    cumplido: ({ estado, resultado }) =>
      lamparaConectada(estado) || filas(resultado, "lamp").some((l) => Math.abs(l.current) > 1e-12),
  },
  {
    id: "tierra",
    titulo: "Poné la tierra (GND)",
    texto: "Arrastrá GND (tecla G) hasta el borne − de la batería. Es la referencia de 0 V: "
      + "sin ella no se puede simular.",
    cumplido: ({ estado, resultado }) => Boolean(estado.ground && resultado),
  },
  {
    id: "encender",
    titulo: "Encendé la lámpara",
    texto: "Con el circuito cerrado y la tierra puesta, la lámpara brilla. Si no, revisá los cables; con "
      + "doble clic en la batería podés subir su tensión.",
    cumplido: ({ resultado }) => filas(resultado, "lamp").some((l) => !l.burned && l.brightness >= BRILLO_VISIBLE),
  },
  {
    id: "interruptor",
    titulo: "Agregá un interruptor",
    texto: "Arrastrá un Interruptor (tecla S) y soltalo sobre uno de los cables: queda en serie. Después "
      + "tocalo para abrirlo y apagar la lámpara.",
    cumplido: ({ estado, resultado }) => {
      const lamparas = filas(resultado, "lamp");
      return de(estado, "switch").some((s) => s.closed === false)
        && lamparas.length > 0 && lamparas.every((l) => !l.burned && Math.abs(l.current) < 1e-12);
    },
  },
  {
    id: "quemar",
    titulo: "Quemá la lámpara",
    texto: "Cerrá el interruptor con un clic y hacé doble clic en la lámpara: bajale la potencia nominal "
      + "(por ejemplo, a 1 W). Si recibe más de lo que aguanta, se quema y abre el circuito.",
    cumplido: ({ resultado }) => filas(resultado, "lamp").some((l) => l.burned),
  },
];

/** Desde el paso `indice`, avanza mientras el paso actual ya esté hecho. Devuelve el índice nuevo. */
export function avanzar(indice, contexto) {
  let i = Math.max(0, indice);
  while (i < PASOS.length && PASOS[i].cumplido(contexto)) i++;
  return i;
}

export const terminado = (indice) => indice >= PASOS.length;
