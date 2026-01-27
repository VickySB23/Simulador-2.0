import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

import gui_pro

if __name__ == "__main__":
    # Inicia la aplicación
    app = gui_pro.SimuladorPro()
    app.mainloop()