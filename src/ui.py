from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.align import Align
from rich import box

console = Console()

# --- TU FIRMA ---
NOMBRE_ALUMNO = "Victoria"

def mostrar_encabezado():
    console.clear()
    titulo = f"""
    [bold cyan]SIMULADOR DE CIRCUITOS CC (MNA)[/bold cyan]
    [italic]Coloquio de Física 2 - Sistema Interactivo[/italic]
    
    [dim]Desarrollado por:[/dim] [bold yellow]{NOMBRE_ALUMNO}[/bold yellow]
    """
    console.print(Panel(Align.center(titulo), border_style="blue"))

def mostrar_ayuda_navegacion():
    console.print(
        "[dim]Atajos:[/dim] [bold red]Q[/] Salir | [bold yellow]R[/] Reiniciar | [bold cyan]B[/] Volver atrás\n"
        "[dim]Formatos:[/dim] 10k (10000), 5m (0.005), 220 (220)",
        justify="center", style="dim"
    )
    console.print("")

def mostrar_resumen_vivo(circ):
    if not circ.resistors and not circ.vsources:
        # ARREGLADO: Cerrado correctamente con [/]
        console.print(Panel("[dim italic]El circuito está vacío. Agrega componentes.[/]", title="Lienzo del Circuito", border_style="dim"))
        return

    table = Table(title="[bold underline]DIAGRAMA DE CONEXIONES[/bold underline]", show_header=True, header_style="bold white", box=box.SIMPLE_HEAVY, expand=True)
    table.add_column("ID", style="cyan", width=6)
    table.add_column("Esquema Visual", style="yellow", justify="center")
    table.add_column("Nodos", justify="center", style="dim")
    table.add_column("Valor", justify="right", style="green")

    for v in circ.vsources:
        grafico = f"({v.n_plus}) ──[bold red](+ V -)[/]── ({v.n_minus})"
        nodos_txt = f"{v.n_plus} → {v.n_minus}"
        table.add_row(v.name, grafico, nodos_txt, f"{v.value} V")

    for r in circ.resistors:
        grafico = f"({r.n1}) ───[bold white]█[dim]R[/]█[/]─── ({r.n2})"
        nodos_txt = f"{r.n1} ↔ {r.n2}"
        table.add_row(r.name, grafico, nodos_txt, f"{r.value} Ω")

    console.print(table)

def mostrar_resultados(voltages, res_currents, vsrc_currents):
    # Tabla de Voltajes
    table_nodes = Table(title="⚡ Voltajes en Nodos", show_header=True, header_style="bold magenta", expand=True, box=box.ROUNDED)
    table_nodes.add_column("Nodo", style="dim", justify="center")
    table_nodes.add_column("Voltaje (V)", justify="right", style="bold green")

    try:
        sorted_nodes = sorted(voltages.items(), key=lambda x: int(x[0]))
    except ValueError:
        sorted_nodes = sorted(voltages.items(), key=lambda x: x[0])

    for n, v in sorted_nodes:
        estilo = "bold white" if str(n) == "0" else "cyan"
        etiqueta = "TIERRA (GND)" if str(n) == "0" else str(n)
        table_nodes.add_row(f"[{estilo}]{etiqueta}[/{estilo}]", f"{v:.4f}")

    # Tabla de Componentes
    table_comp = Table(title="🔌 Análisis de Componentes", show_header=True, header_style="bold yellow", expand=True, box=box.ROUNDED)
    table_comp.add_column("Componente", style="bold cyan")
    table_comp.add_column("Valor", justify="right")
    table_comp.add_column("Corriente (A)", justify="right", style="bold white")
    table_comp.add_column("Potencia (W)", justify="right", style="bold red")
    table_comp.add_column("Conexión", style="dim")

    total_power = 0.0
    
    for name, data in res_currents.items():
        I, n1, n2, R = data
        P = (I**2) * R
        total_power += P
        table_comp.add_row(name, f"{R:.1f} Ω", f"{I:.5f}", f"{P:.5f}", f"N{n1} → N{n2}")

    for name, I in vsrc_currents.items():
        table_comp.add_row(name, "Fuente V", f"{I:.5f}", "-", "Suministro")

    table_comp.add_section()
    table_comp.add_row("TOTAL DISIPADO", "", "", f"[bold underline red]{total_power:.5f}[/]", "Ef. Joule")

    console.print("\n", table_nodes, "\n", table_comp)