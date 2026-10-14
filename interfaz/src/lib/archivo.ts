// Un escenario como archivo: el mismo JSON sirve para guardarlo en este navegador, compartirlo en un enlace,
// descargarlo y correrlo en la versión Python (uv run carguio --escenario mi-mina.json). Los nombres de los campos son
// los de src/carguio/modelo.py, con la unidad al final.
import { COSTOS } from '../modelo/experimento'
import { errores, type Parametros } from '../modelo/simulacion'
import type { Escenario, Ruta } from './escenario'

export const FORMATO = 'rajo-escenario/1'

export interface ArchivoEscenario {
  formato: typeof FORMATO
  nombre: string
  parametros: {
    n_camiones: number
    n_palas: number
    capacidad_t: number
    carga_min: [number, number, number]
    descarga_min: [number, number, number]
    acarreo_min: [number, number]
    retorno_min: [number, number]
    posicionamiento_min: number
    mtbf_pala_min: number | null
    mttr_pala_min: number
    turno_min: number
    calentamiento_min: number
  }
  costos: { camion_usd_h: number; pala_usd_h: number }
  meta_t_turno: number | null
  ruta: { distancia_km: number; velocidad_cargado_km_h: number; velocidad_vacio_km_h: number; variacion: number } | null
}

export function aArchivo(e: Escenario): ArchivoEscenario {
  const p = e.parametros
  return {
    formato: FORMATO,
    nombre: e.nombre,
    parametros: {
      n_camiones: p.camiones,
      n_palas: p.palas,
      capacidad_t: p.capacidadT,
      carga_min: [...p.carga],
      descarga_min: [...p.descarga],
      acarreo_min: [...p.acarreo],
      retorno_min: [...p.retorno],
      posicionamiento_min: p.posicionamiento,
      mtbf_pala_min: p.mtbfPala,
      mttr_pala_min: p.mttrPala,
      turno_min: p.turno,
      calentamiento_min: p.calentamiento,
    },
    costos: { camion_usd_h: e.costos.camionUsdH, pala_usd_h: e.costos.palaUsdH },
    meta_t_turno: e.meta,
    ruta: e.ruta && {
      distancia_km: e.ruta.distanciaKm,
      velocidad_cargado_km_h: e.ruta.velocidadCargadoKmH,
      velocidad_vacio_km_h: e.ruta.velocidadVacioKmH,
      variacion: e.ruta.variacion,
    },
  }
}

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numeros = (v: unknown, n: number): number[] | null => (Array.isArray(v) && v.length === n && v.every(esNumero) ? v : null)

/** Lee un escenario desde su JSON; si algo falta o no tiene sentido, lanza un error que se puede mostrar tal cual. */
export function deArchivo(x: unknown): Escenario {
  if (!x || typeof x !== 'object') throw new Error('El archivo no es un escenario de Tolva.')
  const a = x as Partial<ArchivoEscenario>
  if (a.formato !== FORMATO) throw new Error('El archivo no es un escenario de Tolva (falta «formato»: «rajo-escenario/1»).')
  const q = (a.parametros ?? {}) as Partial<ArchivoEscenario['parametros']>
  const faltan: string[] = []
  const num = (nombre: keyof ArchivoEscenario['parametros']) => {
    const v = q[nombre]
    if (!esNumero(v)) faltan.push(nombre)
    return v as number
  }
  const lista = <N extends 2 | 3>(nombre: keyof ArchivoEscenario['parametros'], n: N) => {
    const v = numeros(q[nombre], n)
    if (!v) faltan.push(nombre)
    return (v ?? []) as N extends 3 ? [number, number, number] : [number, number]
  }
  const parametros: Parametros = {
    camiones: num('n_camiones'),
    palas: num('n_palas'),
    capacidadT: num('capacidad_t'),
    carga: lista('carga_min', 3),
    descarga: lista('descarga_min', 3),
    acarreo: lista('acarreo_min', 2),
    retorno: lista('retorno_min', 2),
    posicionamiento: num('posicionamiento_min'),
    mtbfPala: q.mtbf_pala_min === null ? null : num('mtbf_pala_min'),
    mttrPala: num('mttr_pala_min'),
    turno: num('turno_min'),
    calentamiento: num('calentamiento_min'),
  }
  if (faltan.length) throw new Error(`Al escenario le faltan datos: ${faltan.join(', ')}.`)
  const mal = errores(parametros)
  if (mal.length) throw new Error(mal.join(' '))
  const costos = {
    camionUsdH: esNumero(a.costos?.camion_usd_h) ? a.costos.camion_usd_h : COSTOS.camionUsdH,
    palaUsdH: esNumero(a.costos?.pala_usd_h) ? a.costos.pala_usd_h : COSTOS.palaUsdH,
  }
  if (costos.camionUsdH < 0 || costos.palaUsdH < 0) throw new Error('Los costos no pueden ser negativos.')
  const r = a.ruta
  const ruta: Ruta | null =
    r && esNumero(r.distancia_km) && esNumero(r.velocidad_cargado_km_h) && esNumero(r.velocidad_vacio_km_h) && esNumero(r.variacion)
      ? { distanciaKm: r.distancia_km, velocidadCargadoKmH: r.velocidad_cargado_km_h, velocidadVacioKmH: r.velocidad_vacio_km_h, variacion: r.variacion }
      : null
  return {
    nombre: typeof a.nombre === 'string' && a.nombre.trim() ? a.nombre.trim().slice(0, 80) : 'Mina sin nombre',
    parametros,
    costos,
    meta: esNumero(a.meta_t_turno) && a.meta_t_turno > 0 ? a.meta_t_turno : null,
    ruta,
  }
}

// ---------------------------------------------------------------- en un enlace
const aBase64Url = (texto: string) => {
  const bytes = new TextEncoder().encode(texto)
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
const deBase64Url = (texto: string) => {
  const binario = atob(texto.replaceAll('-', '+').replaceAll('_', '/'))
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)))
}

/** El enlace a esta página con el escenario adentro (#mina=…): no pasa por ningún servidor. */
export function enlace(e: Escenario) {
  const base = location.href.split('#')[0]
  return `${base}#mina=${aBase64Url(JSON.stringify(aArchivo(e)))}`
}

/** El escenario que viene en la dirección, si viene uno. */
export function desdeEnlace(hash: string): Escenario | null {
  const m = /[#&]mina=([A-Za-z0-9_-]+)/.exec(hash)
  if (!m) return null
  return deArchivo(JSON.parse(deBase64Url(m[1])))
}

let apertura: { nombre: string } | { error: string } | null = null

/** Al cargar la página: si la dirección trae una mina, la abre (antes de dibujar nada). */
export function abrirDesdeLaDireccion(usar: (e: Escenario) => void) {
  try {
    const e = desdeEnlace(location.hash)
    if (e) {
      usar(e)
      apertura = { nombre: e.nombre }
    }
  } catch (err) {
    apertura = { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Qué pasó con la mina del enlace, si venía una (para avisarlo una vez). */
export const aperturaInicial = () => apertura

// ---------------------------------------------------------------- guardados en este navegador
const CLAVE = 'rajo.escenarios'

export interface Guardado {
  archivo: ArchivoEscenario
  guardado: string
}

export function guardados(): Guardado[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? '[]')
    return Array.isArray(v) ? v.filter((g) => g?.archivo?.formato === FORMATO) : []
  } catch {
    return []
  }
}

function escribir(lista: Guardado[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista))
    return true
  } catch {
    return false
  }
}

/** Guarda el escenario con su nombre (reemplaza el que tenía el mismo nombre). Devuelve false si el navegador no deja. */
export function guardar(e: Escenario) {
  const lista = guardados().filter((g) => g.archivo.nombre !== e.nombre)
  return escribir([{ archivo: aArchivo(e), guardado: new Date().toISOString() }, ...lista])
}

export function borrar(nombre: string) {
  return escribir(guardados().filter((g) => g.archivo.nombre !== nombre))
}

/** Un nombre de archivo a partir del nombre del escenario: «Mina Norte 2» → «mina-norte-2». */
export function nombreArchivo(nombre: string) {
  return (
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'escenario'
  )
}

export function descargar(nombre: string, contenido: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
