// Qué pasa en la maqueta en el minuto t del turno, a partir del registro de la simulación: la pose de cada camión,
// cuánto lleva en la tolva y si la está levantando, qué hace cada pala y cuánto mineral llegó al acopio.
import type { Parametros, Registro, Tramo } from '../modelo/simulacion'
import type { EstadoPala } from '../simulador/estado'
import { estacionamiento, palas as ubicarPalas } from './mundo'
import { colaChancador, MANIOBRA, type Pose, PUNTO_DESCARGA, rutasDe } from './rutas'

export interface CamionMaqueta extends Pose {
  j: number
  estado: 'espera_salida' | Tramo['tipo']
  /** Cuánto mineral lleva, de 0 a 1. */
  carga: number
  /** Cuánto tiene levantada la tolva, de 0 a 1. */
  volteo: number
}

export interface PalaMaqueta {
  estado: EstadoPala
  /** Giro de la tornamesa respecto de la cara, en radianes (positivo hacia el camión). */
  giro: number
  /** Altura del balde, de 0 (excavando abajo) a 1 (arriba, sobre la tolva). */
  balde: number
}

export interface FotoMaqueta {
  camiones: CamionMaqueta[]
  palas: PalaMaqueta[]
  /** Toneladas llegadas al chancador desde el inicio del turno. */
  toneladas: number
  /** Hay un camión vaciando la tolva (y cae mineral al buzón). */
  vaciando: number
}

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

const suave = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
/** Fracción de la carga que es maniobrar (aculatar) antes de que la pala empiece a echar baldadas. */
const ACULATAR = 0.22
/** Fracción de la descarga que es la maniobra de retroceso hasta el buzón. */
const RETROCEDER = 0.42
const PASADAS = 4

export function prepararMaqueta(p: Parametros, registro: Registro) {
  const ubic = ubicarPalas(p.palas)
  const rutas = ubic.map(rutasDe)
  const descargas = [...registro.descargas].sort((a, b) => a - b)

  return function foto(t: number): FotoMaqueta {
    const actuales = registro.camiones.map((tramos, j) => ({ j, tramo: tramoEn(tramos, t) }))
    const filas = new Map<string, number[]>()
    for (const { j, tramo } of actuales)
      if (tramo && (tramo.tipo === 'cola_pala' || tramo.tipo === 'cola_chancador') && t < tramo.fin) {
        const clave = tramo.tipo === 'cola_pala' ? `p${tramo.pala}` : 'c'
        filas.set(clave, [...(filas.get(clave) ?? []), j])
      }
    for (const fila of filas.values())
      fila.sort((a, b) => tramoEn(registro.camiones[a], t)!.inicio - tramoEn(registro.camiones[b], t)!.inicio || a - b)

    let vaciando = 0
    const giros = ubic.map(() => ({ giro: 0, balde: 0.15, cargando: false }))

    const camiones: CamionMaqueta[] = actuales.map(({ j, tramo }) => {
      if (!tramo || t < registro.salidas[j]) {
        const e = estacionamiento(j)
        return { j, x: e.x, y: e.y, z: -90, rumbo: e.rumbo, cabeceo: 0, estado: 'espera_salida', carga: 0, volteo: 0 }
      }
      const f = tramo.fin > tramo.inicio ? Math.min(1, Math.max(0, (t - tramo.inicio) / (tramo.fin - tramo.inicio))) : 1
      const r = rutas[tramo.pala] ?? rutas[0]
      const base = { j, estado: tramo.tipo, volteo: 0 }
      switch (tramo.tipo) {
        case 'cola_pala': {
          const q = Math.max(0, filas.get(`p${tramo.pala}`)?.indexOf(j) ?? 0)
          return { ...base, ...r.vuelta.antesDelFinal(q * 21), carga: 0 }
        }
        case 'carga': {
          if (f < ACULATAR) return { ...base, ...r.aculatar.en(suave(f / ACULATAR)), carga: 0 }
          // la pala echa PASADAS baldadas; la tolva se llena a saltos
          const g = (f - ACULATAR) / (1 - ACULATAR)
          const ciclo = g * PASADAS
          const pasada = Math.min(PASADAS - 1, Math.floor(ciclo))
          const dentro = ciclo - pasada
          const carga = (pasada + suave((dentro - 0.45) / 0.15)) / PASADAS
          const pala = giros[tramo.pala]
          if (pala) {
            pala.cargando = true
            // de la cara (0) al camión (1) y de vuelta, en cada pasada
            const hacia = dentro < 0.5 ? suave(dentro / 0.4) : 1 - suave((dentro - 0.55) / 0.4)
            pala.giro = hacia
            pala.balde = 0.15 + 0.85 * Math.sin(Math.min(1, hacia) * Math.PI * 0.5)
          }
          return { ...base, ...r.puesto, carga: Math.min(1, carga) }
        }
        case 'acarreo':
          return { ...base, ...r.ida.en(f), carga: 1 }
        case 'cola_chancador': {
          const q = Math.max(0, filas.get('c')?.indexOf(j) ?? 0)
          return { ...base, ...colaChancador(q, rutas[0].ida), carga: 1 }
        }
        case 'descarga': {
          if (f < RETROCEDER) return { ...base, ...MANIOBRA.en(suave(f / RETROCEDER)), carga: 1 }
          vaciando++
          const g = (f - RETROCEDER) / (1 - RETROCEDER)
          const volteo = g < 0.45 ? suave(g / 0.45) : g < 0.7 ? 1 : 1 - suave((g - 0.7) / 0.3)
          return { ...base, ...PUNTO_DESCARGA, carga: Math.max(0, 1 - suave((g - 0.15) / 0.4)), volteo }
        }
        case 'retorno': {
          const ruta = tramo.hacia === null ? rutas[tramo.pala]?.vuelta ?? rutas[0].vuelta : (rutas[tramo.hacia] ?? rutas[0]).vuelta
          return { ...base, ...ruta.en(f), carga: 0 }
        }
      }
    })

    const palas: PalaMaqueta[] = ubic.map((_, i) => {
      const rep = registro.reparaciones[i]?.find((x) => x.falla <= t && t < x.fin)
      const g = giros[i]
      if (rep) return { estado: t < rep.inicio ? 'falla' : 'reparacion', giro: t < rep.inicio ? g.giro : 0, balde: t < rep.inicio ? g.balde : 0 }
      return { estado: g.cargando ? 'cargando' : 'libre', giro: g.giro, balde: g.cargando ? g.balde : 0.15 + 0.1 * Math.sin(t * 2.1 + i) }
    })

    return { camiones, palas, toneladas: cuantosHasta(descargas, t) * p.capacidadT, vaciando }
  }
}
