"""Promedios del modelo de Python con 300 turnos por flota, para probar que el de la app web es el mismo.

El modelo de la app (interfaz/src/modelo) usa otro generador de números aleatorios, así que no da los
mismos turnos: da los mismos promedios y la misma variación. Con 300 turnos el error de cada promedio es
chico y la comparación es exigente; con los 30 de resultados/barrido-flota.csv, las dos versiones pueden
diferir un 5 % solo por azar.

Uso: uv run python scripts/referencia_web.py
     (unos 20 segundos; escribe interfaz/src/modelo/referencia-python.json)
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import numpy as np

from carguio import Parametros, simular

DESTINO = Path(__file__).resolve().parents[1] / "interfaz" / "src" / "modelo" / "referencia-python.json"
FLOTAS = (4, 8, 12, 16, 20)
REPLICAS = 300
INDICADORES = (
    "produccion_t_h",
    "utilizacion_palas",
    "utilizacion_chancador",
    "disponibilidad_palas",
    "espera_pala_min",
    "espera_chancador_min",
    "ciclo_medio_min",
)


def main() -> None:
    salida = {"replicas": REPLICAS, "semilla_base": 1000, "flotas": {}}
    for n in FLOTAS:
        turnos = []
        for i in range(REPLICAS):
            r = simular(Parametros(n_camiones=n), 1000 + i)
            turnos.append({**asdict(r), "produccion_t_h": r.produccion_t_h})
        salida["flotas"][str(n)] = {
            k: {
                "media": round(float(np.mean([t[k] for t in turnos])), 5),
                "desviacion": round(float(np.std([t[k] for t in turnos], ddof=1)), 5),
            }
            for k in INDICADORES
        }
    DESTINO.write_text(json.dumps(salida, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{DESTINO} ({len(FLOTAS)} flotas, {REPLICAS} turnos cada una)")


if __name__ == "__main__":
    main()
