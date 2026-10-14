// Comparar dos escenarios: la mina de ejemplo, la que está en pantalla o cualquiera guardada. Cada uno corre los
// mismos turnos de azar, así que la diferencia turno a turno viene del cambio y no de la suerte.
import { Download, GitCompareArrows, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Boton } from '../componentes/ui'
import { deArchivo, descargar, type Guardado, nombreArchivo } from '../lib/archivo'
import { EJEMPLO, type Escenario, useEscenario } from '../lib/escenario'
import { libroExcel, TIPO_XLSX } from '../lib/excel'
import { hojaEscenario } from '../lib/exportar'
import { minutos, NB, numero, pct, th } from '../lib/formato'
import { cn } from '../lib/utiles'
import type { ComparacionEscenarios, ResumenEscenario } from '../modelo/experimento'
import type { PedidoComparar, RespuestaComparar } from './comparador'

interface Resultado {
  comparacion: ComparacionEscenarios
  a: Escenario
  b: Escenario
  ms: number
}

const TURNOS = [10, 30, 100]

export function Comparar({ lista }: { lista: Guardado[] }) {
  const actual = useEscenario()
  const [ka, setKa] = useState('ejemplo')
  const [kb, setKb] = useState('actual')
  const [turnos, setTurnos] = useState(30)
  const [corriendo, setCorriendo] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trabajador = useRef<Worker | null>(null)
  useEffect(() => () => trabajador.current?.terminate(), [])

  const opciones = [
    { valor: 'actual', texto: `La que está en pantalla: ${actual.nombre}` },
    { valor: 'ejemplo', texto: 'Mina de ejemplo' },
    ...lista.map((g) => ({ valor: `g:${g.archivo.nombre}`, texto: g.archivo.nombre })),
  ]
  const resolver = (k: string): Escenario | null => {
    if (k === 'actual') return actual
    if (k === 'ejemplo') return { ...EJEMPLO, parametros: { ...EJEMPLO.parametros } }
    const g = lista.find((x) => `g:${x.archivo.nombre}` === k)
    try {
      return g ? deArchivo(g.archivo) : null
    } catch {
      return null
    }
  }

  const correr = () => {
    const a = resolver(ka)
    const b = resolver(kb)
    if (!a || !b) return setError('Elige dos escenarios.')
    setError(null)
    trabajador.current?.terminate()
    const w = new Worker(new URL('./comparador.ts', import.meta.url), { type: 'module' })
    trabajador.current = w
    setCorriendo(true)
    w.onmessage = (ev: MessageEvent<RespuestaComparar>) => {
      setResultado({ comparacion: ev.data.comparacion, a, b, ms: ev.data.ms })
      setCorriendo(false)
      w.terminate()
    }
    w.onerror = () => {
      setCorriendo(false)
      setError('La simulación se detuvo. Prueba con menos turnos.')
    }
    w.postMessage({ a: { parametros: a.parametros, costos: a.costos }, b: { parametros: b.parametros, costos: b.costos }, replicas: turnos } satisfies PedidoComparar)
  }

  const selector = (id: string, etiqueta: string, valor: string, alCambiar: (v: string) => void) => (
    <label className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
      <span className="text-[12.5px] text-tinta-suave">{etiqueta}</span>
      <select id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} className="h-9 w-full min-w-0 rounded-md border bg-fondo px-2 text-[14px]">
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <section aria-labelledby="comparar-titulo" className="mt-10">
      <h3 id="comparar-titulo" className="ancha text-[1.3rem] leading-tight font-bold tracking-tight">
        Comparar dos escenarios
      </h3>
      <p className="mt-1 max-w-[70ch] text-[14px] text-tinta-tenue">
        Otra flota, otra ruta, una pala más: los dos corren los mismos turnos de azar, así que la diferencia viene del cambio y no de la suerte.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-superficie px-4 py-3.5">
        {selector('comparar-a', 'Escenario A', ka, setKa)}
        {selector('comparar-b', 'Escenario B', kb, setKb)}
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] text-tinta-suave">Turnos cada uno</span>
          <select value={turnos} onChange={(e) => setTurnos(Number(e.target.value))} className="h-9 rounded-md border bg-fondo px-2 text-[14px]">
            {TURNOS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Boton variante="principal" onClick={correr} disabled={corriendo}>
          {corriendo ? <LoaderCircle className="animate-spin" aria-hidden /> : <GitCompareArrows aria-hidden />}
          {corriendo ? 'Simulando…' : 'Comparar'}
        </Boton>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-falla">
          {error}
        </p>
      )}
      {resultado && <Tabla r={resultado} />}
    </section>
  )
}

function Tabla({ r }: { r: Resultado }) {
  const { comparacion: c, a, b } = r
  const mismoTurno = a.parametros.turno === b.parametros.turno
  const horas = b.parametros.turno / 60
  const significativa = (dif: number, ic: number) => Math.abs(dif) > ic
  const nombreA = a.nombre === b.nombre ? `${a.nombre} (A)` : a.nombre
  const nombreB = a.nombre === b.nombre ? `${b.nombre} (B)` : b.nombre

  const filas: { nombre: string; a: string; b: string; dif?: string }[] = [
    { nombre: 'Camiones y palas', a: `${a.parametros.camiones} y ${a.parametros.palas}`, b: `${b.parametros.camiones} y ${b.parametros.palas}` },
    {
      nombre: 'Producción',
      a: conIc(c.a.produccion, 't/h'),
      b: conIc(c.b.produccion, 't/h'),
      dif: `${signo(c.difProduccion)}${numero(Math.abs(c.difProduccion))} ± ${numero(c.icDifProduccion)}${NB}t/h`,
    },
    ...(mismoTurno
      ? [
          {
            nombre: 'Por turno, a ese ritmo',
            a: `${numero(c.a.produccion[0] * horas)}${NB}t`,
            b: `${numero(c.b.produccion[0] * horas)}${NB}t`,
            dif: `${signo(c.difProduccion)}${numero(Math.abs(c.difProduccion * horas))}${NB}t`,
          },
        ]
      : []),
    {
      nombre: 'Costo por tonelada',
      a: conIc(c.a.costo, 'USD/t', 2),
      b: conIc(c.b.costo, 'USD/t', 2),
      dif: `${signo(c.difCosto)}${numero(Math.abs(c.difCosto), 2)} ± ${numero(c.icDifCosto, 2)}${NB}USD/t`,
    },
    { nombre: 'Palas cargando', a: pct(c.a.utilizacionPalas), b: pct(c.b.utilizacionPalas) },
    { nombre: 'Chancador ocupado', a: pct(c.a.utilizacionChancador), b: pct(c.b.utilizacionChancador) },
    { nombre: 'Espera en la pala', a: minutos(c.a.esperaPala), b: minutos(c.b.esperaPala) },
    { nombre: 'Espera en el chancador', a: minutos(c.a.esperaChancador), b: minutos(c.b.esperaChancador) },
    { nombre: 'Ciclo medio', a: minutos(c.a.cicloMedio), b: minutos(c.b.cicloMedio) },
  ]

  const exportar = () => {
    const lineas = (x: ResumenEscenario) => [
      x.produccion[0],
      x.produccion[1],
      x.costo[0],
      x.costo[1],
      x.utilizacionPalas,
      x.utilizacionChancador,
      x.esperaPala,
      x.esperaChancador,
      x.cicloMedio,
    ]
    const nombres = [
      'Producción (t/h)',
      'IC 95 % producción (± t/h)',
      'Costo (USD/t)',
      'IC 95 % costo (± USD/t)',
      'Palas cargando (fracción del turno)',
      'Chancador ocupado (fracción del turno)',
      'Espera en la pala (min)',
      'Espera en el chancador (min)',
      'Ciclo medio (min)',
    ]
    const la = lineas(c.a)
    const lb = lineas(c.b)
    const bytes = libroExcel([
      {
        nombre: 'Comparación',
        anchos: [40, 22, 22],
        filas: [
          ['Indicador', `A: ${a.nombre}`, `B: ${b.nombre}`],
          ['Turnos simulados por escenario', c.replicas, c.replicas],
          ...nombres.map((n, i) => [n, la[i], lb[i]]),
          [],
          ['Diferencia B − A, turno a turno', 'Media', 'IC 95 % (±)'],
          ['Producción (t/h)', c.difProduccion, c.icDifProduccion],
          ['Costo (USD/t)', c.difCosto, c.icDifCosto],
        ],
      },
      hojaEscenario(a, 'Escenario A'),
      hojaEscenario(b, 'Escenario B'),
    ])
    descargar(`comparacion-${nombreArchivo(a.nombre)}-vs-${nombreArchivo(b.nombre)}.xlsx`, bytes as BlobPart, TIPO_XLSX)
  }

  const masProd = c.difProduccion > 0
  return (
    <div className="mt-4">
      <p className="max-w-[72ch] text-[1.02rem] leading-relaxed text-tinta" role="status">
        {significativa(c.difProduccion, c.icDifProduccion) ? (
          <>
            «{nombreB}» mueve <strong className="font-semibold">{th(Math.abs(c.difProduccion))} {masProd ? 'más' : 'menos'}</strong> que «{nombreA}»
            {mismoTurno && <> (unas {numero(Math.abs(c.difProduccion * horas))}{NB}t por turno)</>}, con un margen de ±{NB}
            {numero(c.icDifProduccion)}{NB}t/h.{' '}
          </>
        ) : (
          <>Con {c.replicas} turnos no se distingue una diferencia de producción entre «{nombreA}» y «{nombreB}». </>
        )}
        {significativa(c.difCosto, c.icDifCosto)
          ? `Cada tonelada le sale ${numero(Math.abs(c.difCosto), 2)} USD ${c.difCosto < 0 ? 'más barata' : 'más cara'}.`
          : 'El costo por tonelada es prácticamente el mismo.'}
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border bg-superficie">
        <table className="cifras w-full min-w-[620px] border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b text-left text-tinta-suave">
              <th className="px-4 py-2.5 font-medium">Indicador</th>
              <th className="px-4 py-2.5 text-right font-medium">A: {nombreA}</th>
              <th className="px-4 py-2.5 text-right font-medium">B: {nombreB}</th>
              <th className="px-4 py-2.5 text-right font-medium">B − A</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre} className="border-b last:border-b-0">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {f.nombre}
                </th>
                <td className="px-4 py-2 text-right">{f.a}</td>
                <td className="px-4 py-2 text-right">{f.b}</td>
                <td className={cn('px-4 py-2 text-right', !f.dif && 'text-tinta-tenue')}>{f.dif ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Boton tamano="sm" onClick={exportar}>
          <Download aria-hidden />
          Descargar en Excel
        </Boton>
        <p className="text-[12.5px] text-tinta-tenue">
          {c.replicas} turnos por escenario en {numero(r.ms / 1000, 1)}{NB}s. El ± es el intervalo de 95{NB}%.
        </p>
      </div>
    </div>
  )
}

const signo = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '')
const conIc = ([m, s]: [number, number], unidad: string, decimales = 0) => `${numero(m, decimales)} ± ${numero(s, decimales)}${NB}${unidad}`
