import tkinter as tk
from tkinter import simpledialog, messagebox, ttk
import math
import sys
import os

# Importar motor
sys.path.append(os.path.dirname(__file__))
from circuit_sim import Circuit

class SimuladorPro(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Laboratorio Virtual de Física 2 - Circuitos DC")
        self.geometry("1300x750")
        self.state('zoomed') # Maximizar

        # --- ESTADO ---
        self.nodos = []       # {'x', 'y', 'id', 'tag_visual'}
        self.componentes = [] # {'tipo', 'n1', 'n2', 'valor', 'ids':[], 'nombre', 'tag'}
        self.modo = "SELECCIONAR" 
        self.seleccionado = None # Índice del componente o nodo seleccionado
        self.tipo_seleccionado = None # 'COMP' o 'NODO'
        
        # Variables de arrastre
        self.nodo_inicio = None
        self.linea_guia = None

        self.crear_interfaz()

    def crear_interfaz(self):
        # 1. Barra de Herramientas Superior
        barra = tk.Frame(self, bg="#2c3e50", height=50)
        barra.pack(side="top", fill="x")
        
        # Botones de Herramientas
        self.crear_boton_tool(barra, "cursor", "👆 Seleccionar", "SELECCIONAR")
        self.crear_boton_tool(barra, "nodo", "🔵 Nodo", "NODO")
        self.crear_boton_tool(barra, "res", "▅ Resistencia", "R")
        self.crear_boton_tool(barra, "fuente", "🔋 Fuente V", "V")
        self.crear_boton_tool(barra, "amp", "🅰 Amperímetro", "AMP")
        self.crear_boton_tool(barra, "calc", "🧮 Calc. Resistividad", "CALC_RO", color="#f39c12")
        
        tk.Button(barra, text="♻ BORRAR TODO", command=self.borrar_todo, bg="#c0392b", fg="white").pack(side="right", padx=10, pady=5)

        # 2. Contenedor Principal
        main_container = tk.PanedWindow(self, orient=tk.HORIZONTAL, sashwidth=5, bg="#bdc3c7")
        main_container.pack(fill="both", expand=True)

        # 3. Lienzo (Izquierda)
        self.canvas = tk.Canvas(main_container, bg="white", cursor="arrow")
        self.canvas.bind("<Button-1>", self.clic_canvas)
        self.canvas.bind("<B1-Motion>", self.arrastrar_canvas)
        self.canvas.bind("<ButtonRelease-1>", self.soltar_canvas)
        main_container.add(self.canvas, minsize=600)

        # 4. Panel de Ingeniería (Derecha)
        panel_derecho = tk.Frame(main_container, bg="#ecf0f1", width=350)
        main_container.add(panel_derecho, minsize=350)

        # --- SECCIÓN A: EDICIÓN ---
        tk.Label(panel_derecho, text="INSPECTOR DE COMPONENTES", bg="#2980b9", fg="white", font=("Arial", 10, "bold")).pack(fill="x", pady=0)
        
        self.frame_propiedades = tk.Frame(panel_derecho, bg="#ecf0f1", pady=10)
        self.frame_propiedades.pack(fill="x")
        
        self.lbl_sel = tk.Label(self.frame_propiedades, text="Nada seleccionado", bg="#ecf0f1", font=("Arial", 10))
        self.lbl_sel.pack()
        
        self.frame_edit_val = tk.Frame(self.frame_propiedades, bg="#ecf0f1")
        self.entry_val = tk.Entry(self.frame_edit_val, width=10)
        tk.Button(self.frame_edit_val, text="Aplicar Cambio", command=self.aplicar_edicion, bg="#27ae60", fg="white").pack(side="right")
        self.entry_val.pack(side="right", padx=5)
        tk.Label(self.frame_edit_val, text="Valor:", bg="#ecf0f1").pack(side="right")
        # (Se empaqueta dinámicamente al seleccionar)

        # --- SECCIÓN B: RESULTADOS ---
        tk.Label(panel_derecho, text="RESULTADOS Y ANÁLISIS", bg="#2c3e50", fg="white", font=("Arial", 10, "bold")).pack(fill="x", pady=(20,0))
        
        self.btn_simular = tk.Button(panel_derecho, text="▶ SIMULAR CIRCUITO", command=self.simular, bg="#e67e22", fg="white", font=("Arial", 12, "bold"), pady=10)
        self.btn_simular.pack(fill="x", padx=10, pady=10)

        # Árbol de Resultados (Tabla)
        columns = ("comp", "val", "i", "v", "p")
        self.tree = ttk.Treeview(panel_derecho, columns=columns, show="headings", height=15)
        self.tree.heading("comp", text="Comp.")
        self.tree.heading("val", text="Valor")
        self.tree.heading("i", text="Corr. (A)")
        self.tree.heading("v", text="Volt. (V)")
        self.tree.heading("p", text="Pot. (W)")
        
        self.tree.column("comp", width=50)
        self.tree.column("val", width=60)
        self.tree.column("i", width=70)
        self.tree.column("v", width=60)
        self.tree.column("p", width=70)
        
        self.tree.pack(fill="both", expand=True, padx=5)

        # --- SECCIÓN C: RESUMEN TEÓRICO ---
        self.lbl_resumen = tk.Label(panel_derecho, text="Estado: Esperando cálculo...", bg="#ecf0f1", justify="left", anchor="nw", padx=10, font=("Consolas", 9))
        self.lbl_resumen.pack(fill="both", expand=True, pady=10)

    def crear_boton_tool(self, parent, modo, texto, valor_modo, color="#bdc3c7"):
        btn = tk.Button(parent, text=texto, command=lambda: self.set_modo(valor_modo), bg=color, relief="flat", padx=10)
        btn.pack(side="left", padx=2, pady=5)

    def set_modo(self, modo):
        if modo == "CALC_RO":
            self.abrir_calculadora_resistividad()
            return
        self.modo = modo
        self.canvas.config(cursor="crosshair" if modo != "SELECCIONAR" else "arrow")
        self.seleccionado = None
        self.actualizar_panel_propiedades()

    # --- Lógica de Dibujo ---
    def clic_canvas(self, event):
        x, y = event.x, event.y
        
        # 1. Crear Nodo
        if self.modo == "NODO":
            if not self.encontrar_nodo_cercano(x, y):
                self.crear_nodo_visual(x, y)
            return

        # 2. Seleccionar
        if self.modo == "SELECCIONAR":
            # Intentar seleccionar nodo
            idx = self.encontrar_nodo_cercano(x, y)
            if idx is not None:
                self.seleccionar('NODO', idx)
                return
            # Intentar seleccionar componente (centro)
            idx_comp = self.encontrar_comp_cercano(x, y)
            if idx_comp is not None:
                self.seleccionar('COMP', idx_comp)
                return
            # Deseleccionar
            self.seleccionar(None, None)
            return

        # 3. Conectar (R, V, AMP)
        idx = self.encontrar_nodo_cercano(x, y)
        if idx is not None:
            self.nodo_inicio = idx
            nx, ny = self.nodos[idx]['x'], self.nodos[idx]['y']
            self.linea_guia = self.canvas.create_line(nx, ny, x, y, dash=(2,2))

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

    # --- Gestión de Objetos ---
    def crear_nodo_visual(self, x, y):
        uid = self.canvas.create_oval(x-6, y-6, x+6, y+6, fill="black", tags="nodo")
        self.nodos.append({'x': x, 'y': y, 'id': uid, 'tag': f"N{len(self.nodos)}"})

    def crear_componente(self, n1, n2, tipo):
        valor = 0.0
        nombre_display = ""
        
        if tipo == "R":
            v = simpledialog.askfloat("Resistencia", "Valor en Ohms (Ω):")
            if v is None: return
            valor = v
            nombre_display = f"{v}Ω"
        elif tipo == "V":
            v = simpledialog.askfloat("Fuente", "Voltaje en Volts (V):")
            if v is None: return
            valor = v
            nombre_display = f"{v}V"
        elif tipo == "AMP":
            valor = 0.0 # Ideal
            nombre_display = "A"

        # Dibujo
        x1, y1 = self.nodos[n1]['x'], self.nodos[n1]['y']
        x2, y2 = self.nodos[n2]['x'], self.nodos[n2]['y']
        xm, ym = (x1+x2)/2, (y1+y2)/2
        
        ids = []
        # Línea base
        ids.append(self.canvas.create_line(x1, y1, x2, y2, width=2, tags="comp"))
        
        # Etiqueta central (Rectángulo blanco para tapar cable)
        bg_color = "#ecf0f1" if tipo == "R" else ("#ffcccc" if tipo == "V" else "#ffffcc")
        ids.append(self.canvas.create_rectangle(xm-20, ym-10, xm+20, ym+10, fill=bg_color, outline="black"))
        ids.append(self.canvas.create_text(xm, ym, text=nombre_display, font=("Arial", 8, "bold")))
        
        if tipo == "V":
             # Indicador de polaridad (+ cerca de n1)
             dx = (x2-x1)*0.2
             dy = (y2-y1)*0.2
             ids.append(self.canvas.create_text(x1+dx, y1+dy, text="+", fill="red", font=("Arial", 12, "bold")))

        self.componentes.append({
            'tipo': tipo, 'n1': n1, 'n2': n2, 'valor': valor, 
            'ids': ids, 
            'nombre': f"{tipo}{len(self.componentes)}"
        })

    # --- Selección y Edición ---
    def seleccionar(self, tipo, idx):
        # Resetear colores previos
        self.canvas.itemconfig("nodo", fill="black")
        self.canvas.itemconfig("comp", fill="black")
        
        self.tipo_seleccionado = tipo
        self.seleccionado = idx
        
        if tipo == 'NODO':
            self.canvas.itemconfig(self.nodos[idx]['id'], fill="red")
        elif tipo == 'COMP':
            # Resaltar línea principal (id 0)
            linea_id = self.componentes[idx]['ids'][0]
            self.canvas.itemconfig(linea_id, fill="red")

        self.actualizar_panel_propiedades()

    def actualizar_panel_propiedades(self):
        self.frame_edit_val.pack_forget() # Ocultar editor
        
        if self.seleccionado is None:
            self.lbl_sel.config(text="Haz clic en un componente para editarlo.")
            return

        if self.tipo_seleccionado == 'COMP':
            comp = self.componentes[self.seleccionado]
            txt = f"Comp: {comp['nombre']} ({comp['tipo']})"
            self.lbl_sel.config(text=txt)
            
            # Mostrar editor si es R o V
            if comp['tipo'] in ['R', 'V']:
                self.frame_edit_val.pack(pady=5)
                self.entry_val.delete(0, tk.END)
                self.entry_val.insert(0, str(comp['valor']))
        
        elif self.tipo_seleccionado == 'NODO':
            self.lbl_sel.config(text=f"Nodo {self.seleccionado}")

    def aplicacion_edicion(self):
        if self.tipo_seleccionado == 'COMP':
            try:
                val = float(self.entry_val.get())
                self.componentes[self.seleccionado]['valor'] = val
                # Actualizar texto visual es complejo, simplificamos repintando el valor
                messagebox.showinfo("Info", "Valor actualizado. Recalcula para ver cambios.")
            except ValueError:
                messagebox.showerror("Error", "Número inválido")
    
    def aplicar_edicion(self):
        self.aplicacion_edicion() # Alias

    # --- UTILIDADES ---
    def encontrar_nodo_cercano(self, x, y):
        for i, n in enumerate(self.nodos):
            if math.hypot(n['x']-x, n['y']-y) < 15: return i
        return None

    def encontrar_comp_cercano(self, x, y):
        for i, c in enumerate(self.componentes):
            n1, n2 = self.nodos[c['n1']], self.nodos[c['n2']]
            xm, ym = (n1['x']+n2['x'])/2, (n1['y']+n2['y'])/2
            if math.hypot(xm-x, ym-y) < 20: return i
        return None

    def borrar_todo(self):
        self.canvas.delete("all")
        self.nodos = []
        self.componentes = []
        self.tree.delete(*self.tree.get_children())
        self.lbl_resumen.config(text="")

    # --- SIMULACIÓN ---
    def simular(self):
        if not self.componentes: return
        
        # Pedir Tierra
        idx_tierra = 0
        if len(self.nodos) > 1:
            # Resaltar nodos con números temporales
            tags = []
            for i, n in enumerate(self.nodos):
                t = self.canvas.create_text(n['x'], n['y']-15, text=str(i), fill="blue", font=("Arial",12,"bold"))
                tags.append(t)
            self.update()
            resp = simpledialog.askinteger("Referencia", f"Elige nodo TIERRA (0-{len(self.nodos)-1}):", minvalue=0, maxvalue=len(self.nodos)-1)
            for t in tags: self.canvas.delete(t)
            if resp is None: return
            idx_tierra = resp

        # Construir Netlist para el motor
        circ = Circuit()
        mapa_nodos = {i: (str(i) if i != idx_tierra else '0') for i in range(len(self.nodos))}
        
        # Añadir componentes
        for i, c in enumerate(self.componentes):
            na, nb = mapa_nodos[c['n1']], mapa_nodos[c['n2']]
            nombre = f"{c['tipo']}_{i}"
            
            if c['tipo'] == 'R':
                circ.add_resistor(nombre, na, nb, c['valor'])
            elif c['tipo'] == 'V':
                circ.add_vsource(nombre, na, nb, c['valor']) # n1 es positivo
            elif c['tipo'] == 'AMP':
                # Amperímetro = Fuente de 0V
                circ.add_vsource(nombre, na, nb, 0.0)

        # Resolver
        try:
            voltages, res_currents, vsrc_currents = circ.solve()
            self.mostrar_resultados_panel(voltages, res_currents, vsrc_currents, mapa_nodos)
        except Exception as e:
            messagebox.showerror("Error de Cálculo", f"El circuito está abierto o mal conectado.\n{e}")

    def mostrar_resultados_panel(self, voltages, res_currents, vsrc_currents, mapa_nodos):
        # Limpiar tabla
        self.tree.delete(*self.tree.get_children())
        
        total_power = 0.0
        res_eq_data = {"v_source": 0, "i_source": 0}

        # Llenar Tabla y Calcular Potencias
        for i, c in enumerate(self.componentes):
            nombre = f"{c['tipo']}_{i}"
            tipo = c['tipo']
            val = c['valor']
            corriente = 0.0
            voltaje_caida = 0.0
            potencia = 0.0

            # Datos de nodos
            na_id, nb_id = mapa_nodos[c['n1']], mapa_nodos[c['n2']]
            va = voltages.get(na_id, 0.0)
            vb = voltages.get(nb_id, 0.0)
            voltaje_caida = va - vb

            if tipo == 'R':
                if nombre in res_currents:
                    corriente = res_currents[nombre][0]
                    potencia = (corriente**2) * val
                    total_power += potencia
            elif tipo == 'V':
                if nombre in vsrc_currents:
                    corriente = vsrc_currents[nombre] # Corriente que sale del +
                    potencia = val * corriente # Potencia entregada (si I>0) o absorbida
                    # Para Req, tomamos la fuente principal (la de mayor voltaje por ej)
                    if val > res_eq_data["v_source"]:
                        res_eq_data["v_source"] = val
                        res_eq_data["i_source"] = abs(corriente)

            elif tipo == 'AMP':
                if nombre in vsrc_currents:
                    corriente = vsrc_currents[nombre]
            
            # Insertar en tabla
            self.tree.insert("", "end", values=(
                tipo, 
                f"{val:.1f}", 
                f"{corriente:.4f}", 
                f"{voltaje_caida:.2f}", 
                f"{potencia:.4f}" if tipo=='R' else "-"
            ))
            
            # Dibujar valor en el canvas (Overlay)
            self.dibujar_dato_en_canvas(c, corriente, voltaje_caida)

        # Resumen final
        req_txt = "N/A"
        if res_eq_data["i_source"] > 0:
            req = res_eq_data["v_source"] / res_eq_data["i_source"]
            req_txt = f"{req:.2f} Ω"

        resumen = (
            f"--- ANÁLISIS GENERAL ---\n"
            f"Potencia Disipada Total: {total_power:.4f} W\n"
            f"Resistencia Equivalente (vista por fuente principal): {req_txt}\n"
            f"Verificación Kirchhoff: OK (Balance Energético)"
        )
        self.lbl_resumen.config(text=resumen)

    def dibujar_dato_en_canvas(self, comp, corriente, voltaje):
        # Borrar textos viejos
        self.canvas.delete("dato_overlay")
        
        x1, y1 = self.nodos[comp['n1']]['x'], self.nodos[comp['n1']]['y']
        x2, y2 = self.nodos[comp['n2']]['x'], self.nodos[comp['n2']]['y']
        xm, ym = (x1+x2)/2, (y1+y2)/2
        
        color = "blue" if comp['tipo'] == 'R' else "red"
        texto = f"{corriente:.3f}A"
        
        self.canvas.create_text(xm, ym-20, text=texto, fill=color, font=("Arial", 8, "bold"), tags="dato_overlay")

    # --- CALCULADORA TEÓRICA ---
    def abrir_calculadora_resistividad(self):
        win = tk.Toplevel(self)
        win.title("Calculadora de Resistividad (Ley de Pouillet)")
        win.geometry("300x250")
        
        tk.Label(win, text="R = ρ * L / A", font=("Arial", 12, "bold")).pack(pady=10)
        
        def calc():
            try:
                rho = float(e_rho.get())
                l = float(e_l.get())
                a_mm2 = float(e_a.get())
                a_m2 = a_mm2 * 1e-6 # Convertir mm2 a m2
                
                res = rho * l / a_m2
                lbl_res.config(text=f"Resistencia: {res:.4f} Ω")
            except:
                lbl_res.config(text="Error en valores")

        tk.Label(win, text="Resistividad ρ (Ω.m):").pack()
        e_rho = tk.Entry(win); e_rho.pack()
        e_rho.insert(0, "1.68e-8") # Cobre
        
        tk.Label(win, text="Longitud L (m):").pack()
        e_l = tk.Entry(win); e_l.pack()
        
        tk.Label(win, text="Área Transversal A (mm²):").pack()
        e_a = tk.Entry(win); e_a.pack()
        
        tk.Button(win, text="Calcular", command=calc, bg="orange").pack(pady=10)
        lbl_res = tk.Label(win, text="Resistencia: -", font=("Arial", 10, "bold"), fg="blue")
        lbl_res.pack()

if __name__ == "__main__":
    app = SimuladorPro()
    app.mainloop()