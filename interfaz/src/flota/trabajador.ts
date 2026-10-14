// El barrido de flota en un hilo aparte, para que la página siga respondiendo mientras corren los 630 turnos.
import { type Comparacion, compararFlotas, type Costos, type FilaBarrido, filaBarrido, recomendacion, replicar } from '../modelo/experimento'
import type { Parametros } from '../modelo/simulacion'

export interface Pedido {
  parametros: Parametros
  costos: Costos
  camiones: number[]
  replicas: number
  /** Qué flotas comparar turno a turno; si no viene, la más barata contra la que logra el 95 % del máximo. */
  comparar?: [number, number]
}
export type Respuesta =
  | { tipo: 'avance'; hechas: number; total: number }
  | { tipo: 'listo'; filas: FilaBarrido[]; comparacion: Comparacion | null; ms: number }

self.onmessage = (e: MessageEvent<Pedido>) => {
  const { parametros, costos, camiones, replicas } = e.data
  const t0 = performance.now()
  const filas: FilaBarrido[] = []
  for (const n of camiones) {
    filas.push(filaBarrido(parametros, n, costos, replicar({ ...parametros, camiones: n }, replicas)))
    self.postMessage({ tipo: 'avance', hechas: filas.length, total: camiones.length } satisfies Respuesta)
  }
  const r = recomendacion(filas)
  const [a, b] = e.data.comparar ?? [r.camionesMenorCosto, r.camionesPara95]
  const comparacion = a !== b ? compararFlotas(parametros, a, b, costos, replicas) : null
  self.postMessage({ tipo: 'listo', filas, comparacion, ms: performance.now() - t0 } satisfies Respuesta)
}
