"""Corre el dimensionamiento de flota y guarda tabla, resumen y gráficos en resultados/.

Uso: uv run carguio                            (la mina de ejemplo, 30 réplicas por tamaño de flota)
     uv run carguio --rapido                   (5 réplicas, para probar)
     uv run carguio --escenario mi-mina.json   (una mina propia, descargada de la app web; deja los
                                                resultados en mi-mina-resultados/)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, MaxNLocator

from .escenario import leer_escenario, rango_flota
from .experimento import Costos, barrido_flota, comparar_flotas, recomendacion
from .modelo import Parametros

# los colores de la app web (Tolva): turquesa para la serie, cobre para la marca
TEMAS = {
    "claro": {
        "fondo": "#fafbfb",
        "texto": "#16191c",
        "texto2": "#474e55",
        "grilla": "#e0e4e6",
        "serie": "#008c9c",
        "marca": "#bb5a1e",
    },
    "oscuro": {
        "fondo": "#171b1e",
        "texto": "#e6eaed",
        "texto2": "#b4bcc2",
        "grilla": "#252b30",
        "serie": "#1aa0aa",
        "marca": "#d9773b",
    },
}


def _coma(v: float, decimales: int = 0) -> str:
    """Número con separador de miles con punto y decimales con coma, como en Chile."""
    return f"{v:,.{decimales}f}".replace(",", "§").replace(".", ",").replace("§", ".")


def _ejes(tema: dict, titulo: str, ylabel: str):
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=150)
    fig.patch.set_facecolor(tema["fondo"])
    ax.set_facecolor(tema["fondo"])
    for lado in ("top", "right"):
        ax.spines[lado].set_visible(False)
    for lado in ("left", "bottom"):
        ax.spines[lado].set_color(tema["grilla"])
    ax.grid(axis="y", color=tema["grilla"], linewidth=0.8)
    ax.set_axisbelow(True)
    ax.xaxis.set_major_locator(MaxNLocator(integer=True))
    ax.tick_params(colors=tema["texto2"], labelsize=9)
    ax.set_title(titulo, loc="left", color=tema["texto"], fontsize=12, fontweight="bold", pad=12)
    ax.set_xlabel("Camiones en la flota", color=tema["texto2"], fontsize=9)
    ax.set_ylabel(ylabel, color=tema["texto2"], fontsize=9)
    return fig, ax


def graficar(tabla, p: Parametros, rec: dict, carpeta: Path) -> None:
    equilibrio = p.n_palas * p.ciclo_sin_colas / p.carga_media  # camiones con factor de acoplamiento 1
    for nombre, tema in TEMAS.items():
        # producción con intervalo de confianza
        fig, ax = _ejes(tema, "Producción por hora según tamaño de flota", "Toneladas por hora")
        x, y, s = tabla["camiones"], tabla["produccion_t_h"], tabla["ic95_t_h"]
        ax.fill_between(x, y - s, y + s, color=tema["serie"], alpha=0.18, linewidth=0)
        ax.plot(x, y, color=tema["serie"], linewidth=2, marker="o", markersize=4)
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: _coma(v)))
        ax.axvline(equilibrio, color=tema["texto2"], linestyle="--", linewidth=1)
        ax.text(
            equilibrio + 0.2,
            y.min(),
            f"factor de acoplamiento = 1\n({_coma(equilibrio, 1)} camiones)",
            color=tema["texto2"],
            fontsize=8,
            va="bottom",
        )
        ax.text(
            x.iloc[-1],
            y.iloc[-1] - y.max() * 0.06,
            "palas saturadas",
            color=tema["texto2"],
            fontsize=8,
            ha="right",
        )
        fig.tight_layout()
        fig.savefig(carpeta / f"produccion-{nombre}.png", facecolor=tema["fondo"])
        plt.close(fig)

        # costo por tonelada
        fig, ax = _ejes(tema, "Costo de carguío y transporte por tonelada", "USD por tonelada (ilustrativo)")
        ax.plot(
            tabla["camiones"],
            tabla["costo_usd_t"],
            color=tema["serie"],
            linewidth=2,
            marker="o",
            markersize=4,
        )
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: _coma(v, 2)))
        n_opt, c_opt = rec["camiones_menor_costo"], rec["costo_minimo_usd_t"]
        ax.plot(
            [n_opt],
            [c_opt],
            marker="o",
            markersize=9,
            color=tema["marca"],
            markeredgecolor=tema["fondo"],
            markeredgewidth=2,
        )
        alto = tabla["costo_usd_t"].max() - c_opt
        ax.annotate(
            f"menor costo: {n_opt} camiones\n{_coma(c_opt, 2)} USD/t",
            (n_opt, c_opt),
            xytext=(n_opt, c_opt + 0.35 * alto),
            ha="center",
            color=tema["texto"],
            fontsize=9,
            arrowprops={"arrowstyle": "-", "color": tema["texto2"], "linewidth": 0.8},
        )
        fig.tight_layout()
        fig.savefig(carpeta / f"costo-{nombre}.png", facecolor=tema["fondo"])
        plt.close(fig)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rapido", action="store_true", help="5 réplicas en vez de 30")
    ap.add_argument("--escenario", type=Path, help="un escenario guardado desde la app web (JSON)")
    ap.add_argument("--salida", type=Path, help="carpeta de resultados (por defecto, resultados/)")
    args = ap.parse_args()

    meta = None
    if args.escenario:
        try:
            escenario = leer_escenario(args.escenario)
        except (OSError, ValueError, TypeError) as e:
            ap.error(f"no pude leer {args.escenario}: {e}")
        p, costos, meta = escenario.parametros, escenario.costos, escenario.meta_t_turno
        flotas = rango_flota(p)
        salida = args.salida or args.escenario.with_name(f"{args.escenario.stem}-resultados")
        print(f"{escenario.nombre}: flotas de {flotas[0]} a {flotas[-1]} camiones")
    else:
        p, costos = Parametros(), Costos()
        flotas = range(4, 25)
        salida = args.salida or Path("resultados")
    salida.mkdir(parents=True, exist_ok=True)

    tabla = barrido_flota(p, flotas, costos, n_replicas=5 if args.rapido else 30)
    rec = recomendacion(tabla)
    if meta:
        # la flota más chica que, a ritmo estable, mueve la meta del turno
        meta_t_h = meta / (p.turno_min / 60)
        llegan = tabla[tabla["produccion_t_h"] >= meta_t_h].sort_values("camiones")
        rec["meta_t_turno"] = meta
        rec["camiones_para_meta"] = int(llegan.iloc[0]["camiones"]) if len(llegan) else None
    n_95 = rec["camiones_para_95pct_del_maximo"]
    if n_95 != rec["camiones_menor_costo"]:
        # diferencia pareada entre la flota más barata y la que logra el 95 % del máximo
        rec["comparacion"] = comparar_flotas(
            p, rec["camiones_menor_costo"], n_95, costos, 5 if args.rapido else 30
        )
    tabla.round(4).to_csv(salida / "barrido-flota.csv", index=False)
    (salida / "recomendacion.json").write_text(
        json.dumps(rec, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    graficar(tabla, p, rec, salida)

    print(
        tabla[
            [
                "camiones",
                "factor_acoplamiento",
                "produccion_t_h",
                "ic95_t_h",
                "utilizacion_palas",
                "espera_pala_min",
                "costo_usd_t",
            ]
        ]
        .round(2)
        .to_string(index=False)
    )
    print(json.dumps(rec, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
