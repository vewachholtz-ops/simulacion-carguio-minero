// Dimensionar la flota: producción y costo por tonelada según cuántos camiones. Con la mina de ejemplo se ve al abrir
// lo publicado por la versión Python (30 turnos por flota, de 4 a 24 camiones); con otra mina, «Correr el barrido»
// simula las flotas alrededor de su equilibrio en el navegador. Todo se descarga en Excel.
import { Cpu, Download, LoaderCircle } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Grafico } from '../componentes/Grafico'
import { Boton } from '../componentes/ui'
import { descargar, nombreArchivo } from '../lib/archivo'
import { BARRIDO_PYTHON, RECOMENDACION } from '../lib/datos'
import { esPorDefecto, flotasABarrer, useEscenario } from '../lib/escenario'
import { libroExcel, TIPO_XLSX } from '../lib/excel'
import { hojaBarrido, hojaEscenario } from '../lib/exportar'
import { minutos, NB, numero, pct, th, usdT } from '../lib/formato'
import { cn } from '../lib/utiles'
import { type Comparacion, type FilaBarrido, flotaParaMeta, recomendacion } from '../modelo/experimento'
import { costo, produccion } from './graficos'
import type { Pedido, Respuesta } from './trabajador'

const REPLICAS = 30

interface Corrida {
  filas: FilaBarrido[]
  comparacion: Comparacion | null
  ms: number
  clave: string
}

export function Flota() {
  const escenario = useEscenario()
  const p = escenario.parametros
  const defecto = esPorDefecto(escenario)
  const flotas = useMemo(() => flotasABarrer(p, defecto), [p, defecto])
  const clave = JSON.stringify({ ...p, camiones: 0 }) + JSON.stringify(escenario.costos)
  const [corrida, setCorrida] = useState<Corrida | null>(null)
  const [avance, setAvance] = useState<number | null>(null)
  const trabajador = useRef<Worker | null>(null)
  useEffect(() => () => trabajador.current?.terminate(), [])

  const vigente = corrida?.clave === clave ? corrida : null
  const python = defecto ? BARRIDO_PYTHON : null
  const app = vigente?.filas ?? null
  const recApp = app ? recomendacion(app) : null
  const horas = p.turno / 60
  const metaTH = escenario.meta ? escenario.meta / horas : null
  const paraMeta = metaTH !== null && (app ?? python) ? flotaParaMeta((app ?? python)!, metaTH) : null
  const destacadas = python
    ? [
        { camiones: RECOMENDACION.camionesMenorCosto, texto: 'menor costo' },
        { camiones: RECOMENDACION.camionesPara95, texto: '95 % del máximo' },
      ]
    : recApp
      ? [
          { camiones: recApp.camionesMenorCosto, texto: 'menor costo' },
          { camiones: recApp.camionesPara95, texto: '95 % del máximo' },
        ]
      : []
  const opciones = useMemo(() => ({ python, app, destacadas, meta: metaTH }), [python, app, JSON.stringify(destacadas), metaTH]) // eslint-disable-line react-hooks/exhaustive-deps
  const dibujarProduccion = useMemo(() => (ancho: number) => produccion(ancho, opciones), [opciones])
  const dibujarCosto = useMemo(() => (ancho: number) => costo(ancho, opciones), [opciones])

  const correr = () => {
    trabajador.current?.terminate()
    const w = new Worker(new URL('./trabajador.ts', import.meta.url), { type: 'module' })
    trabajador.current = w
    setAvance(0)
    w.onmessage = (e: MessageEvent<Respuesta>) => {
      if (e.data.tipo === 'avance') setAvance(e.data.hechas / e.data.total)
      else {
        setCorrida({ filas: e.data.filas, comparacion: e.data.comparacion, ms: e.data.ms, clave })
        setAvance(null)
        w.terminate()
      }
    }
    const pedido: Pedido = {
      parametros: p,
      costos: escenario.costos,
      camiones: flotas,
      replicas: REPLICAS,
      comparar: defecto ? RECOMENDACION.comparacion.flotas : undefined,
    }
    w.postMessage(pedido)
  }

  const exportar = () => {
    const filas = app ?? python
    if (!filas) return
    const bytes = libroExcel([
      hojaBarrido(filas, p.turno, app ? 'Flota' : 'Flota (Python)'),
      ...(app && python ? [hojaBarrido(python, p.turno, 'Flota (Python)')] : []),
      hojaEscenario(escenario),
    ])
    descargar(`flota-${nombreArchivo(escenario.nombre)}.xlsx`, bytes as BlobPart, TIPO_XLSX)
  }

  const c = RECOMENDACION.comparacion
  const maxDiferencia = python && app ? Math.max(...app.map((a, k) => Math.abs(a.produccion_t_h / python[k].produccion_t_h - 1))) : null
  const turnoTexto = `${numero(horas, Number.isInteger(horas) ? 0 : 1)}${NB}horas`

  return (
    <div>
      {defecto ? (
        <div className="max-w-[64ch] space-y-3 text-[1.05rem] leading-relaxed text-tinta-suave">
          <p>
            Con {RECOMENDACION.camionesMenorCosto} camiones el costo por tonelada es el más bajo ({usdT(RECOMENDACION.costoMinimo)}). Con{' '}
            {RECOMENDACION.camionesPara95} se llega al 95{NB}% de la producción máxima: comparando turno a turno con el mismo azar, son{' '}
            <strong className="font-semibold text-tinta">
              {numero(c.difProduccion)}{NB}t/h más (±{NB}{numero(c.icDifProduccion)})
            </strong>{' '}
            por {numero(c.difCosto * 100, 1)} centavos más por tonelada.
          </p>
          <p>
            Pasados los 16 camiones la producción ya no sube: las palas cargan todo el tiempo que no están en reparación, y cada camión
            extra solo alarga la cola.
          </p>
        </div>
      ) : (
        <p className="max-w-[64ch] text-[1.05rem] leading-relaxed text-tinta-suave">
          {app && recApp ? (
            <>
              En «{escenario.nombre}», el costo por tonelada es el más bajo con <strong className="font-semibold text-tinta">{recApp.camionesMenorCosto} camiones</strong> (
              {usdT(recApp.costoMinimo)}), y con <strong className="font-semibold text-tinta">{recApp.camionesPara95}</strong> se llega al 95{NB}% de la
              producción máxima ({th(recApp.produccionMaxima)}).
            </>
          ) : (
            <>
              Para «{escenario.nombre}» no hay resultados publicados: corre el barrido para ver la producción y el costo de {flotas[0]} a {flotas.at(-1)}{' '}
              camiones, alrededor del equilibrio con {p.palas === 1 ? 'su pala' : `sus ${p.palas} palas`}.
            </>
          )}
        </p>
      )}
      {metaTH !== null && (
        <p className="mt-3 max-w-[64ch] text-[1.05rem] leading-relaxed text-tinta">
          Meta: {numero(escenario.meta!)}{NB}t por turno ({th(metaTH)}).{' '}
          {app || python ? (
            paraMeta ? (
              <>
                Se llega con <strong className="font-semibold">{paraMeta.camiones} camiones</strong>, que mueven en promedio {th(paraMeta.produccion_t_h)}.
              </>
            ) : (
              <>Ninguna flota hasta {flotas.at(-1)} camiones llega: el límite son las palas o el chancador, no los camiones.</>
            )
          ) : (
            <>Corre el barrido para saber con cuántos camiones se llega.</>
          )}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-superficie px-4 py-3">
        <Boton variante={app ? 'contorno' : 'principal'} onClick={correr} disabled={avance !== null}>
          {avance !== null ? <LoaderCircle className="animate-spin" aria-hidden /> : <Cpu aria-hidden />}
          {avance !== null ? `Simulando ${numero(avance * 100)}${NB}%` : app ? 'Volver a correr' : 'Correr el barrido en tu navegador'}
        </Boton>
        <p className="min-w-0 flex-1 basis-64 text-[13.5px] text-tinta-suave" role="status">
          {vigente
            ? `${numero(flotas.length * REPLICAS)} turnos de ${turnoTexto} en ${numero(vigente.ms / 1000, 1)}${NB}s, con el modelo de esta página.`
            : `${flotas.length} flotas × ${REPLICAS} turnos = ${numero(flotas.length * REPLICAS)} turnos de ${turnoTexto}. Toma unos segundos.`}
        </p>
        {(app || python) && (
          <Boton variante="fantasma" tamano="sm" onClick={exportar}>
            <Download aria-hidden />
            Descargar en Excel
          </Boton>
        )}
      </div>

      {app && (
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-tinta-suave" aria-label="Leyenda">
          {python && (
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-5 rounded-full bg-dato" />
              Python (SimPy), con su intervalo de 95{NB}%
            </li>
          )}
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full bg-[var(--dato-2)]" />
            Tu navegador, con su intervalo
          </li>
          {metaTH !== null && (
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-0 w-5 border-t-2 border-dashed border-tinta-suave" />
              Meta
            </li>
          )}
        </ul>
      )}

      {(app || python) && (
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <figure className="rounded-lg border bg-superficie p-4">
            <figcaption className="mb-2">
              <span className="block text-[14.5px] font-semibold">Producción</span>
              <span className="text-[12.5px] text-tinta-tenue">toneladas por hora, sin contar el inicio del turno</span>
            </figcaption>
            <Grafico
              dibujar={dibujarProduccion}
              etiqueta={
                defecto && !app
                  ? 'Producción por hora según el tamaño de la flota: sube casi en línea recta hasta unos 15 camiones y se estanca en unas 6.100 t/h'
                  : `Producción por hora según el tamaño de la flota, de ${flotas[0]} a ${flotas.at(-1)} camiones`
              }
            />
          </figure>
          <figure className="rounded-lg border bg-superficie p-4">
            <figcaption className="mb-2">
              <span className="block text-[14.5px] font-semibold">Costo por tonelada</span>
              <span className="text-[12.5px] text-tinta-tenue">
                USD, con camiones a {numero(escenario.costos.camionUsdH)}{NB}USD/h y palas a {numero(escenario.costos.palaUsdH)}{NB}USD/h
              </span>
            </figcaption>
            <Grafico
              dibujar={dibujarCosto}
              etiqueta={
                defecto && !app
                  ? 'Costo por tonelada según el tamaño de la flota: baja hasta un mínimo cerca de 12 camiones, es casi plano hasta 14 y sube después'
                  : `Costo por tonelada según el tamaño de la flota, de ${flotas[0]} a ${flotas.at(-1)} camiones`
              }
            />
          </figure>
        </div>
      )}

      {vigente && (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Tarjeta titulo="Lo que dio tu navegador">
            {recApp && (
              <p>
                Menor costo con <strong className="font-semibold text-tinta">{recApp.camionesMenorCosto} camiones</strong> ({usdT(recApp.costoMinimo)}); el 95{NB}% del
                máximo, con <strong className="font-semibold text-tinta">{recApp.camionesPara95}</strong>.
              </p>
            )}
            {vigente.comparacion && (
              <p className="mt-2">
                Pasar de {vigente.comparacion.flotas[0]} a {vigente.comparacion.flotas[1]} camiones: {vigente.comparacion.difProduccion >= 0 ? '+' : '−'}
                {th(Math.abs(vigente.comparacion.difProduccion))} (±{NB}
                {numero(vigente.comparacion.icDifProduccion)}) y {numero(vigente.comparacion.difCosto * 100, 1)} centavos por tonelada.
              </p>
            )}
          </Tarjeta>
          {python && maxDiferencia !== null && (
            <Tarjeta titulo="¿Por qué no da exactamente lo mismo?">
              <p>
                Las dos versiones simulan lo mismo con distinto azar. Con 30 turnos por flota cada barrido tiene un margen de ±{NB}3{NB}%, y como cada versión
                repite las mismas fallas en todas las flotas, una curva puede quedar entera algo más arriba que la otra: aquí, hasta un {pct(maxDiferencia)}.
                Con 300 turnos los promedios y su variación coinciden; las pruebas del repositorio lo comprueban.
              </p>
              {recApp && (
                <p className="mt-2">
                  El costo casi no cambia entre 12 y 14 camiones (menos de 1{NB}%), así que el mínimo puede caer en cualquiera de ellos según el azar
                  {recApp.camionesMenorCosto !== RECOMENDACION.camionesMenorCosto ? `: aquí cayó en ${recApp.camionesMenorCosto}.` : '.'}
                </p>
              )}
            </Tarjeta>
          )}
          {!python && (
            <Tarjeta titulo="Para leerlo bien">
              <p>
                Cada punto es el promedio de {REPLICAS} turnos, con su margen de 95{NB}%. Si dos flotas vecinas quedan dentro del margen de la otra, la
                diferencia entre ellas es azar. Para comparar dos opciones con más precisión, usa «Comparar dos escenarios» en Tu mina.
              </p>
            </Tarjeta>
          )}
        </div>
      )}

      {(app || python) && (
        <details className="group mt-5 overflow-hidden rounded-lg border bg-superficie">
          <summary className="cursor-pointer list-none px-4 py-3 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            La tabla, flota por flota
          </summary>
          <div className="overflow-x-auto border-t">
            <TablaFlota flotas={flotas} python={python} app={app} marcadas={paraMeta ? [paraMeta.camiones] : python ? [12, 14] : []} />
          </div>
        </details>
      )}
    </div>
  )
}

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-superficie px-4 py-3.5 text-[14px] leading-relaxed text-tinta-suave">
      <p className="mb-1 text-[14px] font-semibold text-tinta">{titulo}</p>
      {children}
    </div>
  )
}

function TablaFlota({ flotas, python, app, marcadas }: { flotas: number[]; python: FilaBarrido[] | null; app: FilaBarrido[] | null; marcadas: number[] }) {
  const filas = flotas.map((n) => ({ n, p: python?.find((f) => f.camiones === n), a: app?.find((f) => f.camiones === n) }))
  const principal = (f: (typeof filas)[number]) => f.p ?? f.a
  return (
    <table className="cifras w-full min-w-[640px] border-collapse text-[13px]">
      <thead>
        <tr className="border-b text-tinta-suave">
          <th className="px-3 py-2 text-left font-medium">Camiones</th>
          <th className="px-3 py-2 text-right font-medium">Acoplamiento</th>
          {python && <th className="px-3 py-2 text-right font-medium">Producción Python (t/h)</th>}
          {app && <th className="px-3 py-2 text-right font-medium">Producción navegador (t/h)</th>}
          <th className="px-3 py-2 text-right font-medium">Palas cargando</th>
          <th className="px-3 py-2 text-right font-medium">Espera en pala</th>
          <th className="px-3 py-2 text-right font-medium">Costo (USD/t)</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => {
          const x = principal(f)
          if (!x) return null
          return (
            <tr key={f.n} className={cn('border-b last:border-b-0', marcadas.includes(f.n) && 'bg-acento-tinte/50')}>
              <td className="px-3 py-1.5">{f.n}</td>
              <td className="px-3 py-1.5 text-right">{numero(x.factor_acoplamiento, 2)}</td>
              {python && <td className="px-3 py-1.5 text-right">{f.p ? `${numero(f.p.produccion_t_h)} ± ${numero(f.p.ic95_t_h)}` : '—'}</td>}
              {app && <td className="px-3 py-1.5 text-right">{f.a ? `${numero(f.a.produccion_t_h)} ± ${numero(f.a.ic95_t_h)}` : '—'}</td>}
              <td className="px-3 py-1.5 text-right">{pct(x.utilizacion_palas)}</td>
              <td className="px-3 py-1.5 text-right">{minutos(x.espera_pala_min)}</td>
              <td className="px-3 py-1.5 text-right">{numero(x.costo_usd_t, 2)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
