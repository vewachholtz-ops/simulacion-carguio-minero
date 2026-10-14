// El formulario de «Tu mina» trabaja con textos (lo que la persona escribe, con coma decimal) y los pasa a un
// escenario solo cuando todo está completo y tiene sentido. Mientras falte algo, la página sigue con el último
// escenario que servía.
import type { Escenario, Ruta } from '../lib/escenario'
import { tiemposDeRuta } from '../lib/escenario'
import { errores, type Parametros } from '../modelo/simulacion'

export type Clave =
  | 'camiones'
  | 'palas'
  | 'capacidadT'
  | 'posicionamiento'
  | 'carga0'
  | 'carga1'
  | 'carga2'
  | 'acarreo0'
  | 'acarreo1'
  | 'retorno0'
  | 'retorno1'
  | 'distanciaKm'
  | 'velocidadCargado'
  | 'velocidadVacio'
  | 'variacionPct'
  | 'descarga0'
  | 'descarga1'
  | 'descarga2'
  | 'mtbfH'
  | 'mttr'
  | 'turnoH'
  | 'calentamiento'
  | 'camionUsdH'
  | 'palaUsdH'
  | 'meta'

export type Textos = Record<Clave, string>

export interface Formulario {
  nombre: string
  textos: Textos
  modoRuta: 'tiempos' | 'distancia'
  conFallas: boolean
}

/** Cómo se llama cada dato al decir que falta. */
export const NOMBRES: Record<Clave, string> = {
  camiones: 'camiones',
  palas: 'palas',
  capacidadT: 'capacidad del camión',
  posicionamiento: 'posicionamiento',
  carga0: 'carga mínima',
  carga1: 'carga más común',
  carga2: 'carga máxima',
  acarreo0: 'acarreo medio',
  acarreo1: 'variación del acarreo',
  retorno0: 'retorno medio',
  retorno1: 'variación del retorno',
  distanciaKm: 'distancia al chancador',
  velocidadCargado: 'velocidad cargado',
  velocidadVacio: 'velocidad vacío',
  variacionPct: 'variación de los viajes',
  descarga0: 'descarga mínima',
  descarga1: 'descarga más común',
  descarga2: 'descarga máxima',
  mtbfH: 'tiempo entre fallas',
  mttr: 'tiempo de reparación',
  turnoH: 'duración del turno',
  calentamiento: 'tiempo sin contar al inicio',
  camionUsdH: 'costo del camión',
  palaUsdH: 'costo de la pala',
  meta: 'meta',
}

const redondear = (v: number, decimales = 4) => Math.round(v * 10 ** decimales) / 10 ** decimales
export const aTexto = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(redondear(v)).replace('.', ','))

/** «4,2» y «4.2» son 4,2; «60.000» y «1.100» (grupos de tres) son miles. */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '')
  if (!t) return null
  const normal = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replaceAll('.', '') : t.replace(',', '.')
  const v = Number(normal)
  return Number.isFinite(v) ? v : null
}

export function desdeEscenario(e: Escenario): Formulario {
  const p = e.parametros
  const r = e.ruta
  return {
    nombre: e.nombre,
    modoRuta: r ? 'distancia' : 'tiempos',
    conFallas: p.mtbfPala !== null,
    textos: {
      camiones: aTexto(p.camiones),
      palas: aTexto(p.palas),
      capacidadT: aTexto(p.capacidadT),
      posicionamiento: aTexto(p.posicionamiento),
      carga0: aTexto(p.carga[0]),
      carga1: aTexto(p.carga[1]),
      carga2: aTexto(p.carga[2]),
      acarreo0: aTexto(p.acarreo[0]),
      acarreo1: aTexto(p.acarreo[1]),
      retorno0: aTexto(p.retorno[0]),
      retorno1: aTexto(p.retorno[1]),
      distanciaKm: aTexto(r?.distanciaKm ?? null),
      velocidadCargado: aTexto(r?.velocidadCargadoKmH ?? null),
      velocidadVacio: aTexto(r?.velocidadVacioKmH ?? null),
      variacionPct: aTexto(r ? r.variacion * 100 : 12),
      descarga0: aTexto(p.descarga[0]),
      descarga1: aTexto(p.descarga[1]),
      descarga2: aTexto(p.descarga[2]),
      mtbfH: aTexto(p.mtbfPala === null ? 8 : p.mtbfPala / 60),
      mttr: aTexto(p.mttrPala),
      turnoH: aTexto(p.turno / 60),
      calentamiento: aTexto(p.calentamiento),
      camionUsdH: aTexto(e.costos.camionUsdH),
      palaUsdH: aTexto(e.costos.palaUsdH),
      meta: aTexto(e.meta),
    },
  }
}

/** Una mina en blanco: solo quedan el turno de 12 horas, los costos de referencia y la variación típica de los viajes. */
export function enBlanco(): Formulario {
  const vacio = Object.fromEntries(Object.keys(NOMBRES).map((k) => [k, ''])) as Textos
  return {
    nombre: 'Mi mina',
    modoRuta: 'distancia',
    conFallas: true,
    textos: { ...vacio, variacionPct: '12', turnoH: '12', calentamiento: '60', camionUsdH: '350', palaUsdH: '900' },
  }
}

/** Los datos que hay que llenar según cómo se describe la ruta y si hay fallas. */
export function claves(f: Pick<Formulario, 'modoRuta' | 'conFallas'>): Clave[] {
  const ruta: Clave[] = f.modoRuta === 'distancia' ? ['distanciaKm', 'velocidadCargado', 'velocidadVacio', 'variacionPct'] : ['acarreo0', 'acarreo1', 'retorno0', 'retorno1']
  return [
    'camiones',
    'palas',
    'capacidadT',
    'posicionamiento',
    'carga0',
    'carga1',
    'carga2',
    ...ruta,
    'descarga0',
    'descarga1',
    'descarga2',
    ...(f.conFallas ? (['mtbfH', 'mttr'] as Clave[]) : []),
    'turnoH',
    'calentamiento',
    'camionUsdH',
    'palaUsdH',
  ]
}

export type Lectura = { escenario: Escenario; faltan: []; problemas: [] } | { escenario: null; faltan: string[]; problemas: string[] }

/** Pasa el formulario a un escenario, o dice qué falta y qué no tiene sentido. */
export function leer(f: Formulario): Lectura {
  const v: Partial<Record<Clave, number>> = {}
  const faltan: string[] = []
  const problemas: string[] = []
  for (const k of claves(f)) {
    const n = leerNumero(f.textos[k])
    if (n === null) faltan.push(NOMBRES[k])
    else v[k] = n
  }
  const meta = f.textos.meta.trim() ? leerNumero(f.textos.meta) : null
  if (f.textos.meta.trim() && (meta === null || meta <= 0)) problemas.push('La meta tiene que ser un número de toneladas mayor que cero (o déjala vacía).')
  if (faltan.length) return { escenario: null, faltan, problemas }

  const n = v as Record<Clave, number>
  let ruta: Ruta | null = null
  let acarreo: [number, number] = [n.acarreo0, n.acarreo1]
  let retorno: [number, number] = [n.retorno0, n.retorno1]
  if (f.modoRuta === 'distancia') {
    if (!(n.distanciaKm > 0)) problemas.push('La distancia tiene que ser mayor que cero.')
    if (!(n.velocidadCargado > 0 && n.velocidadVacio > 0)) problemas.push('Las velocidades tienen que ser mayores que cero.')
    if (!(n.variacionPct >= 0 && n.variacionPct <= 100)) problemas.push('La variación de los viajes va de 0 a 100 %.')
    if (!problemas.length) {
      ruta = { distanciaKm: n.distanciaKm, velocidadCargadoKmH: n.velocidadCargado, velocidadVacioKmH: n.velocidadVacio, variacion: n.variacionPct / 100 }
      ;({ acarreo, retorno } = tiemposDeRuta(ruta))
    }
  }
  if (!(n.camiones <= 200)) problemas.push('Hasta 200 camiones.')
  if (!(n.palas <= 8)) problemas.push('Hasta 8 palas.')
  if (!(n.turnoH > 0 && n.turnoH <= 24)) problemas.push('El turno dura entre 0 y 24 horas.')
  if (n.camionUsdH < 0 || n.palaUsdH < 0) problemas.push('Los costos no pueden ser negativos.')
  const parametros: Parametros = {
    camiones: n.camiones,
    palas: n.palas,
    capacidadT: n.capacidadT,
    carga: [n.carga0, n.carga1, n.carga2],
    descarga: [n.descarga0, n.descarga1, n.descarga2],
    acarreo,
    retorno,
    posicionamiento: n.posicionamiento,
    mtbfPala: f.conFallas ? redondear(n.mtbfH * 60) : null,
    mttrPala: f.conFallas ? n.mttr : (leerNumero(f.textos.mttr) ?? 45),
    turno: redondear(n.turnoH * 60),
    calentamiento: n.calentamiento,
  }
  problemas.push(...errores(parametros))
  if (problemas.length) return { escenario: null, faltan: [], problemas }
  return {
    escenario: { nombre: f.nombre.trim() || 'Mi mina', parametros, costos: { camionUsdH: n.camionUsdH, palaUsdH: n.palaUsdH }, meta, ruta },
    faltan: [],
    problemas: [],
  }
}
