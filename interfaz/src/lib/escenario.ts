// El escenario que se está mirando: los parámetros del modelo, los costos, la meta y su nombre. Lo comparten el
// simulador, el dimensionamiento de la flota y «Tu mina»; por defecto es la mina de ejemplo de la versión Python.
import { useSyncExternalStore } from 'react'
import { COSTOS, type Costos } from '../modelo/experimento'
import { cargaMedia, cicloSinColas, PARAMETROS, type Parametros } from '../modelo/simulacion'

/** La ruta descrita como distancia y velocidades; de ahí salen los tiempos de acarreo y retorno. */
export interface Ruta {
  distanciaKm: number
  velocidadCargadoKmH: number
  velocidadVacioKmH: number
  /** Cuánto varía un viaje de otro: la desviación como fracción de la media (0,12 = 12 %). */
  variacion: number
}

export interface Escenario {
  nombre: string
  parametros: Parametros
  costos: Costos
  /** Toneladas que hay que mover en un turno; null si no hay meta. */
  meta: number | null
  /** null: los tiempos de viaje se escribieron directo. */
  ruta: Ruta | null
}

export const EJEMPLO: Escenario = { nombre: 'Mina de ejemplo', parametros: PARAMETROS, costos: COSTOS, meta: null, ruta: null }

let actual: Escenario = EJEMPLO
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((o) => o())

export function useEscenario(): Escenario {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => actual,
  )
}

export const escenarioActual = () => actual

export function cambiar(cambio: { parametros?: Partial<Parametros>; costos?: Partial<Costos>; nombre?: string; meta?: number | null; ruta?: Ruta | null }) {
  actual = {
    nombre: cambio.nombre ?? actual.nombre,
    parametros: { ...actual.parametros, ...cambio.parametros },
    costos: { ...actual.costos, ...cambio.costos },
    meta: cambio.meta !== undefined ? cambio.meta : actual.meta,
    ruta: cambio.ruta !== undefined ? cambio.ruta : actual.ruta,
  }
  avisar()
}

/** Reemplaza el escenario entero (al abrir uno guardado, compartido o desde un archivo). */
export function usar(e: Escenario) {
  actual = e
  avisar()
}

/** Vuelve a la mina de ejemplo, con los camiones que había. */
export function restablecer() {
  actual = { ...EJEMPLO, parametros: { ...PARAMETROS, camiones: actual.parametros.camiones } }
  avisar()
}

/** ¿Son los parámetros y costos de la versión Python (salvo los camiones, que se eligen aparte)? */
export function esPorDefecto(e: Escenario) {
  const { camiones: _c, ...resto } = e.parametros
  const { camiones: _c2, ...base } = PARAMETROS
  return JSON.stringify(resto) === JSON.stringify(base) && JSON.stringify(e.costos) === JSON.stringify(COSTOS)
}

/** Los tiempos de viaje que salen de una ruta: minutos = km ÷ km/h × 60, con la variación como desviación. */
export function tiemposDeRuta(r: Ruta): { acarreo: [number, number]; retorno: [number, number] } {
  const acarreo = (r.distanciaKm / r.velocidadCargadoKmH) * 60
  const retorno = (r.distanciaKm / r.velocidadVacioKmH) * 60
  const red = (v: number) => Math.round(v * 100) / 100
  return { acarreo: [red(acarreo), red(acarreo * r.variacion)], retorno: [red(retorno), red(retorno * r.variacion)] }
}

/** Los camiones con factor de acoplamiento 1: los que alcanzan, en teoría, para que las palas no esperen. */
export const camionesEquilibrio = (p: Parametros) => (p.palas * cicloSinColas(p)) / cargaMedia(p)

/** Qué flotas barrer: de 4 a 24 en la mina de ejemplo (lo publicado por Python); en otra mina, alrededor del
 * equilibrio, de un tercio a casi el doble, con a lo más 25 tamaños. Igual que rango_flota() en Python. */
export function flotasABarrer(p: Parametros, defecto: boolean): number[] {
  if (defecto) return Array.from({ length: 21 }, (_, i) => i + 4)
  const eq = camionesEquilibrio(p)
  const desde = Math.max(1, Math.floor(eq * 0.35))
  const hasta = Math.max(desde + 4, Math.ceil(eq * 1.8))
  const paso = Math.ceil((hasta - desde + 1) / 25)
  const flotas: number[] = []
  for (let n = desde; n <= hasta; n += paso) flotas.push(n)
  return flotas
}
