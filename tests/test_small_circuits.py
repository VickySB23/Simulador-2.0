import sys
import os
import math

# Truco para poder importar 'src' desde la carpeta 'tests'
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from circuit_sim import parse_netlist_lines

def test_voltage_divider():
    """
    Prueba automática: Divisor de voltaje.
    V1 = 12V
    R1 = 1k
    R2 = 2k
    Teoría: El voltaje en el medio debe ser 8V.
    """
    # Definimos un circuito pequeño en texto (como si fuera un archivo .net)
    lines = [
        'V1 1 0 12',
        'R1 1 2 1000',
        'R2 2 0 2000'
    ]
    
    # Usamos tu motor para resolverlo
    circ = parse_netlist_lines(lines)
    voltages, res_currents, vsrc_currents = circ.solve()
    
    # Obtenemos el voltaje calculado en el nodo 2
    V2_calculado = voltages['2']
    
    # Calculamos el valor teórico (Física 2 pura)
    # V2 = Vfuente * (R2 / (R1 + R2))
    V2_teorico = 12 * (2000 / (1000 + 2000))
    
    # Verificamos que la diferencia sea insignificante (menor a 0.000000001)
    assert abs(V2_calculado - V2_teorico) < 1e-9
    
    print("¡Test del Divisor de Voltaje PASÓ correctamente!")

if __name__ == "__main__":
    test_voltage_divider()