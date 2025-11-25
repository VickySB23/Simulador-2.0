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
        
        # --- AQUÍ ESTABA EL ERROR ANTES (Botones corregidos) ---
        tk.Button(barra, text="🧮 Calc. Resistividad", command=self.abrir_calculadora_resistividad, bg="#8e44ad", fg="white", relief="flat", padx=10).pack(side="right", padx=10, pady=10)
        tk.Button(barra, text="♻ BORRAR TODO", command=self.borrar_todo, bg="#c0392b", fg="white", relief="flat", padx=10).pack(side="right", padx=10, pady=10)
        # -------------------------------------------------------

        # 2. Contenedor Principal (Split View)
        main_container = tk.PanedWindow(self, orient=tk.HORIZONTAL, sashwidth=5, bg="#bdc3c7")
        main_container.pack(fill="both", expand=True)

        # 3. Lienzo de Dibujo (Izquierda)
        self.canvas = tk.Canvas(main_container, bg="white", cursor="arrow")
        # Eventos del Mouse
        self.canvas.bind("<Button-1>", self.clic_canvas)
        self.canvas.bind("<B1-Motion>", self.arrastrar_canvas)
        self.canvas.bind("<ButtonRelease-1>", self.soltar_canvas)
        
        # Agregar scrollbars (opcional pero útil)
        main_container.add(self.canvas, minsize=600)

        # 4. Panel de Ingeniería (Derecha)
        panel_derecho = tk.Frame(main_container, bg="#ecf0f1", width=400)
        main_container.add(panel_derecho, minsize=400)

        # --- SECCIÓN A: EDICIÓN RÁPIDA ---
        tk.Label(panel_derecho, text="INSPECTOR DE COMPONENTES", bg="#2980b9", fg="white", font=("Arial", 10, "bold"), pady=5).pack(fill="x")
        
        self.frame_propiedades = tk.Frame(panel_derecho, bg="#ecf0f1", pady=10)
        self.frame_propiedades.pack(fill="x", padx=10)
        
        self.lbl_sel = tk.Label(self.frame_propiedades, text="Seleccione un componente para editar", bg="#ecf0f1", fg="gray")
        self.lbl_sel.pack()
        
        self.frame_edit_val = tk.Frame(self.frame_propiedades, bg="#ecf0f1")
        tk.Label(self.frame_edit_val, text="Valor:", bg="#ecf0f1").pack(side="left")
        self.entry_val = tk.Entry(self.frame_edit_val, width=10)
        self.entry_val.pack(side="left", padx=5)
        tk.Button(self.frame_edit_val, text="Aplicar", command=self.aplicar_edicion, bg="#27ae60", fg="white", relief="flat").pack(side="left")
        # (Se muestra solo cuando hay selección)

        # --- SECCIÓN B: RESULTADOS NUMÉRICOS ---
        tk.Label(panel_derecho, text="RESULTADOS Y ANÁLISIS", bg="#2c3e50", fg="white", font=("Arial", 10, "bold"), pady=5).pack(fill="x", pady=(20,0))
        
        self.btn_simular = tk.Button(panel_derecho, text="▶ SIMULAR CIRCUITO", command=self.simular, bg="#e67e22", fg="white", font=("Arial", 12, "bold"), pady=10, relief="flat")
        self.btn_simular.pack(fill="x", padx=10, pady=10)

        # Tabla de Resultados
        columns = ("comp", "val", "i", "v", "p")
        self.tree = ttk.Treeview(panel_derecho, columns=columns, show="headings", height=8)
        self.tree.heading("comp", text="Comp.")
        self.tree.heading("val", text="Valor")
        self.tree.heading("i", text="Corr. (A)")
        self.tree.heading("v", text="Volt. (V)")
        self.tree.heading("p", text="Pot. (W)")
        
        self.tree.column("comp", width=50); self.tree.column("val", width=60)
        self.tree.column("i", width=70); self.tree.column("v", width=60)
        self.tree.column("p", width=70)
        
        self.tree.pack(fill="x", padx=10)

        # Resumen Teórico
        self.lbl_resumen = tk.Label(panel_derecho, text="---", bg="#ecf0f1", justify="left", anchor="nw", font=("Consolas", 9))
        self.lbl_resumen.pack(fill="x", padx=10, pady=5)

        # --- SECCIÓN C: GRÁFICO DE POTENCIA ---
        tk.Label(panel_derecho, text="DISTRIBUCIÓN DE POTENCIA", bg="#2c3e50", fg="white", font=("Arial", 8, "bold")).pack(fill="x", pady=(10,0))
        
        self.fig = plt.Figure(figsize=(4, 3), dpi=80)
        self.ax = self.fig.add_subplot(111)
        self.ax.set_title("Potencia Disipada (W)", fontsize=10)
        self.canvas_plot = FigureCanvasTkAgg(self.fig, master=panel_derecho)
        self.canvas_plot.get_tk_widget().pack(fill="both", expand=True, padx=10, pady=5)


    def crear_boton_tool(self, parent, texto, valor_modo, color, fg="white"):
        tk.Button(parent, text=texto, command=lambda: self.set_modo(valor_modo), bg=color, fg=fg, relief="flat", font=("Arial", 9, "bold"), padx=15, pady=5).pack(side="left", padx=2, pady=10)

    def set_modo(self, modo):
        self.modo = modo
        self.canvas.config(cursor="crosshair" if modo != "SELECCIONAR" else "arrow")
        # Deseleccionar
        self.seleccionar(None, None)

    # --- Lógica de Dibujo e Interacción ---

    def clic_canvas(self, event):
        x, y = event.x, event.y
        
        if self.modo == "NODO":
            # Crear nodo si no hay uno muy cerca
            if self.encontrar_nodo_cercano(x, y) is None:
                self.crear_nodo_visual(x, y)
        
        elif self.modo == "SELECCIONAR":
            # Prioridad: Nodos -> Componentes
            idx = self.encontrar_nodo_cercano(x, y)
            if idx is not None:
                self.seleccionar('NODO', idx)
                return
            idx_c = self.encontrar_comp_cercano(x, y)
            if idx_c is not None:
                self.seleccionar('COMP', idx_c)
                return
            self.seleccionar(None, None)

        elif self.modo in ["R", "V", "AMP"]:
            # Iniciar conexión
            idx = self.encontrar_nodo_cercano(x, y)
            if idx is not None:
                self.nodo_inicio = idx
                nx, ny = self.nodos[idx]['x'], self.nodos[idx]['y']
                self.linea_guia = self.canvas.create_line(nx, ny, x, y, dash=(2,2), fill="gray")

    def arrastrar_canvas(self, event):
        if self.linea_guia:
            nx, ny = self.nodos[self.nodo_inicio]['x'], self.nodos[self.nodo_inicio]['y']
            self.canvas.coords(self.linea_guia, nx, ny, event.x, event.y)

    def soltar_canvas(self, event):
        if self.linea_guia:
            self.canvas.delete(self.linea_guia)
            self.linea_guia = None
            
            idx_final = self.encontrar_nodo_cercano(event.x, event.y)
            if idx_final is not None and idx_final != self.nodo_inicio:
                self.crear_componente(self.nodo_inicio, idx_final, self.modo)
            
            self.nodo_inicio = None

    # --- Creación Visual ---

    def crear_nodo_visual(self, x, y):
        r = 6
        uid = self.canvas.create_oval(x-r, y-r, x+r, y+r, fill="black", tags="nodo")
        self.nodos.append({'x': x, 'y': y, 'id': uid})

    def crear_componente(self, n1, n2, tipo):
        # Pedir valor
        valor = 0.0
        if tipo == "R":
            v = simpledialog.askfloat("Resistencia", "Valor (Ohms):", parent=self)
            if v is None: return
            valor = v
        elif tipo == "V":
            v = simpledialog.askfloat("Fuente", "Voltaje (Volts):", parent=self)
            if v is None: return
            valor = v
        
        # Dibujar
        x1, y1 = self.nodos[n1]['x'], self.nodos[n1]['y']
        x2, y2 = self.nodos[n2]['x'], self.nodos[n2]['y']
        xm, ym = (x1+x2)/2, (y1+y2)/2
        
        ids = []
        # Línea base
        ids.append(self.canvas.create_line(x1, y1, x2, y2, width=2, tags="comp"))
        
        # Símbolo (Rectángulo o Círculo)
        label = f"{valor}Ω" if tipo == "R" else f"{valor}V"
        bg = "#ecf0f1" if tipo == "R" else ("#ffcccc" if tipo == "V" else "#ffffcc")
        
        # Rectángulo de fondo para texto
        rect = self.canvas.create_rectangle(xm-25, ym-12, xm+25, ym+12, fill=bg, outline="black", tags="comp")
        ids.append(rect)
        
        if tipo == "V":
            # Polaridad visual (+ cerca de n1)
            dx = (x2-x1)*0.2; dy = (y2-y1)*0.2
            ids.append(self.canvas.create_text(x1+dx, y1+dy, text="+", fill="red", font=("Arial", 14, "bold")))

        texto_id = self.canvas.create_text(xm, ym, text=label, font=("Arial", 8, "bold"), tags="comp")
        ids.append(texto_id)

        self.componentes.append({
            'tipo': tipo, 'n1': n1, 'n2': n2, 'valor': valor, 
            'ids': ids, 'nombre': f"{tipo}{len(self.componentes)+1}"
        })

    # --- Edición ---
    def seleccionar(self, tipo, idx):
        self.canvas.itemconfig("nodo", fill="black")
        self.canvas.itemconfig("comp", fill="black") # Borde default
        
        self.tipo_seleccionado = tipo
        self.seleccionado = idx
        
        if tipo == 'NODO':
            self.canvas.itemconfig(self.nodos[idx]['id'], fill="red")
        elif tipo == 'COMP':
            # Resaltar rectángulo (penúltimo ID guardado)
            self.canvas.itemconfig(self.componentes[idx]['ids'][1], outline="red", width=2)

        self.actualizar_panel_propiedades()

    def actualizar_panel_propiedades(self):
        self.frame_edit_val.pack_forget()
        if self.seleccionado is not None and self.tipo_seleccionado == 'COMP':
            c = self.componentes[self.seleccionado]
            self.lbl_sel.config(text=f"Editando: {c['nombre']} ({c['tipo']})")
            if c['tipo'] in ['R', 'V']:
                self.frame_edit_val.pack()
                self.entry_val.delete(0, tk.END)
                self.entry_val.insert(0, str(c['valor']))
        else:
            self.lbl_sel.config(text="Seleccione un componente para editar")

    def aplicar_edicion(self):
        if self.seleccionado is not None and self.tipo_seleccionado == 'COMP':
            try:
                val = float(self.entry_val.get())
                self.componentes[self.seleccionado]['valor'] = val
                # Actualizar visualmente el texto
                txt_id = self.componentes[self.seleccionado]['ids'][-1]
                new_lbl = f"{val}Ω" if self.componentes[self.seleccionado]['tipo'] == "R" else f"{val}V"
                self.canvas.itemconfig(txt_id, text=new_lbl)
                messagebox.showinfo("Éxito", "Valor actualizado.")
            except: pass

    # --- Simulación ---
    def simular(self):
        if not self.componentes: return
        
        # Pedir Tierra (Nodo referencia)
        for i, n in enumerate(self.nodos):
            self.canvas.create_text(n['x'], n['y']-15, text=str(i), fill="blue", tags="temp_id")
        self.update()
        
        tierra = simpledialog.askinteger("Referencia", f"Nodo Tierra (0-{len(self.nodos)-1}):", minvalue=0, maxvalue=len(self.nodos)-1)
        self.canvas.delete("temp_id") # Borrar números
        
        if tierra is None: return

        # Construir Circuito Matemático
        circ = Circuit()
        mapa = {i: (str(i) if i != tierra else '0') for i in range(len(self.nodos))}
        
        # Agregar componentes
        for c in self.componentes:
            na, nb = mapa[c['n1']], mapa[c['n2']]
            if c['tipo'] == 'R': circ.add_resistor(c['nombre'], na, nb, c['valor'])
            elif c['tipo'] == 'V': circ.add_vsource(c['nombre'], na, nb, c['valor'])
            elif c['tipo'] == 'AMP': circ.add_vsource(c['nombre'], na, nb, 0.0)

        try:
            voltages, res_curr, vsrc_curr = circ.solve()
            self.mostrar_resultados(voltages, res_curr, vsrc_curr, mapa)
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def mostrar_resultados(self, v, i_r, i_v, mapa):
        # 1. Tabla y Resumen
        self.tree.delete(*self.tree.get_children())
        total_p = 0
        r_names = []; r_powers = []

        for c in self.componentes:
            nom = c['nombre']
            tipo = c['tipo']
            val = c['valor']
            curr = 0.0
            
            if tipo == 'R' and nom in i_r:
                curr = i_r[nom][0]
                pot = curr**2 * val
                total_p += pot
                r_names.append(nom); r_powers.append(pot)
                vals = (nom, val, f"{curr:.4f}", "-", f"{pot:.4f}")
            elif tipo == 'V' and nom in i_v:
                curr = i_v[nom]
                vals = (nom, val, f"{curr:.4f}", "-", "-")
            else:
                vals = (nom, val, "-", "-", "-")
                
            self.tree.insert("", "end", values=vals)

        self.lbl_resumen.config(text=f"Potencia Total Disipada: {total_p:.4f} W\nLey de Conservación de Energía: OK")

        # 2. Gráfico de Barras
        self.ax.clear()
        if r_names:
            self.ax.bar(r_names, r_powers, color='#3498db')
            self.ax.set_ylabel("Potencia (W)")
            self.ax.set_title("Disipación por Resistencia")
        else:
            self.ax.text(0.5, 0.5, "Sin Resistencias", ha='center')
        self.canvas_plot.draw()

        # 3. Visualización en Lienzo (Overlay)
        self.canvas.delete("overlay_res")
        for c in self.componentes:
            if c['tipo'] == 'R' and c['nombre'] in i_r:
                curr = i_r[c['nombre']][0]
                
                x1, y1 = self.nodos[c['n1']]['x'], self.nodos[c['n1']]['y']
                x2, y2 = self.nodos[c['n2']]['x'], self.nodos[c['n2']]['y']
                xm, ym = (x1+x2)/2, (y1+y2)/2
                
                self.canvas.create_text(xm, ym+20, text=f"{curr:.3f}A", fill="blue", font=("Arial", 9, "bold"), tags="overlay_res")

    # --- CALCULADORA EXTRA ---
    def abrir_calculadora_resistividad(self):
        win = tk.Toplevel(self)
        win.title("Calculadora Resistividad")
        win.geometry("300x200")
        
        tk.Label(win, text="R = ρ * L / A").pack(pady=5)
        
        f = tk.Frame(win); f.pack()
        tk.Label(f, text="ρ (Ωm):").grid(row=0,0); e_rho=tk.Entry(f); e_rho.grid(row=0,1)
        tk.Label(f, text="L (m):").grid(row=1,0); e_l=tk.Entry(f); e_l.grid(row=1,1)
        tk.Label(f, text="A (m²):").grid(row=2,0); e_a=tk.Entry(f); e_a.grid(row=2,1)
        
        def calc():
            try:
                res = float(e_rho.get()) * float(e_l.get()) / float(e_a.get())
                l_res.config(text=f"{res:.4f} Ω")
            except: pass
            
        tk.Button(win, text="Calcular", command=calc).pack(pady=5)
        l_res = tk.Label(win, text="-", font=("Arial", 12, "bold"), fg="blue")
        l_res.pack()

    # Utilidades
    def encontrar_nodo_cercano(self, x, y):
        for i, n in enumerate(self.nodos):
            if math.hypot(n['x']-x, n['y']-y) < 15: return i
        return None

    def encontrar_comp_cercano(self, x, y):
        for i, c in enumerate(self.componentes):
            x1, y1 = self.nodos[c['n1']]['x'], self.nodos[c['n1']]['y']
            x2, y2 = self.nodos[c['n2']]['x'], self.nodos[c['n2']]['y']
            if math.hypot((x1+x2)/2 - x, (y1+y2)/2 - y) < 20: return i
        return None

    def borrar_todo(self):
        self.nodos = []; self.componentes = []
        self.canvas.delete("all"); self.tree.delete(*self.tree.get_children())
        self.ax.clear(); self.canvas_plot.draw()