// Réplicas, intervalos de confianza y dimensionamiento de la flota: lo mismo que src/carguio/experimento.py.
import { factorAcoplamiento, type Parametros, type Resultado, simular } from './simulacion'

export interface Costos {
  camionUsdH: number
  palaUsdH: number
}
export const COSTOS: Costos = { camionUsdH: 350, palaUsdH: 900 }

/** n turnos independientes: la réplica i usa la semilla semillaBase + i en cualquier escenario. */
export function replicar(p: Parametros, n = 30, semillaBase = 1000): Resultado[] {
  return Array.from({ length: n }, (_, i) => simular(p, semillaBase + i))
}

// ---------------------------------------------------------------- la t de Student
function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let s = 1.000000000190015
  for (const ci of c) s += ci / ++y
  return -t + Math.log((2.5066282746310005 * s) / x)
}

/** Beta incompleta regularizada I_x(a, b), por fracción continua. */
function betaIncompleta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const ln = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  const fraccion = (x: number, a: number, b: number) => {
    let c = 1
    let d = 1 - ((a + b) * x) / (a + 1)
    d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d)
    let h = d
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
      d = 1 / (1 + aa * d || 1e-300)
      c = 1 + aa / c || 1e-300
      h *= d * c
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
      d = 1 / (1 + aa * d || 1e-300)
      c = 1 + aa / c || 1e-300
      const del = d * c
      h *= del
      if (Math.abs(del - 1) < 1e-14) break
    }
    return h
  }
  return x < (a + 1) / (a + b + 2) ? (Math.exp(ln) * fraccion(x, a, b)) / a : 1 - (Math.exp(ln) * fraccion(1 - x, b, a)) / b
}

/** P(T ≤ t) con gl grados de libertad. */
function tAcumulada(t: number, gl: number): number {
  const cola = 0.5 * betaIncompleta(gl / (gl + t * t), gl / 2, 0.5)
  return t >= 0 ? 1 - cola : cola
}

/** El valor t tal que P(T ≤ t) = p (por bisección). */
export function tCuantil(p: number, gl: number): number {
  let bajo = 0
  let alto = 1000
  for (let k = 0; k < 200; k++) {
    const medio = (bajo + alto) / 2
    if (tAcumulada(medio, gl) < p) bajo = medio
    else alto = medio
  }
  return (bajo + alto) / 2
}

/** Media y semiancho del intervalo de confianza t de Student. */
export function intervalo(x: number[], confianza = 0.95): [media: number, semiancho: number] {
  const v = x.filter(Number.isFinite)
  const media = v.reduce((a, b) => a + b, 0) / v.length
  if (v.length < 2) return [media, Number.NaN]
  const varianza = v.reduce((a, b) => a + (b - media) ** 2, 0) / (v.length - 1)
  return [media, (tCuantil((1 + confianza) / 2, v.length - 1) * Math.sqrt(varianza)) / Math.sqrt(v.length)]
}

// ---------------------------------------------------------------- barrido de flota
export interface FilaBarrido {
  camiones: number
  factor_acoplamiento: number
  produccion_t_h: number
  ic95_t_h: number
  utilizacion_palas: number
  utilizacion_chancador: number
  espera_pala_min: number
  espera_chancador_min: number
  ciclo_medio_min: number
  costo_usd_t: number
}

const promedio = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length

export function filaBarrido(base: Parametros, n: number, costos: Costos, replicas: Resultado[]): FilaBarrido {
  const p = { ...base, camiones: n }
  const [prod, semi] = intervalo(replicas.map((r) => r.produccionTH))
  return {
    camiones: n,
    factor_acoplamiento: factorAcoplamiento(p),
    produccion_t_h: prod,
    ic95_t_h: semi,
    utilizacion_palas: promedio(replicas.map((r) => r.utilizacionPalas)),
    utilizacion_chancador: promedio(replicas.map((r) => r.utilizacionChancador)),
    espera_pala_min: promedio(replicas.map((r) => r.esperaPala)),
    espera_chancador_min: promedio(replicas.map((r) => r.esperaChancador)),
    ciclo_medio_min: promedio(replicas.map((r) => r.cicloMedio).filter(Number.isFinite)),
    costo_usd_t: (n * costos.camionUsdH + p.palas * costos.palaUsdH) / prod,
  }
}

/** Para cada tamaño de flota, la producción con su intervalo, utilizaciones, esperas y costo por tonelada. */
export function barridoFlota(base: Parametros, camiones: number[], costos = COSTOS, nReplicas = 30, avisar?: (hechas: number) => void) {
  return camiones.map((n, k) => {
    const fila = filaBarrido(base, n, costos, replicar({ ...base, camiones: n }, nReplicas))
    avisar?.(k + 1)
    return fila
  })
}

export interface Comparacion {
  flotas: [number, number]
  difProduccion: number
  icDifProduccion: number
  difCosto: number
  icDifCosto: number
  correlacion: number
}

/** Diferencia pareada (b − a) de producción y costo por tonelada, réplica a réplica con iguales semillas. */
export function compararFlotas(base: Parametros, nA: number, nB: number, costos = COSTOS, nReplicas = 30): Comparacion {
  const a = replicar({ ...base, camiones: nA }, nReplicas).map((r) => r.produccionTH)
  const b = replicar({ ...base, camiones: nB }, nReplicas).map((r) => r.produccionTH)
  const costo = (prod: number, n: number) => (n * costos.camionUsdH + base.palas * costos.palaUsdH) / prod
  const [difProduccion, icDifProduccion] = intervalo(b.map((v, i) => v - a[i]))
  const [difCosto, icDifCosto] = intervalo(b.map((v, i) => costo(v, nB) - costo(a[i], nA)))
  const ma = promedio(a)
  const mb = promedio(b)
  const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0)
  const sa = Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0))
  const sb = Math.sqrt(b.reduce((s, v) => s + (v - mb) ** 2, 0))
  return { flotas: [nA, nB], difProduccion, icDifProduccion, difCosto, icDifCosto, correlacion: cov / (sa * sb) }
}

export interface ResumenEscenario {
  produccion: [media: number, semiancho: number]
  costo: [media: number, semiancho: number]
  utilizacionPalas: number
  utilizacionChancador: number
  disponibilidadPalas: number
  esperaPala: number
  esperaChancador: number
  cicloMedio: number
}

export interface ComparacionEscenarios {
  a: ResumenEscenario
  b: ResumenEscenario
  /** b − a, turno a turno con las mismas semillas, con su intervalo de 95 %. */
  difProduccion: number
  icDifProduccion: number
  difCosto: number
  icDifCosto: number
  replicas: number
}

/** Dos escenarios cualesquiera (otra flota, otra ruta, otras palas), con los mismos n turnos de azar cada uno. */
export function compararEscenarios(pa: Parametros, ca: Costos, pb: Parametros, cb: Costos, n = 30): ComparacionEscenarios {
  const resumir = (p: Parametros, c: Costos) => {
    const turnos = replicar(p, n)
    const prod = turnos.map((r) => r.produccionTH)
    const costo = prod.map((v) => (p.camiones * c.camionUsdH + p.palas * c.palaUsdH) / v)
    const resumen: ResumenEscenario = {
      produccion: intervalo(prod),
      costo: intervalo(costo),
      utilizacionPalas: promedio(turnos.map((r) => r.utilizacionPalas)),
      utilizacionChancador: promedio(turnos.map((r) => r.utilizacionChancador)),
      disponibilidadPalas: promedio(turnos.map((r) => r.disponibilidadPalas)),
      esperaPala: promedio(turnos.map((r) => r.esperaPala)),
      esperaChancador: promedio(turnos.map((r) => r.esperaChancador)),
      cicloMedio: promedio(turnos.map((r) => r.cicloMedio).filter(Number.isFinite)),
    }
    return { resumen, prod, costo }
  }
  const a = resumir(pa, ca)
  const b = resumir(pb, cb)
  const [difProduccion, icDifProduccion] = intervalo(b.prod.map((v, i) => v - a.prod[i]))
  const [difCosto, icDifCosto] = intervalo(b.costo.map((v, i) => v - a.costo[i]))
  return { a: a.resumen, b: b.resumen, difProduccion, icDifProduccion, difCosto, icDifCosto, replicas: n }
}

export interface Recomendacion {
  camionesMenorCosto: number
  costoMinimo: number
  produccionEnMenorCosto: number
  produccionMaxima: number
  camionesPara95: number
}

/** La flota más chica cuya producción media llega a la meta (en t/h); null si ninguna del barrido llega. */
export function flotaParaMeta(tabla: FilaBarrido[], metaTH: number): FilaBarrido | null {
  return [...tabla].sort((x, y) => x.camiones - y.camiones).find((f) => f.produccion_t_h >= metaTH) ?? null
}

/** La flota de menor costo por tonelada y la flota mínima que logra el 95 % de la producción máxima. */
export function recomendacion(tabla: FilaBarrido[], fraccion = 0.95): Recomendacion {
  const barata = tabla.reduce((m, f) => (f.costo_usd_t < m.costo_usd_t ? f : m))
  const maxima = Math.max(...tabla.map((f) => f.produccion_t_h))
  const suficiente = [...tabla].sort((x, y) => x.camiones - y.camiones).find((f) => f.produccion_t_h >= fraccion * maxima)!
  return {
    camionesMenorCosto: barata.camiones,
    costoMinimo: barata.costo_usd_t,
    produccionEnMenorCosto: barata.produccion_t_h,
    produccionMaxima: maxima,
    camionesPara95: suficiente.camiones,
  }
}
