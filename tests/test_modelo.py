import math
from dataclasses import replace
from itertools import pairwise

import pandas as pd
import pytest

from carguio import (
    Costos,
    Parametros,
    barrido_flota,
    comparar_flotas,
    intervalo,
    recomendacion,
    replicar,
    simular,
)

# sin azar y sin fallas: el resultado se puede calcular a mano
DETERMINISTA = Parametros(
    n_camiones=1,
    n_palas=1,
    capacidad_t=100.0,
    carga_min=(3.0, 3.0, 3.0),
    descarga_min=(1.0, 1.0, 1.0),
    acarreo_min=(10.0, 0.0),
    retorno_min=(6.0, 0.0),
    posicionamiento_min=0.0,
    mtbf_pala_min=None,
    turno_min=600.0,
    calentamiento_min=0.0,
)


def test_un_camion_determinista_coincide_con_el_calculo_a_mano():
    r = simular(DETERMINISTA)
    ciclo = 3 + 10 + 1 + 6
    # descarga k-ésima en 14 + 20k minutos; cuenta las que terminan dentro del turno
    descargas = math.floor((600 - 14) / ciclo) + 1
    assert r.ciclos == descargas
    assert r.toneladas == descargas * 100
    assert r.espera_pala_min == 0 and r.espera_chancador_min == 0
    assert r.utilizacion_palas == pytest.approx(descargas * 3 / 600, abs=0.01)


def test_el_calentamiento_no_se_cuenta():
    r = simular(replace(DETERMINISTA, calentamiento_min=100.0))
    # descargas en 14 + 20k; cuentan las de k = 5 (minuto 114) a k = 29 (minuto 594)
    assert r.ciclos == 25
    assert r.toneladas == 2500
    # cargas de 3 min que parten en 100, 120, …, 580: 25 cargas en 500 minutos
    assert r.utilizacion_palas == pytest.approx(25 * 3 / 500)
    assert r.ciclo_medio_min == pytest.approx(20)
    assert r.disponibilidad_palas == 1


def test_una_reparacion_en_curso_al_final_del_turno_se_cuenta():
    p = Parametros(n_camiones=1, n_palas=1, mtbf_pala_min=600.0, mttr_pala_min=600.0, turno_min=720.0)
    r = simular(p, 0)
    # con una reparación media de 10 h, casi seguro sigue en curso al cerrar el turno
    assert r.disponibilidad_palas < 0.9


def test_misma_semilla_mismo_resultado():
    p = Parametros()
    assert simular(p, 7) == simular(p, 7)
    assert simular(p, 7).toneladas != simular(p, 8).toneladas


def test_mas_camiones_nunca_bajan_la_produccion_media():
    tabla = barrido_flota(Parametros(), range(4, 21, 4), n_replicas=8)
    prod = tabla["produccion_t_h"].tolist()
    assert all(b >= a * 0.99 for a, b in pairwise(prod))


def test_con_palas_saturadas_la_produccion_es_su_capacidad():
    p = Parametros(n_camiones=30, mtbf_pala_min=None)
    df = replicar(p, n=10)
    capacidad_t_h = p.n_palas * p.capacidad_t * 60 / p.carga_media  # con el tiempo medio de carga: 6.828 t/h
    assert df["produccion_t_h"].mean() == pytest.approx(capacidad_t_h, rel=0.02)
    assert df["utilizacion_palas"].min() > 0.99  # con 30 camiones las palas nunca esperan


def test_indicadores_en_rangos_validos():
    for semilla in range(5):
        r = simular(Parametros(), semilla)
        for valor in (r.utilizacion_palas, r.utilizacion_chancador, r.disponibilidad_palas):
            assert 0 <= valor <= 1
        assert r.ciclo_medio_min >= Parametros().ciclo_sin_colas * 0.8


def test_las_fallas_reducen_la_disponibilidad():
    con = replicar(Parametros(n_camiones=16), n=10)
    sin = replicar(Parametros(n_camiones=16, mtbf_pala_min=None), n=10)
    assert sin["disponibilidad_palas"].min() == 1
    assert con["disponibilidad_palas"].mean() < 0.97
    assert con["produccion_t_h"].mean() < sin["produccion_t_h"].mean()


def test_un_chancador_lento_se_vuelve_el_cuello_de_botella():
    p = Parametros(n_palas=3, n_camiones=24, descarga_min=(4.0, 4.5, 5.0), mtbf_pala_min=None)
    r = simular(p, 1)
    assert r.utilizacion_chancador > 0.95
    assert r.espera_chancador_min > r.espera_pala_min


def test_factor_de_acoplamiento():
    p = replace(DETERMINISTA, n_camiones=4, n_palas=2)
    assert p.factor_acoplamiento == pytest.approx(4 * 3 / (2 * 20))


def test_recomendacion():
    tabla = barrido_flota(Parametros(), range(6, 19, 3), Costos(), n_replicas=5)
    rec = recomendacion(tabla)
    fila = tabla.loc[tabla["camiones"] == rec["camiones_menor_costo"]].iloc[0]
    assert fila["costo_usd_t"] == tabla["costo_usd_t"].min()
    suficiente = rec["camiones_para_95pct_del_maximo"]
    prod = tabla.set_index("camiones")["produccion_t_h"]
    assert prod[suficiente] >= 0.95 * prod.max()
    assert all(prod[n] < 0.95 * prod.max() for n in prod.index if n < suficiente)


def test_intervalo_de_confianza_t_de_student():
    media, semi = intervalo(pd.Series([1.0, 2.0, 3.0, 4.0, 5.0]))
    assert media == 3
    assert semi == pytest.approx(2.776445 * 1.581139 / 5**0.5, rel=1e-5)


def test_numeros_aleatorios_comunes_entre_flotas():
    # misma semilla en dos flotas parecidas: turnos parecidos, así que la diferencia pareada tiene poco ruido
    c = comparar_flotas(Parametros(), 13, 14, n_replicas=20)
    assert c["correlacion_produccion"] > 0.6
    assert c["dif_produccion_t_h"] > 0


@pytest.mark.parametrize(
    "cambio",
    [{"n_camiones": 0}, {"n_palas": 0}, {"carga_min": (3.0, 2.0, 4.0)}, {"calentamiento_min": 720.0}],
)
def test_parametros_invalidos(cambio):
    with pytest.raises(ValueError):
        replace(Parametros(), **cambio)


@pytest.mark.parametrize(
    "cambio",
    [
        {"capacidad_t": -1},
        {"capacidad_t": math.nan},
        {"turno_min": math.inf},
        {"posicionamiento_min": -1},
        {"acarreo_min": (-1, 0)},
        {"retorno_min": (9, math.nan)},
        {"carga_min": (0, 0, 0), "posicionamiento_min": 0},
        {"n_camiones": 1.5},
        {"n_palas": True},
        {"mtbf_pala_min": math.nan},
    ],
)
def test_rechaza_parametros_no_fisicos_antes_de_simular(cambio):
    with pytest.raises(ValueError):
        replace(Parametros(), **cambio)


@pytest.mark.parametrize("costo", [-1, math.nan, math.inf])
def test_rechaza_costos_invalidos(costo):
    with pytest.raises(ValueError):
        Costos(camion_usd_h=costo)


def test_recomendacion_elige_la_flota_minima_aunque_la_tabla_este_desordenada():
    tabla = pd.DataFrame(
        {"camiones": [20, 14, 12], "produccion_t_h": [100, 96, 86], "costo_usd_t": [2.0, 1.2, 1.1]}
    )
    assert recomendacion(tabla)["camiones_para_95pct_del_maximo"] == 14


@pytest.mark.parametrize("n", [0, -1, 1.5])
def test_replicas_invalidas(n):
    with pytest.raises(ValueError):
        replicar(Parametros(), n=n)


def test_barrido_necesita_replicas_para_el_intervalo():
    with pytest.raises(ValueError):
        barrido_flota(Parametros(), range(12, 15), n_replicas=1)
