"""Los escenarios que guarda la app web se leen igual en Python, y las dos barren las mismas flotas."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from carguio import Parametros, leer_escenario, rango_flota

MINA_NORTE = Path(__file__).parent / "datos" / "mina-norte.json"


def test_lee_el_escenario_de_la_app():
    e = leer_escenario(MINA_NORTE)
    assert e.nombre == "Mina Norte (inventada)"
    assert e.parametros.n_palas == 3
    assert e.parametros.carga_min == (2.0, 2.5, 3.2)
    assert e.parametros.acarreo_min == (9.0, 1.08)
    assert e.costos.pala_usd_h == 1100
    assert e.meta_t_turno == 60000


def test_las_mismas_flotas_que_la_app():
    # interfaz/src/mina/mina.test.ts espera la misma lista para el mismo archivo
    assert rango_flota(leer_escenario(MINA_NORTE).parametros) == list(range(6, 35, 2))
    assert rango_flota(Parametros(n_palas=1, acarreo_min=(1.0, 0.1), retorno_min=(1.0, 0.1)))[0] == 1


def test_rechaza_archivos_que_no_son_escenarios(tmp_path):
    otro = tmp_path / "otro.json"
    otro.write_text(json.dumps({"hola": 1}), encoding="utf-8")
    with pytest.raises(ValueError, match="no es un escenario"):
        leer_escenario(otro)
    datos = json.loads(MINA_NORTE.read_text(encoding="utf-8"))
    del datos["parametros"]["capacidad_t"]
    incompleto = tmp_path / "incompleto.json"
    incompleto.write_text(json.dumps(datos), encoding="utf-8")
    with pytest.raises(ValueError, match="capacidad_t"):
        leer_escenario(incompleto)
    datos = json.loads(MINA_NORTE.read_text(encoding="utf-8"))
    datos["parametros"]["carga_min"] = [3, 2, 4]
    malo = tmp_path / "malo.json"
    malo.write_text(json.dumps(datos), encoding="utf-8")
    with pytest.raises(ValueError, match="mínimo ≤ moda ≤ máximo"):
        leer_escenario(malo)


def test_la_linea_de_comandos_corre_un_escenario(tmp_path):
    archivo = tmp_path / "mina-norte.json"
    archivo.write_text(MINA_NORTE.read_text(encoding="utf-8"), encoding="utf-8")
    subprocess.run(
        [sys.executable, "-m", "carguio", "--rapido", "--escenario", str(archivo)],
        check=True,
        capture_output=True,
    )
    salida = tmp_path / "mina-norte-resultados"
    rec = json.loads((salida / "recomendacion.json").read_text(encoding="utf-8"))
    assert rec["meta_t_turno"] == 60000
    assert rec["camiones_para_meta"] in range(6, 35, 2)
    assert (salida / "barrido-flota.csv").read_text(encoding="utf-8").startswith("camiones,")
