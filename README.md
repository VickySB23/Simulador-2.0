# Simulador de Circuitos DC (MNA)

Este repositorio contiene un simulador de circuitos en corriente continua (DC) basado en **Modified Nodal Analysis (MNA)**.

## Estructura del repositorio

```
circuit-cc-sim/
├─ README.md
├─ requirements.txt
├─ src/
│  ├─ circuit_sim.py
│  └─ cli.py
├─ examples/
│  └─ example.net
├─ tests/
│  └─ test_small_circuits.py
└─ docs/
   └─ ecuaciones.md
```

## Uso rápido

```bash
python src/circuit_sim.py examples/example.net --out-csv results.csv --out-plot diagram.png
```
