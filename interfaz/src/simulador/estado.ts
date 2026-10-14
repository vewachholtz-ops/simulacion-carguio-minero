// Qué pasa en la mina en el minuto T del turno, a partir del registro de la simulación: dónde va cada camión, qué
// hace cada pala y cuántas toneladas llegaron al chancador.
import type { Parametros, Registro, Tramo } from '../modelo/simulacion'
import { colaChancador, colaPala, DESCARGA, PIE_RAMPA, type Punto, puestoCarga, recorridos } from './geometria'

export type EstadoCamion = 'espera_salida' | Tramo['tipo']
export type EstadoPala = 'libre' | 'cargando' | 'falla' | 'reparacion'

export interface Camion {
  j: number
  x: number
  y: number
  angulo: number
  cargado: boolean
  estado: EstadoCamion
}

export interface Foto {
  camiones: Camion[]
  palas: EstadoPala[]
  descargando: boolean
  /** Toneladas que llegaron al chancador desde el inicio del turno y después del calentamiento. */
  toneladas: number
  toneladasEfectivas: number
  cuenta: Record<'cargando' | 'viajando' | 'colaPala' | 'colaChancador' | 'descargando' | 'esperaSalida', number>
}

/** El tramo en curso en el minuto t (el último que empezó), por búsqueda binaria. */
function tramoEn(tramos: Tramo[], t: number): Tramo | null {
  let bajo = 0
  let alto = tramos.length - 1
  let encontrado = -1
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1
    if (tramos[medio].inicio <= t) {
      encontrado = medio
      bajo = medio + 1
    } else alto = medio - 1
  }
  return encontrado < 0 ? null : tramos[encontrado]
}

function cuantosHasta(lista: number[], t: number) {
  let bajo = 0
  let alto = lista.length
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1
    if (lista[medio] <= t) bajo = medio + 1
    else alto = medio
  }
  return bajo
}

export function preparar(p: Parametros, registro: Registro, posPalas: Punto[]) {
  const rutas = recorridos(posPalas)
  const descargas = [...registro.descargas].sort((a, b) => a - b)
  const antesDelCalentamiento = cuantosHasta(descargas, p.calentamiento - 1e-9)

  return function foto(t: number): Foto {
    const cuenta = { cargando: 0, viajando: 0, colaPala: 0, colaChancador: 0, descargando: 0, esperaSalida: 0 }
    const actuales = registro.camiones.map((tramos, j) => ({ j, tramo: tramoEn(tramos, t) }))
    // el orden en cada cola: quien llegó primero va adelante
    const filas = new Map<string, number[]>()
    for (const { j, tramo } of actuales)
      if (tramo && (tramo.tipo === 'cola_pala' || tramo.tipo === 'cola_chancador') && t < tramo.fin) {
        const clave = tramo.tipo === 'cola_pala' ? `p${tramo.pala}` : 'c'
        filas.set(clave, [...(filas.get(clave) ?? []), j])
      }
    for (const fila of filas.values())
      fila.sort((a, b) => tramoEn(registro.camiones[a], t)!.inicio - tramoEn(registro.camiones[b], t)!.inicio || a - b)

    const camiones: Camion[] = actuales.map(({ j, tramo }) => {
      if (!tramo || t < registro.salidas[j]) {
        cuenta.esperaSalida++
        const fila = j % 6
        const columna = Math.floor(j / 6)
        return { j, x: PIE_RAMPA[0] - 10 - columna * 18, y: PIE_RAMPA[1] + 18 + fila * 11, angulo: 0, cargado: false, estado: 'espera_salida' }
      }
      const f = tramo.fin > tramo.inicio ? (t - tramo.inicio) / (tramo.fin - tramo.inicio) : 1
      switch (tramo.tipo) {
        case 'cola_pala': {
          cuenta.colaPala++
          const q = filas.get(`p${tramo.pala}`)?.indexOf(j) ?? 0
          const [x, y] = colaPala(posPalas[tramo.pala], Math.max(0, q))
          const [cx, cy] = puestoCarga(posPalas[tramo.pala])
          return { j, x, y, angulo: (Math.atan2(cy - y, cx - x) * 180) / Math.PI, cargado: false, estado: tramo.tipo }
        }
        case 'carga': {
          cuenta.cargando++
          const [x, y] = puestoCarga(posPalas[tramo.pala])
          const [px, py] = posPalas[tramo.pala]
          return { j, x, y, angulo: (Math.atan2(y - py, x - px) * 180) / Math.PI, cargado: f > 0.5, estado: tramo.tipo }
        }
        case 'acarreo': {
          cuenta.viajando++
          return { j, ...rutas.ida[tramo.pala].en(f, 5), cargado: true, estado: tramo.tipo }
        }
        case 'cola_chancador': {
          cuenta.colaChancador++
          const q = filas.get('c')?.indexOf(j) ?? 0
          return { j, ...colaChancador(Math.max(0, q)), cargado: true, estado: tramo.tipo }
        }
        case 'descarga': {
          cuenta.descargando++
          return { j, x: DESCARGA[0], y: DESCARGA[1], angulo: 0, cargado: f < 0.6, estado: tramo.tipo }
        }
        case 'retorno': {
          cuenta.viajando++
          const ruta = tramo.hacia === null ? rutas.vueltaAlPie : rutas.vuelta[tramo.hacia]
          return { j, ...ruta.en(f, 5), cargado: false, estado: tramo.tipo }
        }
      }
    })

    const palas: EstadoPala[] = posPalas.map((_, i) => {
      const r = registro.reparaciones[i].find((x) => x.falla <= t && t < x.fin)
      if (r) return t < r.inicio ? 'falla' : 'reparacion'
      return actuales.some(({ tramo }) => tramo?.tipo === 'carga' && tramo.pala === i && t < tramo.fin) ? 'cargando' : 'libre'
    })
    const hechas = cuantosHasta(descargas, t)
    return {
      camiones,
      palas,
      descargando: cuenta.descargando > 0,
      toneladas: hechas * p.capacidadT,
      toneladasEfectivas: Math.max(0, hechas - antesDelCalentamiento) * p.capacidadT,
      cuenta,
    }
  }
}
