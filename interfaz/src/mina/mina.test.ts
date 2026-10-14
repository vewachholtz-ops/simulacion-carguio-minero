// «Tu mina»: el archivo del escenario (el mismo que lee Python), las flotas que se barren, la ruta por distancia y el
// Excel que se descarga.
import { strFromU8, unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aArchivo, deArchivo } from '../lib/archivo'
import { EJEMPLO, esPorDefecto, flotasABarrer, tiemposDeRuta } from '../lib/escenario'
import { libroExcel } from '../lib/excel'
import { hojaBarrido, hojaEscenario } from '../lib/exportar'
import { compararEscenarios, flotaParaMeta } from '../modelo/experimento'
import { PARAMETROS } from '../modelo/simulacion'
import { desdeEscenario, enBlanco, leer, leerNumero } from './textos'

const MINA_NORTE = JSON.parse(readFileSync(new URL('../../../tests/datos/mina-norte.json', import.meta.url), 'utf8'))

describe('el archivo del escenario', () => {
  it('lee el mismo JSON que tests/test_escenario.py y lo vuelve a escribir igual', () => {
    const e = deArchivo(MINA_NORTE)
    expect(e.nombre).toBe('Mina Norte (inventada)')
    expect(e.parametros.palas).toBe(3)
    expect(e.parametros.carga).toEqual([2, 2.5, 3.2])
    expect(e.meta).toBe(60000)
    expect(e.ruta?.distanciaKm).toBe(4.2)
    expect(aArchivo(e)).toEqual(MINA_NORTE)
  })

  it('la mina de ejemplo usa los nombres de Python', () => {
    const a = aArchivo(EJEMPLO)
    expect(a.parametros.n_camiones).toBe(12)
    expect(a.parametros.mtbf_pala_min).toBe(480)
    expect(deArchivo(JSON.parse(JSON.stringify(a)))).toEqual(EJEMPLO)
  })

  it('dice qué falta o qué está mal', () => {
    expect(() => deArchivo({ hola: 1 })).toThrow(/no es un escenario/)
    const sinCapacidad = structuredClone(MINA_NORTE)
    delete sinCapacidad.parametros.capacidad_t
    expect(() => deArchivo(sinCapacidad)).toThrow(/capacidad_t/)
    const malo = structuredClone(MINA_NORTE)
    malo.parametros.carga_min = [3, 2, 4]
    expect(() => deArchivo(malo)).toThrow(/mínimo ≤ moda ≤ máximo/)
  })
})

describe('las flotas y la ruta', () => {
  it('barre las mismas flotas que rango_flota() de Python', () => {
    expect(flotasABarrer(deArchivo(MINA_NORTE).parametros, false)).toEqual(Array.from({ length: 15 }, (_, i) => 6 + 2 * i))
    expect(flotasABarrer(PARAMETROS, true)).toEqual(Array.from({ length: 21 }, (_, i) => i + 4))
    expect(esPorDefecto(EJEMPLO)).toBe(true)
    expect(esPorDefecto({ ...EJEMPLO, parametros: { ...PARAMETROS, camiones: 20 } })).toBe(true)
    expect(esPorDefecto({ ...EJEMPLO, parametros: { ...PARAMETROS, palas: 3 } })).toBe(false)
  })

  it('pasa la distancia y las velocidades a minutos', () => {
    const t = tiemposDeRuta({ distanciaKm: 4.2, velocidadCargadoKmH: 28, velocidadVacioKmH: 40, variacion: 0.12 })
    expect(t.acarreo).toEqual([9, 1.08])
    expect(t.retorno).toEqual([6.3, 0.76])
  })

  it('la flota para la meta es la más chica que llega', () => {
    const tabla = [8, 10, 12].map((camiones, i) => ({ camiones, produccion_t_h: [3000, 4500, 5200][i] }))
    expect(flotaParaMeta(tabla as never, 4000)?.camiones).toBe(10)
    expect(flotaParaMeta(tabla as never, 6000)).toBeNull()
  })

  it('dos escenarios con el mismo azar: el que tiene más camiones produce más', () => {
    const c = compararEscenarios({ ...PARAMETROS, camiones: 8 }, EJEMPLO.costos, { ...PARAMETROS, camiones: 12 }, EJEMPLO.costos, 10)
    expect(c.difProduccion).toBeGreaterThan(0)
    expect(c.difProduccion - c.icDifProduccion).toBeGreaterThan(0)
    expect(c.a.produccion[0]).toBeLessThan(c.b.produccion[0])
  })
})

describe('el formulario', () => {
  it('ida y vuelta: el formulario de un escenario da el mismo escenario', () => {
    expect(leer(desdeEscenario(EJEMPLO)).escenario).toEqual(EJEMPLO)
    const norte = deArchivo(MINA_NORTE)
    expect(leer(desdeEscenario(norte)).escenario).toEqual(norte)
  })

  it('en blanco dice qué falta, y con todo lleno arma la mina', () => {
    const f = enBlanco()
    const r = leer(f)
    expect(r.escenario).toBeNull()
    expect(r.faltan).toContain('camiones')
    expect(r.faltan).toContain('distancia al chancador')
    expect(r.faltan).not.toContain('duración del turno')
    const lleno = {
      ...f,
      textos: {
        ...f.textos,
        camiones: '18',
        palas: '3',
        capacidadT: '240',
        posicionamiento: '0,6',
        carga0: '2',
        carga1: '2,5',
        carga2: '3,2',
        distanciaKm: '4,2',
        velocidadCargado: '28',
        velocidadVacio: '40',
        descarga0: '0,8',
        descarga1: '1',
        descarga2: '1,4',
        mtbfH: '10',
        mttr: '40',
        meta: '60.000',
      },
    }
    const e = leer(lleno).escenario!
    expect(e.parametros.acarreo).toEqual([9, 1.08])
    expect(e.parametros.mtbfPala).toBe(600)
    expect(e.meta).toBe(60000)
  })

  it('lee números con coma o punto, y los miles con punto', () => {
    expect(leerNumero('4,2')).toBe(4.2)
    expect(leerNumero('4.2')).toBe(4.2)
    expect(leerNumero('60.000')).toBe(60000)
    expect(leerNumero('')).toBeNull()
    expect(leerNumero('abc')).toBeNull()
  })

  it('explica lo que no tiene sentido', () => {
    const f = desdeEscenario(EJEMPLO)
    expect(leer({ ...f, textos: { ...f.textos, carga0: '5' } }).problemas.join(' ')).toMatch(/mínimo ≤ moda ≤ máximo/)
    expect(leer({ ...f, textos: { ...f.textos, camiones: '2,5' } }).problemas.join(' ')).toMatch(/entero/)
  })
})

describe('el Excel', () => {
  it('trae una hoja por tabla, con números como números', () => {
    const fila = {
      camiones: 12,
      factor_acoplamiento: 0.9,
      produccion_t_h: 5000.5,
      ic95_t_h: 80,
      utilizacion_palas: 0.8,
      utilizacion_chancador: 0.5,
      espera_pala_min: 1.2,
      espera_chancador_min: 0.3,
      ciclo_medio_min: 28,
      costo_usd_t: 1.2,
    }
    const zip = unzipSync(libroExcel([hojaEscenario(EJEMPLO), hojaBarrido([fila], 720)]))
    const libro = strFromU8(zip['xl/workbook.xml'])
    expect(libro).toContain('name="Escenario"')
    expect(libro).toContain('name="Flota"')
    const flota = strFromU8(zip['xl/worksheets/sheet2.xml'])
    expect(flota).toContain('<c r="C2"><v>5000.5</v></c>')
    // la producción por turno: 5.000,5 t/h × 12 h
    expect(flota).toContain('<c r="E2"><v>60006</v></c>')
    expect(strFromU8(zip['xl/worksheets/sheet1.xml'])).toContain('Mina de ejemplo')
  })
})
