# Auditoría del portafolio · 2026-10-09

Autor: Codex. Solicitud: auditar, mejorar y preparar publicación del proyecto.

## Hallazgos corregidos

- **Corrección:** la flota que alcanza el 95 % dependía del orden de las filas. Ahora se elige por tamaño de flota y una prueba usa filas desordenadas.
- **Validación:** rechaza conteos fraccionarios/bool, parámetros físicos negativos, capacidad cero, valores NaN/infinito, costos negativos y tiempo de carga más posicionamiento nulo.
- **Estadística:** réplicas enteras positivas; barrido y comparación requieren al menos dos para calcular intervalos, y el rango no puede estar vacío.
- **Navegador:** una descarga con el endpoint de medios produjo un 404 en stlite. Se usa un enlace CSV generado en el navegador. Gráficos con dominios explícitos para evitar advertencias durante la llegada asíncrona de datos.

Antes de la corrección fallaron 18 casos nuevos; después se aprobaron con la suite existente. Los resultados válidos originales se mantienen.

## Presentación

`site/index.html` abre resultados guardados inmediatamente, sin cargar Python. Expone costos, supuestos, intervalos, límites y comparación pareada. La página `interactiva.html` descarga stlite solo al entrar; reutiliza los tres módulos de `src/carguio/` sin reescribir el modelo en JavaScript.

`web/app.py` calcula solo al pulsar Simular, conserva el último escenario identificado, muestra errores y permite descargar CSV. La recomendación describe el máximo dentro del rango probado. Fuente local, salida reproducible y CI/Pages preparados. Streamlit local sigue disponible.

## Verificación

Baseline: 19 pruebas. Motor corregido: 37. Final: **39 aprobadas**. Ruff/formato y generador `--check` aprobados.

Prueba de mutación: permitir cero camiones hace fallar dos casos de validación; archivo restaurado. Nuevas pruebas comprueban módulos exportados idénticos, entrada sin CDN/Python y ejecución de la interfaz con resultados originales.

Navegador real con stlite: escenario predeterminado reproduce **12 camiones** de menor costo, **14** para el 95 % del máximo, **6.081 t/h**, comparación **+577 ±36 t/h**. Los gráficos son visibles y el CSV se genera como data URL. Vista móvil de 320 px sin desbordamiento global.

## Límites y pendientes para Claude

- Falta despliegue y comprobación en Pages. Checkout sin origin. Ver `PUBLICACION.md`.
- stlite usa Pyodide y descarga bibliotecas: arranque y tiempo de cálculo dependen del dispositivo/red. No prometer mismo rendimiento ni versiones binarias idénticas al entorno uv.
- El modelo es ficticio y necesita calibración antes de decidir en una faena. El IC es de la media, no una predicción de un turno.
- La API general todavía puede producir cero toneladas en turnos extremadamente cortos; el costo por tonelada de esos escenarios requiere una política explícita. La interfaz publicada fija 12 horas y restringe parámetros.
- Revisar validación de una fracción objetivo arbitraria o tabla vacía si se amplía la API de recomendación; el flujo actual produce una tabla válida y usa 0,95.
- No se midió formalmente accesibilidad ni tiempos de carga en dispositivos físicos.

## Revisión de Claude · 2026-10-09

Revisé el generador, la página y las pruebas en 1440 y 390 px. El motor, los resultados y el simulador stlite no cambian.

- **Encabezado:** la página abría con el nombre del autor y una etiqueta en mayúsculas, como un sitio personal. Ahora abre con la pregunta del proyecto; el nombre salió del encabezado y de los títulos de pestaña (también en `interactiva.html`), y el pie enlaza a los otros proyectos.
- **Gráficos:** los PNG (fondo crema, texto muy chico) se reemplazan por los gráficos de la app, que pasaron a `src/carguio/graficos.py` y los usan la app y la vitrina. Se exportan como Vega-Lite y se dibujan con vega copiado en `web/vendor/`, sin CDN. La portada sigue sin cargar Python: stlite solo está en `interactiva.html`. `graficos.py` no se copia al simulador.
- **Contenido:** se agrega el gráfico de espera en la pala con una nota que explica la curva de costo (desde unos 16 camiones las palas cargan el 89 % del turno y cada camión extra solo alarga la cola), y las flotas de 12 y 14 quedan marcadas en la tabla.
- **Diseño:** indicadores en un panel (con el equilibrio teórico, 13,5 camiones), botones de acción arriba y el aviso de que el simulador tarda la primera vez. HTML en `web/plantilla.html`; el generador borra de `site/` lo que ya no produce y `--check` falla si sobra algo.
- `interactiva.html` ya no carga `style.css` completo: sus reglas de tablas y desplegables podían cambiar los de Streamlit. Lleva solo la fuente y el enlace para volver; el enlace duplicado se quitó de `web/app.py`.

Pruebas: **39 aprobadas**. La de la portada ahora exige que no haya stlite, Pyodide ni scripts externos (antes exigía cero scripts). No pude probar stlite en mi entorno porque el CDN está bloqueado; el código del simulador no cambió salvo el enlace quitado.
