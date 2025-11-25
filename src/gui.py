import customtkinter as ctk
from tkinter import messagebox
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import networkx as nx
import sys
import os

# Importamos tu lógica matemática existente
sys.path.append(os.path.dirname(__file__))
from circuit_sim import Circuit

# Configuración visual
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

class AplicacionVisual(ctk.CTk):
    def __init__(self):
        super().__init__()

        # Configuración de la Ventana
        self.title("Simulador de Circuitos - Física 2")
        self.geometry("1200x700")
        
        # Lógica del Circuito
        self.circ = Circuit()
        self.contador_r = 1
        self.contador_v = 1

        # ============================================================
        # 1. BARRA SUPERIOR (Entrada de Datos - Como pediste)
        # ============================================================
        self.frame_top = ctk.CTkFrame(self, corner_radius=10)
        self.frame_top.pack(side="top", fill="x", padx=10, pady=10)

        # Título pequeño
        lbl_titulo = ctk.CTkLabel(self.frame_top, text="AGREGAR COMPONENTES:", font=("Arial", 14, "bold"))
        lbl_titulo.pack(side="left", padx=15)

        # Selección de Tipo
        self.tipo_var = ctk.StringVar(value="Resistencia")
        self.combo_tipo = ctk.CTkComboBox(self.frame_top, values=["Resistencia", "Fuente Voltaje"], 
                                          command=self.cambiar_tipo, variable=self.tipo_var, width=150)
        self.combo_tipo.pack(side="left", padx=5)

        # Inputs
        self.entry_valor = ctk.CTkEntry(self.frame_top, placeholder_text="Valor (Ω)", width=100)
        self.entry_valor.pack(side="left", padx=5)

        self.entry_n1 = ctk.CTkEntry(self.frame_top, placeholder_text="Nodo A", width=80)
        self.entry_n1.pack(side="left", padx=5)

        self.entry_n2 = ctk.CTkEntry(self.frame_top, placeholder_text="Nodo B", width=80)
        self.entry_n2.pack(side="left", padx=5)

        # Botón Agregar
        self.btn_agregar = ctk.CTkButton(self.frame_top, text="+ AGREGAR", fg_color="green", width=100, command=self.agregar_componente)
        self.btn_agregar.pack(side="left", padx=15)

        # Botón Calcular
        self.btn_calcular = ctk.CTkButton(self.frame_top, text="▶ CALCULAR", fg_color="#D35400", font=("Arial", 12, "bold"), command=self.calcular)
        self.btn_calcular.pack(side="right", padx=15)
        
        self.btn_reset = ctk.CTkButton(self.frame_top, text="♻ Reiniciar", fg_color="gray", width=80, command=self.reiniciar)
        self.btn_reset.pack(side="right", padx=5)

        # ============================================================
        # 2. ÁREA PRINCIPAL
        # ============================================================
        self.main_area = ctk.CTkFrame(self, fg_color="transparent")
        self.main_area.pack(fill="both", expand=True, padx=10, pady=5)

        # --- Panel Izquierdo: Lista de Componentes ---
        self.frame_lista = ctk.CTkFrame(self.main_area, width=250)
        self.frame_lista.pack(side="left", fill="y", padx=(0, 10))
        
        ctk.CTkLabel(self.frame_lista, text="LISTA DE CONEXIONES", font=("Arial", 12, "bold")).pack(pady=10)
        self.textbox_lista = ctk.CTkTextbox(self.frame_lista, width=230)
        self.textbox_lista.pack(fill="both", expand=True, padx=10, pady=10)

        # --- Panel Derecho: Gráfico y Resultados ---
        self.frame_grafico = ctk.CTkFrame(self.main_area)
        self.frame_grafico.pack(side="right", fill="both", expand=True)

        # Inicializar figura de Matplotlib vacía
        self.fig, self.ax = plt.subplots(figsize=(6, 5))
        self.ax.set_title("El diagrama aparecerá aquí al calcular")
        self.ax.axis('off')
        
        # Canvas para integrar Matplotlib en Tkinter
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.frame_grafico)
        self.canvas.get_tk_widget().pack(fill="both", expand=True, padx=10, pady=10)

        # Barra inferior de estado
        self.lbl_estado = ctk.CTkLabel(self, text="Listo. Ingrese componentes arriba. (Nodo 0 es Tierra)", text_color="gray")
        self.lbl_estado.pack(side="bottom", pady=5)

    # --- LÓGICA ---

    def cambiar_tipo(self, choice):
        if choice == "Resistencia":
            self.entry_valor.configure(placeholder_text="Valor (Ω)")
            self.entry_n1.configure(placeholder_text="Nodo A")
            self.entry_n2.configure(placeholder_text="Nodo B")
        else:
            self.entry_valor.configure(placeholder_text="Voltaje (V)")
            self.entry_n1.configure(placeholder_text="Positivo (+)")
            self.entry_n2.configure(placeholder_text="Negativo (-)")

    def agregar_componente(self):
        try:
            val_str = self.entry_valor.get()
            n1 = self.entry_n1.get()
            n2 = self.entry_n2.get()

            if not val_str or not n1 or not n2:
                messagebox.showwarning("Faltan datos", "Por favor complete todos los campos.")
                return

            # Conversión de sufijos (k, m) manual simple o usando tu parser
            if 'k' in val_str: val = float(val_str.replace('k','')) * 1000
            elif 'm' in val_str: val = float(val_str.replace('m','')) / 1000
            else: val = float(val_str)

            tipo = self.tipo_var.get()
            if tipo == "Resistencia":
                name = f"R{self.contador_r}"
                self.circ.add_resistor(name, n1, n2, val)
                texto = f"[R] {name}: {val}Ω  ({n1} ↔ {n2})\n"
                self.contador_r += 1
            else:
                name = f"V{self.contador_v}"
                self.circ.add_vsource(name, n1, n2, val)
                texto = f"[V] {name}: {val}V  ({n1} → {n2})\n"
                self.contador_v += 1

            self.textbox_lista.insert("end", texto)
            self.lbl_estado.configure(text=f"Agregado: {name}", text_color="green")
            
            # Limpiar inputs
            self.entry_valor.delete(0, "end")
            self.entry_n1.delete(0, "end")
            self.entry_n2.delete(0, "end")
            self.entry_valor.focus() # Volver el cursor al inicio

        except ValueError:
            messagebox.showerror("Error", "El valor debe ser un número válido.")

    def reiniciar(self):
        self.circ = Circuit()
        self.contador_r = 1
        self.contador_v = 1
        self.textbox_lista.delete("0.0", "end")
        self.ax.clear()
        self.ax.axis('off')
        self.ax.set_title("Lienzo Reiniciado")
        self.canvas.draw()
        self.lbl_estado.configure(text="Sistema reiniciado", text_color="yellow")

    def calcular(self):
        if not self.circ.resistors and not self.circ.vsources:
            messagebox.showinfo("Vacío", "Agrega componentes antes de calcular.")
            return

        try:
            self.lbl_estado.configure(text="Calculando...", text_color="cyan")
            voltages, res_currents, vsrc_currents = self.circ.solve()
            
            # --- DIBUJAR EN LA VENTANA ---
            self.ax.clear()
            self.dibujar_grafo(voltages, res_currents)
            self.canvas.draw()
            
            # Mostrar resumen rápido en popup o etiqueta
            self.lbl_estado.configure(text="¡Cálculo Exitoso! Ver gráfico para detalles.", text_color="green")

        except Exception as e:
            messagebox.showerror("Error Matemático", f"El circuito no tiene solución:\n{e}\n\nRevise que tenga Tierra (0) y esté cerrado.")
            self.lbl_estado.configure(text="Error en el cálculo", text_color="red")

    def dibujar_grafo(self, voltages, res_currents):
        # Usamos networkx para calcular posiciones bonitas
        G = nx.Graph()
        nodes = sorted(list(self.circ.nodes))
        if '0' not in nodes: nodes.append('0')
        
        for n in nodes: G.add_node(n)
        for r in self.circ.resistors: G.add_edge(r.n1, r.n2)
        for v in self.circ.vsources: G.add_edge(v.n_plus, v.n_minus)

        # Layout automático
        pos = nx.spring_layout(G, seed=42)

        # Dibujar Nodos
        for n, (x,y) in pos.items():
            self.ax.plot(x, y, 'o', markersize=10, color='white', markeredgecolor='black')
            # Etiqueta de Voltaje
            v_val = voltages.get(n, 0.0)
            self.ax.text(x, y+0.1, f"Nodo {n}\n{v_val:.2f}V", ha='center', fontsize=9, color='blue')

        # Dibujar Resistencias (Líneas Azules)
        for r in self.circ.resistors:
            x1,y1 = pos[r.n1]; x2,y2 = pos[r.n2]
            self.ax.plot([x1,x2], [y1,y2], color='#3498DB', linewidth=2, zorder=1)
            
            # Etiqueta Corriente
            mx, my = (x1+x2)/2, (y1+y2)/2
            curr = res_currents[r.name][0]
            self.ax.text(mx, my, f"{r.name}\n{curr:.3f}A", ha='center', fontsize=8, 
                         bbox=dict(boxstyle="round", fc="white", ec="blue", alpha=0.7))

        # Dibujar Fuentes (Líneas Rojas)
        for v in self.circ.vsources:
            x1,y1 = pos[v.n_plus]; x2,y2 = pos[v.n_minus]
            self.ax.plot([x1,x2], [y1,y2], color='#E74C3C', linewidth=2, zorder=1)
            mx, my = (x1+x2)/2, (y1+y2)/2
            self.ax.text(mx, my, f"{v.name}\n{v.value}V", ha='center', fontsize=8, color='red', weight='bold')

        self.ax.axis('off')