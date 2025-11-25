"""
circuit_sim.py - Motor MNA Robusto con Validaciones Energéticas
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Tuple

@dataclass
class Resistor:
    name: str; n1: str; n2: str; value: float

@dataclass
class VSource:
    name: str; n_plus: str; n_minus: str; value: float

@dataclass
class ISource:
    name: str; n_from: str; n_to: str; value: float

class Circuit:
    def __init__(self):
        self.resistors: List[Resistor] = []
        self.vsources: List[VSource] = []
        self.isources: List[ISource] = []
        self.nodes: set = set()

    def _add_node(self, node: str):
        if str(node).upper() in ['GND', 'TIERRA', '0']: node = '0'
        self.nodes.add(str(node))

    def add_resistor(self, name: str, n1: str, n2: str, R: float):
        self.resistors.append(Resistor(name, str(n1), str(n2), float(R)))
        self._add_node(n1); self._add_node(n2)

    def add_vsource(self, name: str, n_plus: str, n_minus: str, V: float):
        self.vsources.append(VSource(name, str(n_plus), str(n_minus), float(V)))
        self._add_node(n_plus); self._add_node(n_minus)

    def add_isource(self, name: str, n_from: str, n_to: str, I: float):
        self.isources.append(ISource(name, str(n_from), str(n_to), float(I)))
        self._add_node(n_from); self._add_node(n_to)

    def node_index_map(self) -> Tuple[Dict[str,int], List[str]]:
        if '0' not in self.nodes: self.nodes.add('0')
        unknowns = sorted([n for n in self.nodes if n != '0'])
        idx = {n:i for i,n in enumerate(unknowns)}
        return idx, unknowns

    def solve(self):
        idx_map, nodes = self.node_index_map()
        N = len(nodes)
        M = len(self.vsources)
        
        G = np.zeros((N,N), dtype=float)
        B = np.zeros((N,M), dtype=float)
        E = np.zeros((M,), dtype=float)
        Ivec = np.zeros((N,), dtype=float)

        # 1. Estampado de Resistencias (G Matrix)
        for r in self.resistors:
            # Protección contra R=0 (singularidad)
            val = r.value if abs(r.value) > 1e-9 else 1e-9
            g = 1.0 / val
            n1, n2 = r.n1, r.n2
            
            if n1 != '0': i = idx_map[n1]; G[i,i] += g
            if n2 != '0': j = idx_map[n2]; G[j,j] += g
            if n1 != '0' and n2 != '0':
                i, j = idx_map[n1], idx_map[n2]
                G[i,j] -= g; G[j,i] -= g

        # 2. Estampado de Fuentes de Voltaje (B Matrix & E Vector)
        for k, vs in enumerate(self.vsources):
            E[k] = vs.value
            if vs.n_plus != '0': B[idx_map[vs.n_plus], k] = 1.0
            if vs.n_minus != '0': B[idx_map[vs.n_minus], k] = -1.0

        # 3. Estampado de Fuentes de Corriente (I Vector)
        for isrc in self.isources:
            if isrc.n_from != '0': Ivec[idx_map[isrc.n_from]] -= isrc.value
            if isrc.n_to != '0': Ivec[idx_map[isrc.n_to]] += isrc.value

        # Construcción del Sistema Ax = z
        if M > 0:
            top = np.hstack((G, B))
            bottom = np.hstack((B.T, np.zeros((M, M), dtype=float)))
            A = np.vstack((top, bottom))
            z = np.concatenate((Ivec, E))
        else:
            A = G; z = Ivec

        # Resolución
        try:
            sol = np.linalg.solve(A, z)
        except np.linalg.LinAlgError as e:
            raise RuntimeError(f"Matriz Singular: Circuito abierto o nodo flotante. ({e})")

        # Mapeo de Resultados
        Vsol = sol[:N]
        Isrc_v = sol[N: N+M] if M > 0 else []

        voltages = {'0': 0.0}
        for n, i in idx_map.items(): voltages[n] = float(Vsol[i])

        # Resultados por Componente
        results = {}
        
        # Resistencias
        for r in self.resistors:
            v1, v2 = voltages.get(r.n1, 0.0), voltages.get(r.n2, 0.0)
            val = r.value if abs(r.value) > 1e-9 else 1e-9
            i_val = (v1 - v2) / val
            p_val = i_val**2 * val
            results[r.name] = {'v': v1-v2, 'i': i_val, 'p': p_val, 'type': 'R', 'val': r.value}

        # Fuentes V
        for k, vs in enumerate(self.vsources):
            i_val = float(Isrc_v[k])
            v1, v2 = voltages.get(vs.n_plus, 0.0), voltages.get(vs.n_minus, 0.0)
            v_drop = v1 - v2
            # Potencia suministrada (convención pasiva: si sale corriente por +, P es negativa => suministra)
            p_val = v_drop * i_val 
            results[vs.name] = {'v': v_drop, 'i': i_val, 'p': p_val, 'type': 'V', 'val': vs.value}

        # Fuentes I
        for isrc in self.isources:
            v1, v2 = voltages.get(isrc.n_from, 0.0), voltages.get(isrc.n_to, 0.0)
            v_drop = v1 - v2
            p_val = v_drop * isrc.value
            results[isrc.name] = {'v': v_drop, 'i': isrc.value, 'p': p_val, 'type': 'I', 'val': isrc.value}

        return voltages, results
    
    def validate_power_balance(self, results):
        """Devuelve el residual de potencia (debe ser cercano a 0)"""
        total_p = sum(item['p'] for item in results.values())
        return total_p