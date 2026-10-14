// Las rutas de los camiones en la maqueta, en 3D: por el piso del rajo, la rampa y el camino de superficie. Cada ruta
// sabe dónde va un camión cuando lleva una fracción f del viaje, hacia dónde mira y cuánto se inclina en la pendiente.
import {
  CAMINO_SUPERFICIE,
  caminoPiso,
  CRUCE,
  DESCARGA,
  FONDO,
  type P2,
  type P3,
  puestoCarga,
  RAMPA_EJE,
  RETROCESO,
  APROXIMACION,
  SALIDA_CHANCADOR,
} from './mundo'

export interface Pose {
  x: number
  y: number
  z: number
  /** Hacia dónde apunta la trompa, en radianes desde el este. */
  rumbo: number
  /** Inclinación de la trompa hacia arriba, en radianes. */
  cabeceo: number
}

interface Tramo {
  puntos: P3[]
  /** El camión va marcha atrás: mira al revés de como avanza. */
  reversa?: boolean
  /** Va por un camino de dos pistas: se corre a la derecha. */
  pista?: boolean
}

/** Curva suave (Catmull-Rom centrada) por una lista de puntos, con un punto cada `paso` metros aproximadamente. */
export function suavizar(puntos: P3[], paso = 3): P3[] {
  if (puntos.length < 3) return densificar(puntos, paso)
  const out: P3[] = []
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[Math.max(0, i - 1)]
    const p1 = puntos[i]
    const p2 = puntos[i + 1]
    const p3 = puntos[Math.min(puntos.length - 1, i + 2)]
    const largo = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2])
    const n = Math.max(1, Math.ceil(largo / paso))
    for (let k = 0; k < n; k++) {
      const t = k / n
      const t2 = t * t
      const t3 = t2 * t
      out.push([0, 1, 2].map(
        (c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3),
      ) as P3)
    }
  }
  out.push(puntos.at(-1)!)
  return out
}

function densificar(puntos: P3[], paso: number): P3[] {
  const out: P3[] = []
  for (let i = 0; i < puntos.length - 1; i++) {
    const [a, b] = [puntos[i], puntos[i + 1]]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / paso))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, a[2] + ((b[2] - a[2]) * k) / n])
  }
  out.push(puntos.at(-1)!)
  return out
}

const enPlano = (pts: P2[], z: number): P3[] => pts.map(([x, y]) => [x, y, z])

export class Recorrido {
  private puntos: P3[] = []
  private acumulado: number[] = []
  private tramoDe: number[] = []
  private tramos: Tramo[]
  readonly largo: number

  constructor(tramos: Tramo[]) {
    this.tramos = tramos
    tramos.forEach((t, k) => {
      for (const p of t.puntos) {
        const previo = this.puntos.at(-1)
        if (previo && Math.hypot(p[0] - previo[0], p[1] - previo[1], p[2] - previo[2]) < 1e-6) continue
        this.acumulado.push(previo ? this.acumulado.at(-1)! + Math.hypot(p[0] - previo[0], p[1] - previo[1], p[2] - previo[2]) : 0)
        this.puntos.push(p)
        this.tramoDe.push(k)
      }
    })
    this.largo = this.acumulado.at(-1) ?? 0
  }

  private indice(d: number) {
    let bajo = 0
    let alto = this.acumulado.length - 1
    while (bajo < alto - 1) {
      const m = (bajo + alto) >> 1
      if (this.acumulado[m] <= d) bajo = m
      else alto = m
    }
    return bajo
  }

  private punto(d: number): P3 {
    const dd = Math.min(Math.max(d, 0), this.largo)
    const i = this.indice(dd)
    const a = this.puntos[i]
    const b = this.puntos[Math.min(i + 1, this.puntos.length - 1)]
    const tramo = this.acumulado[i + 1] - this.acumulado[i] || 1
    const t = (dd - this.acumulado[i]) / tramo
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  }

  /** La pose a una fracción f del recorrido; `pista` metros a la derecha en los caminos de dos pistas. */
  en(f: number, pista = 6.5): Pose {
    const d = Math.min(Math.max(f, 0), 1) * this.largo
    const p = this.punto(d)
    const tramo = this.tramos[this.tramoDe[this.indice(d)]]
    // la dirección de avance, mirando unos metros adelante y atrás para que no tiemble
    const a = this.punto(d - 4)
    const b = this.punto(d + 4)
    let dx = b[0] - a[0]
    let dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const plano = Math.hypot(dx, dy) || 1
    dx /= plano
    dy /= plano
    let [x, y] = [p[0], p[1]]
    if (tramo?.pista) {
      x += dy * pista
      y += -dx * pista
    }
    const avance = Math.atan2(dy, dx)
    const subida = Math.atan2(dz, plano)
    return tramo?.reversa ? { x, y, z: p[2], rumbo: avance + Math.PI, cabeceo: -subida } : { x, y, z: p[2], rumbo: avance, cabeceo: subida }
  }

  /** La pose a d metros antes del final (para las colas). */
  antesDelFinal(d: number, pista = 6.5): Pose {
    return this.en(this.largo > 0 ? 1 - d / this.largo : 1, pista)
  }
}

// ---------------------------------------------------------------- las rutas de la mina
const rampa: P3[] = (() => {
  const out: P3[] = []
  let ultimo = -Infinity
  for (const m of RAMPA_EJE)
    if (m.largo - ultimo >= 3 || m === RAMPA_EJE.at(-1)) {
      out.push([m.x, m.y, m.z])
      ultimo = m.largo
    }
  return out
})()
const rampaSubiendo = [...rampa].reverse()
const superficie = suavizar(enPlano(CAMINO_SUPERFICIE, 0))
const superficieVuelta = [...superficie].reverse()

export interface RutasPala {
  /** Del puesto de carga al cruce frente al chancador, cargado. */
  ida: Recorrido
  /** Del punto de descarga a la cola de la pala, vacío. */
  vuelta: Recorrido
  /** Marcha atrás desde la cabeza de la cola hasta el puesto de carga. */
  aculatar: Recorrido
  puesto: Pose
}

export function rutasDe(p: { x: number; y: number; frente: number }): RutasPala {
  const pc = puestoCarga(p)
  const haciaDentro: P2 = [Math.cos(pc.rumbo), Math.sin(pc.rumbo)]
  // de qué lado está la pala, para hacer la maniobra por el otro
  const lado = Math.sign((p.x - pc.x) * -haciaDentro[1] + (p.y - pc.y) * haciaDentro[0]) || 1
  const perp: P2 = [-haciaDentro[1] * -lado, haciaDentro[0] * -lado]
  const cabeza: P2 = [pc.x + 36 * haciaDentro[0] + 16 * perp[0], pc.y + 36 * haciaDentro[1] + 16 * perp[1]]
  const piso = caminoPiso(p)
  // vuelta por el piso: del pie de la rampa a la cabeza de la cola
  const pisoVuelta = suavizar(enPlano([...piso.slice(0, -2), [cabeza[0] + 30 * perp[0], cabeza[1] + 30 * perp[1]], cabeza], FONDO))
  // ida por el piso: sale de frente desde el puesto, hacia el centro, y va al pie de la rampa
  const salida: P2 = [pc.x + 30 * haciaDentro[0], pc.y + 30 * haciaDentro[1]]
  const pisoIda = suavizar(enPlano([[pc.x, pc.y], salida, ...piso.slice(1, -2).reverse(), piso[0]], FONDO))
  const aculatar = suavizar(enPlano([cabeza, [pc.x + 14 * haciaDentro[0] + 4 * perp[0], pc.y + 14 * haciaDentro[1] + 4 * perp[1]], [pc.x, pc.y]], FONDO), 1.5)
  return {
    ida: new Recorrido([
      { puntos: pisoIda, pista: true },
      { puntos: rampaSubiendo, pista: true },
      { puntos: superficie, pista: true },
    ]),
    vuelta: new Recorrido([
      { puntos: suavizar(enPlano(SALIDA_CHANCADOR, 0)) },
      { puntos: superficieVuelta, pista: true },
      { puntos: rampa, pista: true },
      { puntos: pisoVuelta, pista: true },
    ]),
    aculatar: new Recorrido([{ puntos: aculatar, reversa: true }]),
    puesto: { x: pc.x, y: pc.y, z: FONDO, rumbo: pc.rumbo, cabeceo: 0 },
  }
}

/** La maniobra en el chancador: avanzar y retroceder hasta dejar la tolva sobre el buzón. */
export const MANIOBRA = new Recorrido([
  { puntos: suavizar(enPlano(APROXIMACION, 0), 2) },
  { puntos: suavizar(enPlano(RETROCESO, 0), 1.5), reversa: true },
])

/** Dónde espera el camión número q de la cola del chancador: hacia atrás por el camino, en la pista de subida. */
export function colaChancador(q: number, ida: Recorrido): Pose {
  return ida.antesDelFinal(4 + q * 21)
}

export const PUNTO_DESCARGA: Pose = { x: DESCARGA[0], y: DESCARGA[1], z: 0, rumbo: Math.PI, cabeceo: 0 }
export const PUNTO_CRUCE: P2 = CRUCE
