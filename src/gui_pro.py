import tkinter as tk
from tkinter import simpledialog, messagebox, ttk
import math
import sys
import os

try:
    from ctypes import windll
    windll.shcore.SetProcessDpiAwareness(1)
except:
    pass

sys.path.append(os.path.dirname(__file__))
from circuit_sim import Circuit

# --- UTILS DE COLOR ---
def get_voltage_color(v, v_min, v_max):
    """Retorna un color hex entre Azul (Bajo) y Rojo (Alto)"""
    if v_max == v_min: return "#2c3e50" # Gris oscuro si todo es igual
    
    # Normalizar 0.0 a 1.0
    ratio = (v - v_min) / (v_max - v_min)
    ratio = max(0.0, min(1.0, ratio))
    
    # Interpolación Azul (0,0,255) -> Rojo (255,0,0)
    r = int(255 * ratio)
    g = 0
    b = int(255 * (1 - ratio))
    
    return f"#{r:02x}{g:02x}{b:02x}"

# ==========================================
# SECCIÓN 1: HISTORIAL
# ==========================================
class HistoryManager:
    def __init__(self, limit=30):
        self.history_stack = []
        self.redo_stack = []
        self.is_recording = True
        self.limit = limit

    def save(self, state):
        if not self.is_recording: return
        self.history_stack.append(state)
        self.redo_stack.clear()
        if len(self.history_stack) > self.limit: self.history_stack.pop(0)

    def undo(self):
        if len(self.history_stack) > 1:
            self.redo_stack.append(self.history_stack.pop())
            return self.history_stack[-1]
        return None

    def redo(self):
        if self.redo_stack:
            state = self.redo_stack.pop()
            self.history_stack.append(state)
            return state
        return None

# ==========================================
# SECCIÓN 2: DIBUJO
# ==========================================
def dibujar_rejilla(canvas, w, h, grid_size):
    for i in range(0, w, grid_size):
        for j in range(0, h, grid_size):
            canvas.create_oval(i-1, j-1, i+1, j+1, fill="#bdc3c7", outline="")

def crear_nodo_visual_func(canvas, x, y, label, is_gnd=False):
    r = 7
    color = "#34495e" # Color base
    uid = canvas.create_oval(x-r, y-r, x+r, y+r, fill=color, outline="black", width=2, tags="nodo")
    txt_id = canvas.create_text(x+12, y-12, text=label, fill="#7f8c8d", font=("Arial", 10, "bold"), tags="lbl_nodo")
    
    if is_gnd:
        gnd_ids = []
        gnd_ids.append(canvas.create_line(x, y+r, x, y+r+10, width=2, fill="black", tags="gnd"))
        gnd_ids.append(canvas.create_line(x-10, y+r+10, x+10, y+r+10, width=2, fill="black", tags="gnd"))
        gnd_ids.append(canvas.create_line(x-6, y+r+14, x+6, y+r+14, width=2, fill="black", tags="gnd"))
        gnd_ids.append(canvas.create_line(x-2, y+r+18, x+2, y+r+18, width=2, fill="black", tags="gnd"))
    
    return uid, txt_id

def dibujar_componente_func(canvas, x1, y1, x2, y2, tipo, valor, nombre):
    ids = []
    dist_x, dist_y = abs(x2 - x1), abs(y2 - y1)
    if dist_x > dist_y: xm, ym, vertical = (x1 + x2) / 2, y1, False
    else: xm, ym, vertical = x2, (y1 + y2) / 2, True

    gap = 20 if tipo != 'WIRE' else 0
    
    # Segmentos de cable
    # ids[0] -> Conectado a n1
    # ids[1] -> Conectado a n2 (si existe gap)
    if gap > 0:
        coords_1 = [x1, y1, x2, y1, x2, ym-gap] if vertical else [x1, y1, xm-gap, y1]
        coords_2 = [x2, ym+gap, x2, y2] if vertical else [xm+gap, y1, x2, y1, x2, y2]
        
        if len(coords_1)>=4: ids.append(canvas.create_line(coords_1, width=3, fill="#2c3e50", tags="comp"))
        if len(coords_2)>=4: ids.append(canvas.create_line(coords_2, width=3, fill="#2c3e50", tags="comp"))
    else:
        coords = [x1, y1, x2, y1, x2, y2] if vertical else [x1, y1, x2, y1, x2, y2]
        ids.append(canvas.create_line(coords, width=3, fill="#2c3e50", tags="comp"))
        ids.append(canvas.create_text(xm, ym, text="")) # Placeholder

    # Símbolos
    if tipo == 'R':
        box_w, box_h = 40, 20
        if vertical: box_w, box_h = box_h, box_w
        rect_id = canvas.create_rectangle(xm-box_w/2, ym-box_h/2, xm+box_w/2, ym+box_h/2, fill="white", outline="black", width=2, tags="comp")
        ids.append(rect_id)
        txt_id = canvas.create_text(xm, ym, text=f"{valor}Ω", font=("Arial", 9, "bold"), fill="black", tags="comp")
        ids.append(txt_id)

    elif tipo == 'V':
        r = 15
        ids.append(canvas.create_oval(xm-r, ym-r, xm+r, ym+r, fill="#e74c3c", outline="black", width=2, tags="comp"))
        ids.append(canvas.create_text(xm, ym, text="+  -", font=("Arial", 10, "bold"), fill="white", tags="comp"))
        tx, ty = (xm+25, ym) if vertical else (xm, ym-25)
        ids.append(canvas.create_text(tx, ty, text=f"{valor}V", font=("Arial", 9, "bold"), fill="red", tags="comp"))

    elif tipo == 'I':
        r = 15
        ids.append(canvas.create_oval(xm-r, ym-r, xm+r, ym+r, fill="#2ecc71", outline="black", width=2, tags="comp"))
        ids.append(canvas.create_text(xm, ym, text="I", font=("Arial", 12, "bold"), fill="white", tags="comp"))
        tx, ty = (xm+25, ym) if vertical else (xm, ym-25)
        ids.append(canvas.create_text(tx, ty, text=f"{valor}A", font=("Arial", 9, "bold"), fill="green", tags="comp"))

    if tipo != 'WIRE':
        nx, ny = (xm-25, ym) if vertical else (xm, ym-25)
        if tipo in ['V', 'I']: ny -= 18
        ids.append(canvas.create_text(nx, ny, text=nombre, font=("Segoe UI", 11, "bold"), fill="blue", tags="comp"))
    else:
        ids.append(canvas.create_text(xm, ym, text=""))

    ids.append(canvas.create_text(xm, ym, text="", font=("Arial", 14, "bold"), fill="red", tags="arrow"))
    return ids

# ==========================================
# SECCIÓN 3: INTERFAZ
# ==========================================
class SimuladorPro(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Laboratorio de Circuitos - Análisis Profesional")
        self.geometry("1400x950")
        
        self.style = ttk.Style()
        self.style.theme_use('clam')
        self.style.configure("Treeview", font=("Segoe UI", 10), rowheight=28)
        self.style.configure("Treeview.Heading", font=("Segoe UI", 10, "bold"), background="#ecf0f1")
        self.style.map("Treeview", background=[('selected', '#3498db')])
        
        self.GRID_SIZE = 20 
        self.nodos = []       
        self.componentes = [] 
        self.history = HistoryManager(limit=30)
        self.tierra_idx = 0 
        
        self.modo = "SELECCIONAR" 
        self.seleccionado = None      
        self.tipo_seleccionado = None 
        self.nodo_inicio = None
        self.linea_guia = None
        self.bloqueo_arbol = False 

        self.crear_interfaz()
        self.save_state() 

        self.bind("<Control-z>", self.undo)
        self.bind("<Control-y>", self.redo)
        self.bind("<Delete>", self.eliminar_seleccion)
        self.bind("<Escape>", lambda e: self.set_modo("SELECCIONAR"))

    def crear_interfaz(self):
        barra = tk.Frame(self, bg="#2c3e50", height=70, pady=5)
        barra.pack(side="top", fill="x")
        
        self.lbl_modo = tk.Label(barra, text="MODO: SELECCIÓN", bg="#2c3e50", fg="#f1c40f", font=("Segoe UI", 12, "bold"))
        self.lbl_modo.pack(side="left", padx=15)
        tk.Frame(barra, width=20, bg="#2c3e50").pack(side="left")
        
        self.btn_tool(barra, "✏ Cable", "WIRE", "#95a5a6")
        tk.Frame(barra, width=10, bg="#2c3e50").pack(side="left")
        self.btn_tool(barra, "▅ Res.", "R", "#ecf0f1", fg="black")
        self.btn_tool(barra, "🔋 Fuente V", "V", "#e74c3c")
        self.btn_tool(barra, "⚡ Fuente I", "I", "#2ecc71")
        self.btn_tool(barra, "🔵 Nodo", "NODO", "#3498db")
        self.btn_tool(barra, "⏚ GND", "GND", "#34495e")
        
        tk.Button(barra, text="↪ Rehacer", command=self.redo, bg="#7f8c8d", fg="white", relief="flat", padx=10).pack(side="right", padx=5)
        tk.Button(barra, text="↩ Deshacer", command=self.undo, bg="#7f8c8d", fg="white", relief="flat", padx=10).pack(side="right", padx=5)
        
        self.paned = tk.PanedWindow(self, orient=tk.HORIZONTAL, sashwidth=8, bg="#bdc3c7")
        self.paned.pack(fill="both", expand=True)

        self.frame_grafico = tk.Frame(self.paned, bg="white")
        self.paned.add(self.frame_grafico, minsize=600)
        
        self.canvas = tk.Canvas(self.frame_grafico, bg="white", cursor="arrow")
        self.canvas.pack(fill="both", expand=True)
        
        self.update()
        dibujar_rejilla(self.canvas, self.winfo_screenwidth(), self.winfo_screenheight(), self.GRID_SIZE)
        
        self.canvas.bind("<Button-1>", self.clic_canvas)
        self.canvas.bind("<B1-Motion>", self.arrastrar_canvas)
        self.canvas.bind("<ButtonRelease-1>", self.soltar_canvas)

        self.frame_datos = tk.Frame(self.paned, bg="#ecf0f1")
        self.paned.add(self.frame_datos, minsize=500)

        header = tk.Frame(self.frame_datos, bg="#34495e", pady=8)
        header.pack(fill="x")
        tk.Label(header, text="DETALLE POR RAMA (KCL/KVL)", bg="#34495e", fg="white", font=("Segoe UI", 10, "bold")).pack()

        cols = ("Nombre", "Tipo", "Valor", "Va (V)", "Vb (V)", "ΔV (V)", "|I| (A)", "P (W)")
        self.tree = ttk.Treeview(self.frame_datos, columns=cols, show="headings", selectmode="browse", height=8)
        
        anchos = [60, 40, 60, 60, 60, 60, 70, 70]
        for c, w in zip(cols, anchos):
            self.tree.heading(c, text=c); self.tree.column(c, width=w, anchor="center")
        
        self.tree.pack(fill="both", expand=False, padx=10, pady=5)
        self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)
        self.tree.bind("<Double-1>", self.on_tree_double_click) 

        self.frame_energia = tk.LabelFrame(self.frame_datos, text="BALANCE DE POTENCIA", bg="white", font=("Segoe UI", 10, "bold"), fg="#2980b9")
        self.frame_energia.pack(fill="x", padx=10, pady=5)
        self.lbl_p_gen = tk.Label(self.frame_energia, text="P. Suministrada: ---", font=("Segoe UI", 10), bg="white", fg="green")
        self.lbl_p_gen.pack(anchor="w", padx=10)
        self.lbl_p_dis = tk.Label(self.frame_energia, text="P. Disipada: ---", font=("Segoe UI", 10), bg="white", fg="#c0392b")
        self.lbl_p_dis.pack(anchor="w", padx=10)
        self.lbl_balance = tk.Label(self.frame_energia, text="Neto: ---", font=("Segoe UI", 10, "bold"), bg="white", fg="black")
        self.lbl_balance.pack(anchor="w", padx=10, pady=(5,5))

        self.frame_kcl = tk.LabelFrame(self.frame_datos, text="VALIDACIÓN KCL (Nodos)", bg="#ecf0f1", font=("Segoe UI", 10, "bold"), fg="#8e44ad")
        self.frame_kcl.pack(fill="both", expand=True, padx=10, pady=10)
        self.txt_kcl = tk.Text(self.frame_kcl, height=10, font=("Consolas", 9), bg="#fdfefe", relief="flat")
        self.txt_kcl.pack(fill="both", expand=True, padx=5, pady=5)

        self.status_bar = tk.Label(self.frame_datos, text="Listo.", bg="#95a5a6", fg="white", font=("Segoe UI", 9), anchor="w", padx=10)
        self.status_bar.pack(fill="x", side="bottom")

    def btn_tool(self, parent, txt, mode, col, fg="white"):
        tk.Button(parent, text=txt, command=lambda: self.set_modo(mode), bg=col, fg=fg, 
                 font=("Segoe UI", 10, "bold"), relief="flat", width=14, pady=5).pack(side="left", padx=5)

    def set_modo(self, m):
        self.modo = m
        txt = "SELECCIÓN" if m == "SELECCIONAR" else f"HERRAMIENTA: {m}"
        self.lbl_modo.config(text=txt)
        self.canvas.config(cursor="crosshair" if m != "SELECCIONAR" else "arrow")
        self.seleccionar(None, None, update_tree=False)

    def snap(self, v): return round(v/self.GRID_SIZE)*self.GRID_SIZE

    def clic_canvas(self, event):
        x, y = self.snap(event.x), self.snap(event.y)
        if self.modo in ["R", "V", "I"]:
            self.save_state()
            x1, y1 = x - 40, y; x2, y2 = x + 40, y
            idx1 = self.crear_nodo(x1, y1); idx2 = self.crear_nodo(x2, y2)
            comp_idx = self.crear_componente(idx1, idx2, self.modo)
            self.usar_dialogo_fallback(self.componentes[comp_idx]['nombre'], "VALOR")
            self.set_modo("SELECCIONAR")
        elif self.modo == "GND":
            idx = self.find_node(x,y)
            if idx is not None:
                self.save_state(); self.tierra_idx = idx
                self.set_modo("SELECCIONAR"); self.simular_en_tiempo_real()
            else:
                self.save_state(); idx = self.crear_nodo(x,y); self.tierra_idx = idx
                self.set_modo("SELECCIONAR"); self.simular_en_tiempo_real()
        elif self.modo == "NODO":
            if self.find_node(x,y) is None:
                self.save_state(); self.crear_nodo(x, y); self.set_modo("SELECCIONAR")
        elif self.modo == "WIRE":
            idx = self.find_node(x,y)
            if idx is not None:
                self.nodo_inicio = idx
                nx, ny = self.nodos[idx]['x'], self.nodos[idx]['y']
                self.linea_guia = self.canvas.create_line(nx, ny, x, y, dash=(2,2), fill="#2c3e50", width=2)
        elif self.modo == "SELECCIONAR":
            idx_n = self.find_node(x,y)
            if idx_n is not None: self.seleccionar('NODO', idx_n); return
            idx_c = self.find_comp(x,y)
            if idx_c is not None: self.seleccionar('COMP', idx_c); return
            self.seleccionar(None, None)

    def arrastrar_canvas(self, event):
        if self.linea_guia and self.modo == "WIRE":
            x, y = self.snap(event.x), self.snap(event.y)
            nx, ny = self.nodos[self.nodo_inicio]['x'], self.nodos[self.nodo_inicio]['y']
            dist_x, dist_y = abs(x-nx), abs(y-ny)
            if dist_x > dist_y: self.canvas.coords(self.linea_guia, nx, ny, x, ny, x, y)
            else: self.canvas.coords(self.linea_guia, nx, ny, nx, y, x, y)
        if self.modo in ["WIRE", "R", "V", "I", "SELECCIONAR"]:
            idx = self.find_node(event.x, event.y)
            self.canvas.delete("highlight")
            if idx is not None:
                nx, ny = self.nodos[idx]['x'], self.nodos[idx]['y']
                self.canvas.create_oval(nx-8, ny-8, nx+8, ny+8, outline="#39ff14", width=3, tags="highlight")

    def soltar_canvas(self, event):
        if self.linea_guia:
            self.canvas.delete(self.linea_guia)
            self.linea_guia = None
            if self.modo == "WIRE":
                x, y = self.snap(event.x), self.snap(event.y)
                idx_end = self.find_node(x,y)
                if idx_end is not None and idx_end != self.nodo_inicio:
                    self.save_state()
                    self.crear_componente(self.nodo_inicio, idx_end, "WIRE")
                    self.simular_en_tiempo_real()
            self.nodo_inicio = None

    def crear_nodo(self, x, y):
        existente = self.find_node(x, y)
        if existente is not None: return existente
        is_gnd = (len(self.nodos) == 0)
        if is_gnd: self.tierra_idx = 0
        lbl = "GND" if is_gnd else str(len(self.nodos))
        uid, txt_id = crear_nodo_visual_func(self.canvas, x, y, lbl, is_gnd)
        self.nodos.append({'x': x, 'y': y, 'id': uid, 'txt_id': txt_id})
        return len(self.nodos) - 1

    def crear_componente(self, n1, n2, tipo, valor=None, nombre=None):
        if valor is None: 
            valor = 10.0 if tipo in ['R', 'V'] else 1.0
            if tipo == 'WIRE': valor = 1e-9
        if nombre is None:
            count = len([c for c in self.componentes if c['tipo'] == tipo]) + 1
            prefix = "W" if tipo == "WIRE" else tipo
            nombre = f"{prefix}{count}"
        x1, y1 = self.nodos[n1]['x'], self.nodos[n1]['y']
        x2, y2 = self.nodos[n2]['x'], self.nodos[n2]['y']
        ids = dibujar_componente_func(self.canvas, x1, y1, x2, y2, tipo, valor, nombre)
        self.componentes.append({'tipo': tipo, 'n1': n1, 'n2': n2, 'valor': valor, 'ids': ids, 'nombre': nombre})
        return len(self.componentes) - 1

    def seleccionar(self, tipo, idx, update_tree=True):
        self.canvas.itemconfig("nodo", fill="black")
        if self.tierra_idx < len(self.nodos): self.canvas.itemconfig(self.nodos[self.tierra_idx]['id'], fill="#2c3e50")
        for c in self.componentes:
            idx_shape = 0 if c['tipo']=='WIRE' else (1 if c['tipo']=='R' else 0)
            try:
                shape_id = c['ids'][idx_shape]
                self.canvas.itemconfig(shape_id, outline="black", width=2)
                if c['tipo']=='WIRE': self.canvas.itemconfig(shape_id, fill="#2c3e50", width=3)
            except: pass
        self.tipo_seleccionado = tipo; self.seleccionado = idx
        if tipo == 'NODO': self.canvas.itemconfig(self.nodos[idx]['id'], fill="#e74c3c")
        elif tipo == 'COMP':
            c = self.componentes[idx]
            idx_shape = 1 if c['tipo'] == 'R' else 0
            if c['tipo'] == 'WIRE': idx_shape = 0
            try:
                shape_id = c['ids'][idx_shape]
                self.canvas.itemconfig(shape_id, outline="#e74c3c", width=3)
                if c['tipo']=='WIRE': self.canvas.itemconfig(shape_id, fill="#e74c3c", width=5)
            except: pass
            if update_tree:
                self.bloqueo_arbol = True
                for item in self.tree.get_children():
                    if self.tree.item(item)['values'][0] == c['nombre']:
                        self.tree.selection_set(item); self.tree.see(item); break
                self.bloqueo_arbol = False

    def on_tree_select(self, event):
        if self.bloqueo_arbol: return
        sel = self.tree.selection()
        if not sel: self.seleccionar(None, None, update_tree=False); return
        nombre = self.tree.item(sel[0])['values'][0]
        for i, c in enumerate(self.componentes):
            if c['nombre'] == nombre: self.seleccionar('COMP', i, update_tree=False); break

    def on_tree_double_click(self, event):
        item = self.tree.identify_row(event.y)
        if not item: return
        vals = self.tree.item(item)['values']
        nombre = vals[0]; tipo = vals[1]
        if tipo != "WIRE": self.usar_dialogo_fallback(nombre, "VALOR")

    def usar_dialogo_fallback(self, nombre_comp, modo):
        current_val = 0
        for c in self.componentes:
            if c['nombre'] == nombre_comp: current_val = c['valor']
        new_val = simpledialog.askfloat("Editar", f"Valor para {nombre_comp}:", initialvalue=current_val, parent=self)
        if new_val is not None:
            for c in self.componentes:
                if c['nombre'] == nombre_comp:
                    self.save_state(); c['valor'] = new_val; break
            self.simular_en_tiempo_real()

    def simular_en_tiempo_real(self):
        sel = self.tree.selection()
        sel_name = self.tree.item(sel[0])['values'][0] if sel else None
        circ = Circuit()
        # Asegurar GND
        circ.nodes.add('0')
        for c in self.componentes:
            n1 = str(c['n1']) if c['n1'] != self.tierra_idx else '0'
            n2 = str(c['n2']) if c['n2'] != self.tierra_idx else '0'
            val = c['valor']
            if c['tipo'] == 'WIRE': val = 1e-9
            if c['tipo'] in ['R', 'WIRE']: circ.add_resistor(c['nombre'], n1, n2, val)
            elif c['tipo'] == 'V': circ.add_vsource(c['nombre'], n1, n2, val)
            elif c['tipo'] == 'I': circ.add_isource(c['nombre'], n1, n2, val)

        self.canvas.delete("error_mark")
        try:
            voltages, results = circ.solve() 
            self.bloqueo_arbol = True
            self.tree.delete(*self.tree.get_children())
            
            p_gen, p_dis = 0.0, 0.0
            kcl_nodos = {str(i) if i!=self.tierra_idx else '0': 0.0 for i in range(len(self.nodos))}
            
            v_max = max(voltages.values()) if voltages else 1.0
            v_min = min(voltages.values()) if voltages else 0.0

            for c in self.componentes:
                if c['tipo'] == 'WIRE': 
                    # Colorear cables (Heatmap)
                    n1_key = str(c['n1']) if c['n1'] != self.tierra_idx else '0'
                    v_wire = voltages.get(n1_key, 0.0)
                    color = get_voltage_color(v_wire, v_min, v_max)
                    self.canvas.itemconfig(c['ids'][0], fill=color)
                    continue
                
                d = results.get(c['nombre'], {'v':0, 'i':0, 'p':0})
                n1_key = str(c['n1']) if c['n1'] != self.tierra_idx else '0'
                n2_key = str(c['n2']) if c['n2'] != self.tierra_idx else '0'
                va = voltages.get(n1_key, 0.0); vb = voltages.get(n2_key, 0.0)
                
                kcl_nodos[n1_key] -= d['i']; kcl_nodos[n2_key] += d['i']
                if d['p'] > 0: p_dis += d['p']
                else: p_gen += abs(d['p'])

                vals = (c['nombre'], c['tipo'], f"{c['valor']:.2f}", f"{va:.2f}", f"{vb:.2f}", f"{d['v']:.2f}", f"{abs(d['i']):.3f}", f"{d['p']:.3f}")
                item = self.tree.insert("", "end", values=vals)
                if c['nombre'] == sel_name: self.tree.selection_set(item)
            
            self.bloqueo_arbol = False
            
            for c in self.componentes:
                if c['tipo'] == 'WIRE': continue
                val_id = c['ids'][-3]
                unit = "Ω" if c['tipo']=='R' else ("V" if c['tipo']=='V' else "A")
                self.canvas.itemconfig(val_id, text=f"{c['valor']}{unit}")
                arrow_id = c['ids'][-1]
                curr = results.get(c['nombre'], {'i':0})['i']
                if abs(curr) > 1e-6:
                    x1,y1 = self.nodos[c['n1']]['x'], self.nodos[c['n1']]['y']
                    x2,y2 = self.nodos[c['n2']]['x'], self.nodos[c['n2']]['y']
                    ang = math.degrees(math.atan2(y2-y1, x2-x1)) if curr > 0 else math.degrees(math.atan2(y1-y2, x1-x2))
                    self.canvas.itemconfig(arrow_id, text=f"➤\n{abs(curr):.2f}A", angle=ang, state="normal")
                else: self.canvas.itemconfig(arrow_id, state="hidden")

            for i, n in enumerate(self.nodos):
                key = str(i) if i!=self.tierra_idx else '0'
                v_val = voltages.get(key, 0.0)
                color = get_voltage_color(v_val, v_min, v_max)
                self.canvas.itemconfig(n['id'], fill=color) # Colorear nodo
                prefix = "GND" if i==self.tierra_idx else f"N{i}"
                self.canvas.itemconfig(n['txt_id'], text=f"{prefix}: {v_val:.2f}V")

            self.lbl_p_gen.config(text=f"P. Suministrada: {p_gen:.4f} W")
            self.lbl_p_dis.config(text=f"P. Disipada: {p_dis:.4f} W")
            neto = p_gen - p_dis
            color_bal = "green" if abs(neto) < 1e-4 else "red"
            self.lbl_balance.config(text=f"Neto: {neto:.5e} W", fg=color_bal)

            self.txt_kcl.delete("1.0", tk.END)
            self.txt_kcl.insert(tk.END, f"{'NODO':<10} | {'Σ I (A)':<15}\n" + "-"*30 + "\n")
            for k, v in kcl_nodos.items():
                lbl = "GND" if k=='0' else f"N{k}"
                status = "✅" if abs(v) < 1e-4 else "❌"
                self.txt_kcl.insert(tk.END, f"{lbl:<10} | {v:+.5f} {status}\n")
            self.status_bar.config(text="Cálculo Automático OK", fg="#27ae60")
            
        except Exception as e:
            self.status_bar.config(text=f"Error: {str(e)}", fg="#e67e22")

    def save_state(self):
        if not self.history.is_recording: return
        state = {'n': [{'x':n['x'],'y':n['y']} for n in self.nodos], 
                 'c': [{'t':c['tipo'],'n1':c['n1'],'n2':c['n2'],'v':c['valor'],'n':c['nombre']} for c in self.componentes]}
        self.history.save(state)
    def undo(self, e=None):
        s = self.history.undo()
        if s: self.restore(s)
    def redo(self, e=None):
        s = self.history.redo()
        if s: self.restore(s)
    def restore(self, s):
        self.history.is_recording = False
        self.canvas.delete("all"); dibujar_rejilla(self.canvas, self.winfo_screenwidth(), self.winfo_screenheight(), self.GRID_SIZE)
        self.nodos=[]; self.componentes=[]
        for n in s['n']: self.crear_nodo(n['x'], n['y'])
        for c in s['c']: self.crear_componente(c['n1'], c['n2'], c['t'], c['v'], c['n'])
        self.history.is_recording = True
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
    def find_comp(self, x, y):
        for i, c in enumerate(self.componentes):
            x1,y1=self.nodos[c['n1']]['x'], self.nodos[c['n1']]['y']
            x2,y2=self.nodos[c['n2']]['x'], self.nodos[c['n2']]['y']
            if math.hypot((x1+x2)/2-x, (y1+y2)/2-y) < 30: return i