"""interfaz/src/modelo/referencia-python.json, con la que se prueba el modelo de la app web, está al día
con el modelo de Python: si el modelo cambia, hay que volver a correr scripts/referencia_web.py."""

import json
from dataclasses import asdict
from pathlib import Path

import numpy as np

from carguio import Parametros, simular

RAIZ = Path(__file__).resolve().parents[1]


def test_la_referencia_de_la_app_web_coincide_con_el_modelo():
    ref = json.loads((RAIZ / "interfaz/src/modelo/referencia-python.json").read_text(encoding="utf-8"))
    flota = ref["flotas"]["4"]
    turnos = [simular(Parametros(n_camiones=4), ref["semilla_base"] + i) for i in range(ref["replicas"])]
    for indicador, valores in flota.items():
        datos = [r.produccion_t_h if indicador == "produccion_t_h" else asdict(r)[indicador] for r in turnos]
        assert round(float(np.mean(datos)), 5) == valores["media"], indicador
