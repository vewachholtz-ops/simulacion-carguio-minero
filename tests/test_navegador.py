"""La app web en un navegador de verdad: el turno se anima, los controles cambian la flota, el barrido
corre en el navegador, los datos mal escritos se avisan sin romper nada, y «Tu mina» arma una mina desde
cero, la guarda, la descarga (el mismo JSON que lee Python), la compara y la abre desde un enlace.

Necesita la app construida y Chromium para Playwright:

    cd interfaz && npm ci && npm run build && cd ..
    uv run playwright install chromium
    uv run pytest tests/test_navegador.py

Con otro Chromium ya instalado: CHROMIUM=/ruta/al/chrome uv run pytest tests/test_navegador.py
"""

import base64
import functools
import http.server
import json
import os
import threading
import zipfile
from pathlib import Path

import pytest

DIST = Path(__file__).resolve().parents[1] / "interfaz" / "dist"
playwright = pytest.importorskip("playwright.sync_api")
if not (DIST / "index.html").exists():
    pytest.skip("falta construir la app (cd interfaz && npm run build)", allow_module_level=True)


class _Servidor(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def url():
    manejador = functools.partial(_Servidor, directory=str(DIST))
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{servidor.server_address[1]}/"
    servidor.shutdown()


@pytest.fixture(scope="module")
def navegador():
    with playwright.sync_playwright() as p:
        try:
            # WebGL por software, para que la maqueta 3D también se pruebe sin tarjeta gráfica
            b = p.chromium.launch(
                executable_path=os.environ.get("CHROMIUM") or None,
                args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
            )
        except Exception as e:  # sin Chromium instalado
            pytest.skip(f"no hay Chromium para Playwright: {e}")
        yield b
        b.close()


@pytest.fixture
def pagina(navegador):
    pg = navegador.new_page(viewport={"width": 1280, "height": 900})
    errores: list[str] = []
    pg.on("pageerror", lambda e: errores.append(str(e)))
    yield pg
    pg.close()
    assert not errores


def _hora(pagina) -> str:
    return pagina.locator("aside[aria-label=Despacho] p.ancha").inner_text()


def test_el_turno_avanza_y_los_controles_cambian_la_flota(pagina, url):
    pagina.goto(url)
    # la app abre en el turno, con la maqueta 3D dibujada
    assert pagina.get_by_role("link", name="Turno", exact=True).get_attribute("aria-current") == "page"
    pagina.locator("#simular canvas").wait_for(timeout=30_000)
    inicio = _hora(pagina)
    pagina.wait_for_timeout(1500)
    assert _hora(pagina) != inicio, "el reloj del turno no avanzó"
    pagina.get_by_role("button", name="Pausar").click()
    pagina.get_by_label("Minuto del turno").fill("300")
    assert _hora(pagina) == "13:00"
    despacho = pagina.locator("aside[aria-label=Despacho]")
    assert "2 de 2" in despacho.inner_text()
    despacho.get_by_role("radio", name="3", exact=True).click()
    assert " de 3" in despacho.inner_text()
    despacho.get_by_role("button", name="Un camión más").click()
    assert "13" in despacho.locator("span.ancha").inner_text()
    despacho.get_by_role("radio", name="Sin fallas").click()
    assert pagina.locator("svg text", has_text="reparación").count() == 0
    # el formulario de «Tu mina» sigue a los controles del simulador
    assert pagina.locator("#mina-camiones").input_value() == "13"
    assert pagina.locator("#mina-palas").input_value() == "3"


def test_el_barrido_corre_en_el_navegador(pagina, url):
    pagina.goto(f"{url}#flota")
    pagina.get_by_role("button", name="Correr el barrido en tu navegador").click()
    pagina.get_by_text("Lo que dio tu navegador").wait_for(timeout=120_000)
    texto = pagina.locator("#flota").inner_text().replace("\xa0", " ")
    assert "630 turnos de 12 horas" in texto
    assert "Menor costo con 1" in texto  # 11 a 14 camiones, según el azar


def test_un_dato_mal_escrito_se_avisa(pagina, url):
    pagina.goto(f"{url}#mina")
    pagina.locator("#mina-carga1").fill("9")
    assert "mínimo ≤ moda ≤ máximo" in pagina.locator("#mina").inner_text()
    pagina.locator("#mina-carga1").fill("3")
    pagina.locator("#mina-capacidadT").fill("180")
    assert "180 t" in pagina.locator("#simular").inner_text().replace("\xa0", " ")
    pagina.get_by_role("button", name="Volver a la mina de ejemplo").click()
    assert pagina.locator("#mina-capacidadT").input_value() == "220"


MINA_NORTE = Path(__file__).parent / "datos" / "mina-norte.json"


def test_tu_mina_en_blanco_guardar_descargar_y_comparar(pagina, url):
    pagina.goto(f"{url}#mina")
    pagina.get_by_role("button", name="Empezar una mina en blanco").click()
    mina = pagina.locator("#mina")
    assert "Completa estos" in mina.inner_text()
    pagina.get_by_label("Nombre de la mina o del escenario").fill("Mina Norte (inventada)")
    datos = {
        "camiones": "18",
        "palas": "3",
        "capacidadT": "240",
        "posicionamiento": "0,6",
        "carga0": "2",
        "carga1": "2,5",
        "carga2": "3,2",
        "distanciaKm": "4,2",
        "velocidadCargado": "28",
        "velocidadVacio": "40",
        "descarga0": "0,8",
        "descarga1": "1",
        "descarga2": "1,4",
        "mtbfH": "10",
        "mttr": "40",
        "camionUsdH": "380",
        "palaUsdH": "1100",
        "meta": "60.000",
    }
    for clave, valor in datos.items():
        pagina.locator(f"#mina-{clave}").fill(valor)
    assert "Con estos números" in mina.inner_text()
    # el simulador ya corre la mina nueva
    assert "Mina Norte (inventada)" in pagina.locator("#simular").inner_text()
    assert " de 3" in pagina.locator("aside[aria-label=Despacho]").inner_text()

    mina.get_by_role("button", name="Guardar", exact=True).click()
    assert "Guardada «Mina Norte (inventada)»" in mina.get_by_role("status").first.inner_text()
    guardadas = mina.locator("section[aria-label='Guardadas en este navegador']").inner_text()
    assert "Mina Norte (inventada)" in guardadas
    assert "18 camiones, 3 palas" in guardadas

    # lo descargado es el mismo escenario que lee Python
    with pagina.expect_download() as descarga:
        mina.get_by_role("button", name="Descargar", exact=True).click()
    bajado = json.loads(Path(descarga.value.path()).read_text(encoding="utf-8"))
    assert bajado == json.loads(MINA_NORTE.read_text(encoding="utf-8"))

    # comparar con la mina de ejemplo, con el mismo azar
    pagina.locator("#comparar-a").select_option("ejemplo")
    pagina.locator("#comparar-b").select_option("actual")
    pagina.get_by_role("button", name="Comparar", exact=True).click()
    comparacion = pagina.locator("section[aria-labelledby=comparar-titulo]")
    comparacion.locator("table").wait_for(timeout=120_000)
    assert "Mina Norte (inventada)» mueve" in comparacion.inner_text()
    with pagina.expect_download() as excel:
        pagina.locator("#mina").get_by_role("button", name="Descargar en Excel").click()
    with zipfile.ZipFile(excel.value.path()) as z:
        assert "Comparación" in z.read("xl/workbook.xml").decode()

    # el barrido de flota usa la mina nueva y responde la meta
    pagina.get_by_role("link", name="Flota", exact=True).click()
    flota = pagina.locator("#flota")
    assert "De 6 a 34 camiones, de 2 en 2" in pagina.locator("#flota-titulo + p").inner_text()
    flota.get_by_role("button", name="Correr el barrido en tu navegador").click()
    flota.get_by_text("Lo que dio tu navegador").wait_for(timeout=180_000)
    assert "Se llega con" in flota.inner_text()


def test_una_mina_compartida_en_un_enlace(pagina, url):
    datos = MINA_NORTE.read_text(encoding="utf-8")
    codigo = base64.urlsafe_b64encode(json.dumps(json.loads(datos)).encode()).decode().rstrip("=")
    pagina.goto(f"{url}#mina={codigo}")
    en_pantalla = pagina.locator("#simular").inner_text()
    assert "Mina Norte (inventada)" in en_pantalla
    assert "abierta desde un enlace" in en_pantalla
    assert pagina.locator("#mina-distanciaKm").input_value() == "4,2"
