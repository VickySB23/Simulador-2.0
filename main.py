import sys
import os

# Configurar ruta para encontrar los módulos en 'src'
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

# Importamos la interfaz gráfica PRRRRO
import gui_pro

if __name__ == "__main__":
    # Inicia la aplicación
    app = gui_pro.SimuladorPro()
    app.mainloop()