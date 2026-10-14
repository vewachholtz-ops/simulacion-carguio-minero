// Los gráficos del dimensionamiento: producción y costo por tonelada según el tamaño de la flota. La versión Python
// es la línea (con su intervalo de 95 %); lo que corre el navegador, los puntos con sus barras de error.
import * as Plot from '@observablehq/plot'
import { numero, th, usdT } from '../lib/formato'
import { color } from '../lib/tema'
import type { FilaBarrido } from '../modelo/experimento'

function colores() {
  return {
    dato: color('dato'),
    dato2: color('dato-2'),
    tinta: color('tinta'),
    suave: color('tinta-suave'),
    tenue: color('tinta-tenue'),
    superficie: color('superficie'),
    grilla: color('grilla'),
    eje: color('eje'),
  }
}

const base = (ancho: number) => ({
  width: ancho,
  height: ancho < 560 ? 250 : 300,
  marginLeft: 58,
  marginRight: 18,
  marginBottom: 42,
  style: { fontSize: '12px', fontFamily: 'inherit' },
})

interface Opciones {
  python: FilaBarrido[] | null
  app: FilaBarrido[] | null
  destacadas: { camiones: number; texto: string }[]
  /** La meta de producción, en t/h; null si no hay. */
  meta?: number | null
}

export function produccion(ancho: number, { python, app, destacadas, meta = null }: Opciones) {
  const c = colores()
  const referencia = python ?? app ?? []
  // la mina de ejemplo tiene su escala fija (para comparar con lo publicado); otra mina, la que pidan sus datos
  const alto = Math.max(...referencia.map((f) => f.produccion_t_h + (Number.isFinite(f.ic95_t_h) ? f.ic95_t_h : 0)), meta ?? 0) * 1.08
  const marcas = destacadas.map((d) => ({ ...d, fila: referencia.find((f) => f.camiones === d.camiones)! })).filter((d) => d.fila)
  return Plot.plot({
    ...base(ancho),
    x: { label: 'Camiones en la flota', labelAnchor: 'center', labelArrow: 'none', labelOffset: 34, ticks: ancho < 560 ? 5 : 10, tickFormat: (d: number) => String(d) },
    y: { label: null, grid: true, ticks: 5, tickFormat: (d: number) => numero(d), domain: python && !meta ? [0, 7000] : [0, alto] },
    marks: [
      Plot.gridY({ stroke: c.grilla, strokeOpacity: 1, ticks: 5 }),
      Plot.ruleY([0], { stroke: c.eje }),
      ...(meta
        ? [
            Plot.ruleY([meta], { stroke: c.suave, strokeWidth: 1.5, strokeDasharray: '5,4' }),
            Plot.text([meta], {
              y: (d: number) => d,
              frameAnchor: 'right',
              dx: -4,
              dy: 10,
              text: () => `meta ${th(meta)}`,
              fill: c.suave,
              textAnchor: 'end',
              stroke: c.superficie,
              strokeWidth: 4,
              paintOrder: 'stroke',
            }),
          ]
        : []),
      ...(python
        ? [
            Plot.areaY(python, { x: 'camiones', y1: (d: FilaBarrido) => d.produccion_t_h - d.ic95_t_h, y2: (d: FilaBarrido) => d.produccion_t_h + d.ic95_t_h, fill: c.dato, fillOpacity: 0.14 }),
            Plot.lineY(python, { x: 'camiones', y: 'produccion_t_h', stroke: c.dato, strokeWidth: 2 }),
          ]
        : []),
      ...(app
        ? [
            Plot.ruleX(app, { x: 'camiones', y1: (d: FilaBarrido) => d.produccion_t_h - d.ic95_t_h, y2: (d: FilaBarrido) => d.produccion_t_h + d.ic95_t_h, stroke: c.dato2, strokeWidth: 1.5 }),
            Plot.dot(app, { x: 'camiones', y: 'produccion_t_h', r: 4, fill: c.dato2, stroke: c.superficie, strokeWidth: 2 }),
          ]
        : []),
      Plot.dot(marcas, { x: (d) => d.camiones, y: (d) => d.fila.produccion_t_h, r: 5.5, fill: python ? c.dato : c.dato2, stroke: c.superficie, strokeWidth: 2 }),
      // el primero (menor costo) abajo a la derecha; el segundo (95 %) arriba a la izquierda, para que no choquen
      ...marcas.map((m, i) =>
        Plot.text([m], {
          x: (d) => d.camiones,
          y: (d) => d.fila.produccion_t_h,
          text: (d) => `${d.texto}\n${th(d.fila.produccion_t_h)}`,
          dx: i === 0 ? 10 : -10,
          dy: i === 0 ? 14 : -14,
          textAnchor: i === 0 ? 'start' : 'end',
          lineAnchor: i === 0 ? 'top' : 'bottom',
          fill: c.tinta,
          fontWeight: 600,
          stroke: c.superficie,
          strokeWidth: 4,
          paintOrder: 'stroke',
        }),
      ),
      Plot.tip(
        referencia,
        Plot.pointerX({
          x: 'camiones',
          y: 'produccion_t_h',
          fill: c.superficie,
          stroke: c.eje,
          title: (d: FilaBarrido) => {
            const a = app?.find((f) => f.camiones === d.camiones)
            const p = python?.find((f) => f.camiones === d.camiones)
            return [
              `${d.camiones} camiones`,
              p ? `Python: ${th(p.produccion_t_h)} ± ${numero(p.ic95_t_h)}` : '',
              a ? `Tu navegador: ${th(a.produccion_t_h)} ± ${numero(a.ic95_t_h)}` : '',
              `palas cargando ${numero((a ?? p)!.utilizacion_palas * 100)} % del turno`,
              `espera en pala ${numero((a ?? p)!.espera_pala_min, 1)} min por ciclo`,
            ]
              .filter(Boolean)
              .join('\n')
          },
        }),
      ),
    ],
  })
}

export function costo(ancho: number, { python, app, destacadas }: Opciones) {
  const c = colores()
  const referencia = python ?? app ?? []
  const costos = referencia.map((f) => f.costo_usd_t).filter(Number.isFinite)
  const [bajo, alto] = [Math.min(...costos), Math.max(...costos)]
  const margen = (alto - bajo) * 0.12 || bajo * 0.1
  const minimo = destacadas[0] ? referencia.find((f) => f.camiones === destacadas[0].camiones) : undefined
  return Plot.plot({
    ...base(ancho),
    x: { label: 'Camiones en la flota', labelAnchor: 'center', labelArrow: 'none', labelOffset: 34, ticks: ancho < 560 ? 5 : 10, tickFormat: (d: number) => String(d) },
    y: { label: null, grid: true, ticks: 5, tickFormat: (d: number) => numero(d, 2), domain: python ? [1, 1.75] : [Math.max(0, bajo - margen), alto + margen * 1.6] },
    marks: [
      Plot.gridY({ stroke: c.grilla, strokeOpacity: 1, ticks: 5 }),
      ...(python ? [Plot.lineY(python, { x: 'camiones', y: 'costo_usd_t', stroke: c.dato, strokeWidth: 2 })] : []),
      ...(app ? [Plot.dot(app, { x: 'camiones', y: 'costo_usd_t', r: 4, fill: c.dato2, stroke: c.superficie, strokeWidth: 2 })] : []),
      ...(minimo
        ? [
            Plot.dot([minimo], { x: 'camiones', y: 'costo_usd_t', r: 5.5, fill: python ? c.dato : c.dato2, stroke: c.superficie, strokeWidth: 2 }),
            Plot.text([minimo], {
              x: 'camiones',
              y: 'costo_usd_t',
              text: (d: FilaBarrido) => `${d.camiones} camiones: ${usdT(d.costo_usd_t)}`,
              dy: -16,
              fill: c.tinta,
              fontWeight: 600,
              stroke: c.superficie,
              strokeWidth: 4,
              paintOrder: 'stroke',
            }),
          ]
        : []),
      Plot.tip(
        referencia,
        Plot.pointerX({
          x: 'camiones',
          y: 'costo_usd_t',
          fill: c.superficie,
          stroke: c.eje,
          title: (d: FilaBarrido) => {
            const a = app?.find((f) => f.camiones === d.camiones)
            const p = python?.find((f) => f.camiones === d.camiones)
            return [`${d.camiones} camiones`, p ? `Python: ${usdT(p.costo_usd_t)}` : '', a ? `Tu navegador: ${usdT(a.costo_usd_t)}` : ''].filter(Boolean).join('\n')
          },
        }),
      ),
    ],
  })
}
