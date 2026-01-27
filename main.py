import sys
import os
import gui_pro

# Configurar ruta para encontrar los módulos en 'src'
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

if __name__ == "__main__":
    # Inicia la aplicación
    app = gui_pro.SimuladorPro()
    app.mainloop()