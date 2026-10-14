// Lo publicado por la versión Python (uv run carguio): el barrido de flota con 30 turnos por flota y la
// recomendación. Entran a la página al construirla, así que la portada muestra los mismos números del repo.
import { csvParse } from 'd3-dsv'
import barridoCsv from '../../../resultados/barrido-flota.csv?raw'
import recomendacionJson from '../../../resultados/recomendacion.json?raw'
import type { FilaBarrido } from '../modelo/experimento'

export const BARRIDO_PYTHON: FilaBarrido[] = csvParse(barridoCsv, (d) => ({
  camiones: Number(d.camiones),
  factor_acoplamiento: Number(d.factor_acoplamiento),
  produccion_t_h: Number(d.produccion_t_h),
  ic95_t_h: Number(d.ic95_t_h),
  utilizacion_palas: Number(d.utilizacion_palas),
  utilizacion_chancador: Number(d.utilizacion_chancador),
  espera_pala_min: Number(d.espera_pala_min),
  espera_chancador_min: Number(d.espera_chancador_min),
  ciclo_medio_min: Number(d.ciclo_medio_min),
  costo_usd_t: Number(d.costo_usd_t),
}))

const r = JSON.parse(recomendacionJson)
export const RECOMENDACION = {
  camionesMenorCosto: r.camiones_menor_costo as number,
  costoMinimo: r.costo_minimo_usd_t as number,
  produccionEnMenorCosto: r.produccion_en_menor_costo_t_h as number,
  produccionMaxima: r.produccion_maxima_t_h as number,
  camionesPara95: r.camiones_para_95pct_del_maximo as number,
  comparacion: {
    flotas: r.comparacion.flotas as [number, number],
    difProduccion: r.comparacion.dif_produccion_t_h as number,
    icDifProduccion: r.comparacion.ic95_dif_produccion as number,
    difCosto: r.comparacion.dif_costo_usd_t as number,
    icDifCosto: r.comparacion.ic95_dif_costo as number,
    correlacion: r.comparacion.correlacion_produccion as number,
  },
}
