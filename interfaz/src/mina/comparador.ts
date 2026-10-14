// La comparación de dos escenarios en un hilo aparte, para que la página siga respondiendo.
import { type ComparacionEscenarios, type Costos, compararEscenarios } from '../modelo/experimento'
import type { Parametros } from '../modelo/simulacion'

export interface PedidoComparar {
  a: { parametros: Parametros; costos: Costos }
  b: { parametros: Parametros; costos: Costos }
  replicas: number
}
export interface RespuestaComparar {
  comparacion: ComparacionEscenarios
  ms: number
}

self.onmessage = (e: MessageEvent<PedidoComparar>) => {
  const { a, b, replicas } = e.data
  const t0 = performance.now()
  const comparacion = compararEscenarios(a.parametros, a.costos, b.parametros, b.costos, replicas)
  self.postMessage({ comparacion, ms: performance.now() - t0 } satisfies RespuestaComparar)
}
