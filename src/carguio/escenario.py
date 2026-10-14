"""Escenarios como archivo: el JSON que descarga la app web («Tu mina» → Descargar) se corre igual aquí.

    uv run carguio --escenario mi-mina.json

El formato es «rajo-escenario/1»: los parámetros con los mismos nombres de `Parametros`, los costos de
`Costos` y, si hay, la meta de toneladas por turno. La ruta por distancia y velocidades es solo para la app:
los tiempos de viaje ya vienen calculados en `acarreo_min` y `retorno_min`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from math import ceil, floor
from pathlib import Path

from .experimento import Costos
from .modelo import Parametros

FORMATO = "rajo-escenario/1"


@dataclass(frozen=True)
class Escenario:
    nombre: str
    parametros: Parametros
    costos: Costos
    meta_t_turno: float | None = None


def leer_escenario(ruta: Path | str) -> Escenario:
    """Lee un escenario; si falta algo o no tiene sentido, lanza ValueError con el motivo."""
    datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    if not isinstance(datos, dict) or datos.get("formato") != FORMATO:
        raise ValueError(f"El archivo no es un escenario de Tolva (falta «formato»: «{FORMATO}»).")
    q = datos.get("parametros") or {}
    campos = (
        "n_camiones",
        "n_palas",
        "capacidad_t",
        "carga_min",
        "descarga_min",
        "acarreo_min",
        "retorno_min",
        "posicionamiento_min",
        "mtbf_pala_min",
        "mttr_pala_min",
        "turno_min",
        "calentamiento_min",
    )
    faltan = [c for c in campos if c not in q]
    if faltan:
        raise ValueError(f"Al escenario le faltan datos: {', '.join(faltan)}.")
    p = Parametros(
        n_camiones=q["n_camiones"],
        n_palas=q["n_palas"],
        capacidad_t=float(q["capacidad_t"]),
        carga_min=tuple(float(v) for v in q["carga_min"]),
        descarga_min=tuple(float(v) for v in q["descarga_min"]),
        acarreo_min=tuple(float(v) for v in q["acarreo_min"]),
        retorno_min=tuple(float(v) for v in q["retorno_min"]),
        posicionamiento_min=float(q["posicionamiento_min"]),
        mtbf_pala_min=None if q["mtbf_pala_min"] is None else float(q["mtbf_pala_min"]),
        mttr_pala_min=float(q["mttr_pala_min"]),
        turno_min=float(q["turno_min"]),
        calentamiento_min=float(q["calentamiento_min"]),
    )
    if (
        len(p.carga_min) != 3
        or len(p.descarga_min) != 3
        or len(p.acarreo_min) != 2
        or len(p.retorno_min) != 2
    ):
        raise ValueError(
            "Carga y descarga llevan mínimo, moda y máximo; acarreo y retorno, media y desviación."
        )
    c = datos.get("costos") or {}
    costos = Costos(
        camion_usd_h=float(c.get("camion_usd_h", Costos.camion_usd_h)),
        pala_usd_h=float(c.get("pala_usd_h", Costos.pala_usd_h)),
    )
    meta = datos.get("meta_t_turno")
    nombre = str(datos.get("nombre") or "").strip() or "Mina sin nombre"
    return Escenario(nombre, p, costos, float(meta) if meta else None)


def rango_flota(p: Parametros) -> list[int]:
    """Qué flotas barrer en una mina cualquiera: alrededor del equilibrio (factor de acoplamiento 1), de un
    tercio a casi el doble, con a lo más 25 tamaños. Igual que flotasABarrer() en la app web."""
    equilibrio = p.n_palas * p.ciclo_sin_colas / p.carga_media
    desde = max(1, floor(equilibrio * 0.35))
    hasta = max(desde + 4, ceil(equilibrio * 1.8))
    paso = ceil((hasta - desde + 1) / 25)
    return list(range(desde, hasta + 1, paso))
