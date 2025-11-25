"""
circuit_sim.py
Motor de simulación MNA para circuitos DC.
"""
from __future__ import annotations
import re
import os
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Tuple

# Intentamos importar scipy para velocidad en circuitos gigantes, si no, usamos numpy normal
try:
    from scipy import sparse
    from scipy.sparse.linalg import spsolve
    _HAS_SCIPY = True
except Exception:
    _HAS_SCIPY = False

SI_PREFIXES = {
    'G': 1e9, 'M': 1e6, 'k': 1e3, 'K': 1e3, 'm': 1e-3,
    'u': 1e-6, 'µ': 1e-6, 'n': 1e-9, 'p': 1e-12,
}

def parse_value(token: str) -> float:
    """Convierte textos como '10k' a números (10000.0)."""
    token = token.strip()
    try:
        return float(token)
    except ValueError:
        pass
    m = re.fullmatch(r"([+-]?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)([a-zA-Zµ%]+)", token)
    if not m:
        raise ValueError(f"Valor inválido: '{token}'")
    base = float(m.group(1))
    suf = m.group(2)
    if suf in SI_PREFIXES:
        return base * SI_PREFIXES[suf]
    for ch in suf:
        if ch in SI_PREFIXES:
            return base * SI_PREFIXES[ch]
    raise ValueError(f"Sufijo desconocido: '{suf}'")

@dataclass
class Resistor:
    name: str
    n1: str
    n2: str
    value: float

@dataclass
class VSource:
    name: str
    n_plus: str
    n_minus: str
    value: float

@dataclass
class ISource:
    name: str
    n_plus: str
    n_minus: str
    value: float

class Circuit:
    def __init__(self):
        self.resistors: List[Resistor] = []
        self.vsources: List[VSource] = []
        self.isources: List[ISource] = []
        self.nodes: set = set()

    def _add_node(self, node: str):
        if node.upper() == 'GND': node = '0'
        self.nodes.add(str(node))

    def add_resistor(self, name: str, n1: str, n2: str, R: float):
        self.resistors.append(Resistor(name, str(n1), str(n2), float(R)))
        self._add_node(n1); self._add_node(n2)

    def add_vsource(self, name: str, n_plus: str, n_minus: str, V: float):
        self.vsources.append(VSource(name, str(n_plus), str(n_minus), float(V)))
        self._add_node(n_plus); self._add_node(n_minus)

    def add_isource(self, name: str, n_plus: str, n_minus: str, I: float):
        self.isources.append(ISource(name, str(n_plus), str(n_minus), float(I)))
        self._add_node(n_plus); self._add_node(n_minus)

    def node_index_map(self) -> Tuple[Dict[str,int], List[str]]:
        if '0' not in self.nodes: self.nodes.add('0')
        unknowns = sorted([n for n in self.nodes if n != '0'])
        idx = {n:i for i,n in enumerate(unknowns)}
        return idx, unknowns

    def assemble_mna(self):
        idx_map, nodes = self.node_index_map()
        N = len(nodes)
        M = len(self.vsources)
        G = np.zeros((N,N), dtype=float)
        Ivec = np.zeros((N,), dtype=float)
        B = np.zeros((N,M), dtype=float)
        E = np.zeros((M,), dtype=float)

        for r in self.resistors:
            g = 1.0 / r.value
            n1 = r.n1; n2 = r.n2
            if n1 != '0': i = idx_map[n1]; G[i,i] += g
            if n2 != '0': j = idx_map[n2]; G[j,j] += g
            if n1 != '0' and n2 != '0':
                i = idx_map[n1]; j = idx_map[n2]
                G[i,j] -= g; G[j,i] -= g

        for src in self.isources:
            n_plus = src.n_plus; n_minus = src.n_minus; val = src.value
            if n_plus != '0': Ivec[idx_map[n_plus]] -= val
            if n_minus != '0': Ivec[idx_map[n_minus]] += val

        for k, vs in enumerate(self.vsources):
            E[k] = vs.value
            if vs.n_plus != '0': B[idx_map[vs.n_plus], k] = 1.0
            if vs.n_minus != '0': B[idx_map[vs.n_minus], k] = -1.0

        if M > 0:
            top = np.hstack((G, B))
            bottom = np.hstack((B.T, np.zeros((M, M), dtype=float)))
            A = np.vstack((top, bottom))
            z = np.concatenate((Ivec, E))
        else:
            A = G; z = Ivec

        return A, z, idx_map, nodes

    def solve(self, use_sparse_if_possible: bool = True):
        A, z, idx_map, nodes = self.assemble_mna()
        
        try:
            if _HAS_SCIPY and use_sparse_if_possible and A.shape[0] > 50:
                A_sp = sparse.csr_matrix(A)
                sol = spsolve(A_sp, z)
            else:
                sol = np.linalg.solve(A, z)
        except np.linalg.LinAlgError as e:
            raise RuntimeError(f"Error numérico (Matriz Singular): {e}")

        M = len(self.vsources); N = len(nodes)
        Vsol = sol[:N]
        Isrc = sol[N: N+M] if M > 0 else []

        voltages = {'0': 0.0}
        for n, i in idx_map.items(): voltages[n] = float(Vsol[i])

        res_currents = {}
        for r in self.resistors:
            v1 = voltages.get(r.n1, 0.0)
            v2 = voltages.get(r.n2, 0.0)
            I_R = (v1 - v2) / r.value
            res_currents[r.name] = (float(I_R), r.n1, r.n2, float(r.value))

        vsrc_currents = {}
        for k, vs in enumerate(self.vsources):
            vsrc_currents[vs.name] = float(Isrc[k]) if M > 0 else 0.0

        return voltages, res_currents, vsrc_currents

def parse_netlist_lines(lines: List[str]) -> Circuit:
    circ = Circuit()
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(('*','#',';')): continue
        parts = re.split(r"\s+", line)
        tok = parts[0].upper()
        try:
            if tok.startswith('R'):
                circ.add_resistor(parts[0], parts[1], parts[2], parse_value(parts[3]))
            elif tok.startswith('V'):
                circ.add_vsource(parts[0], parts[1], parts[2], parse_value(parts[3]))
            elif tok.startswith('I'):
                circ.add_isource(parts[0], parts[1], parts[2], parse_value(parts[3]))
        except Exception: pass
    return circ

def load_netlist(path: str) -> Circuit:
    with open(path, 'r', encoding='utf-8') as f: return parse_netlist_lines(f.readlines())