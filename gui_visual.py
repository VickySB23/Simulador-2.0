import tkinter as tk
from tkinter import simpledialog, messagebox
import math
import sys
import os

# Importar el motor matemático
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))
from circuit_sim import Circuit

class EditorCircuito(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Editor Visual de Circuitos - Física 2")
        self.geometry("1000x700")
        
        # --- Variables de Estado ---
        self.nodos_visuales = [] # Lista de tuplas (x, y, id_visual)
        self.componentes = []    # Lista de dicts con datos del componente
        self.nodo_seleccionado = None
        self.modo_actual = "NODO" # NODO, RESISTENCIA, FUENTE, BORRAR
        
        # --- Panel de Herramientas (Izquierda) ---
        self.panel = tk.Frame(self, width=200, bg="#2c3e50")
        self.panel.pack(side="left", fill="y")
        
        self.lbl_titulo = tk.Label(self.panel, text="HERRAMIENTAS", bg="#2c3e50", fg="white", font=("Arial", 12, "bold"))
        self.lbl_titulo.pack(pady=10)
        
        self.btn_nodo = tk.Button(self.panel, text="📍 Crear Nodo", command=lambda: self.set_modo("NODO"), width=20, bg="#3498db", fg="white")
        self.btn_nodo.pack(pady=5)
        
        self.btn_res = tk.Button(self.panel, text="Resistencia (R)", command=lambda: self.set_modo("RESISTENCIA"), width=20, bg="#95a5a6")
        self.btn_res.pack(pady=5)
        
        self.btn_v = tk.Button(self.panel, text="Fuente (V)", command=lambda: self.set_modo("FUENTE"), width=20, bg="#e74c3c", fg="white")
        self.btn_v.pack(pady=5)
        
        self.btn_calc = tk.Button(self.panel, text="▶ CALCULAR", command=self.calcular, width=20, bg="#2ecc71", fg="white", font=("Arial", 12, "bold"))
        self.btn_calc.pack(pady=20)
        
        self.btn_clear = tk.Button(self.panel, text="Borrar Todo", command=self.borrar_todo, width=20, bg="#c0392b", fg="white")
        self.btn_clear.pack(side="bottom", pady=20)
        
        self.lbl_info = tk.Label(self.panel, text="Modo: NODO\nHaz clic en el espacio\npara crear puntos.", bg="#2c3e50", fg="#f1c40f", justify="left")
        self.lbl_info.pack(pady=20)

        # --- Lienzo de Dibujo (Canvas) ---
        self.canvas = tk.Canvas(self, bg="white", cursor="cross")
        self.canvas.pack(side="right", fill="both", expand=True)
        
        # Eventos del Mouse
        self.canvas.bind("<Button-1>", self.clic_canvas)

    def set_modo(self, modo):
        self.modo_actual = modo
        self.nodo_seleccionado = None
        
        txt = ""
        if modo == "NODO": txt = "Haz clic en el fondo blanco\npara crear puntos de conexión."
        elif modo == "RESISTENCIA": txt = "1. Clic en Nodo Inicio\n2. Clic en Nodo Fin\n(Para unir)"
        elif modo == "FUENTE": txt = "1. Clic en Positivo (+)\n2. Clic en Negativo (-)"
        
        self.lbl_info.config(text=f"Modo: {modo}\n\n{txt}")
        # Resetear colores
        self.redibujar()

    def clic_canvas(self, event):
        x, y = event.x, event.y
        
        # 1. Si el modo es crear NODO
        if self.modo_actual == "NODO":
            # Verificar que no estemos clicando encima de otro
            for nx, ny, _ in self.nodos_visuales:
                if abs(nx - x) < 20 and abs(ny - y) < 20:
                    return # Muy cerca de otro nodo
            
            # Dibujar nodo visual
            r = 8
            uid = self.canvas.create_oval(x-r, y-r, x+r, y+r, fill="black")
            # Texto del nodo (ID interno = índice en la lista)
            idx = len(self.nodos_visuales)
            label_id = self.canvas.create_text(x, y-15, text=f"N{idx}", fill="blue")
            
            self.nodos_visuales.append((x, y, uid))
            return

        # 2. Si el modo es conectar (R o V), necesitamos detectar si clicó en un nodo
        nodo_clicado = None
        for i, (nx, ny, uid) in enumerate(self.nodos_visuales):
            if abs(nx - x) < 15 and abs(ny - y) < 15:
                nodo_clicado = i
                break
        
        if nodo_clicado is not None:
            if self.nodo_seleccionado is None:
                # Primer clic: Seleccionar nodo
                self.nodo_seleccionado = nodo_clicado
                # Resaltar visualmente
                nx, ny, uid = self.nodos_visuales[nodo_clicado]
                self.canvas.itemconfig(uid, fill="red")
            else:
                # Segundo clic: Crear componente
                if self.nodo_seleccionado == nodo_clicado:
                    return # No se puede conectar con sí mismo
                
                self.abrir_dialogo_componente(self.nodo_seleccionado, nodo_clicado)
                
                # Resetear selección
                prev_uid = self.nodos_visuales[self.nodo_seleccionado][2]
                self.canvas.itemconfig(prev_uid, fill="black")
                self.nodo_seleccionado = None

    def abrir_dialogo_componente(self, n1, n2):
        tipo = self.modo_actual
        valor = simpledialog.askfloat("Valor", f"Ingrese valor para {tipo} ({'Ohms' if tipo=='RESISTENCIA' else 'Volts'}):")
        
        if valor is not None:
            comp = {
                'tipo': tipo,
                'n1': n1,
                'n2': n2,
                'valor': valor,
                'nombre': f"{tipo[0]}{len(self.componentes)+1}"
            }
            self.componentes.append(comp)
            self.dibujar_componente(comp)

    def dibujar_componente(self, comp):
        # Coordenadas de los nodos
        x1, y1, _ = self.nodos_visuales[comp['n1']]
        x2, y2, _ = self.nodos_visuales[comp['n2']]
        
        # Matemáticas para dibujar en el centro
        xm, ym = (x1 + x2) / 2, (y1 + y2) / 2
        angulo = math.atan2(y2 - y1, x2 - x1)
        deg = math.degrees(angulo)
        
        # Dibujar la línea base (cable)
        self.canvas.create_line(x1, y1, x2, y2, width=2)
        
        # Dibujar el símbolo encima (rectángulo para R, círculo para V)
        # Usamos un "parche" blanco para tapar la línea en el medio
        size = 20
        # Coordenadas para un rectángulo rotado es complejo en tkinter básico,
        # haremos una aproximación visual simple: Una etiqueta con fondo blanco
        
        texto = ""
        color_fondo = ""
        color_borde = ""
        
        if comp['tipo'] == "RESISTENCIA":
            texto = f"{comp['valor']}Ω"
            color_fondo = "#ecf0f1"
            color_borde = "black"
            # Dibujar un rectángulo simple en el medio
            self.canvas.create_rectangle(xm-25, ym-10, xm+25, ym+10, fill=color_fondo, outline=color_borde)
            
        elif comp['tipo'] == "FUENTE":
            texto = f"{comp['valor']}V"
            color_fondo = "#ffcccc"
            color_borde = "red"
            # Dibujar un círculo para la fuente
            self.canvas.create_oval(xm-20, ym-20, xm+20, ym+20, fill=color_fondo, outline=color_borde)
            # Indicar polaridad (n1 es +, n2 es - en nuestra lógica de dibujo)
            # Dibujamos un + cerca del nodo 1
            self.canvas.create_text(x1 + (x2-x1)*0.2, y1 + (y2-y1)*0.2, text="+", fill="red", font=("Arial", 14, "bold"))

        self.canvas.create_text(xm, ym, text=texto, font=("Arial", 9, "bold"))

    def borrar_todo(self):
        self.canvas.delete("all")
        self.nodos_visuales = []
        self.componentes = []
        self.nodo_seleccionado = None

    def redibujar(self):
        # Vuelve a pintar nodos que quedaron rojos por selección
        for x, y, uid in self.nodos_visuales:
            self.canvas.itemconfig(uid, fill="black")

    def calcular(self):
        if not self.componentes:
            messagebox.showwarning("Error", "Dibuja algo primero.")
            return
            
        # 1. Traducir el dibujo visual al Motor Matemático (Circuit)
        circ = Circuit()
        
        # IMPORTANTE: El motor necesita que un nodo se llame '0' para ser Tierra.
        # Vamos a asumir arbitrariamente que el primer nodo que dibujaste (N0) es Tierra.
        # O mejor: preguntamos.
        
        try:
            idx_tierra = int(simpledialog.askstring("Referencia", "Ingresa el número del nodo que será TIERRA (0, 1...):", initialvalue="0"))
        except:
            return # Cancelo

        # Mapeo de IDs visuales a nombres reales para el motor
        # Si el usuario eligió el N0 visual como tierra, ese se llama '0'. El resto '1', '2'...
        mapa_nodos = {}
        contador_nodos_motor = 1
        
        for i in range(len(self.nodos_visuales)):
            if i == idx_tierra:
                mapa_nodos[i] = '0'
            else:
                mapa_nodos[i] = str(contador_nodos_motor)
                contador_nodos_motor += 1
        
        # Cargar componentes al motor
        for comp in self.componentes:
            n_a = mapa_nodos[comp['n1']]
            n_b = mapa_nodos[comp['n2']]
            val = comp['valor']
            name = comp['nombre']
            
            if comp['tipo'] == "RESISTENCIA":
                circ.add_resistor(name, n_a, n_b, val)
            elif comp['tipo'] == "FUENTE":
                circ.add_vsource(name, n_a, n_b, val)

        # 2. Resolver
        try:
            voltages, res_currents, _ = circ.solve()
            
            # 3. Mostrar Resultados en el mismo gráfico
            self.mostrar_resultados_graficos(voltages, res_currents, mapa_nodos)
            messagebox.showinfo("Éxito", "Cálculo completado. Ver valores en el esquema.")
            
        except Exception as e:
            messagebox.showerror("Error Matemático", str(e))

    def mostrar_resultados_graficos(self, voltages, res_currents, mapa_nodos):
        # Mostrar voltajes en los nodos
        for i, nombre_motor in mapa_nodos.items():
            x, y, _ = self.nodos_visuales[i]
            v = voltages.get(nombre_motor, 0.0)
            # Etiqueta azul con el voltaje
            self.canvas.create_text(x, y+20, text=f"{v:.2f}V", fill="blue", font=("Arial", 10, "bold"))

        # Mostrar corrientes sobre los componentes
        # Esto es un poco más difícil de mapear de vuelta, pero lo intentamos
        for comp in self.componentes:
            name = comp['nombre']
            if name in res_currents:
                # Es una resistencia
                I = res_currents[name][0] # Valor de corriente
                
                # Buscar coordenadas
                x1, y1, _ = self.nodos_visuales[comp['n1']]
                x2, y2, _ = self.nodos_visuales[comp['n2']]
                xm, ym = (x1 + x2) / 2, (y1 + y2) / 2
                
                self.canvas.create_text(xm, ym+20, text=f"{I:.4f} A", fill="#d35400", font=("Arial", 9, "bold"))

if __name__ == "__main__":
    app = EditorCircuito()
    app.mainloop()