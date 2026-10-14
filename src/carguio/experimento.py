"""Réplicas, intervalos de confianza y dimensionamiento de la flota de camiones."""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from math import isfinite
from numbers import Integral

import numpy as np
import pandas as pd
from scipy import stats

from .modelo import Parametros, simular


@dataclass(frozen=True)
class Costos:
    """Costos horarios de operación. Ilustrativos: se reemplazan por los de la faena."""

    camion_usd_h: float = 350.0
    pala_usd_h: float = 900.0

    def __post_init__(self) -> None:
        if any(not isfinite(v) or v < 0 for v in (self.camion_usd_h, self.pala_usd_h)):
            raise ValueError("Los costos deben ser finitos y no negativos.")


def replicar(p: Parametros, n: int = 30, semilla_base: int = 1000) -> pd.DataFrame:
    """Corre n turnos independientes (una semilla distinta por réplica)."""
    if isinstance(n, bool) or not isinstance(n, Integral) or n < 1:
        raise ValueError("El número de réplicas debe ser un entero positivo.")
    filas = []
    for i in range(n):
        r = simular(p, semilla_base + i)
        d = asdict(r)
        d["produccion_t_h"] = r.produccion_t_h
        d["replica"] = i
        filas.append(d)
    return pd.DataFrame(filas)


def intervalo(x: pd.Series, confianza: float = 0.95) -> tuple[float, float]:
    """Media y semiancho del intervalo de confianza t de Student."""
    x = x.dropna()
    media = float(x.mean())
    if len(x) < 2:
        return media, float("nan")
    semi = float(stats.t.ppf((1 + confianza) / 2, len(x) - 1) * x.std(ddof=1) / np.sqrt(len(x)))
    return media, semi


def barrido_flota(
    base: Parametros,
    camiones: range,
    costos: Costos | None = None,
    n_replicas: int = 30,
) -> pd.DataFrame:
    """Para cada tamaño de flota: producción con su intervalo, utilizaciones, esperas y costo por tonelada."""
    if n_replicas < 2:
        raise ValueError("Se necesitan al menos dos réplicas para el intervalo de confianza.")
    if not camiones:
        raise ValueError("El rango de flotas no puede estar vacío.")
    costos = costos or Costos()
    filas = []
    for n in camiones:
        p = replace(base, n_camiones=n)
        df = replicar(p, n_replicas)
        prod, semi = intervalo(df["produccion_t_h"])
        costo_h = n * costos.camion_usd_h + p.n_palas * costos.pala_usd_h
        filas.append(
            {
                "camiones": n,
                "factor_acoplamiento": p.factor_acoplamiento,
                "produccion_t_h": prod,
                "ic95_t_h": semi,
                "utilizacion_palas": df["utilizacion_palas"].mean(),
                "utilizacion_chancador": df["utilizacion_chancador"].mean(),
                "espera_pala_min": df["espera_pala_min"].mean(),
                "espera_chancador_min": df["espera_chancador_min"].mean(),
                "ciclo_medio_min": df["ciclo_medio_min"].mean(),
                "costo_usd_t": costo_h / prod,
            }
        )
    return pd.DataFrame(filas)


def comparar_flotas(
    base: Parametros, n_a: int, n_b: int, costos: Costos | None = None, n_replicas: int = 30
) -> dict:
    """Diferencia pareada (b - a) de producción y costo por tonelada, réplica a réplica con iguales semillas.

    Con números aleatorios comunes, la diferencia pareada tiene mucho menos ruido que comparar
    los intervalos de cada escenario por separado.
    """
    if n_replicas < 2:
        raise ValueError("Se necesitan al menos dos réplicas para el intervalo de confianza.")
    costos = costos or Costos()
    a = replicar(replace(base, n_camiones=n_a), n_replicas)
    b = replicar(replace(base, n_camiones=n_b), n_replicas)

    def costo(df: pd.DataFrame, n: int) -> pd.Series:
        return (n * costos.camion_usd_h + base.n_palas * costos.pala_usd_h) / df["produccion_t_h"]

    dif_prod = intervalo(b["produccion_t_h"] - a["produccion_t_h"])
    dif_costo = intervalo(costo(b, n_b) - costo(a, n_a))
    return {
        "flotas": (n_a, n_b),
        "dif_produccion_t_h": dif_prod[0],
        "ic95_dif_produccion": dif_prod[1],
        "dif_costo_usd_t": dif_costo[0],
        "ic95_dif_costo": dif_costo[1],
        "correlacion_produccion": float(a["produccion_t_h"].corr(b["produccion_t_h"])),
    }


def recomendacion(tabla: pd.DataFrame, fraccion: float = 0.95) -> dict:
    """Flota de menor costo por tonelada y flota mínima que logra la fracción pedida del máximo."""
    i_costo = tabla["costo_usd_t"].idxmin()
    maximo = tabla["produccion_t_h"].max()
    suficiente = tabla[tabla["produccion_t_h"] >= fraccion * maximo].sort_values("camiones").iloc[0]
    return {
        "camiones_menor_costo": int(tabla.loc[i_costo, "camiones"]),
        "costo_minimo_usd_t": float(tabla.loc[i_costo, "costo_usd_t"]),
        "produccion_en_menor_costo_t_h": float(tabla.loc[i_costo, "produccion_t_h"]),
        "produccion_maxima_t_h": float(maximo),
        f"camiones_para_{int(fraccion * 100)}pct_del_maximo": int(suficiente["camiones"]),
    }
