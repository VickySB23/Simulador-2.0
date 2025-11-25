import sys
import os

# Configuración de rutas
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

import gui

if __name__ == "__main__":
    # Inicia la interfaz gráfica moderna
    app = gui.AplicacionVisual()
    app.mainloop()