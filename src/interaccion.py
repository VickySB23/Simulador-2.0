import sys
import time
from rich.prompt import Prompt
import ui
from circuit_sim import Circuit, parse_value, load_netlist

class ReiniciarSistema(Exception): pass
class VolverAtras(Exception): pass

def input_inteligente(mensaje, tipo="float", default=None):
    """
    Pide un dato al usuario. 
    Gestiona Q/R/B, evita duplicados (show_default=False) y errores de None.
    """
    while True:
        valor_raw = Prompt.ask(mensaje, default=default, show_default=False)
        
        if valor_raw is None:
            val = ""
        else:
            val = str(valor_raw).strip()
        
        # Comandos Globales
        if val.lower() == 'q':
            ui.console.print("[bold red]👋 Cerrando simulador...[/bold red]")
            sys.exit(0)
        if val.lower() == 'r': raise ReiniciarSistema()
        if val.lower() == 'b': raise VolverAtras()

        if tipo == "str": return val
        
        if tipo == "float":
            if val == "": return None 
            try:
                return parse_value(val)
            except ValueError:
                ui.console.print(f"[red]❌ Valor no válido.[/red] Intente: 10, 1k, 5m")

def modo_crear_circuito():
    """Construye el circuito mostrando el diagrama en vivo."""
    circ = Circuit()
    cont_r = 1
    cont_v = 1

    while True:
        ui.mostrar_encabezado()
        ui.mostrar_resumen_vivo(circ)
        ui.mostrar_ayuda_navegacion()

        ui.console.print("\n[1] Agregar Resistencia (R)")
        ui.console.print("[2] Agregar Fuente de Voltaje (V)")
        ui.console.print("[3] [bold green]CALCULAR Y SIMULAR ▶[/bold green]")
        
        try:
            opcion = input_inteligente("\nSeleccione opción", tipo="str")

            if opcion == "3":
                if not circ.resistors and not circ.vsources:
                    ui.console.print("[red]¡Circuito vacío![/red]")
                    time.sleep(1)
                    continue
                return circ

            # --- RESISTENCIA ---
            if opcion == "1":
                ui.console.print(f"\n[cyan]--- Nueva Resistencia R{cont_r} ---[/cyan]")
                val = input_inteligente(f"  Valor en Ohms (ej: 1k)", default="1k")
                n1 = input_inteligente("  Nodo Entrada", tipo="str")
                n2 = input_inteligente("  Nodo Salida [dim](Enter=0/Tierra)[/dim]", tipo="str", default="0")
                
                circ.add_resistor(f"R{cont_r}", n1, n2, val)
                cont_r += 1

            # --- FUENTE ---
            elif opcion == "2":
                ui.console.print(f"\n[cyan]--- Nueva Fuente V{cont_v} ---[/cyan]")
                val = input_inteligente(f"  Voltaje en Volts (ej: 12)", default="12")
                n_pos = input_inteligente("  Nodo Positivo (+)", tipo="str")
                n_neg = input_inteligente("  Nodo Negativo (-) [dim](Enter=0/Tierra)[/dim]", tipo="str", default="0")
                
                circ.add_vsource(f"V{cont_v}", n_pos, n_neg, val)
                cont_v += 1

        except VolverAtras:
            continue

def ejecutar_simulacion(circ):
    """Realiza cálculos y muestra resultados en terminal (sin PNG)."""
    if not circ: return

    ui.mostrar_encabezado()
    try:
        voltages, res_currents, vsrc_currents = circ.solve()
        ui.mostrar_resultados(voltages, res_currents, vsrc_currents)
        
        input_inteligente("\n[Presione Enter para Reiniciar]", tipo="str", default="")
        
    except Exception as e:
        ui.console.print(ui.Panel(f"[bold red]Error Matemático:[/bold red] {e}\n\nCausa probable: Circuito abierto o sin Tierra (0).", title="ERROR", border_style="red"))
        # Pregunta simple para reintentar o salir
        resp = input_inteligente("¿Intentar corregir? (s/n)", tipo="str", default="s")
        if resp.lower() != 's': sys.exit(0)

def ciclo_principal():
    ui.mostrar_encabezado()
    ui.console.print("\n[1] Cargar Ejercicio 10 (TP4)")
    ui.console.print("[2] Crear circuito nuevo paso a paso")
    
    try:
        opcion = input_inteligente("Seleccione", tipo="str")
        circ = None

        # OPCION 1: Archivo
        if opcion == "1":
            ruta = "examples/ejercicio_10_tp4.net"
            if not os.path.exists(ruta):
                ui.console.print(f"[bold red]Error:[/bold red] Falta '{ruta}'.")
                time.sleep(3); return 
            
            circ = load_netlist(ruta)
            ui.console.print(f"[green]✓ Circuito cargado[/green]")
            
            # Mostrar diagrama antes de calcular
            ui.mostrar_resumen_vivo(circ)
            time.sleep(2.0)
        
        # OPCION 2: Manual
        elif opcion == "2":
            circ = modo_crear_circuito()
        
        else:
            return 

        ejecutar_simulacion(circ)

    except VolverAtras:
        return 

def iniciar_aplicacion():
    while True:
        try:
            ciclo_principal()
        except ReiniciarSistema:
            ui.console.print("[yellow]🔄 Reiniciando...[/yellow]")
            continue
        except KeyboardInterrupt:
            break
        except Exception as e:
            ui.console.print(f"[bold red]Error Inesperado:[/bold red] {e}")
            input("Enter para salir...")
            break