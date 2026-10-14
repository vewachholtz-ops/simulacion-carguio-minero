// El rajo visto desde arriba: bancos como elipses una dentro de otra, una rampa en espiral desde el fondo hasta el
// borde, un camino al chancador y las palas en el fondo. Todo en las coordenadas del viewBox del mapa (1000 × 600).
// Cada recorrido es una polilínea; la posición de un camión es un punto a cierta distancia a lo largo de ella.

export type Punto = readonly [number, number]

export const ANCHO = 1000
export const ALTO = 600
const CENTRO: Punto = [395, 330]
const ACHATADO = 0.6
const GIRO = (-9 * Math.PI) / 180
export const RADIO_FONDO = 118
export const RADIO_BORDE = 372
export const BANCOS = 6

/** Un punto de la elipse de radio r (en el eje largo) en el ángulo a, con el giro del rajo. */
function elipse(r: number, a: number): Punto {
  const x = r * Math.cos(a)
  const y = r * ACHATADO * Math.sin(a)
  return [CENTRO[0] + x * Math.cos(GIRO) - y * Math.sin(GIRO), CENTRO[1] + x * Math.sin(GIRO) + y * Math.cos(GIRO)]
}

/** Los bancos, del borde al fondo: el contorno de cada uno como path SVG. */
export function bancos(): { d: string; nivel: number }[] {
  return Array.from({ length: BANCOS + 1 }, (_, k) => {
    const r = RADIO_BORDE - ((RADIO_BORDE - RADIO_FONDO) * k) / BANCOS
    const puntos = Array.from({ length: 73 }, (_, i) => elipse(r * (1 + 0.035 * Math.sin(3 * ((i * 5 * Math.PI) / 180) + k)), (i * 5 * Math.PI) / 180))
    return { d: `M${puntos.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L')}Z`, nivel: k }
  })
}

// la rampa: vuelta y cuarto en espiral, del fondo (ángulo inicial) al borde (sale hacia el chancador, arriba a la derecha)
const SALIDA = (-28 * Math.PI) / 180
const VUELTAS = 1.25
const RAMPA: Punto[] = Array.from({ length: 181 }, (_, i) => {
  const t = i / 180
  const a = SALIDA - (1 - t) * VUELTAS * 2 * Math.PI
  return elipse(RADIO_FONDO * 0.92 + (RADIO_BORDE * 1.0 - RADIO_FONDO * 0.92) * t, a)
})
export const PIE_RAMPA = RAMPA[0]
const BORDE = RAMPA[RAMPA.length - 1]
export const CHANCADOR: Punto = [905, 112]
const CAMINO: Punto[] = [BORDE, [BORDE[0] + 70, BORDE[1] - 40], [CHANCADOR[0] - 120, CHANCADOR[1] + 34], [CHANCADOR[0] - 34, CHANCADOR[1] + 8]]
/** Donde descarga el camión: al lado del chancador. */
export const DESCARGA: Punto = [CHANCADOR[0] - 34, CHANCADOR[1] + 8]

/** La rampa y el camino al chancador, como un solo path SVG. */
export const CAMINO_D = `M${[...RAMPA, ...CAMINO.slice(1)].map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L')}`

/** Dónde está cada pala en el fondo del rajo, según cuántas son (lejos del pie de la rampa). */
export function palas(n: number): Punto[] {
  const lejos = Math.atan2(CENTRO[1] - PIE_RAMPA[1], CENTRO[0] - PIE_RAMPA[0])
  return Array.from({ length: n }, (_, i) => {
    const desvio = n === 1 ? 0 : ((i / (n - 1)) * 2 - 1) * 0.95
    const a = lejos + desvio
    const r = RADIO_FONDO * 0.55
    return [CENTRO[0] + r * Math.cos(a), CENTRO[1] + r * ACHATADO * Math.sin(a) * 1.25] as Punto
  })
}

// ---------------------------------------------------------------- recorridos
export class Recorrido {
  readonly largo: number
  private acumulado: number[]
  constructor(readonly puntos: Punto[]) {
    this.acumulado = [0]
    for (let i = 1; i < puntos.length; i++) this.acumulado.push(this.acumulado[i - 1] + Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]))
    this.largo = this.acumulado.at(-1)!
  }

  /** El punto a una fracción f del recorrido, el ángulo de avance y el punto corrido `lado` px hacia la derecha. */
  en(f: number, lado = 0): { x: number; y: number; angulo: number } {
    const d = Math.min(Math.max(f, 0), 1) * this.largo
    let i = 1
    while (i < this.acumulado.length - 1 && this.acumulado[i] < d) i++
    const [a, b] = [this.puntos[i - 1], this.puntos[i]]
    const tramo = this.acumulado[i] - this.acumulado[i - 1] || 1
    const t = (d - this.acumulado[i - 1]) / tramo
    const angulo = Math.atan2(b[1] - a[1], b[0] - a[0])
    return {
      x: a[0] + (b[0] - a[0]) * t - Math.sin(angulo) * lado,
      y: a[1] + (b[1] - a[1]) * t + Math.cos(angulo) * lado,
      angulo: (angulo * 180) / Math.PI,
    }
  }
}

/** El lugar de carga frente a la pala: un poco hacia el pie de la rampa. */
export function puestoCarga(pala: Punto): Punto {
  const a = Math.atan2(PIE_RAMPA[1] - pala[1], PIE_RAMPA[0] - pala[0])
  return [pala[0] + 22 * Math.cos(a), pala[1] + 22 * Math.sin(a)]
}

/** Los recorridos de ida (cargado: de la pala al chancador) y de vuelta (vacío: del chancador a la pala). */
export function recorridos(posPalas: Punto[]) {
  const subida = [...RAMPA, ...CAMINO.slice(1)]
  return {
    ida: posPalas.map((p) => new Recorrido([puestoCarga(p), ...subida])),
    vuelta: posPalas.map((p) => new Recorrido([...[...subida].reverse(), colaPala(p, 0)])),
    vueltaAlPie: new Recorrido([...subida].reverse()),
  }
}

/** El lugar del q-ésimo camión en la cola de una pala: en fila hacia el pie de la rampa. */
export function colaPala(pala: Punto, q: number): Punto {
  const c = puestoCarga(pala)
  const a = Math.atan2(PIE_RAMPA[1] - pala[1], PIE_RAMPA[0] - pala[0])
  const d = 20 + q * 17
  return [c[0] + d * Math.cos(a), c[1] + d * Math.sin(a)]
}

/** El lugar del q-ésimo camión en la cola del chancador: en fila por el camino, hacia atrás. */
const FILA_CHANCADOR = new Recorrido([...CAMINO].reverse())
export function colaChancador(q: number): { x: number; y: number; angulo: number } {
  const p = FILA_CHANCADOR.en(Math.min(1, (22 + q * 17) / FILA_CHANCADOR.largo))
  return { ...p, angulo: p.angulo + 180 }
}
