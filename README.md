# Simulador de Circuitos DC - Análisis Profesional (MNA)

Este proyecto es un simulador interactivo de circuitos de Corriente Continua (CC) desarrollado en Python. Utiliza el método de **Análisis Nodal Modificado (MNA)** para resolver sistemas complejos de circuitos aplicando las Leyes de Kirchhoff y la Ley de Ohm mediante álgebra lineal matricial.

## 🚀 Funcionalidades Principales

1.  **Interfaz Gráfica Interactiva (GUI):**
    * Dibujo libre de circuitos sobre una grilla magnética (snap-to-grid).
    * Componentes soportados: Resistencias, Fuentes de Voltaje (CC), Fuentes de Corriente (CC) y Cables.
    * **Rotación de componentes:** Posibilidad de colocar elementos vertical u horizontalmente (Tecla `Espacio`).
    * **Edición:** Selección, movimiento de Tierra (GND) y borrado de componentes (`Supr`) con auto-limpieza de nodos.

2.  **Motor Matemático Robusto:**
    * Implementación del algoritmo MNA (Modified Nodal Analysis).
    * Generación automática de matrices de conductancia (G) y vectores de fuentes.
    * Resolución de sistemas lineales `Ax = z` utilizando `numpy`.

3.  **Visualización de Datos en Tiempo Real:**
    * **Tabla de Resultados:** Muestra voltaje nodal, caída de voltaje, corriente y potencia disipada/suministrada por cada componente.
    * **Mapa de Calor:** Los cables cambian de color (Azul -> Rojo) según su nivel de voltaje relativo.
    * **Flujo de Corriente:** Flechas dinámicas que indican la dirección real de la corriente y su magnitud.

4.  **Validaciones Físicas:**
    * **Balance de Potencia:** Verifica que la potencia suministrada sea igual a la disipada (Conservación de la energía).
    * **Validación KCL:** Comprueba la Ley de Corrientes de Kirchhoff en cada nodo (suma de corrientes = 0) y detecta nodos desconectados ("Abiertos").

## 📂 Estructura del Código

### 1. `main.py`
Es el punto de entrada de la aplicación. Configura las rutas del sistema e inicia la interfaz gráfica.

### 2. `src/circuit_sim.py` (El Cerebro Matemático 🧠)
**Aquí residen las fórmulas y la lógica física.** Este módulo no tiene interfaz gráfica; se encarga de:
* **Definir Componentes:** Clases `Resistor`, `VSource`, `ISource`.
* **Construir Matrices (MNA):** Transforma el circuito dibujado en un sistema de ecuaciones matriciales `[G B] [V] = [I]`.
* **Resolver el Sistema:** Utiliza `numpy.linalg.solve()` para calcular los voltajes desconocidos en cada nodo basándose en las Leyes de Kirchhoff.

### 3. `src/gui_pro.py` (La Interfaz Visual 🎨)
Maneja la interacción con el usuario usando `tkinter`:
* **Dibujo Inteligente:** Renderizado de componentes, rotación de textos y flechas de dirección de corriente.
* **Gestión de Eventos:** Clics, arrastre, atajos de teclado (`Supr`, `Espacio`, `Ctrl+Z`).
* **Puente:** Toma lo que el usuario dibuja, se lo envía a `circuit_sim.py` para calcular, y muestra los resultados en la pantalla.

### 4. `docs/ecuaciones.md`
Documentación teórica que explica el desarrollo matemático del Análisis Nodal Modificado (MNA) utilizado en el motor de simulación.

## 🎮 Controles de Usuario

* **Clic Izquierdo:** Colocar componente / Seleccionar.
* **Arrastrar (con herramienta Cable):** Dibujar cables.
* **Barra Espaciadora:** Rotar componente (Horizontal/Vertical) antes de colocarlo.
* **Tecla Supr (Delete):** Borrar componente o nodo seleccionado.
* **Herramienta GND:** Clic en un nodo para establecerlo como Tierra (0V).
* **Checkbox "Ver Voltajes":** Muestra u oculta los valores de voltaje sobre los cables.

## 📦 Requisitos e Instalación

Se requiere Python 3.x y las siguientes librerías:

```bash
pip install -r requirements.txt