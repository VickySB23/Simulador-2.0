"""Análisis Nodal Modificado (MNA) para circuitos de corriente continua.

Pasos:
1. Valida los componentes.
2. Une con union-find los nodos conectados por cables ideales: un cable no es una
   resistencia de 1e-9 Ω (eso arruina el condicionamiento de la matriz), sino la
   identidad entre dos nodos.
3. Revisa la topología antes de resolver: tierra presente, nodos flotantes, lazos de
   fuentes de tensión y fuentes en cortocircuito. Así el error dice qué está mal en
   lugar de "matriz singular", y nunca se devuelven tensiones absurdas.
4. Arma el sistema [G B; Bᵀ 0][V; I] = [J; E] en formato disperso y lo resuelve.
5. Calcula corrientes, potencias, balance de potencias y el residuo de KCL.
"""
from __future__ import annotations

import math
import warnings
from collections import defaultdict, deque
from time import perf_counter

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import MatrixRankWarning, spsolve

from app.domain.circuit import (
    GROUND_ALIASES,
    Circuit,
    CircuitError,
    Component,
    ComponentResult,
    ComponentType,
    FloatingNodesError,
    InvalidComponentError,
    NoGroundError,
    PowerBalance,
    ShortedVoltageSourceError,
    SimulationResult,
    SingularCircuitError,
    VoltageSourceLoopError,
)

GROUND = "0"
# Debajo de este tamaño la factorización densa es más rápida que la dispersa.
DENSE_LIMIT = 200
_POWER_TOLERANCE = 1e-6


class _UnionFind:
    def __init__(self) -> None:
        self._parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self._parent.setdefault(x, x)
        root = x
        while self._parent[root] != root:
            root = self._parent[root]
        while self._parent[x] != root:
            self._parent[x], x = root, self._parent[x]
        return root

    def union(self, a: str, b: str) -> bool:
        """Une dos conjuntos; devuelve False si ya estaban unidos. Tierra queda como raíz."""
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if rb == GROUND:
            ra, rb = rb, ra
        self._parent[rb] = ra
        return True


def _validate(circuit: Circuit) -> None:
    if not circuit.components:
        raise CircuitError("El circuito está vacío.")
    seen: set[str] = set()
    for c in circuit.components:
        if not c.id:
            raise InvalidComponentError("Hay un componente sin identificador.")
        if c.id in seen:
            raise InvalidComponentError(f"Identificador repetido: {c.id}.", {"components": [c.id]})
        seen.add(c.id)
        if not c.a or not c.b:
            raise InvalidComponentError(f"{c.id}: falta un nodo.", {"components": [c.id]})
        if c.a == c.b:
            raise InvalidComponentError(
                f"{c.id}: sus dos terminales están en el mismo nodo ({c.a}).", {"components": [c.id]}
            )
        if not math.isfinite(c.value):
            raise InvalidComponentError(f"{c.id}: valor no finito.", {"components": [c.id]})
        if c.type is ComponentType.RESISTOR and c.value <= 0:
            raise InvalidComponentError(
                f"{c.id}: la resistencia debe ser mayor que 0 Ω (para un corto usá un cable).",
                {"components": [c.id]},
            )


def simulate(circuit: Circuit) -> SimulationResult:
    started = perf_counter()
    _validate(circuit)

    def canon(node: str) -> str:
        return GROUND if node == circuit.ground or node.upper() in GROUND_ALIASES else node

    original_nodes = sorted({n for c in circuit.components for n in (c.a, c.b)})
    if not any(canon(n) == GROUND for n in original_nodes):
        raise NoGroundError(
            f"El circuito no tiene tierra: conectá un nodo a '{circuit.ground}' o 'GND'."
        )

    # 1. Cables ideales: los nodos que unen son el mismo nodo eléctrico.
    uf = _UnionFind()
    for n in original_nodes:
        uf.find(canon(n))
    for c in circuit.components:
        if c.type is ComponentType.WIRE:
            uf.union(canon(c.a), canon(c.b))

    def group(node: str) -> str:
        return uf.find(canon(node))

    groups = sorted({group(n) for n in original_nodes})
    members: dict[str, list[str]] = defaultdict(list)
    for n in original_nodes:
        members[group(n)].append(n)

    # 2. Componentes efectivos y fuentes de tensión en cortocircuito.
    active: list[Component] = []
    for c in circuit.components:
        if c.type is ComponentType.WIRE:
            continue
        if group(c.a) == group(c.b):
            if c.type is ComponentType.VOLTAGE_SOURCE:
                raise ShortedVoltageSourceError(
                    f"La fuente {c.id} está en cortocircuito: sus terminales están unidos por cables.",
                    {"components": [c.id]},
                )
            continue  # Una resistencia o fuente de corriente en corto no aporta ecuaciones.
        active.append(c)

    # 3. Nodos flotantes: sin camino a tierra por resistencias o fuentes de tensión.
    # Una fuente de corriente no fija potenciales, así que no cuenta como camino.
    adjacency: dict[str, set[str]] = defaultdict(set)
    for c in active:
        if c.type is not ComponentType.CURRENT_SOURCE:
            ga, gb = group(c.a), group(c.b)
            adjacency[ga].add(gb)
            adjacency[gb].add(ga)
    reached = {GROUND}
    queue = deque([GROUND])
    while queue:
        for nxt in adjacency[queue.popleft()]:
            if nxt not in reached:
                reached.add(nxt)
                queue.append(nxt)
    floating = sorted(n for g in groups if g not in reached for n in members[g])
    if floating:
        raise FloatingNodesError(
            "Nodos sin camino a tierra: " + ", ".join(floating)
            + ". Conectalos con una resistencia o fuente de tensión.",
            {"nodes": floating},
        )

    # 4. Lazos formados solo por fuentes de tensión (KVL contradictoria o indeterminada).
    loop_uf = _UnionFind()
    for c in active:
        if c.type is ComponentType.VOLTAGE_SOURCE and not loop_uf.union(group(c.a), group(c.b)):
            raise VoltageSourceLoopError(
                f"La fuente {c.id} cierra un lazo formado solo por fuentes de tensión "
                "(por ejemplo, dos fuentes en paralelo).",
                {"components": [c.id]},
            )

    # 5. Armado del sistema MNA.
    unknown_nodes = [g for g in groups if g != GROUND]
    index = {g: i for i, g in enumerate(unknown_nodes)}
    vsources = [c for c in active if c.type is ComponentType.VOLTAGE_SOURCE]
    n, m = len(unknown_nodes), len(vsources)
    size = n + m

    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []
    rhs = np.zeros(size)

    def stamp(r: int, col: int, val: float) -> None:
        rows.append(r)
        cols.append(col)
        data.append(val)

    for c in active:
        ia = index.get(group(c.a))
        ib = index.get(group(c.b))
        if c.type is ComponentType.RESISTOR:
            g = 1.0 / c.value
            if ia is not None:
                stamp(ia, ia, g)
            if ib is not None:
                stamp(ib, ib, g)
            if ia is not None and ib is not None:
                stamp(ia, ib, -g)
                stamp(ib, ia, -g)
        elif c.type is ComponentType.CURRENT_SOURCE:
            if ia is not None:
                rhs[ia] -= c.value
            if ib is not None:
                rhs[ib] += c.value

    for k, c in enumerate(vsources):
        row = n + k
        ia = index.get(group(c.a))
        ib = index.get(group(c.b))
        if ia is not None:
            stamp(ia, row, 1.0)
            stamp(row, ia, 1.0)
        if ib is not None:
            stamp(ib, row, -1.0)
            stamp(row, ib, -1.0)
        rhs[row] = c.value

    solve_started = perf_counter()
    if size == 0:
        solution = np.zeros(0)
        solver = "trivial"
    else:
        matrix = sparse.csr_matrix((data, (rows, cols)), shape=(size, size))
        solution, solver = _solve(matrix, rhs)
    solve_ms = (perf_counter() - solve_started) * 1000

    # 6. Resultados.
    group_voltage = {GROUND: 0.0}
    for g, i in index.items():
        group_voltage[g] = float(solution[i])
    node_voltages = {node: group_voltage[group(node)] for node in original_nodes}
    vsource_current = {c.id: float(solution[n + k]) for k, c in enumerate(vsources)}

    results: list[ComponentResult] = []
    kcl: dict[str, float] = defaultdict(float)
    for c in circuit.components:
        va, vb = group_voltage[group(c.a)], group_voltage[group(c.b)]
        voltage = va - vb
        if c.type is ComponentType.WIRE:
            results.append(ComponentResult(c.id, c.type, 0.0, None, 0.0))
            continue
        if c.type is ComponentType.RESISTOR:
            current = voltage / c.value
        elif c.type is ComponentType.VOLTAGE_SOURCE:
            current = vsource_current[c.id]
        else:
            current = c.value
        kcl[group(c.a)] += current
        kcl[group(c.b)] -= current
        results.append(ComponentResult(c.id, c.type, voltage, current, voltage * current))

    absorbed = sum(r.power for r in results if r.power > 0)
    supplied = -sum(r.power for r in results if r.power < 0)
    net = absorbed - supplied
    balance_ok = abs(net) <= _POWER_TOLERANCE * max(1.0, absorbed, supplied)

    return SimulationResult(
        node_voltages=node_voltages,
        components=results,
        power=PowerBalance(supplied=supplied, absorbed=absorbed, net=net, ok=balance_ok),
        kcl_max_residual=max((abs(v) for v in kcl.values()), default=0.0),
        stats={
            "components": len(circuit.components),
            "electrical_nodes": len(groups),
            "unknowns": size,
            "solver": solver,
            "solve_ms": round(solve_ms, 3),
            "total_ms": round((perf_counter() - started) * 1000, 3),
        },
    )


def _solve(matrix: sparse.csr_matrix, rhs: np.ndarray) -> tuple[np.ndarray, str]:
    try:
        if matrix.shape[0] <= DENSE_LIMIT:
            solution, solver = np.linalg.solve(matrix.toarray(), rhs), "dense"
        else:
            with warnings.catch_warnings():
                warnings.simplefilter("error", MatrixRankWarning)
                solution, solver = spsolve(matrix.tocsc(), rhs), "sparse"
    except (np.linalg.LinAlgError, MatrixRankWarning, RuntimeError) as exc:
        raise SingularCircuitError("El sistema de ecuaciones no tiene solución única.") from exc
    if not np.all(np.isfinite(solution)):
        raise SingularCircuitError("El sistema de ecuaciones no tiene solución única.")
    return np.atleast_1d(solution), solver
