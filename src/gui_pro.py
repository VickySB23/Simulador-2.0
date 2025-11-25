import tkinter as tk
from tkinter import simpledialog, messagebox, ttk
import math
import sys
import os
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

# Importar motor matemático
sys.path.append(os.path.dirname(__file__))
from circuit_sim import Circuit

class SimuladorPro(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Laboratorio Virtual de Física 2 - Circuitos DC")
        self.geometry("1300x750")
        # Maximizar ventana según sistema operativo
        try:
            self.state('zoomed')
        except:
            self.attributes('-zoomed', True)

        # --- ESTADO DEL SISTEMA ---
        self.nodos = []       # Lista de nodos visuales {'x', 'y', 'id', 'tag'}
        self.componentes = [] # Lista de comps {'tipo', 'n1', 'n2', 'valor', 'ids', 'nombre'}
        
        self.modo = "SELECCIONAR" 
        self.seleccionado = None 
        self.tipo_seleccionado = None # 'COMP' o 'NODO'
        
        # Variables para arrastrar conexiones
        self.nodo_inicio = None
        self.linea_guia = None

        self.crear_interfaz()

    def crear_interfaz(self):
        # 1. Barra de Herramientas Superior (Estilo Ribbon)
        barra = tk.Frame(self, bg="#2c3e50", height=60)
        barra.pack(side="top", fill="x")
        
        # Botones de Herramientas
        self.crear_boton_tool(barra, "👆 Seleccionar", "SELECCIONAR", "#95a5a6")
        tk.Frame(barra, width=20, bg="#2c3e50").pack(side="left") # Separador
        self.crear_boton_tool(barra, "🔵 Nodo", "NODO", "#3498db")
        self.crear_boton_tool(barra, "▅ Resistencia", "R", "#ecf0f1", fg="black")
        self.crear_boton_tool(barra, "🔋 Fuente V", "V", "#e74c3c")
        self.crear_boton_tool(barra, "🅰 Amperímetro", "AMP", "#f39c12")
        
        tk.Button(barra, text="🧮 Calc. Resistividad", command=self.abrir_calculadora_resistividad, bg="#8e44ad", fg="white", relief="flat", padx=10).pack(side="right", padx=10, pady=10)
        tk.Button(barra, text="♻ BORRAR TODO", command=self.borrar_todo, bg="#c0392b", fg="white", relief="flat", padx=10).pack(side="right", padx=10, pady= 10)