"""Modelo de eventos discretos de carguío y transporte en una mina a rajo abierto.

Ciclo de cada camión: elige la pala con menos camiones esperando, se posiciona y es cargado,
viaja cargado al chancador, espera su turno, descarga y vuelve vacío. Las palas fallan al azar
y quedan detenidas mientras se reparan. Todos los tiempos están en minutos.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from numbers import Integral

import numpy as np
import simpy


@dataclass(frozen=True)
class Parametros:
    """Parámetros de una corrida. Los valores por defecto son ilustrativos, no de una faena real."""

    n_camiones: int = 12
    n_palas: int = 2
    capacidad_t: float = 220.0
    # triangular (mínimo, moda, máximo)
    carga_min: tuple[float, float, float] = (2.5, 3.0, 4.0)
    descarga_min: tuple[float, float, float] = (1.0, 1.2, 1.6)
    # normal (media, desviación), truncada para no dar tiempos negativos
    acarreo_min: tuple[float, float] = (12.0, 1.5)
    retorno_min: tuple[float, float] = (9.0, 1.0)
    posicionamiento_min: float = 0.7
    # fallas de pala: tiempo entre fallas y de reparación exponenciales; None = sin fallas
    mtbf_pala_min: float | None = 480.0
    mttr_pala_min: float = 45.0
    turno_min: float = 720.0
    calentamiento_min: float = 60.0

    def __post_init__(self) -> None:
        for nombre in ("n_camiones", "n_palas"):
            valor = getattr(self, nombre)
            if isinstance(valor, bool) or not isinstance(valor, Integral) or valor < 1:
                raise ValueError(f"{nombre} debe ser un entero positivo.")
        valores = (
            self.capacidad_t,
            self.posicionamiento_min,
            self.turno_min,
            self.calentamiento_min,
            self.mttr_pala_min,
            *self.carga_min,
            *self.descarga_min,
            *self.acarreo_min,
            *self.retorno_min,
        )
        if not all(isfinite(v) for v in valores):
            raise ValueError("Los parámetros deben ser finitos (sin NaN ni infinito).")
        if self.capacidad_t <= 0 or self.posicionamiento_min < 0:
            raise ValueError("La capacidad debe ser positiva y el posicionamiento no negativo.")
        if self.acarreo_min[0] < 0 or self.retorno_min[0] < 0:
            raise ValueError("Los tiempos medios de viaje no pueden ser negativos.")
        if not 0 <= self.calentamiento_min < self.turno_min:
            raise ValueError("El calentamiento debe ser menor que el turno.")
        if self.acarreo_min[1] < 0 or self.retorno_min[1] < 0:
            raise ValueError("Las desviaciones estándar no pueden ser negativas.")
        if self.mttr_pala_min <= 0 or (
            self.mtbf_pala_min is not None and (not isfinite(self.mtbf_pala_min) or self.mtbf_pala_min <= 0)
        ):
            raise ValueError("El tiempo entre fallas y el de reparación deben ser positivos.")
        for nombre in ("carga_min", "descarga_min"):
            a, m, b = getattr(self, nombre)
            if not 0 <= a <= m <= b:
                raise ValueError(f"{nombre} debe cumplir 0 ≤ mínimo ≤ moda ≤ máximo.")
        if self.carga_media <= 0:
            raise ValueError("La carga y el posicionamiento deben sumar un tiempo positivo.")

    # medias teóricas, para el factor de acoplamiento
    @property
    def carga_media(self) -> float:
        return self.posicionamiento_min + sum(self.carga_min) / 3

    @property
    def ciclo_sin_colas(self) -> float:
        return self.carga_media + self.acarreo_min[0] + sum(self.descarga_min) / 3 + self.retorno_min[0]

    @property
    def factor_acoplamiento(self) -> float:
        """Match factor: capacidad de los camiones para alimentar las palas (1 = equilibrio teórico)."""
        return self.n_camiones * self.carga_media / (self.n_palas * self.ciclo_sin_colas)


@dataclass
class Resultado:
    toneladas: float
    horas_efectivas: float
    ciclos: int
    utilizacion_palas: float  # fracción del turno (después del calentamiento) que las palas pasan cargando
    utilizacion_chancador: float
    disponibilidad_palas: float  # fracción del turno en que las palas no están en reparación
    espera_pala_min: float
    espera_chancador_min: float
    ciclo_medio_min: float

    @property
    def produccion_t_h(self) -> float:
        return self.toneladas / self.horas_efectivas


class _Mina:
    def __init__(self, p: Parametros, semilla: int):
        self.p = p
        # Un generador por fuente de azar y por equipo: la carga k-ésima de la pala i, o el viaje k-ésimo
        # del camión j, usan el mismo número aleatorio en cualquier tamaño de flota. Así, al comparar
        # escenarios con la misma semilla, las diferencias vienen de la flota y no del azar.
        carga, descarga, fallas, viajes = np.random.SeedSequence(semilla).spawn(4)
        self.rng_carga = [np.random.default_rng(s) for s in carga.spawn(p.n_palas)]
        self.rng_fallas = [np.random.default_rng(s) for s in fallas.spawn(p.n_palas)]
        self.rng_viajes = [np.random.default_rng(s) for s in viajes.spawn(p.n_camiones)]
        self.rng_descarga = np.random.default_rng(descarga)
        self.env = simpy.Environment()
        self.palas = [simpy.PriorityResource(self.env, capacity=1) for _ in range(p.n_palas)]
        self.chancador = simpy.Resource(self.env, capacity=1)
        self.en_reparacion: set[int] = set()
        self.en_curso: dict[tuple, float] = {}  # actividades abiertas: (tipo, equipo) -> inicio
        self.ocupado_palas = 0.0
        self.detenido_palas = 0.0
        self.ocupado_chancador = 0.0
        self.toneladas = 0.0
        self.ciclos = 0
        self.esperas_pala: list[float] = []
        self.esperas_chancador: list[float] = []
        self.duracion_ciclos: list[float] = []

    # --- tiempos aleatorios ---
    @staticmethod
    def _tri(rng: np.random.Generator, abc: tuple[float, float, float]) -> float:
        a, m, b = abc
        return a if a == b else float(rng.triangular(a, m, b))

    @staticmethod
    def _normal(rng: np.random.Generator, media_desv: tuple[float, float]) -> float:
        media, desv = media_desv
        if desv == 0:
            return media
        return float(
            max(0.1 * media, rng.normal(media, desv))
        )  # acotada abajo: nunca menos de 10 % de la media

    def _post_calentamiento(self, inicio: float, fin: float) -> float:
        """Parte del intervalo [inicio, fin] que cae después del calentamiento."""
        return max(0.0, fin - max(inicio, self.p.calentamiento_min))

    def _abrir(self, clave: tuple) -> None:
        self.en_curso[clave] = self.env.now

    def _cerrar(self, clave: tuple) -> float:
        return self._post_calentamiento(self.en_curso.pop(clave), self.env.now)

    # --- procesos ---
    def camion(self, j: int):
        p, env = self.p, self.env
        while True:
            inicio_ciclo = env.now
            # despacho: entre las palas que no están en reparación, la con menos camiones en cola o cargando
            operativas = [i for i in range(p.n_palas) if i not in self.en_reparacion] or list(
                range(p.n_palas)
            )
            i = min(operativas, key=lambda k: len(self.palas[k].queue) + self.palas[k].count)
            llegada = env.now
            with self.palas[i].request(priority=1) as req:
                yield req
                espera_pala = env.now - llegada
                self._abrir(("carga", i))
                yield env.timeout(p.posicionamiento_min + self._tri(self.rng_carga[i], p.carga_min))
                self.ocupado_palas += self._cerrar(("carga", i))
            yield env.timeout(self._normal(self.rng_viajes[j], p.acarreo_min))
            llegada = env.now
            with self.chancador.request() as req:
                yield req
                espera_chancador = env.now - llegada
                self._abrir(("descarga",))
                yield env.timeout(self._tri(self.rng_descarga, p.descarga_min))
                self.ocupado_chancador += self._cerrar(("descarga",))
            if env.now >= p.calentamiento_min:
                self.toneladas += p.capacidad_t
                self.ciclos += 1
                self.esperas_pala.append(espera_pala)
                self.esperas_chancador.append(espera_chancador)
            yield env.timeout(self._normal(self.rng_viajes[j], p.retorno_min))
            if inicio_ciclo >= p.calentamiento_min:
                self.duracion_ciclos.append(env.now - inicio_ciclo)

    def fallas(self, i: int):
        p, env, rng = self.p, self.env, self.rng_fallas[i]
        while True:
            yield env.timeout(float(rng.exponential(p.mtbf_pala_min)))
            # desde la falla no se le despachan camiones; la reparación espera que termine la carga en curso
            self.en_reparacion.add(i)
            with self.palas[i].request(priority=0) as req:
                yield req
                self._abrir(("reparacion", i))
                yield env.timeout(float(rng.exponential(p.mttr_pala_min)))
                self.detenido_palas += self._cerrar(("reparacion", i))
            self.en_reparacion.discard(i)

    def correr(self) -> Resultado:
        p = self.p
        for j in range(p.n_camiones):
            # los camiones salen escalonados, como al inicio de un turno
            self.env.process(self._salida(j, j * 0.5))
        if p.mtbf_pala_min is not None:
            for i in range(p.n_palas):
                self.env.process(self.fallas(i))
        self.env.run(until=p.turno_min)
        # cargas, descargas y reparaciones que siguen en curso al terminar el turno también cuentan
        for (tipo, *_), inicio in self.en_curso.items():
            parcial = self._post_calentamiento(inicio, p.turno_min)
            if tipo == "carga":
                self.ocupado_palas += parcial
            elif tipo == "descarga":
                self.ocupado_chancador += parcial
            else:
                self.detenido_palas += parcial
        efectivo = p.turno_min - p.calentamiento_min
        return Resultado(
            toneladas=self.toneladas,
            horas_efectivas=efectivo / 60,
            ciclos=self.ciclos,
            utilizacion_palas=self.ocupado_palas / (p.n_palas * efectivo),
            utilizacion_chancador=self.ocupado_chancador / efectivo,
            disponibilidad_palas=1 - self.detenido_palas / (p.n_palas * efectivo),
            espera_pala_min=float(np.mean(self.esperas_pala)) if self.esperas_pala else 0.0,
            espera_chancador_min=float(np.mean(self.esperas_chancador)) if self.esperas_chancador else 0.0,
            # solo ciclos completos que partieron después del calentamiento
            ciclo_medio_min=float(np.mean(self.duracion_ciclos)) if self.duracion_ciclos else float("nan"),
        )

    def _salida(self, j: int, retraso: float):
        yield self.env.timeout(retraso)
        yield self.env.process(self.camion(j))


def simular(p: Parametros, semilla: int = 0) -> Resultado:
    """Corre un turno y devuelve sus indicadores (después del calentamiento)."""
    return _Mina(p, semilla).correr()
