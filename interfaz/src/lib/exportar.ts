// Lo que se descarga en Excel: el escenario (para saber de dónde salen los números), el barrido de flota y la
// comparación de dos escenarios. Los nombres de las columnas dicen la unidad.
import type { FilaBarrido } from '../modelo/experimento'
import { cargaMedia, cicloSinColas } from '../modelo/simulacion'
import type { Escenario } from './escenario'
import type { Celda, Hoja } from './excel'

export function hojaEscenario(e: Escenario, titulo = 'Escenario'): Hoja {
  const p = e.parametros
  const filas: Celda[][] = [
    ['Parámetro', 'Valor', 'Unidad', 'Distribución'],
    ['Nombre', e.nombre, null, null],
    ['Camiones', p.camiones, 'camiones', null],
    ['Palas', p.palas, 'palas', null],
    ['Capacidad del camión', p.capacidadT, 't', 'fija'],
    ['Posicionamiento en la pala', p.posicionamiento, 'min', 'fijo'],
    ['Carga, mínimo', p.carga[0], 'min', 'triangular'],
    ['Carga, moda', p.carga[1], 'min', 'triangular'],
    ['Carga, máximo', p.carga[2], 'min', 'triangular'],
    ['Acarreo cargado, media', p.acarreo[0], 'min', 'normal'],
    ['Acarreo cargado, desviación', p.acarreo[1], 'min', 'normal'],
    ['Descarga, mínimo', p.descarga[0], 'min', 'triangular'],
    ['Descarga, moda', p.descarga[1], 'min', 'triangular'],
    ['Descarga, máximo', p.descarga[2], 'min', 'triangular'],
    ['Retorno vacío, media', p.retorno[0], 'min', 'normal'],
    ['Retorno vacío, desviación', p.retorno[1], 'min', 'normal'],
    ['Tiempo medio entre fallas de una pala', p.mtbfPala ?? 'sin fallas', p.mtbfPala === null ? null : 'min', 'exponencial'],
    ['Tiempo medio de reparación', p.mttrPala, 'min', 'exponencial'],
    ['Duración del turno', p.turno, 'min', null],
    ['Calentamiento (no se cuenta)', p.calentamiento, 'min', null],
    ['Costo de un camión', e.costos.camionUsdH, 'USD/h', null],
    ['Costo de una pala', e.costos.palaUsdH, 'USD/h', null],
    ['Meta de producción', e.meta ?? 'sin meta', e.meta === null ? null : 't por turno', null],
  ]
  if (e.ruta)
    filas.push(
      ['Distancia al chancador', e.ruta.distanciaKm, 'km', null],
      ['Velocidad cargado', e.ruta.velocidadCargadoKmH, 'km/h', null],
      ['Velocidad vacío', e.ruta.velocidadVacioKmH, 'km/h', null],
      ['Variación de los viajes', e.ruta.variacion, 'fracción de la media', null],
    )
  filas.push(
    ['Carga media (posicionamiento + carga)', cargaMedia(p), 'min', 'calculado'],
    ['Ciclo sin colas', cicloSinColas(p), 'min', 'calculado'],
  )
  return { nombre: titulo, filas, anchos: [38, 14, 18, 14] }
}

export function hojaBarrido(filas: FilaBarrido[], turnoMin: number, titulo = 'Flota'): Hoja {
  return {
    nombre: titulo,
    anchos: [11, 15, 16, 16, 18, 15, 17, 17, 21, 14, 16],
    filas: [
      [
        'Camiones',
        'Acoplamiento',
        'Producción (t/h)',
        'IC 95 % (± t/h)',
        'Producción (t por turno)',
        'Palas cargando',
        'Chancador ocupado',
        'Espera en pala (min)',
        'Espera en chancador (min)',
        'Ciclo medio (min)',
        'Costo (USD/t)',
      ],
      ...filas.map((f) => [
        f.camiones,
        f.factor_acoplamiento,
        f.produccion_t_h,
        f.ic95_t_h,
        (f.produccion_t_h * turnoMin) / 60,
        f.utilizacion_palas,
        f.utilizacion_chancador,
        f.espera_pala_min,
        f.espera_chancador_min,
        f.ciclo_medio_min,
        f.costo_usd_t,
      ]),
    ],
  }
}
