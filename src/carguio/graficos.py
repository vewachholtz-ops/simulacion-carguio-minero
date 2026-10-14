"""Gráficos de la simulación (Altair), compartidos por la app de Streamlit y la vitrina estática.

Azul para la producción y naranja para el costo, que se distinguen también para daltónicos. Los números
van en formato chileno (miles con punto, decimales con coma).
"""

from __future__ import annotations

import altair as alt
import pandas as pd

AZUL, NARANJA = "#2a78d6", "#d95926"
TINTA, TINTA_2, GRILLA, BASE, SUPERFICIE = "#1d2733", "#5a6675", "#e6eaef", "#c9d0d8", "#ffffff"


def num(x: float, decimales: int = 0) -> str:
    """6081.3 -> "6.081"; 1.1446 -> "1,14" (miles con punto, decimales con coma)."""
    texto = f"{x:,.{decimales}f}"
    return texto.replace(",", "§").replace(".", ",").replace("§", ".")


def pct(x: float, decimales: int = 0) -> str:
    return f"{num(100 * x, decimales)} %"


def _eje_x() -> alt.X:
    return alt.X("camiones:Q", title="Camiones en la flota", axis=alt.Axis(tickMinStep=1, format="d"))


def _estilo(grafico: alt.Chart, titulo: str, subtitulo: str = "") -> alt.Chart:
    return (
        grafico.properties(height=300, title=alt.Title(titulo, subtitle=subtitulo))
        .configure(font="Nunito, sans-serif", background="transparent")
        .configure_view(stroke=None)
        .configure_axis(
            labelColor=TINTA_2,
            titleColor=TINTA_2,
            labelFontSize=12.5,
            titleFontSize=12.5,
            titleFontWeight=600,
            gridColor=GRILLA,
            domainColor=BASE,
            tickColor=BASE,
        )
        .configure_title(
            color=TINTA,
            fontSize=15,
            fontWeight=700,
            anchor="start",
            offset=12,
            subtitleColor=TINTA_2,
            subtitleFontSize=13,
            subtitlePadding=6,
        )
    )


MILES = "replace(format(datum.value, ',d'), /,/g, '.')"
DOS_DECIMALES = "replace(format(datum.value, '.2f'), '.', ',')"


def produccion(t: pd.DataFrame, marcas: dict[int, str]) -> alt.Chart:
    t = t.assign(inf=t.produccion_t_h - t.ic95_t_h, sup=t.produccion_t_h + t.ic95_t_h)
    t["Producción"] = [f"{num(p)} ± {num(s)} t/h" for p, s in zip(t.produccion_t_h, t.ic95_t_h, strict=True)]
    t["Palas cargando"] = [pct(u) for u in t.utilizacion_palas]
    base = alt.Chart(t).encode(x=_eje_x())
    y = alt.Y("produccion_t_h:Q", title="Producción (t/h)", axis=alt.Axis(labelExpr=MILES))
    banda = base.mark_area(opacity=0.12, color=AZUL).encode(y="inf:Q", y2="sup:Q")
    linea = base.mark_line(color=AZUL, strokeWidth=2).encode(y=y)
    puntos = base.mark_circle(size=70, color=AZUL, stroke=SUPERFICIE, strokeWidth=2, opacity=1).encode(
        y=y, tooltip=[alt.Tooltip("camiones:Q", title="Camiones"), "Producción", "Palas cargando"]
    )
    capas = [banda, linea, puntos]
    # Las flotas marcadas llevan una línea vertical fina hasta el punto y la etiqueta abajo, en la zona vacía
    # bajo la curva: la primera hacia la izquierda y la segunda hacia la derecha, para que no se monten.
    for i, (n, etiqueta) in enumerate(sorted(marcas.items())):
        m = t[t.camiones == n].assign(etiqueta=etiqueta, cero=0.0, piso=0.08 * t.sup.max())
        capas.append(
            alt.Chart(m)
            .mark_rule(color=TINTA_2, strokeWidth=1)
            .encode(x=_eje_x(), y="cero:Q", y2="produccion_t_h:Q")
        )
        capas.append(
            alt.Chart(m)
            .mark_text(
                align="right" if i == 0 else "left", dx=-6 if i == 0 else 6, fontSize=12, color=TINTA_2
            )
            .encode(x=_eje_x(), y="piso:Q", text="etiqueta:N")
        )
    return _estilo(alt.layer(*capas), "Producción por hora", "La banda es el intervalo de confianza de 95 %.")


def costo(t: pd.DataFrame, minimo: int) -> alt.Chart:
    t = t.assign(Costo=[f"{num(c, 2)} USD/t" for c in t.costo_usd_t])
    t["Espera en pala"] = [f"{num(e, 1)} min" for e in t.espera_pala_min]
    base = alt.Chart(t).encode(x=_eje_x())
    # el eje baja un poco más que el mínimo, para que la etiqueta quepa entre la curva y el eje
    bajo, alto = t.costo_usd_t.min(), t.costo_usd_t.max()
    y = alt.Y(
        "costo_usd_t:Q",
        title="Costo (USD por tonelada)",
        scale=alt.Scale(domain=[bajo - 0.3 * (alto - bajo), alto]),
        axis=alt.Axis(labelExpr=DOS_DECIMALES),
    )
    linea = base.mark_line(color=NARANJA, strokeWidth=2).encode(y=y)
    puntos = base.mark_circle(size=70, color=NARANJA, stroke=SUPERFICIE, strokeWidth=2, opacity=1).encode(
        y=y, tooltip=[alt.Tooltip("camiones:Q", title="Camiones"), "Costo", "Espera en pala"]
    )
    m = t[t.camiones == minimo].assign(etiqueta=f"mínimo: {minimo} camiones")
    texto = (
        alt.Chart(m)
        .mark_text(align="center", dy=18, fontSize=12.5, color=TINTA_2)
        .encode(x=_eje_x(), y=y, text="etiqueta:N")
    )
    return _estilo(
        alt.layer(linea, puntos, texto),
        "Costo por tonelada",
        "Costo horario de la flota por tonelada movida.",
    )


def espera(t: pd.DataFrame) -> alt.Chart:
    t = t.assign(Espera=[f"{num(e, 1)} min" for e in t.espera_pala_min])
    base = alt.Chart(t).encode(x=_eje_x())
    y = alt.Y("espera_pala_min:Q", title="Minutos por ciclo")
    return _estilo(
        alt.layer(
            base.mark_line(color=AZUL, strokeWidth=2).encode(y=y),
            base.mark_circle(size=70, color=AZUL, stroke=SUPERFICIE, strokeWidth=2, opacity=1).encode(
                y=y, tooltip=[alt.Tooltip("camiones:Q", title="Camiones"), "Espera"]
            ),
        ),
        "Espera de cada camión en la pala",
        "Promedio por ciclo.",
    )
