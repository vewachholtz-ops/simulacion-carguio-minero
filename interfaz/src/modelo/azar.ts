// Números aleatorios con semilla. Un generador por fuente de azar y por equipo (la pala i, el camión j...), como en
// el modelo de Python: la carga k-ésima de una pala dura lo mismo en cualquier tamaño de flota, así que al comparar
// flotas con la misma semilla la diferencia viene de la flota y no del azar (números aleatorios comunes).
//
// El generador es sfc32 (rápido y con buena calidad estadística); cada flujo parte de la semilla y de un rótulo que
// se mezclan con splitmix32. No reproduce los números de NumPy: la app y Python dan resultados estadísticamente
// iguales, no idénticos (lo comprueban las pruebas contra resultados/barrido-flota.csv).

function splitmix32(a: number) {
  return () => {
    a = (a + 0x9e3779b9) | 0
    let z = a
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
}

function hash(texto: string, semilla: number) {
  let h = (semilla ^ 0x811c9dc5) >>> 0
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0
  return h
}

export class Flujo {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(semilla: number, rotulo: string) {
    const mezcla = splitmix32(hash(rotulo, semilla >>> 0) ^ Math.imul(semilla | 0, 0x27d4eb2d))
    this.a = mezcla()
    this.b = mezcla()
    this.c = mezcla()
    this.d = mezcla()
    for (let i = 0; i < 12; i++) this.uniforme() // descarta los primeros
  }

  /** Uniforme en [0, 1). */
  uniforme(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0
    this.d = (this.d + 1) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.c = (this.c + t) | 0
    return (t >>> 0) / 4294967296
  }

  /** Triangular (mínimo, moda, máximo), por la inversa de la distribución acumulada. */
  triangular([a, m, b]: readonly [number, number, number]): number {
    if (a === b) return a
    const u = this.uniforme()
    const corte = (m - a) / (b - a)
    return u < corte ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m))
  }

  /** Normal (Box-Muller). Gasta siempre dos uniformes, para que cada sorteo use los mismos números en cualquier
   * escenario. */
  normal(media: number, desviacion: number): number {
    const u1 = this.uniforme()
    const u2 = this.uniforme()
    if (desviacion === 0) return media
    return media + desviacion * Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2)
  }

  exponencial(media: number): number {
    return -media * Math.log(1 - this.uniforme())
  }
}
