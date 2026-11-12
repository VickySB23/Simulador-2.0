# Motor JS contra el backend Python

`comparar.mjs` genera circuitos aleatorios reproducibles (semilla fija) y compara el motor del
navegador (`frontend/public/js/lib/mna.js`) con `POST /simulate` del servicio en Python de la rama
`microservicios`. La mezcla incluye circuitos conectados, otros al azar (que suelen tener errores),
errores forzados (valor inválido o faltante, R ≤ 0, id repetido, fuentes en paralelo o en corto,
nodos sueltos) y uno de cada 50 con más de 200 incógnitas, que se resuelve con el método disperso.

Compara:

- en los inválidos: el código, el mensaje y los `details` (nodos o componentes) del error;
- en los válidos: el solver elegido, la cantidad de nodos e incógnitas, y las tensiones,
  corrientes, potencias y el balance.

Para correrlo hace falta el stack de la rama `microservicios` levantado:

```bash
git switch microservicios && docker compose up --build -d --wait
git switch web
node tests/comparacion/comparar.mjs 500        # cantidad y semilla opcionales
```

Resultado guardado en [`docs/comparacion/motor-js-vs-python-500.json`](../../docs/comparacion/motor-js-vs-python-500.json)
(2026-11-12, semilla 20261112):

| Medida | Valor |
| --- | --- |
| Circuitos | 500 (222 válidos: 205 densos, 10 dispersos y 7 triviales; 278 con error) |
| Errores con distinto código, mensaje o detalle | 0 |
| Diferencia máxima relativa a la escala del circuito | 5,5·10⁻¹⁰ en tensiones, corrientes y potencias |
| Diferencia máxima absoluta en tensión | 2,1·10⁻⁵ V |

La diferencia relativa a cada valor puede parecer grande en nodos con tensión casi cero: llega a
6·10⁻⁵ en un nodo de −0,0017 V de un circuito de 402 componentes (resolución dispersa) con
tensiones de hasta 2·10⁴ V. Es cancelación de punto flotante; la medida que importa es la relativa
a la escala del circuito.
