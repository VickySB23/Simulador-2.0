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
        self.title("Laboratorio de Circuitos - Edición Robusta")
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
        self.modo = "SELECCIONAR" 
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

    def crear_interfaz(self):
        # 1. Barra Superior
        barra = tk.Frame(self, bg="#2c3e50", height=70, pady=5)
        barra.pack(side="top", fill="x")
        
        self.btn_tool(barra, "👆 Selec.", "SELECCIONAR", "#95a5a6")
        tk.Frame(barra, width=20, bg="#2c3e50").pack(side="left")
        
        self.btn_tool(barra, "🔵 Nodo", "NODO", "#3498db")
        self.btn_tool(barra, "▭ Res.", "R", "#ecf0f1", fg="black")
        self.btn_tool(barra, "🔋 Fuente V", "V", "#e74c3c")
        self.btn_tool(barra, "⚡ Fuente I", "I", "#2ecc71")
        
        tk.Button(barra, text="↪ Rehacer", command=self.redo, bg="#7f8c8d", fg="white", relief="flat", padx=10).pack(side="right", padx=5)
        tk.Button(barra, text="↩ Deshacer", command=self.undo, bg="#7f8c8d", fg="white", relief="flat", padx=10).pack(side="right", padx=5)
        
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
        tk.Label(header, text="TABLA DE DATOS (Doble clic en la fila para editar)", 
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

        self.status_bar = tk.Label(self.frame_datos, text="Listo.", bg="#95a5a6", fg="white", font=("Segoe UI", 10), anchor="w", padx=10, pady=5)
        self.status_bar.pack(fill="x", side="bottom")

    # --- HERRAMIENTAS ---
    def btn_tool(self, parent, txt, mode, col, fg="white"):
        tk.Button(parent, text=txt, command=lambda: self.set_modo(mode), bg=col, fg=fg, 
                 font=("Segoe UI", 10, "bold"), relief="flat", width=12, pady=5).pack(side="left", padx=5)

    def set_modo(self, m):
        self.modo = m
        self.canvas.config(cursor="crosshair" if m != "SELECCIONAR" else "arrow")
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
        
        elif self.modo in ["R", "V", "I"]:
            idx = self.find_node(x,y)
            if idx is not None:
                self.nodo_inicio = idx
                nx, ny = self.nodos[idx]['x'], self.nodos[idx]['y']
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
            self.canvas.coords(self.linea_guia, nx, ny, x, y)

    def soltar_canvas(self, event):
        if self.linea_guia:
            self.canvas.delete(self.linea_guia)
            self.linea_guia = None
            x, y = self.snap(event.x), self.snap(event.y)
            idx_end = self.find_node(x,y)
            
            if idx_end is None:
                self.crear_nodo_visual(x, y)
                idx_end = len(self.nodos)-1
            
            if idx_end != self.nodo_inicio:
                self.save_state()
                self.crear_componente_visual(self.nodo_inicio, idx_end, self.modo)
                self.simular_en_tiempo_real()
            
            self.nodo_inicio = None

    # --- DIBUJO VISUAL (AJUSTE DE ETIQUETAS) ---
    def crear_nodo_visual(self, x, y):
        r = 5
        uid = self.canvas.create_oval(x-r, y-r, x+r, y+r, fill="black", outline="black", tags="nodo")
        self.nodos.append({'x': x, 'y': y, 'id': uid})
        self.canvas.create_text(x+12, y-12, text=str(len(self.nodos)-1), fill="#2980b9", font=("Arial", 12, "bold"), tags="nodo_lbl")

    def crear_componente_visual(self, n1, n2, tipo, valor=None, nombre=None):
        if valor is None: valor = 100.0 if tipo == 'R' else 10.0
        if nombre is None:
            count = len([c for c in self.componentes if c['tipo'] == tipo]) + 1
            nombre = f"{tipo}{count}"

        x1, y1 = self.nodos[n1]['x'], self.nodos[n1]['y']
        x2, y2 = self.nodos[n2]['x'], self.nodos[n2]['y']
        xm, ym = (x1+x2)/2, (y1+y2)/2
        ids = []
        
        # Cable base
        if tipo == 'V':
            dx, dy = x2-x1, y2-y1; dist = math.hypot(dx, dy) or 1
            ux, uy = dx/dist, dy/dist; gap = 15
            ids.append(self.canvas.create_line(x1, y1, xm - gap*ux, ym - gap*uy, width=2, fill="black", tags="comp"))
            ids.append(self.canvas.create_line(xm + gap*ux, ym + gap*uy, x2, y2, width=2, fill="black", tags="comp"))
        else:
            ids.append(self.canvas.create_line(x1, y1, x2, y2, width=2, fill="black", tags="comp"))
        
        # Componente y Valor
        if tipo == 'R':
            box_w, box_h = 44, 24
            rect_id = self.canvas.create_rectangle(xm - box_w/2, ym - box_h/2, xm + box_w/2, ym + box_h/2, 
                                                  fill="white", outline="black", width=2, tags="comp")
            ids.append(rect_id)
            txt_id = self.canvas.create_text(xm, ym, text=f"{valor}Ω", font=("Arial", 9, "bold"), fill="black", tags="comp")
            ids.append(txt_id)

        elif tipo == 'V':
            dx, dy = x2-x1, y2-y1; dist = math.hypot(dx, dy) or 1
            ux, uy, px, py = dx/dist, dy/dist, -dy/dist, dx/dist
            w_l, w_s, off = 16, 8, 4
            ids.append(self.canvas.create_line(xm-off*ux+px*w_l, ym-off*uy+py*w_l, xm-off*ux-px*w_l, ym-off*uy-py*w_l, width=2, fill="#e74c3c", tags="comp"))
            ids.append(self.canvas.create_line(xm+off*ux+px*w_s, ym+off*uy+py*w_s, xm+off*ux-px*w_s, ym+off*uy-py*w_s, width=4, fill="black", tags="comp"))
            ids.append(self.canvas.create_text(x1+dx*0.2, y1+dy*0.2, text="+", fill="red", font=("Arial", 14, "bold"), tags="comp"))
            
            # Texto Valor (Ajuste de offset)
            txt_id = self.canvas.create_text(xm+px*28, ym+py*28, text=f"{valor}V", font=("Arial", 10, "bold"), fill="red", tags="comp")
            ids.append(txt_id)

        elif tipo == 'I':
            r = 16
            ids.append(self.canvas.create_oval(xm-r, ym-r, xm+r, ym+r, fill="#d5f5e3", outline="black", width=2, tags="comp"))
            ang = math.degrees(math.atan2(y2-y1, x2-x1))
            ids.append(self.canvas.create_text(xm, ym, text="⮕", font=("Arial", 14, "bold"), angle=ang, tags="comp"))
            # Texto Valor (Ajuste de offset)
            txt_id = self.canvas.create_text(xm, ym-35, text=f"{valor}A", font=("Arial", 9, "bold"), fill="green", tags="comp")
            ids.append(txt_id)

        # Etiqueta de Nombre (R1, V1) - AJUSTADA
        name_id = self.canvas.create_text(xm, ym - 18, text=nombre, font=("Segoe UI", 11, "bold"), fill="blue", tags="comp")
        ids.append(name_id)

        self.componentes.append({'tipo': tipo, 'n1': n1, 'n2': n2, 'valor': valor, 'ids': ids, 'nombre': nombre})

    # --- SELECCIÓN Y EDICIÓN ---
    def seleccionar(self, tipo, idx, update_tree=True):
        self.canvas.itemconfig("nodo", fill="black")
        for c in self.componentes: 
            target = c['ids'][1] if c['tipo']=='R' else c['ids'][0]
            if c['tipo']=='R': self.canvas.itemconfig(target, outline="black", width=2)
            else: self.canvas.itemconfig(target, fill="black", width=2)
        
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
            target = c['ids'][1] if c['tipo']=='R' else c['ids'][0]
            if c['tipo']=='R': self.canvas.itemconfig(target, outline="#e74c3c", width=4)
            else: self.canvas.itemconfig(target, fill="#e74c3c", width=3)
            
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
        """Doble clic en la fila para activar el diálogo de edición seguro."""
        item_id = self.tree.identify_row(event.y)
        if not item_id: return
        
        vals = self.tree.item(item_id)['values']
        nombre_comp = vals[0]
        tipo_comp = vals[1]
        
        # Modo por defecto: Editar VALOR principal
        modo = "VALOR"
        
        # Identificar si el clic fue en V o I para preguntar sobre Inferencia
        col = self.tree.identify_column(event.x)
        if tipo_comp == 'R' and (col == "#5" or col == "#6"):
            target = "Voltaje" if col == "#5" else "Corriente"
            if messagebox.askyesno("Inferencia", f"¿Desea recalcular la Resistencia para obtener este {target}?"):
                modo = "INFERENCIA"
            else:
                return

        # Lanzar diálogo seguro
        self.usar_dialogo_fallback(nombre_comp, modo)

    def usar_dialogo_fallback(self, nombre_comp, modo):
        current_val = 0
        for c in self.componentes:
            if c['nombre'] == nombre_comp: current_val = c['valor']
        
        prompt = f"Nuevo valor para {nombre_comp}:"
        new_val = simpledialog.askfloat("Editar Valor", prompt, initialvalue=current_val, parent=self)
        if new_val is not None:
            self.aplicar_cambio(nombre_comp, new_val, modo)

    def aplicar_cambio(self, nombre_comp, input_val, modo):
        for c in self.componentes:
            if c['nombre'] == nombre_comp:
                self.save_state()
                
                if modo == "VALOR":
                    c['valor'] = input_val
                
                elif modo == "INFERENCIA":
                    # Lógica de inferencia R = V/I
                    sel_item = self.tree.selection()
                    if sel_item:
                        vals = self.tree.item(sel_item[0])['values']
                        cur_i = float(vals[5])
                        if abs(cur_i) > 1e-9: c['valor'] = abs(input_val / cur_i)
                        else: messagebox.showwarning("Aviso", "Corriente muy baja para inferir.")
                break
        self.simular_en_tiempo_real()

    # --- SIMULACIÓN Y UTILIDADES ---
    def simular_en_tiempo_real(self):
        sel = self.tree.selection()
        sel_name = self.tree.item(sel[0])['values'][0] if sel else None

        circ = Circuit()
        for c in self.componentes:
            n1 = str(c['n1']) if c['n1'] != self.tierra_idx else '0'
            n2 = str(c['n2']) if c['n2'] != self.tierra_idx else '0'
            if c['tipo'] == 'R': circ.add_resistor(c['nombre'], n1, n2, c['valor'])
            elif c['tipo'] == 'V': circ.add_vsource(c['nombre'], n1, n2, c['valor'])
            elif c['tipo'] == 'I': circ.add_isource(c['nombre'], n1, n2, c['valor'])

        try:
            _, results = circ.solve()
            self.actualizar_tabla(results, sel_name)
            self.actualizar_etiquetas_visuales(results)
            bal = circ.validate_power_balance(results)
            self.status_bar.config(text=f"Simulación OK | Balance Energía: {bal:.6f}", fg="#27ae60")
        except Exception as e:
            self.status_bar.config(text=f"Error: {str(e)}", fg="#e67e22")
            self.actualizar_tabla({}, sel_name)

    def actualizar_tabla(self, results, sel_name):
        self.bloqueo_arbol = True
        self.tree.delete(*self.tree.get_children())
        for c in self.componentes:
            d = results.get(c['nombre'], {'v':0, 'i':0, 'p':0})
            vals = (c['nombre'], c['tipo'], f"{c['n1']}-{c['n2']}", 
                    f"{c['valor']:.2f}", f"{d['v']:.2f}", f"{d['i']:.3f}", f"{d['p']:.3f}")
            item = self.tree.insert("", "end", values=vals)
            if c['nombre'] == sel_name: self.tree.selection_set(item)
        self.bloqueo_arbol = False

    def actualizar_etiquetas_visuales(self, results):
        for c in self.componentes:
            val_id = c['ids'][-2]
            unit = "Ω" if c['tipo']=='R' else ("V" if c['tipo']=='V' else "A")
            self.canvas.itemconfig(val_id, text=f"{c['valor']}{unit}")

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
            x1, y1 = self.nodos[c['n1']]['x'], self.nodos[c['n1']]['y']
            x2, y2 = self.nodos[c['n2']]['x'], self.nodos[c['n2']]['y']
            if math.hypot((x1+x2)/2-x, (y1+y2)/2-y) < 25: return i
        return None