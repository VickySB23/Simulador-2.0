# Deducción rápida de MNA

La MNA combina las ecuaciones de KCL en cada nodo (excluyendo tierra) y las ecuaciones impuestas por fuentes de tensión.

Sea G la matriz de conductancias. Para cada resistor entre nodos i y j, se añade g=1/R a las entradas Gii y Gjj y se resta en Gij y Gji.

Para M fuentes de tensión, se añade una matriz B que relaciona nodos con fuentes. El sistema extendido es:

[ G   B ] [ V ] = [ I ]
[ B^T 0 ] [ I_v ]   [ E ]

Donde V son los voltajes nodales desconocidos, I_v las corrientes por las fuentes de tensión, I el vector de corrientes inyectadas por fuentes de corriente, y E el vector de tensiones de las fuentes.
