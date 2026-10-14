// El modelo de eventos discretos de carguío y transporte: el mismo de src/carguio/modelo.py (SimPy), escrito en
// TypeScript para correr en el navegador y para animarlo. Ciclo de cada camión: elige la pala con menos camiones
// esperando, se posiciona y es cargado, viaja cargado al chancador, espera su turno, descarga y vuelve vacío. Las palas
// fallan al azar y quedan detenidas mientras se reparan. Todos los tiempos están en minutos.
import { Flujo } from './azar'

export type Tri = readonly [minimo: number, moda: number, maximo: number]
export type Normal = readonly [media: number, desviacion: number]

export interface Parametros {
  camiones: number
  palas: number
  capacidadT: number
  carga: Tri
  descarga: Tri
  acarreo: Normal
  retorno: Normal
  posicionamiento: number
  /** Tiempo medio entre fallas de una pala; null: sin fallas. */
  mtbfPala: number | null
  mttrPala: number
  turno: number
  calentamiento: number
}

/** Los valores por defecto del modelo de Python: ilustrativos, no de una faena real. */
export const PARAMETROS: Parametros = {
  camiones: 12,
  palas: 2,
  capacidadT: 220,
  carga: [2.5, 3.0, 4.0],
  descarga: [1.0, 1.2, 1.6],
  acarreo: [12.0, 1.5],
  retorno: [9.0, 1.0],
  posicionamiento: 0.7,
  mtbfPala: 480,
  mttrPala: 45,
  turno: 720,
  calentamiento: 60,
}

/** Lo que está mal en los parámetros, en palabras; vacío si están bien. */
export function errores(p: Parametros): string[] {
  const e: string[] = []
  const entero = (v: number) => Number.isInteger(v) && v >= 1
  if (!entero(p.camiones)) e.push('Los camiones deben ser un entero positivo.')
  if (!entero(p.palas)) e.push('Las palas deben ser un entero positivo.')
  const todos = [p.capacidadT, p.posicionamiento, p.turno, p.calentamiento, p.mttrPala, ...p.carga, ...p.descarga, ...p.acarreo, ...p.retorno]
  if (!todos.every(Number.isFinite)) e.push('Todos los valores deben ser números.')
  if (p.capacidadT <= 0) e.push('La capacidad del camión debe ser positiva.')
  if (p.posicionamiento < 0) e.push('El posicionamiento no puede ser negativo.')
  if (p.acarreo[0] < 0 || p.retorno[0] < 0) e.push('Los tiempos medios de viaje no pueden ser negativos.')
  if (p.acarreo[1] < 0 || p.retorno[1] < 0) e.push('Las desviaciones no pueden ser negativas.')
  if (!(p.calentamiento >= 0 && p.calentamiento < p.turno)) e.push('El calentamiento debe ser menor que el turno.')
  if (!(p.mttrPala > 0) || (p.mtbfPala !== null && !(p.mtbfPala > 0))) e.push('El tiempo entre fallas y el de reparación deben ser positivos.')
  for (const [nombre, [a, m, b]] of [
    ['La carga', p.carga],
    ['La descarga', p.descarga],
  ] as const)
    if (!(a >= 0 && a <= m && m <= b)) e.push(`${nombre} debe cumplir 0 ≤ mínimo ≤ moda ≤ máximo.`)
  if (e.length === 0 && cargaMedia(p) <= 0) e.push('La carga y el posicionamiento deben sumar un tiempo positivo.')
  return e
}

export const cargaMedia = (p: Parametros) => p.posicionamiento + (p.carga[0] + p.carga[1] + p.carga[2]) / 3
export const cicloSinColas = (p: Parametros) => cargaMedia(p) + p.acarreo[0] + (p.descarga[0] + p.descarga[1] + p.descarga[2]) / 3 + p.retorno[0]
/** Factor de acoplamiento (match factor): 1 es el equilibrio teórico entre camiones y palas. */
export const factorAcoplamiento = (p: Parametros) => (p.camiones * cargaMedia(p)) / (p.palas * cicloSinColas(p))

export interface Resultado {
  toneladas: number
  horasEfectivas: number
  ciclos: number
  /** Fracción del turno (después del calentamiento) que las palas pasan cargando. */
  utilizacionPalas: number
  utilizacionChancador: number
  /** Fracción del turno en que las palas no están en reparación. */
  disponibilidadPalas: number
  esperaPala: number
  esperaChancador: number
  cicloMedio: number
  produccionTH: number
}

// ---------------------------------------------------------------- el registro, para animar el turno
export type Tramo =
  | { tipo: 'cola_pala' | 'carga'; inicio: number; fin: number; pala: number }
  | { tipo: 'acarreo' | 'cola_chancador' | 'descarga'; inicio: number; fin: number; pala: number }
  | { tipo: 'retorno'; inicio: number; fin: number; pala: number; hacia: number | null }

export interface Registro {
  /** Lo que hizo cada camión, tramo por tramo. Las cargas, viajes y descargas tienen el fin que tendrían aunque
   * pasen del cierre del turno; una cola sin terminar queda hasta el cierre. */
  camiones: Tramo[][]
  /** Cuándo partió cada camión. */
  salidas: number[]
  /** Las reparaciones de cada pala: desde la falla, desde que empezó a repararse y hasta cuándo. */
  reparaciones: { falla: number; inicio: number; fin: number }[][]
  /** Cada descarga terminada: cuándo (para contar toneladas en el tiempo). */
  descargas: number[]
}

// ---------------------------------------------------------------- un motor mínimo de eventos discretos
type Orden = { esperar: number } | { pedir: Recurso; prioridad: number }

interface Evento {
  t: number
  n: number
  hacer: () => void
}

class Entorno {
  ahora = 0
  private eventos: Evento[] = []
  private n = 0

  programar(t: number, hacer: () => void) {
    const e = { t, n: this.n++, hacer }
    const h = this.eventos
    h.push(e)
    let i = h.length - 1
    while (i > 0) {
      const padre = (i - 1) >> 1
      if (antes(h[padre], e)) break
      h[i] = h[padre]
      i = padre
    }
    h[i] = e
  }

  private sacar(): Evento {
    const h = this.eventos
    const primero = h[0]
    const ultimo = h.pop()!
    if (h.length) {
      let i = 0
      for (;;) {
        const a = 2 * i + 1
        const b = a + 1
        let menor = i
        let valor = ultimo
        if (a < h.length && antes(h[a], valor)) {
          menor = a
          valor = h[a]
        }
        if (b < h.length && antes(h[b], valor)) menor = b
        if (menor === i) break
        h[i] = h[menor]
        i = menor
      }
      h[i] = ultimo
    }
    return primero
  }

  /** Corre los eventos anteriores a `hasta` (los que caen justo en `hasta` no, como run(until) de SimPy). */
  correr(hasta: number) {
    while (this.eventos.length && this.eventos[0].t < hasta) {
      const e = this.sacar()
      this.ahora = e.t
      e.hacer()
    }
    this.ahora = hasta
  }

  proceso(g: Generator<Orden, void, void>) {
    const seguir = () => {
      const r = g.next()
      if (r.done) return
      const o = r.value
      if ('esperar' in o) this.programar(this.ahora + o.esperar, seguir)
      else o.pedir.pedir(o.prioridad, seguir)
    }
    seguir()
  }
}

const antes = (x: Evento, y: Evento) => x.t < y.t || (x.t === y.t && x.n < y.n)

/** Un recurso con capacidad 1 y cola por prioridad (menor primero) y, a igual prioridad, por orden de llegada. */
class Recurso {
  usuarios = 0
  private cola: { prioridad: number; n: number; seguir: () => void }[] = []
  private n = 0
  constructor(private env: Entorno) {}

  get enCola() {
    return this.cola.length
  }

  pedir(prioridad: number, seguir: () => void) {
    if (this.usuarios < 1) {
      this.usuarios++
      this.env.programar(this.env.ahora, seguir)
      return
    }
    const pedido = { prioridad, n: this.n++, seguir }
    let i = this.cola.length
    while (i > 0 && (this.cola[i - 1].prioridad > prioridad || (this.cola[i - 1].prioridad === prioridad && this.cola[i - 1].n > pedido.n))) i--
    this.cola.splice(i, 0, pedido)
  }

  liberar() {
    const siguiente = this.cola.shift()
    if (siguiente) this.env.programar(this.env.ahora, siguiente.seguir)
    else this.usuarios--
  }
}

// ---------------------------------------------------------------- la mina
export function simular(p: Parametros, semilla = 0, registrar = false): Resultado & { registro?: Registro } {
  const env = new Entorno()
  const rngCarga = Array.from({ length: p.palas }, (_, i) => new Flujo(semilla, `carga-${i}`))
  const rngFallas = Array.from({ length: p.palas }, (_, i) => new Flujo(semilla, `fallas-${i}`))
  const rngViajes = Array.from({ length: p.camiones }, (_, j) => new Flujo(semilla, `viajes-${j}`))
  const rngDescarga = new Flujo(semilla, 'descarga')
  const palas = Array.from({ length: p.palas }, () => new Recurso(env))
  const chancador = new Recurso(env)
  const enReparacion = new Set<number>()
  const enCurso = new Map<string, number>()
  let ocupadoPalas = 0
  let detenidoPalas = 0
  let ocupadoChancador = 0
  let toneladas = 0
  let ciclos = 0
  const esperasPala: number[] = []
  const esperasChancador: number[] = []
  const duraciones: number[] = []
  const registro: Registro | undefined = registrar
    ? { camiones: Array.from({ length: p.camiones }, () => []), salidas: [], reparaciones: Array.from({ length: p.palas }, () => []), descargas: [] }
    : undefined

  const normal = (rng: Flujo, [media, desv]: Normal) => Math.max(0.1 * media, rng.normal(media, desv))
  const postCalentamiento = (inicio: number, fin: number) => Math.max(0, fin - Math.max(inicio, p.calentamiento))
  const abrir = (clave: string) => enCurso.set(clave, env.ahora)
  const cerrar = (clave: string) => {
    const inicio = enCurso.get(clave)!
    enCurso.delete(clave)
    return postCalentamiento(inicio, env.ahora)
  }
  const anotar = (j: number, tramo: Tramo) => registro?.camiones[j].push(tramo)
  const cerrarTramo = (j: number) => {
    const t = registro?.camiones[j].at(-1)
    if (t) t.fin = env.ahora
  }

  function* camion(j: number): Generator<Orden, void, void> {
    for (;;) {
      const inicioCiclo = env.ahora
      // despacho: entre las palas que no están en reparación, la con menos camiones en cola o cargando
      let operativas = palas.map((_, i) => i).filter((i) => !enReparacion.has(i))
      if (!operativas.length) operativas = palas.map((_, i) => i)
      let i = operativas[0]
      for (const k of operativas) if (palas[k].enCola + palas[k].usuarios < palas[i].enCola + palas[i].usuarios) i = k
      const anterior = registro?.camiones[j].at(-1)
      if (anterior?.tipo === 'retorno') anterior.hacia = i
      let llegada = env.ahora
      anotar(j, { tipo: 'cola_pala', inicio: env.ahora, fin: env.ahora, pala: i })
      yield { pedir: palas[i], prioridad: 1 }
      const esperaPala = env.ahora - llegada
      cerrarTramo(j)
      const carga = p.posicionamiento + rngCarga[i].triangular(p.carga)
      anotar(j, { tipo: 'carga', inicio: env.ahora, fin: env.ahora + carga, pala: i })
      abrir(`carga-${i}`)
      yield { esperar: carga }
      ocupadoPalas += cerrar(`carga-${i}`)
      palas[i].liberar()
      const acarreo = normal(rngViajes[j], p.acarreo)
      anotar(j, { tipo: 'acarreo', inicio: env.ahora, fin: env.ahora + acarreo, pala: i })
      yield { esperar: acarreo }
      llegada = env.ahora
      anotar(j, { tipo: 'cola_chancador', inicio: env.ahora, fin: env.ahora, pala: i })
      yield { pedir: chancador, prioridad: 0 }
      const esperaChancador = env.ahora - llegada
      cerrarTramo(j)
      const descarga = rngDescarga.triangular(p.descarga)
      anotar(j, { tipo: 'descarga', inicio: env.ahora, fin: env.ahora + descarga, pala: i })
      abrir('descarga')
      yield { esperar: descarga }
      ocupadoChancador += cerrar('descarga')
      chancador.liberar()
      registro?.descargas.push(env.ahora)
      if (env.ahora >= p.calentamiento) {
        toneladas += p.capacidadT
        ciclos++
        esperasPala.push(esperaPala)
        esperasChancador.push(esperaChancador)
      }
      const retorno = normal(rngViajes[j], p.retorno)
      anotar(j, { tipo: 'retorno', inicio: env.ahora, fin: env.ahora + retorno, pala: i, hacia: null })
      yield { esperar: retorno }
      if (inicioCiclo >= p.calentamiento) duraciones.push(env.ahora - inicioCiclo)
    }
  }

  function* fallas(i: number): Generator<Orden, void, void> {
    const rng = rngFallas[i]
    for (;;) {
      yield { esperar: rng.exponencial(p.mtbfPala!) }
      // desde la falla no se le despachan camiones; la reparación espera que termine la carga en curso
      enReparacion.add(i)
      const falla = env.ahora
      yield { pedir: palas[i], prioridad: 0 }
      abrir(`reparacion-${i}`)
      const duracion = rng.exponencial(p.mttrPala)
      registro?.reparaciones[i].push({ falla, inicio: env.ahora, fin: env.ahora + duracion })
      yield { esperar: duracion }
      detenidoPalas += cerrar(`reparacion-${i}`)
      palas[i].liberar()
      enReparacion.delete(i)
    }
  }

  for (let j = 0; j < p.camiones; j++) {
    // los camiones salen escalonados, como al inicio de un turno
    registro?.salidas.push(j * 0.5)
    env.programar(j * 0.5, () => env.proceso(camion(j)))
  }
  if (p.mtbfPala !== null) for (let i = 0; i < p.palas; i++) env.proceso(fallas(i))
  env.correr(p.turno)

  // cargas, descargas y reparaciones que siguen en curso al terminar el turno también cuentan
  for (const [clave, inicio] of enCurso) {
    const parcial = postCalentamiento(inicio, p.turno)
    if (clave.startsWith('carga')) ocupadoPalas += parcial
    else if (clave === 'descarga') ocupadoChancador += parcial
    else detenidoPalas += parcial
  }
  // una cola que sigue al cerrar el turno queda abierta hasta el cierre (las cargas y viajes ya tienen su fin)
  if (registro)
    for (const tramos of registro.camiones) {
      const ultimo = tramos.at(-1)
      if (ultimo && (ultimo.tipo === 'cola_pala' || ultimo.tipo === 'cola_chancador') && ultimo.fin <= ultimo.inicio) ultimo.fin = p.turno
    }
  const efectivo = p.turno - p.calentamiento
  const media = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0)
  const horasEfectivas = efectivo / 60
  return {
    toneladas,
    horasEfectivas,
    ciclos,
    utilizacionPalas: ocupadoPalas / (p.palas * efectivo),
    utilizacionChancador: ocupadoChancador / efectivo,
    disponibilidadPalas: 1 - detenidoPalas / (p.palas * efectivo),
    esperaPala: media(esperasPala),
    esperaChancador: media(esperasChancador),
    cicloMedio: duraciones.length ? media(duraciones) : Number.NaN,
    produccionTH: toneladas / horasEfectivas,
    registro,
  }
}
