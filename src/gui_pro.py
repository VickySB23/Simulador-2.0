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

# --- UTILS DE FORMATO E INGENIERÍA ---
def format_eng(value, unit=""):
    """Formatea números con prefijos de ingeniería (M, k, m, µ, n)"""
    if value is None: return "---"
    if abs(value) < 1e-15: return f"0.00 {unit}"
    
    abs_val = abs(value)
    sign = "-" if value < 0 else ""
    
    if abs_val >= 1e6: return f"{sign}{abs_val/1e6:.2f} M{unit}"
    if abs_val >= 1e3: return f"{sign}{abs_val/1e3:.2f} k{unit}"
    if abs_val >= 1:   return f"{sign}{abs_val:.2f} {unit}"
    if abs_val >= 1e-3: return f"{sign}{abs_val*1e3:.2f} m{unit}"
    if abs_val >= 1e-6: return f"{sign}{abs_val*1e6:.2f} µ{unit}"
    if abs_val >= 1e-9: return f"{sign}{abs_val*1e9:.2f} n{unit}"
    
    return f"{sign}{value:.2e} {unit}"

# --- UTILS DE COLOR ---
def get_voltage_color(v, v_min, v_max):
    if v_max == v_min: return "#2c3e50" 
    ratio = (v - v_min) / (v_max - v_min)
    ratio = max(0.0, min(1.0, ratio))
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
        if self.history_stack:
            state = self.history_stack.pop()
            self.redo_stack.append(state)
            return state
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
    canvas.create_rectangle(0,0,w,h, fill="#fdfefe", outline="")
    for i in range(0, w, grid_size):
        for j in range(0, h, grid_size):
            canvas.create_oval(i-1, j-1, i+1, j+1, fill="#bdc3c7", outline="")

def crear_nodo_visual_func(canvas, x, y, label, is_gnd=False):
    r = 8
    color = "#34495e" 
    uid = canvas.create_oval(x-r, y-r, x+r, y+r, fill=color, outline="black", width=2, tags="nodo")
    txt_id = canvas.create_text(x, y-22, text=label, fill="#7f8c8d", font=("Arial", 9, "bold"), tags="lbl_nodo")
    
    if is_gnd:
        gnd_ids = []
        gnd_ids.append(canvas.create_line(x, y+r, x, y+r+10, width=2, fill="black", tags="gnd"))
        gnd_ids.append(canvas.create_line(x-10, y+r+10, x+10, y+r+10, width=2, fill="black", tags="gnd"))
        gnd_ids.append(canvas.create_line(x-6, y+r+14, x+6, y+r+14, width=2, fill="black", tags="gnd"))
    
    return uid, txt_id

def dibujar_componente_func(canvas, x1, y1, x2, y2, tipo, valor, nombre):
    ids = []
    dist_x, dist_y = abs(x2 - x1), abs(y2 - y1)
    is_vertical = abs(y2 - y1) > abs(x2 - x1)
    
    if not is_vertical:
        xm, ym = (x1 + x2) / 2, y1
        vertical = False
    else:
        xm, ym = x2, (y1 + y2) / 2
        vertical = True

    gap = 25 if tipo != 'WIRE' else 0
    is_source = tipo in ['V', 'I']
    
    # Segmentos de cable
    if gap > 0:
        coords_1 = [x1, y1, x2, y1, x2, ym-gap] if vertical else [x1, y1, xm-gap, y1]
        coords_2 = [x2, ym+gap, x2, y2] if vertical else [xm+gap, y1, x2, y1, x2, y2]
        if len(coords_1)>=4: ids.append(canvas.create_line(coords_1, width=3, fill="#2c3e50", tags="comp"))
        if len(coords_2)>=4: ids.append(canvas.create_line(coords_2, width=3, fill="#2c3e50", tags="comp"))
    else:
        coords = [x1, y1, x2, y1, x2, y2] if vertical else [x1, y1, x2, y1, x2, y2]
        ids.append(canvas.create_line(coords, width=3, fill="#2c3e50", tags="comp"))
        ids.append(canvas.create_text(xm, ym, text="")) 

    val_str = format_eng(valor, "Ω" if tipo=='R' else ("V" if tipo=='V' else "A"))

    # --- HELPER PARA TEXTO CON FONDO ---
    def create_label_bg(tx, ty, text, color, angle=0, font_size=9, tag_extra=""):
        # Estimar tamaño del fondo basado en longitud del texto
        char_w = 7 if font_size == 9 else 6
        w_box = len(text) * char_w
        h_box = 16
        
        if angle == 90: 
            w_box, h_box = h_box, w_box
            
        # Rectángulo de fondo (Máscara)
        bg_id = canvas.create_rectangle(tx - w_box/2, ty - h_box/2, tx + w_box/2, ty + h_box/2, 
                                        fill="white", outline="", tags=("comp", tag_extra))
        # Texto
        t_id = canvas.create_text(tx, ty, text=text, font=("Arial", font_size, "bold"), 
                                  fill=color, angle=angle, tags=("comp", tag_extra))
        return bg_id, t_id

    # --- DIBUJO DE COMPONENTES ---
    if tipo == 'R':
        # Cálculo dinámico del rectángulo del cuerpo de la resistencia
        char_width = 7
        txt_w = len(val_str) * char_width + 10
        if txt_w < 40: txt_w = 40
        box_w, box_h = txt_w, 20
        
        angle_txt = 0
        if vertical:
            box_w, box_h = box_h, box_w 
            angle_txt = 90
            
        rect_id = canvas.create_rectangle(xm-box_w/2, ym-box_h/2, xm+box_w/2, ym+box_h/2, fill="white", outline="black", width=2, tags="comp")
        ids.append(rect_id)
        
        # Texto valor (dentro, no necesita fondo extra porque el rect es blanco)
        ids.append(canvas.create_text(xm, ym, text=val_str, font=("Arial", 9, "bold"), fill="black", tags="comp", angle=angle_txt))

    elif tipo == 'V':
        r = 20
        ids.append(canvas.create_oval(xm-r, ym-r, xm+r, ym+r, fill="#e74c3c", outline="black", width=2, tags="comp"))
        ids.append(canvas.create_text(xm, ym, text="+  -", font=("Arial", 10, "bold"), fill="white", tags="comp"))
        
        tx, ty = (xm+28, ym) if vertical else (xm, ym-28)
        bg, txt = create_label_bg(tx, ty, val_str, "red", angle=0)
        ids.extend([bg, txt])

    elif tipo == 'I':
        r = 20
        ids.append(canvas.create_oval(xm-r, ym-r, xm+r, ym+r, fill="#2ecc71", outline="black", width=2, tags="comp"))
        ids.append(canvas.create_text(xm, ym, text="I", font=("Arial", 12, "bold"), fill="white", tags="comp"))
        
        tx, ty = (xm+28, ym) if vertical else (xm, ym-28)
        bg, txt = create_label_bg(tx, ty, val_str, "green", angle=0)
        ids.extend([bg, txt])

    # --- NOMBRE (R1, V1) ---
    if tipo != 'WIRE':
        dist_name = 45 if is_source else 35
        nx, ny = (xm-dist_name, ym) if vertical else (xm, ym-dist_name)
        if is_source: ny -= 5 
        # Usamos el helper también para el nombre para que no se superponga con cables
        bg, txt = create_label_bg(nx, ny, nombre, "blue", angle=0, font_size=10)
        ids.extend([bg, txt])
    else:
        ids.append(canvas.create_text(xm, ym, text=""))

    # --- ETIQUETA DE VOLTAJE EN CABLE (CON FONDO) ---
    if tipo == 'WIRE':
        if vertical:
            vx, vy = (xm - 15, ym); ang_volt = 90
        else:
            vx, vy = (xm, ym - 15); ang_volt = 0
            
        # Creamos el fondo y el texto pero ocultos inicialmente
        bg_id = canvas.create_rectangle(vx, vy, vx, vy, fill="white", outline="", tags="lbl_volt_wire", state="hidden")
        txt_id = canvas.create_text(vx, vy, text="", font=("Arial", 9, "bold"), fill="#e67e22", tags="lbl_volt_wire", state="hidden", angle=ang_volt)
        ids.extend([bg_id, txt_id])
    
    # --- FLECHA CORRIENTE (CON FONDO) ---
    dist_arrow = 28
    ax, ay = (xm+dist_arrow, ym) if vertical else (xm, ym+dist_arrow)
    # Fondo pequeño para la flecha
    bg_arrow = canvas.create_oval(ax-8, ay-8, ax+8, ay+8, fill="white", outline="", tags="arrow") 
    txt_arrow = canvas.create_text(ax, ay, text="", font=("Arial", 10, "bold"), fill="#c0392b", tags="arrow")
    ids.extend([bg_arrow, txt_arrow])
    
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
        
        self.GRID_SIZE = 40 
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
        self.orientacion = "HORIZONTAL"
        self.mostrar_voltajes = tk.BooleanVar(value=True)

        self.crear_interfaz()
        self.save_state() 

        self.bind("<Control-z>", self.undo)
        self.bind("<Control-y>", self.redo)
        self.bind("<Delete>", self.eliminar_seleccion)
        self.bind("<Escape>", lambda e: self.set_modo("SELECCIONAR"))
        self.bind("<space>", self.toggle_orientacion)

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
        
        tk.Frame(barra, width=20, bg="#2c3e50").pack(side="left")
        
        chk = tk.Checkbutton(barra, text="Ver Voltajes", variable=self.mostrar_voltajes, 
                             command=self.actualizar_etiquetas_voltaje,
                             bg="#2c3e50", fg="white", selectcolor="#2c3e50", activebackground="#2c3e50", activeforeground="white",
                             font=("Segoe UI", 10))
        chk.pack(side="left")

        tk.Button(barra, text="↪ Rehacer", command=self.redo, bg="#7f8c8d", fg="white", relief="flat", padx=10).pack(side="right", padx=5)
        tk.Button(barra, text="↩ Deshacer", command=self.undo, bg="#7f8c8d", fg="white", relief="flat", padx=10).pack(side="right", padx=5)
        
        self.paned = tk.PanedWindow(self, orient=tk.HORIZONTAL, sashwidth=8, bg="#bdc3c7")
        self.paned.pack(fill="both", expand=True)

        self.frame_grafico = tk.Frame(self.paned, bg="white")
        self.paned.add(self.frame_grafico, minsize=600)
        
        self.canvas = tk.Canvas(self.frame_grafico, bg="#fdfefe", cursor="arrow")
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

        cols = ("Nombre", "Tipo", "Valor", "Va (V)", "Vb (V)", "ΔV", "|I|", "P (W)")
        self.tree = ttk.Treeview(self.frame_datos, columns=cols, show="headings", selectmode="browse", height=8)
        
        anchos = [60, 40, 70, 60, 60, 60, 70, 70]
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

    def actualizar_etiquetas_voltaje(self):
        state = "normal" if self.mostrar_voltajes.get() else "hidden"
        self.canvas.itemconfig("lbl_volt_wire", state=state)

    def btn_tool(self, parent, txt, mode, col, fg="white"):
        tk.Button(parent, text=txt, command=lambda: self.set_modo(mode), bg=col, fg=fg, 
                 font=("Segoe UI", 10, "bold"), relief="flat", width=14, pady=5).pack(side="left", padx=5)

    def set_modo(self, m):
        self.modo = m
        txt = "SELECCIÓN" if m == "SELECCIONAR" else f"HERRAMIENTA: {m}"
        self.lbl_modo.config(text=txt)
        self.canvas.config(cursor="crosshair" if m != "SELECCIONAR" else "arrow")
        self.seleccionar(None, None, update_tree=False)
        
        if m in ["R", "V", "I"]:
            self.orientacion = "HORIZONTAL"
            self.status_bar.config(text=f"Modo {m} activo. Orientación: {self.orientacion} (Usa ESPACIO para rotar)", fg="#34495e")
        else:
            self.status_bar.config(text="Listo.", fg="white", bg="#95a5a6")

    def toggle_orientacion(self, event=None):
        if self.modo in ["R", "V", "I"]:
            self.orientacion = "VERTICAL" if self.orientacion == "HORIZONTAL" else "HORIZONTAL"
            self.status_bar.config(text=f"Modo {self.modo} activo. Orientación: {self.orientacion} (Usa ESPACIO para rotar)", fg="#34495e")

    def snap(self, v): return round(v/self.GRID_SIZE)*self.GRID_SIZE

    def clic_canvas(self, event):
        self.canvas.focus_set()
        x, y = self.snap(event.x), self.snap(event.y)
        
        if self.modo == "GND":
            idx = self.find_node(x, y)
            if idx is not None:
                self.tierra_idx = idx
                self.save_state()
                self.simular_en_tiempo_real()
                return 

        if self.modo in ["R", "V", "I"]:
            if self.find_comp(x, y, radius_override=45) is not None:
                messagebox.showwarning("Espacio Ocupado", "Ya existe un componente aquí o muy cerca.")
                return

        if self.modo in ["R", "V", "I"]:
            self.save_state()
            if self.orientacion == "HORIZONTAL":
                x1, y1 = x - 40, y; x2, y2 = x + 40, y
            else: 
                x1, y1 = x, y - 40; x2, y2 = x, y + 40
            idx1 = self.crear_nodo(x1, y1); idx2 = self.crear_nodo(x2, y2)
            
            existing_names = {c['nombre'] for c in self.componentes if c['tipo'] == self.modo}
            k = 1
            prefix = "W" if self.modo == "WIRE" else self.modo
            while f"{prefix}{k}" in existing_names:
                k += 1
            nombre_final = f"{prefix}{k}"

            comp_idx = self.crear_componente(idx1, idx2, self.modo, nombre=nombre_final)
            self.usar_dialogo_fallback(self.componentes[comp_idx]['nombre'], "VALOR")
            self.set_modo("SELECCIONAR")
        
        elif self.modo == "GND":
            idx = self.find_node(x,y)
            if idx is None:
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
                self.canvas.create_oval(nx-10, ny-10, nx+10, ny+10, outline="#39ff14", width=3, tags="highlight")

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
        
        if tipo == 'WIRE':
            volt_id = ids[-3] # Encontrando el ID del texto de voltaje, ajustado por los nuevos elementos
            # IDs structure: [line1, line2, box, text]
            # Revisamos el último elemento que sea 'lbl_volt_wire'
            for item in ids:
                tags = self.canvas.gettags(item)
                if "lbl_volt_wire" in tags and self.canvas.type(item) == "text":
                    state = "normal" if self.mostrar_voltajes.get() else "hidden"
                    self.canvas.itemconfig(item, state=state)
                    # También el fondo
                    bg_item = ids[ids.index(item)-1]
                    self.canvas.itemconfig(bg_item, state=state)
            
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
        circ.nodes.add('0')
        
        node_degree = {str(i): 0 for i in range(len(self.nodos))}

        for c in self.componentes:
            n1 = str(c['n1']) if c['n1'] != self.tierra_idx else '0'
            n2 = str(c['n2']) if c['n2'] != self.tierra_idx else '0'
            
            idx1 = str(self.tierra_idx) if n1 == '0' else str(c['n1'])
            idx2 = str(self.tierra_idx) if n2 == '0' else str(c['n2'])
            
            if n1 == '0': idx1 = str(self.tierra_idx)
            if n2 == '0': idx2 = str(self.tierra_idx)

            node_degree[idx1] = node_degree.get(idx1, 0) + 1
            node_degree[idx2] = node_degree.get(idx2, 0) + 1

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
                d = results.get(c['nombre'], {'v':0, 'i':0, 'p':0})
                n1_key = str(c['n1']) if c['n1'] != self.tierra_idx else '0'
                n2_key = str(c['n2']) if c['n2'] != self.tierra_idx else '0'
                
                kcl_nodos[n1_key] -= d['i']
                kcl_nodos[n2_key] += d['i']

                if c['tipo'] == 'WIRE': 
                    v_wire = voltages.get(n1_key, 0.0)
                    color = get_voltage_color(v_wire, v_min, v_max)
                    self.canvas.itemconfig(c['ids'][0], fill=color)
                    
                    # Buscar el texto del voltaje en los IDs
                    for item in c['ids']:
                        tags = self.canvas.gettags(item)
                        if "lbl_volt_wire" in tags and self.canvas.type(item) == "text":
                            self.canvas.itemconfig(item, text=format_eng(v_wire, "V"))
                            
                            # Ajustar el fondo
                            bg_item = c['ids'][c['ids'].index(item)-1]
                            # Calcular tamaño texto aproximado
                            txt = format_eng(v_wire, "V")
                            w_box = len(txt)*6
                            h_box = 16
                            coords = self.canvas.coords(item)
                            # Si el texto está rotado 90
                            if self.canvas.itemcget(item, "angle") == "90.0":
                                w_box, h_box = h_box, w_box
                            
                            self.canvas.coords(bg_item, coords[0]-w_box/2, coords[1]-h_box/2, coords[0]+w_box/2, coords[1]+h_box/2)
                            
                    continue 
                
                va = voltages.get(n1_key, 0.0); vb = voltages.get(n2_key, 0.0)
                if d['p'] > 0: p_dis += d['p']
                else: p_gen += abs(d['p'])

                val_fmt = format_eng(c['valor'], "Ω" if c['tipo']=='R' else ("V" if c['tipo']=='V' else "A"))
                v_drop = format_eng(d['v'], "V")
                i_fmt = format_eng(abs(d['i']), "A")
                p_fmt = format_eng(d['p'], "W")
                
                vals = (c['nombre'], c['tipo'], val_fmt, f"{va:.2f}", f"{vb:.2f}", v_drop, i_fmt, p_fmt)
                item = self.tree.insert("", "end", values=vals)
                if c['nombre'] == sel_name: self.tree.selection_set(item)
            
            self.bloqueo_arbol = False
            
            for c in self.componentes:
                if c['tipo'] == 'WIRE': continue
                val_id = c['ids'][-3]
                # Actualizar texto principal no requiere lógica especial de fondo porque el rect ya está
                # Pero si es Fuente, sí. El helper ya creó el rect. Solo actualizamos texto.
                # Buscar el texto del valor
                # En R es ids[-1]
                # En V/I es ids[-1] (text) y ids[-2] (bg)
                
                # Lógica simple: buscar tags
                for item in c['ids']:
                    tags = self.canvas.gettags(item)
                    if "comp" in tags and self.canvas.type(item) == "text":
                        # Es un texto de componente. Verificar si es el valor.
                        current_text = self.canvas.itemcget(item, "text")
                        # Si parece un valor (tiene numeros y unidades)
                        if any(x.isdigit() for x in current_text) and c['nombre'] not in current_text:
                             self.canvas.itemconfig(item, text=format_eng(c['valor'], "Ω" if c['tipo']=='R' else ("V" if c['tipo']=='V' else "A")))
                
                # Flecha corriente
                arrow_id = c['ids'][-1]
                curr = results.get(c['nombre'], {'i':0})['i']
                if abs(curr) > 1e-12:
                    x1,y1 = self.nodos[c['n1']]['x'], self.nodos[c['n1']]['y']
                    x2,y2 = self.nodos[c['n2']]['x'], self.nodos[c['n2']]['y']
                    ang = math.degrees(math.atan2(y2-y1, x2-x1))
                    if curr < 0: ang += 180
                    ang = ang % 360
                    
                    if 45 <= ang < 135:   arrow_char = "▼" 
                    elif 135 <= ang < 225: arrow_char = "◄" 
                    elif 225 <= ang < 315: arrow_char = "▲" 
                    else:                 arrow_char = "➤" 
                    
                    self.canvas.itemconfig(arrow_id, text=f"{arrow_char} {format_eng(abs(curr), 'A')}", angle=0, state="normal")
                else: self.canvas.itemconfig(arrow_id, state="hidden")

            for i, n in enumerate(self.nodos):
                if i == self.tierra_idx:
                    self.canvas.delete(n.get('gnd_lines', [])) 
                key = str(i) if i!=self.tierra_idx else '0'
                v_val = voltages.get(key, 0.0)
                color = get_voltage_color(v_val, v_min, v_max)
                self.canvas.itemconfig(n['id'], fill=color)
                prefix = "GND" if i==self.tierra_idx else f"N{i}"
                self.canvas.itemconfig(n['txt_id'], text=prefix)

            self.lbl_p_gen.config(text=f"P. Suministrada: {format_eng(p_gen, 'W')}")
            self.lbl_p_dis.config(text=f"P. Disipada: {format_eng(p_dis, 'W')}")
            neto = p_gen - p_dis
            color_bal = "green" if abs(neto) < 1e-4 else "red"
            self.lbl_balance.config(text=f"Neto: {neto:.5e} W", fg=color_bal)

            self.txt_kcl.delete("1.0", tk.END)
            self.txt_kcl.insert(tk.END, f"{'NODO':<10} | {'Σ I (A)':<15}\n" + "-"*30 + "\n")
            
            for k, v in kcl_nodos.items():
                lbl = "GND" if k=='0' else f"N{k}"
                real_idx = str(self.tierra_idx) if k == '0' else k
                conns = node_degree.get(real_idx, 0)
                if conns < 2: status = "❌ (Abierto)"
                else: status = "✅" if abs(v) < 1e-3 else "❌ (Error KCL)"
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
        self.canvas.delete("all")
        dibujar_rejilla(self.canvas, self.winfo_screenwidth(), self.winfo_screenheight(), self.GRID_SIZE)
        self.nodos = []
        self.componentes = []
        for n in s['n']: self.crear_nodo(n['x'], n['y'])
        for c in s['c']: self.crear_componente(c['n1'], c['n2'], c['t'], c['v'], c['n'])
        self.history.is_recording = True
        self.simular_en_tiempo_real()

    def cleanup_isolated_nodes(self):
        used_indices = set()
        for c in self.componentes:
            used_indices.add(c['n1'])
            used_indices.add(c['n2'])
        new_nodos = []
        mapping = {}
        for old_i, node in enumerate(self.nodos):
            if old_i in used_indices:
                mapping[old_i] = len(new_nodos)
                new_nodos.append(node)
            else:
                self.canvas.delete(node['id'])
                self.canvas.delete(node['txt_id'])
        for c in self.componentes:
            c['n1'] = mapping[c['n1']]
            c['n2'] = mapping[c['n2']]
        if self.tierra_idx in mapping:
            self.tierra_idx = mapping[self.tierra_idx]
        else:
            self.tierra_idx = 0 if len(new_nodos) > 0 else 0
        self.nodos = new_nodos

    def eliminar_seleccion(self, e=None):
        if self.seleccionado is not None and self.tipo_seleccionado == 'COMP':
            self.save_state()
            for i in self.componentes[self.seleccionado]['ids']: 
                self.canvas.delete(i)
            self.componentes.pop(self.seleccionado)
            self.seleccionado = None
            self.cleanup_isolated_nodes()
            self.simular_en_tiempo_real()
            
        elif self.seleccionado is not None and self.tipo_seleccionado == 'NODO':
            n_idx = self.seleccionado
            conectados = [c for c in self.componentes if c['n1'] == n_idx or c['n2'] == n_idx]
            if conectados:
                messagebox.showwarning("No se puede borrar", "Desconecta los componentes unidos a este nodo primero.")
                return
            self.save_state()
            self.cleanup_isolated_nodes()
            self.seleccionado = None
            self.simular_en_tiempo_real()

    def find_node(self, x, y):
        for i, n in enumerate(self.nodos):
            if math.hypot(n['x']-x, n['y']-y) < 20: return i
            
    def find_comp(self, x, y, radius_override=None):
        radius = radius_override if radius_override else 40
        for i, c in enumerate(self.componentes):
            x1,y1=self.nodos[c['n1']]['x'], self.nodos[c['n1']]['y']
            x2,y2=self.nodos[c['n2']]['x'], self.nodos[c['n2']]['y']
            if math.hypot((x1+x2)/2-x, (y1+y2)/2-y) < radius: return i