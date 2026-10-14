// El modelo de la app contra el de Python: los mismos casos a mano de tests/test_modelo.py y, con los parámetros por
// defecto, un barrido de flota estadísticamente igual al publicado en resultados/barrido-flota.csv.
import { csvParse } from 'd3-dsv'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { barridoFlota, compararFlotas, intervalo, recomendacion, replicar, tCuantil } from './experimento'
import { cargaMedia, cicloSinColas, errores, factorAcoplamiento, PARAMETROS, type Parametros, simular } from './simulacion'

// sin azar y sin fallas: el resultado se puede calcular a mano
const DETERMINISTA: Parametros = {
  ...PARAMETROS,
  camiones: 1,
  palas: 1,
  capacidadT: 100,
  carga: [3, 3, 3],
  descarga: [1, 1, 1],
  acarreo: [10, 0],
  retorno: [6, 0],
  posicionamiento: 0,
  mtbfPala: null,
  turno: 600,
  calentamiento: 0,
}

describe('casos calculados a mano', () => {
  it('un camión sin azar', () => {
    const r = simular(DETERMINISTA)
    const ciclo = 3 + 10 + 1 + 6
    // descarga k-ésima en 14 + 20k minutos; cuentan las que terminan dentro del turno
    const descargas = Math.floor((600 - 14) / ciclo) + 1
    expect(r.ciclos).toBe(descargas)
    expect(r.toneladas).toBe(descargas * 100)
    expect(r.esperaPala).toBe(0)
    expect(r.esperaChancador).toBe(0)
    expect(r.utilizacionPalas).toBeCloseTo((descargas * 3) / 600, 2)
  })

  it('el calentamiento no se cuenta', () => {
    const r = simular({ ...DETERMINISTA, calentamiento: 100 })
    expect(r.ciclos).toBe(25)
    expect(r.toneladas).toBe(2500)
    expect(r.utilizacionPalas).toBeCloseTo((25 * 3) / 500, 10)
    expect(r.cicloMedio).toBeCloseTo(20, 10)
    expect(r.disponibilidadPalas).toBe(1)
  })

  it('el registro del turno sigue el ciclo del camión', () => {
    const { registro } = simular(DETERMINISTA, 0, true)
    const tramos = registro!.camiones[0]
    expect(tramos.slice(0, 6).map((t) => [t.tipo, t.inicio, t.fin])).toEqual([
      ['cola_pala', 0, 0],
      ['carga', 0, 3],
      ['acarreo', 3, 13],
      ['cola_chancador', 13, 13],
      ['descarga', 13, 14],
      ['retorno', 14, 20],
    ])
    expect(registro!.descargas.slice(0, 3)).toEqual([14, 34, 54])
  })

  it('el factor de acoplamiento', () => {
    expect(factorAcoplamiento({ ...DETERMINISTA, camiones: 4, palas: 2 })).toBeCloseTo((4 * 3) / (2 * 20), 12)
    expect(cargaMedia(PARAMETROS)).toBeCloseTo(0.7 + 9.5 / 3, 12)
    expect(cicloSinColas(PARAMETROS)).toBeCloseTo(cargaMedia(PARAMETROS) + 12 + 3.8 / 3 + 9, 12)
  })

  it('el intervalo t de Student', () => {
    expect(tCuantil(0.975, 4)).toBeCloseTo(2.776445, 5)
    expect(tCuantil(0.975, 29)).toBeCloseTo(2.045230, 5)
    const [media, semi] = intervalo([1, 2, 3, 4, 5])
    expect(media).toBe(3)
    expect(semi).toBeCloseTo((2.776445 * 1.581139) / Math.sqrt(5), 4)
  })

  it('rechaza parámetros que no tienen sentido', () => {
    expect(errores(PARAMETROS)).toEqual([])
    expect(errores({ ...PARAMETROS, camiones: 0 })).not.toEqual([])
    expect(errores({ ...PARAMETROS, carga: [3, 2, 4] })).not.toEqual([])
    expect(errores({ ...PARAMETROS, calentamiento: 720 })).not.toEqual([])
  })
})

describe('propiedades del modelo', () => {
  it('la misma semilla da el mismo turno', () => {
    expect(simular(PARAMETROS, 7)).toEqual(simular(PARAMETROS, 7))
    expect(simular(PARAMETROS, 7).toneladas).not.toBe(simular(PARAMETROS, 8).toneladas)
  })

  it('con las palas saturadas la producción es su capacidad', () => {
    const p = { ...PARAMETROS, camiones: 30, mtbfPala: null }
    const [media] = intervalo(replicar(p, 10).map((r) => r.produccionTH))
    const capacidad = (p.palas * p.capacidadT * 60) / cargaMedia(p)
    expect(Math.abs(media / capacidad - 1)).toBeLessThan(0.02)
  })

  it('los indicadores quedan en rangos válidos', () => {
    for (let s = 0; s < 5; s++) {
      const r = simular(PARAMETROS, s)
      for (const v of [r.utilizacionPalas, r.utilizacionChancador, r.disponibilidadPalas]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1)
      expect(r.cicloMedio).toBeGreaterThanOrEqual(cicloSinColas(PARAMETROS) * 0.8)
    }
  })

  it('un chancador lento se vuelve el cuello de botella', () => {
    const r = simular({ ...PARAMETROS, palas: 3, camiones: 24, descarga: [4, 4.5, 5], mtbfPala: null }, 1)
    expect(r.utilizacionChancador).toBeGreaterThan(0.95)
    expect(r.esperaChancador).toBeGreaterThan(r.esperaPala)
  })

  it('números aleatorios comunes: flotas parecidas dan turnos muy correlacionados', () => {
    const c = compararFlotas(PARAMETROS, 13, 14, undefined, 20)
    expect(c.correlacion).toBeGreaterThan(0.6)
    expect(c.difProduccion).toBeGreaterThan(0)
  })
})

describe('igual que la versión Python', () => {
  // Las dos versiones usan generadores de azar distintos: no dan los mismos turnos, dan los mismos promedios.
  // referencia-python.json tiene los promedios de Python con 300 turnos por flota (scripts/referencia_web.py).
  const referencia = JSON.parse(readFileSync(new URL('./referencia-python.json', import.meta.url), 'utf8')) as {
    replicas: number
    flotas: Record<string, Record<string, { media: number; desviacion: number }>>
  }
  const INDICADOR: Record<string, (r: ReturnType<typeof simular>) => number> = {
    produccion_t_h: (r) => r.produccionTH,
    utilizacion_palas: (r) => r.utilizacionPalas,
    utilizacion_chancador: (r) => r.utilizacionChancador,
    disponibilidad_palas: (r) => r.disponibilidadPalas,
    espera_pala_min: (r) => r.esperaPala,
    espera_chancador_min: (r) => r.esperaChancador,
    ciclo_medio_min: (r) => r.cicloMedio,
  }

  for (const [flota, indicadores] of Object.entries(referencia.flotas))
    it(`${flota} camiones: los mismos promedios y la misma variabilidad con ${referencia.replicas} turnos`, () => {
      const turnos = replicar({ ...PARAMETROS, camiones: Number(flota) }, referencia.replicas)
      for (const [nombre, py] of Object.entries(indicadores)) {
        const valores = turnos.map(INDICADOR[nombre])
        const media = valores.reduce((a, b) => a + b, 0) / valores.length
        const desviacion = Math.sqrt(valores.reduce((a, b) => a + (b - media) ** 2, 0) / (valores.length - 1))
        // dos medias independientes: la diferencia tiene un error estándar de √(ee₁² + ee₂²); se aceptan 4
        const ee = Math.hypot(py.desviacion, desviacion) / Math.sqrt(referencia.replicas)
        expect(Math.abs(media - py.media), `${nombre}: ${media} contra ${py.media}`).toBeLessThan(4 * ee + 1e-9)
        // y la misma variabilidad de un turno a otro
        expect(desviacion / py.desviacion, `${nombre}: desviación ${desviacion} contra ${py.desviacion}`).toBeGreaterThan(0.8)
        expect(desviacion / py.desviacion, `${nombre}: desviación ${desviacion} contra ${py.desviacion}`).toBeLessThan(1.25)
      }
    })

  it('con 30 turnos, el barrido publicado en resultados/barrido-flota.csv cae dentro de su variación', () => {
    const python = csvParse(readFileSync(new URL('../../../resultados/barrido-flota.csv', import.meta.url), 'utf8'), (d) => ({
      camiones: Number(d.camiones),
      produccion: Number(d.produccion_t_h),
      ic: Number(d.ic95_t_h),
    }))
    const app = barridoFlota(PARAMETROS, python.map((f) => f.camiones))
    for (const [k, py] of python.entries()) {
      const ee = Math.hypot(py.ic, app[k].ic95_t_h) / tCuantil(0.975, 29)
      expect(Math.abs(app[k].produccion_t_h - py.produccion), `${py.camiones} camiones`).toBeLessThan(3 * ee)
    }
    const r = recomendacion(app)
    expect([11, 12, 13]).toContain(r.camionesMenorCosto)
    expect([13, 14, 15]).toContain(r.camionesPara95)
  })
})
