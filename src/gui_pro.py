import tkinter as tk
from tkinter import simpledialog, messagebox, ttk
import math
import sys
import os

# ACTIVAR ALTA DEFINICIÓN (Textos nítidos en Windows)
try:
    from ctypes import windll
    windll.shcore.SetProcessDpiAwareness(1)
except:
    pass

# Importar motor matemático
sys.path.append(os.path.dirname(__file__))
from circuit_sim import Circuit

class SimuladorPro(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Laboratorio de Circuitos - CAD Pro")
        self.geometry("1400x900")
        
        # --- ESTILOS ---
        self.style = ttk.Style()
        self.style.theme_use('clam')
        self.style.configure("Treeview", font=("Segoe UI", 11), rowheight=30)
        self.style.configure("Treeview.Heading", font=("Segoe UI", 11, "bold"), background="#ecf0f1")
        self.style.map("Treeview", background=[('selected', '#3498db')])
        
        self.GRID_SIZE = 40 
        
        # --- DATOS ---
        self.nodos = []       
        self.componentes = [] 
        
        # Historial
        self.history_stack = []
        self.redo_stack = []
        self.is_recording = True 
        
        # Variables de interacción
        self.modo = "SELECCIONAR" # Modo por defecto
        self.seleccionado = None      
        self.tipo_seleccionado = None 
        
        self.nodo_inicio = None
        self.linea_guia = None
        self.tierra_idx = 0 
        
        self.bloqueo_arbol = False 

        self.crear_interfaz()
        self.save_state() 

        # Atajos
        self.bind("<Control-z>", self.undo)
        self.bind("<Control-y>", self.redo)
        self.bind("<Delete>", self.eliminar_seleccion)
        # Escape cancela herramienta actual
        self.bind("<Escape>", lambda e: self.set_modo("SELECCIONAR"))

    def crear_interfaz(self):
        # 1. Barra Superior (Sin botón Seleccionar explicito, es el default)
        barra = tk.Frame(self, bg="#2c3e50", height=70, pady=5)
        barra.pack(side="top", fill="x")
        
        # Etiqueta de Modo
        self.lbl_modo = tk.Label(barra, text="MODO: SELECCIÓN", bg="#2c3e50", fg="#f1c40f", font=("Segoe UI", 12, "bold"))
        self.lbl_modo.pack(side="left", padx=15)
        
        tk.Frame(barra, width=20, bg="#2c3e50").pack(side="left")
        
        # Herramientas de Dibujo
        self.btn_tool(barra, "✏ Cable", "WIRE", "#7f8c8d")
        self.btn_tool(barra, "🔵 Nodo", "NODO", "#3498db")
        self.btn_tool(barra, "▭ Res.", "R", "#ecf0f1", fg="black")
        self.btn_tool(barra, "🔋 Fuente V", "V", "#e74c3c")
        self.btn_tool(barra, "⚡ Fuente I", "I", "#2ecc71")
        
        tk.Button(barra, text="↪ Rehacer", command=self.redo, bg="#95a5a6", fg="white", relief="flat", padx=10).pack(side="right", padx=5)
        tk.Button(barra, text="↩ Deshacer", command=self.undo, bg="#95a5a6", fg="white", relief="flat", padx=10).pack(side="right", padx=5)
        
        # 2. División Principal
        self.paned = tk.PanedWindow(self, orient=tk.HORIZONTAL, sashwidth=8, bg="#bdc3c7")
        self.paned.pack(fill="both", expand=True)

        # IZQUIERDA: GRÁFICO
        self.frame_grafico = tk.Frame(self.paned, bg="white")
        self.paned.add(self.frame_grafico, minsize=500)
        
        self.canvas = tk.Canvas(self.frame_grafico, bg="white", cursor="arrow")
        self.canvas.pack(fill="both", expand=True)
        self.dibujar_rejilla()
        
        self.canvas.bind("<Button-1>", self.clic_canvas)
        self.canvas.bind("<B1-Motion>", self.arrastrar_canvas)
        self.canvas.bind("<ButtonRelease-1>", self.soltar_canvas)

        # DERECHA: TABLA
        self.frame_datos = tk.Frame(self.paned, bg="#ecf0f1")
        self.paned.add(self.frame_datos, minsize=450)

        header = tk.Frame(self.frame_datos, bg="#34495e", pady=8)
        header.pack(fill="x")
        tk.Label(header, text="TABLA DE DATOS (Doble clic en fila para editar)", 
                 bg="#34495e", fg="white", font=("Segoe UI", 11, "bold")).pack()

        # Columnas
        cols = ("Nombre", "Tipo", "Nodos", "Valor", "V (Volts)", "I (Amps)", "P (Watts)")
        self.tree = ttk.Treeview(self.frame_datos, columns=cols, show="headings", selectmode="browse")
        
        anchos = [70, 50, 60, 90, 80, 80, 80]
        for c, w in zip(cols, anchos):
            self.tree.heading(c, text=c)
            self.tree.column(c, width=w, anchor="center")
        
        self.tree.pack(fill="both", expand=True, padx=10, pady=10)
        
        self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)
        self.tree.bind("<Double-1>", self.on_tree_double_click) 

        # Botón Calcular
        btn_calc = tk.Button(self.frame_datos, text="CALCULAR CIRCUITOS", command=self.simular_en_tiempo_real, 
                             bg="#e67e22", fg="white", font=("Segoe UI", 11, "bold"), relief="flat", padx=10, pady=5)
        btn_calc.pack(fill="x", padx=10, pady=(0, 5)) 

        self.status_bar = tk.Label(self.frame_datos, text="Listo.", bg="#95a5a6", fg="white", font=("Segoe UI", 10), anchor="w", padx=10, pady=5)
        self.status_bar.pack(fill="x", side="bottom")

    # --- HERRAMIENTAS ---
    def btn_tool(self, parent, txt, mode, col, fg="white"):
        tk.Button(parent, text=txt, command=lambda: self.set_modo(mode), bg=col, fg=fg, 
                 font=("Segoe UI", 10, "bold"), relief="flat", width=12, pady=5).pack(side="left", padx=5)

    def set_modo(self, m):
        self.modo = m
        # Feedback visual del modo
        txt = "SELECCIÓN" if m == "SELECCIONAR" else f"DIBUJAR: {m}"
        self.lbl_modo.config(text=f"MODO: {txt}")
        
        cursor = "crosshair" if m != "SELECCIONAR" else "arrow"
        self.canvas.config(cursor=cursor)
        self.seleccionar(None, None, update_tree=False)

    def snap(self, v): return round(v/self.GRID_SIZE)*self.GRID_SIZE

    def dibujar_rejilla(self):
        w = self.winfo_screenwidth()
        h = self.winfo_screenheight()
        for i in range(0, w, self.GRID_SIZE):
            for j in range(0, h, self.GRID_SIZE):
                self.canvas.create_oval(i-1, j-1, i+1, j+1, fill="#bdc3c7", outline="")

    # --- CANVAS ---
    def clic_canvas(self, event):
        x, y = self.snap(event.x), self.snap(event.y)
        
        if self.modo == "NODO":
            if self.find_node(x,y) is None: 
                self.save_state()
                self.crear_nodo_visual(x, y)
                # Volver a modo selección tras crear nodo para fluidez
                self.set_modo("SELECCIONAR")
        
        elif self.modo in ["R", "V", "I", "WIRE"]:
            # Iniciar arrastre
            # Si clic en vacío, crear nodo temporal de inicio
            idx = self.find_node(x,y)
            if idx is None:
                self.crear_nodo_visual(x, y)
                idx = len(self.nodos)-1
                
            self.nodo_inicio = idx
            nx, ny = self.nodos[idx]['x'], self.nodos[idx]['y']
            # Línea guía temporal
            self.linea_guia = self.canvas.create_line(nx, ny, x, y, dash=(2,2), fill="#3498db", width=2)

        elif self.modo == "SELECCIONAR":
            idx_n = self.find_node(x,y)
            if idx_n is not None: 
                self.seleccionar('NODO', idx_n)
                return
            idx_c = self.find_comp(x,y)
            if idx_c is not None: 
                self.seleccionar('COMP', idx_c)
                return
            self.seleccionar(None, None)

    def arrastrar_canvas(self, event):
        if self.linea_guia:
            x, y = self.snap(event.x), self.snap(event.y)
            nx, ny = self.nodos[self.nodo_inicio]['x'], self.nodos[self.nodo_inicio]['y']
            
            # Dibujar en "L" (Ortogonal) para la guía también
            self.canvas.coords(self.linea_guia, nx, ny, x, ny, x, y) # Polyline: Start -> Corner -> End

    def soltar_canvas(self, event):
        if self.linea_guia:
            self.canvas.delete(self.linea_guia)
            self.linea_guia = None
            x, y = self.snap(event.x), self.snap(event.y)
            idx_end = self.find_node(x,y)
            
            # Crear nodo final si no existe
            if idx_end is None:
                self.crear_nodo_visual(x, y)
                idx_end = len(self.nodos)-1
            
            if idx_end != self.nodo_inicio:
                self.save_state()
                # Crear componente
                comp_idx = self.crear_componente_visual(self.nodo_inicio, idx_end, self.modo)
                
                # PEDIR VALOR INMEDIATAMENTE (Excepto para cables)
                if self.modo != "WIRE":
                    self.usar_dialogo_fallback(self.componentes[comp_idx]['nombre'], "VALOR")
                else:
                    self.simular_en_tiempo_real()
                
                # Volver a selección automática para flujo rápido
                self.set_modo("SELECCIONAR")
            
            self.nodo_inicio = None

    # --- DIBUJO VISUAL ORTOGONAL ("ACORDADO") ---
    def crear_nodo_visual(self, x, y):
        r = 6
        uid = self.canvas.create_oval(x-r, y-r, x+r, y+r, fill="black", outline="black", tags="nodo")
        self.nodos.append({'x': x, 'y': y, 'id': uid})
        # ID del nodo discreto
        self.canvas.create_text(x+10, y-10, text=str(len(self.nodos)-1), fill="#95a5a6", font=("Arial", 8), tags="nodo_lbl")

    def crear_componente_visual(self, n1, n2, tipo, valor=None, nombre=None):
        # Valor por defecto
        if valor is None: 
            valor = 10.0 if tipo in ['R', 'V'] else 1.0
            if tipo == 'WIRE': valor = 1e-9 # Cable ideal

        if nombre is None:
            count = len([c for c in self.componentes if c['tipo'] == tipo]) + 1
            prefix = "W" if tipo == "WIRE" else tipo
            nombre = f"{prefix}{count}"

        x1, y1 = self.nodos[n1]['x'], self.nodos[n1]['y']
        x2, y2 = self.nodos[n2]['x'], self.nodos[n2]['y']
        
        # Lógica Ortogonal (Manhattan Routing)
        # Dibujamos en L: Primero horizontal hasta x2, luego vertical hasta y2.
        # Puntos: (x1, y1) -> (x2, y1) -> (x2, y2)
        # El punto medio para el componente estará en el segmento más largo o en el centro de la L
        
        mid_x, mid_y = x2, y1 # Esquina
        
        # Calculamos el punto medio "visual" del recorrido
        # Distancia total
        dist_x = abs(x2-x1)
        dist_y = abs(y2-y1)
        
        # Decidir dónde poner el componente (en el tramo largo)
        if dist_x > dist_y:
            # Tramo horizontal dominante
            xm, ym = (x1+x2)/2, y1
            vertical = False
        else:
            # Tramo vertical dominante (o esquina)
            xm, ym = x2, (y1+y2)/2
            vertical = True

        ids = []
        
        # 1. DIBUJAR LOS CABLES (Polyline)
        # Si es un componente, necesitamos un hueco en (xm, ym)
        gap = 20 if tipo != 'WIRE' else 0
        
        if gap > 0:
            # Dibujar cables interrumpiendo en el centro
            if vertical:
                # (x1, y1) -> (x2, y1) -> (x2, ym-gap) ... (x2, ym+gap) -> (x2, y2)
                coords_1 = [x1, y1, x2, y1, x2, ym-gap]
                coords_2 = [x2, ym+gap, x2, y2]
            else:
                # (x1, y1) -> (xm-gap, y1) ... (xm+gap, y1) -> (x2, y1) -> (x2, y2)
                coords_1 = [x1, y1, xm-gap, y1]
                coords_2 = [xm+gap, y1, x2, y1, x2, y2]
            
            # Solo dibujar si los segmentos tienen longitud
            if len(coords_1) >= 4: ids.append(self.canvas.create_line(coords_1, width=2, fill="black", tags="comp"))
            if len(coords_2) >= 4: ids.append(self.canvas.create_line(coords_2, width=2, fill="black", tags="comp"))
        else:
            # Cable continuo (WIRE)
            ids.append(self.canvas.create_line(x1, y1, x2, y1, x2, y2, width=2, fill="black", tags="comp"))

        # 2. SÍMBOLO DEL COMPONENTE
        txt_display = ""
        
        if tipo == 'R':
            # Caja
            box_w, box_h = 40, 20
            # Rotar caja si es vertical
            if vertical: box_w, box_h = box_h, box_w
            
            rect_id = self.canvas.create_rectangle(xm - box_w/2, ym - box_h/2, xm + box_w/2, ym + box_h/2, 
                                                  fill="white", outline="black", width=2, tags="comp")
            ids.append(rect_id)
            txt_display = f"{valor}Ω"
            txt_id = self.canvas.create_text(xm, ym, text=txt_display, font=("Arial", 8, "bold"), fill="black", tags="comp")
            ids.append(txt_id)

        elif tipo == 'V':
            # Fuente
            # Orientación: Si vertical, placas horizontales.
            # Asumimos polaridad: Cable entra por un lado (+) sale por el otro (-)
            # Dibujo simplificado circular para que sirva en cualquier rotación o el clásico
            r = 14
            ids.append(self.canvas.create_oval(xm-r, ym-r, xm+r, ym+r, fill="#e74c3c", outline="black", width=2, tags="comp"))
            ids.append(self.canvas.create_text(xm, ym, text="+  -", font=("Arial", 10, "bold"), fill="white", tags="comp"))
            
            txt_display = f"{valor}V"
            # Offset texto
            tx, ty = (xm+25, ym) if vertical else (xm, ym-25)
            txt_id = self.canvas.create_text(tx, ty, text=txt_display, font=("Arial", 9, "bold"), fill="red", tags="comp")
            ids.append(txt_id)

        elif tipo == 'I':
            r = 14
            ids.append(self.canvas.create_oval(xm-r, ym-r, xm+r, ym+r, fill="#2ecc71", outline="black", width=2, tags="comp"))
            ids.append(self.canvas.create_text(xm, ym, text="I", font=("Arial", 12, "bold"), fill="white", tags="comp"))
            
            txt_display = f"{valor}A"
            tx, ty = (xm+25, ym) if vertical else (xm, ym-25)
            txt_id = self.canvas.create_text(tx, ty, text=txt_display, font=("Arial", 9, "bold"), fill="green", tags="comp")
            ids.append(txt_id)
        
        elif tipo == 'WIRE':
            # No hay símbolo visual extra, solo el cable
            # Agregamos un placeholder ID invisible para mantener consistencia de índices
            ids.append(self.canvas.create_text(xm, ym, text="")) 
            ids.append(self.canvas.create_text(xm, ym, text=""))

        # Nombre (R1, V1)
        if tipo != 'WIRE':
            nx, ny = (xm-25, ym) if vertical else (xm, ym-25)
            name_id = self.canvas.create_text(nx, ny, text=nombre, font=("Segoe UI", 10, "bold"), fill="blue", tags="comp")
            ids.append(name_id)
        else:
             ids.append(self.canvas.create_text(xm, ym, text="")) # Placeholder

        self.componentes.append({'tipo': tipo, 'n1': n1, 'n2': n2, 'valor': valor, 'ids': ids, 'nombre': nombre})
        return len(self.componentes) - 1 # Retornar índice

    # --- SELECCIÓN ---
    def seleccionar(self, tipo, idx, update_tree=True):
        self.canvas.itemconfig("nodo", fill="black")
        for c in self.componentes: 
            # Resetear color. WIRE es index 0 (linea). Otros tienen caja en index 1 o 0.
            t = c['ids'][0] if c['tipo'] == 'WIRE' else (c['ids'][1] if len(c['ids'])>1 else c['ids'][0])
            if c['tipo']=='R': self.canvas.itemconfig(t, outline="black", width=2)
            else: self.canvas.itemconfig(t, fill="black" if c['tipo']=='WIRE' else ( "#e74c3c" if c['tipo']=='V' else "#2ecc71" ), width=2)
        
        self.tipo_seleccionado = tipo
        self.seleccionado = idx
        
        if tipo is None:
            if update_tree:
                self.bloqueo_arbol = True
                if self.tree.selection(): self.tree.selection_remove(self.tree.selection())
                self.bloqueo_arbol = False
            return

        if tipo == 'NODO':
            self.canvas.itemconfig(self.nodos[idx]['id'], fill="#e74c3c")
        elif tipo == 'COMP':
            c = self.componentes[idx]
            t = c['ids'][0] if c['tipo'] == 'WIRE' else c['ids'][1]
            if c['tipo']=='R': self.canvas.itemconfig(t, outline="#e74c3c", width=4)
            else: self.canvas.itemconfig(t, fill="#e74c3c" if c['tipo']=='WIRE' else "#f1c40f", width=3 if c['tipo']=='WIRE' else 5)
            
            if update_tree:
                self.bloqueo_arbol = True
                for item in self.tree.get_children():
                    if self.tree.item(item)['values'][0] == c['nombre']:
                        self.tree.selection_set(item)
                        self.tree.see(item)
                        break
                self.bloqueo_arbol = False

    def on_tree_select(self, event):
        if self.bloqueo_arbol: return
        sel = self.tree.selection()
        if not sel:
            self.seleccionar(None, None, update_tree=False)
            return
        nombre = self.tree.item(sel[0])['values'][0]
        for i, c in enumerate(self.componentes):
            if c['nombre'] == nombre:
                self.seleccionar('COMP', i, update_tree=False)
                break

    def on_tree_double_click(self, event):
        item_id = self.tree.identify_row(event.y)
        if not item_id: return
        
        vals = self.tree.item(item_id)['values']
        nombre_comp = vals[0]
        
        # No editar cables en tabla (son 0 ohms)
        if nombre_comp.startswith("W"): return

        col = self.tree.identify_column(event.x)
        tipo_comp = vals[1]
        modo = "VALOR"
        
        if tipo_comp == 'R' and (col == "#5" or col == "#6"):
            if messagebox.askyesno("Inferencia", "¿Recalcular R basado en este valor?"):
                modo = "INFERENCIA"
            else: return

        self.usar_dialogo_fallback(nombre_comp, modo)

    def usar_dialogo_fallback(self, nombre_comp, modo):
        current_val = 0
        for c in self.componentes:
            if c['nombre'] == nombre_comp: current_val = c['valor']
        
        prompt = f"Valor para {nombre_comp}:"
        new_val = simpledialog.askfloat("Editar", prompt, initialvalue=current_val, parent=self)
        if new_val is not None:
            self.aplicar_cambio(nombre_comp, new_val, modo)

    def aplicar_cambio(self, nombre_comp, input_val, modo):
        for c in self.componentes:
            if c['nombre'] == nombre_comp:
                self.save_state()
                if modo == "VALOR":
                    c['valor'] = input_val
                elif modo == "INFERENCIA":
                    # Lógica simple
                    sel = self.tree.selection()
                    if sel:
                        vals = self.tree.item(sel[0])['values']
                        cur_i = float(vals[5])
                        if abs(cur_i)>1e-9: c['valor'] = abs(input_val/cur_i)
                break
        self.simular_en_tiempo_real()

    # --- SIMULACIÓN ---
    def simular_en_tiempo_real(self):
        sel = self.tree.selection()
        sel_name = self.tree.item(sel[0])['values'][0] if sel else None

        circ = Circuit()
        for c in self.componentes:
            n1 = str(c['n1']) if c['n1'] != self.tierra_idx else '0'
            n2 = str(c['n2']) if c['n2'] != self.tierra_idx else '0'
            
            # Tratamos WIRE como R muy pequeña
            val = c['valor']
            tipo = c['tipo']
            if tipo == 'WIRE': 
                tipo = 'R'
                val = 1e-9 # 1 nano ohm
            
            if tipo == 'R': circ.add_resistor(c['nombre'], n1, n2, val)
            elif tipo == 'V': circ.add_vsource(c['nombre'], n1, n2, val)
            elif tipo == 'I': circ.add_isource(c['nombre'], n1, n2, val)

        try:
            _, results = circ.solve()
            self.actualizar_tabla(results, sel_name)
            self.actualizar_etiquetas_visuales(results)
            bal = circ.validate_power_balance(results)
            self.status_bar.config(text=f"Cálculo Exitoso | Balance: {bal:.6f} W", fg="#27ae60")
        except Exception as e:
            self.status_bar.config(text=f"Error: {str(e)}", fg="#e67e22")
            self.actualizar_tabla({}, sel_name)

    def actualizar_tabla(self, results, sel_name):
        self.bloqueo_arbol = True
        self.tree.delete(*self.tree.get_children())
        for c in self.componentes:
            # No mostrar cables en la tabla para limpiar la vista
            if c['tipo'] == 'WIRE': continue
            
            d = results.get(c['nombre'], {'v':0, 'i':0, 'p':0})
            vals = (c['nombre'], c['tipo'], f"{c['n1']}-{c['n2']}", 
                    f"{c['valor']:.2f}", f"{d['v']:.2f}", f"{d['i']:.3f}", f"{d['p']:.3f}")
            item = self.tree.insert("", "end", values=vals)
            if c['nombre'] == sel_name: self.tree.selection_set(item)
        self.bloqueo_arbol = False

    def actualizar_etiquetas_visuales(self, results):
        for c in self.componentes:
            if c['tipo'] == 'WIRE': continue
            # Valor está en penúltimo ID (-2)
            val_id = c['ids'][-2]
            unit = "Ω" if c['tipo']=='R' else ("V" if c['tipo']=='V' else "A")
            self.canvas.itemconfig(val_id, text=f"{c['valor']}{unit}")

    # --- UTILIDADES ---
    def save_state(self):
        if not self.is_recording: return
        state = {
            'nodos': [{'x':n['x'], 'y':n['y']} for n in self.nodos],
            'comps': [{'tipo':c['tipo'], 'n1':c['n1'], 'n2':c['n2'], 'valor':c['valor'], 'nombre':c['nombre']} for c in self.componentes]
        }
        self.history_stack.append(state)
        self.redo_stack.clear()
        if len(self.history_stack) > 30: self.history_stack.pop(0)

    def undo(self, e=None):
        if len(self.history_stack) > 1:
            self.redo_stack.append(self.history_stack.pop())
            self.restore(self.history_stack[-1])

    def redo(self, e=None):
        if self.redo_stack:
            state = self.redo_stack.pop()
            self.history_stack.append(state)
            self.restore(state)

    def restore(self, state):
        self.is_recording = False
        self.canvas.delete("all")
        self.dibujar_rejilla()
        self.nodos = []; self.componentes = []
        for n in state['nodos']: self.crear_nodo_visual(n['x'], n['y'])
        for c in state['comps']: self.crear_componente_visual(c['n1'], c['n2'], c['tipo'], c['valor'], c['nombre'])
        self.is_recording = True
        self.simular_en_tiempo_real()

    def eliminar_seleccion(self, e=None):
        if self.seleccionado is not None and self.tipo_seleccionado == 'COMP':
            self.save_state()
            for i in self.componentes[self.seleccionado]['ids']: self.canvas.delete(i)
            self.componentes.pop(self.seleccionado)
            self.seleccionado = None
            self.simular_en_tiempo_real()

    def find_node(self, x, y):
        for i, n in enumerate(self.nodos):
            if math.hypot(n['x']-x, n['y']-y) < 15: return i
        return None
    def find_comp(self, x, y):
        for i, c in enumerate(self.componentes):
            # Detección aproximada en el centro
            x1, y1 = self.nodos[c['n1']]['x'], self.nodos[c['n1']]['y']
            x2, y2 = self.nodos[c['n2']]['x'], self.nodos[c['n2']]['y']
            # Centro "visual" del componente (L shape)
            # Simplificación: punto medio geométrico del bounding box
            xm, ym = (x1+x2)/2, (y1+y2)/2
            if math.hypot(xm-x, ym-y) < 30: return i
        return None