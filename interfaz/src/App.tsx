// Tolva: un turno de una mina a rajo abierto que se puede mirar y cambiar, «Tu mina» (los números de una operación
// propia, para guardar, compartir y comparar), el dimensionamiento de la flota y el modelo.
import { type ReactNode, useEffect, useSyncExternalStore } from 'react'
import { ExternalLink, Monitor, Moon, Mountain, Sun } from 'lucide-react'
import { aperturaInicial } from './lib/archivo'
import { RECOMENDACION } from './lib/datos'
import { EJEMPLO, esPorDefecto, flotasABarrer, useEscenario } from './lib/escenario'
import { NB, numero, usdT } from './lib/formato'
import { cambiarTema, type Tema, useTema } from './lib/tema'
import { cn } from './lib/utiles'
import { Flota } from './flota/Flota'
import { MiMina } from './mina/MiMina'
import { Ciclo, TablaParametros } from './secciones/Modelo'
import { Simulador } from './simulador/Simulador'

export const REPO = 'https://github.com/vewachholtz-ops/simulacion-carguio-minero'

type Vista = 'turno' | 'mina' | 'flota' | 'modelo'
const VISTAS: { id: Vista; texto: string; ancla: string }[] = [
  { id: 'turno', texto: 'Turno', ancla: '#turno' },
  { id: 'mina', texto: 'Tu mina', ancla: '#mina' },
  { id: 'flota', texto: 'Flota', ancla: '#flota' },
  { id: 'modelo', texto: 'Cómo funciona', ancla: '#modelo' },
]

/** La vista que pide la dirección: #mina, #flota, #modelo; cualquier otra cosa (o un enlace con una mina) es el turno. */
function vistaDe(hash: string): Vista {
  if (/^#mina(?!=)/.test(hash)) return 'mina'
  if (hash.startsWith('#flota')) return 'flota'
  if (hash.startsWith('#modelo')) return 'modelo'
  return 'turno'
}

function useVista(): Vista {
  const hash = useSyncExternalStore(
    (o) => {
      addEventListener('hashchange', o)
      return () => removeEventListener('hashchange', o)
    },
    () => location.hash,
  )
  return vistaDe(hash)
}

export function App() {
  const vista = useVista()
  useEffect(() => {
    // un enlace con una mina ya se abrió al cargar: la dirección queda limpia, en el turno
    if (location.hash.startsWith('#mina=')) history.replaceState(null, '', '#turno')
  }, [])
  useEffect(() => {
    scrollTo(0, 0)
    document.title = vista === 'turno' ? 'Tolva · Simulación de carguío minero' : `${VISTAS.find((v) => v.id === vista)!.texto} · Tolva`
  }, [vista])

  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-fondo/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <a href="#turno" className="flex shrink-0 items-center gap-2.5" aria-label="Tolva, ir al turno">
            <img src="./rajo.svg" alt="" className="size-7" />
            <span className="leading-none">
              <span className="ancha block text-[18px] font-bold tracking-tight">Tolva</span>
              <span className="hidden text-[11.5px] text-tinta-tenue lg:block">Simulador de carguío y transporte</span>
            </span>
          </a>
          <Pestanas vista={vista} className="ml-2 hidden md:flex" />
          <div className="ml-auto flex items-center gap-2">
            <MinaActual />
            <SelectorTema />
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-[13.5px] text-tinta-suave hover:bg-hundida hover:text-tinta xl:inline-flex"
            >
              Código
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
        <Pestanas vista={vista} className="flex overflow-x-auto border-t px-2 md:hidden" />
      </header>

      <main className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <section id="simular" aria-labelledby="turno-titulo" hidden={vista !== 'turno'} className="pt-6 sm:pt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="max-w-[68ch]">
              <h1 id="turno-titulo" className="ancha text-[1.6rem] leading-tight font-bold tracking-[-0.01em] sm:text-[1.9rem]">
                Un turno en el rajo
              </h1>
              <p className="mt-1 text-[14.5px] leading-relaxed text-tinta-suave">
                Palas que cargan, camiones que suben al chancador, colas y fallas, simulados minuto a minuto. Cambia la flota en el panel o usa los
                números de tu mina.
              </p>
            </div>
          </div>
          <MinaEnPantalla />
          <Simulador />
        </section>

        <Seccion
          id="mina"
          oculta={vista !== 'mina'}
          titulo="Tu mina"
          bajada="Escribe los números de tu operación, o parte de una mina en blanco. El simulador y el barrido los usan al tiro; nada sale de tu navegador."
        >
          <MiMina />
        </Seccion>

        <Seccion id="flota" oculta={vista !== 'flota'} titulo="Dimensionar la flota" bajada={<BajadaFlota />}>
          <Flota />
        </Seccion>

        <Seccion
          id="modelo"
          oculta={vista !== 'modelo'}
          titulo="¿Cuántos camiones necesita una mina?"
          bajada="Una simulación de eventos discretos: el reloj salta de un evento al siguiente (una carga que termina, un camión que llega, una pala que falla)."
        >
          <div className="mb-8 max-w-[64ch] space-y-3 text-[1.05rem] leading-relaxed text-tinta-suave">
            <p>
              Cada camión carga en una pala, sube cargado al chancador, espera su turno, descarga y vuelve. Con pocos camiones las palas esperan; con
              muchos, los camiones hacen cola. Tolva simula turnos completos para encontrar la flota que mueve más mineral al menor costo por tonelada.
            </p>
            <p className="text-tinta">
              Con los valores de ejemplo: <strong className="font-semibold">{RECOMENDACION.camionesMenorCosto} camiones</strong> dan el menor costo por
              tonelada ({usdT(RECOMENDACION.costoMinimo)}) y <strong className="font-semibold">{RECOMENDACION.camionesPara95}</strong>, el 95{NB}% de la
              producción máxima.
            </p>
          </div>
          <Ciclo />
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div>
              <h3 className="mb-3 text-[15px] font-semibold">Parámetros</h3>
              <TablaParametros />
            </div>
            <div className="space-y-6 text-[14.5px] leading-relaxed text-tinta-suave">
              <div>
                <h3 className="mb-2 text-[15px] font-semibold text-tinta">Cómo decide</h3>
                <ul className="list-disc space-y-1.5 pl-5 marker:text-tinta-tenue">
                  <li>
                    <strong className="font-medium text-tinta">Despacho:</strong> cada camión va a la pala con menos camiones esperando o cargando, sin
                    contar las que están en reparación.
                  </li>
                  <li>
                    <strong className="font-medium text-tinta">Fallas:</strong> una reparación espera que termine la carga en curso y después detiene la
                    pala.
                  </li>
                  <li>
                    <strong className="font-medium text-tinta">Calentamiento:</strong> el inicio del turno no se cuenta, para no medir la flota recién
                    saliendo.
                  </li>
                  <li>
                    <strong className="font-medium text-tinta">Números aleatorios comunes:</strong> cada pala y cada camión tienen su propio azar, así que
                    al comparar dos flotas con la misma semilla la diferencia viene de la flota y no de la suerte.
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-[15px] font-semibold text-tinta">Lo que no modela</h3>
                <p>
                  Un solo destino (el chancador), rutas de largo fijo, sin cambios de turno ni colaciones, y fallas que corren en tiempo calendario y no por
                  horas de operación.
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-[15px] font-semibold text-tinta">La maqueta</h3>
                <p>
                  La mina dibujada es una sola para cualquier escenario: un rajo de ocho bancos con su rampa, el chancador y su correa. Los camiones y las
                  palas están donde los pone la simulación en cada minuto, y el acopio crece con las toneladas del turno. El acabado sigue el estilo de las
                  figuras de{' '}
                  <a href="https://github.com/wheresryan22/anatomy" target="_blank" rel="noreferrer" className="font-medium text-acento hover:underline">
                    Anatomy
                  </a>
                  .
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-[15px] font-semibold text-tinta">De dónde viene</h3>
                <p>
                  Es el modelo de{' '}
                  <a href={`${REPO}/blob/main/src/carguio/modelo.py`} target="_blank" rel="noreferrer" className="font-medium text-acento hover:underline">
                    src/carguio/modelo.py
                  </a>{' '}
                  (Python y SimPy), escrito otra vez en TypeScript para correr en la página. Usan azares distintos; con 300 turnos por flota dan los mismos
                  promedios de producción, colas y utilización, con la misma variación de un turno a otro, y las pruebas del repositorio lo comprueban
                  en cada cambio.
                </p>
              </div>
            </div>
          </div>
        </Seccion>
      </main>

      <footer className="mx-auto mt-16 max-w-[90rem] px-4 sm:px-6">
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t py-8 text-[13px] text-tinta-tenue">
          <p className="max-w-[70ch]">Hecho por Vicente Wachholtz Reyes con React, three.js y Observable Plot. Valores ilustrativos, no de una faena real.</p>
          <a href={REPO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-tinta">
            Código en GitHub
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <a href="./licencias.txt" className="hover:text-tinta">
            Licencias de terceros
          </a>
        </div>
      </footer>
    </>
  )
}

function Pestanas({ vista, className }: { vista: Vista; className?: string }) {
  return (
    <nav aria-label="Vistas" className={cn('items-stretch gap-1 text-[14px]', className)}>
      {VISTAS.map((v) => (
        <a
          key={v.id}
          href={v.ancla}
          aria-current={vista === v.id ? 'page' : undefined}
          className={cn(
            'relative inline-flex h-11 shrink-0 items-center px-3 text-tinta-suave transition-colors hover:text-tinta md:h-14',
            vista === v.id && 'font-semibold text-tinta after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-acento',
          )}
        >
          {v.texto}
        </a>
      ))}
    </nav>
  )
}

/** La mina que se está mirando, siempre a la vista: lleva a «Tu mina». */
function MinaActual() {
  const e = useEscenario()
  return (
    <a
      href="#mina"
      className="hidden h-8 max-w-[15rem] items-center gap-2 rounded-md border bg-superficie px-2.5 text-[13px] hover:bg-hundida sm:inline-flex"
      title="Cambiar la mina"
    >
      <Mountain className="size-3.5 shrink-0 text-acento" aria-hidden />
      <span className="truncate font-medium">{e.nombre}</span>
    </a>
  )
}

/** Qué mina se está mirando: la de ejemplo o una propia (escrita, abierta o recibida en un enlace). */
function MinaEnPantalla() {
  const e = useEscenario()
  const ejemplo = esPorDefecto(e) && e.nombre === EJEMPLO.nombre
  const apertura = aperturaInicial()
  const p = e.parametros
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[13.5px]" role="status">
      <span className="text-tinta-tenue">En pantalla:</span>
      <span className="font-semibold">{e.nombre}</span>
      <span className="text-tinta-tenue">
        {p.camiones} camiones de {numero(p.capacidadT)}{NB}t, {p.palas} {p.palas === 1 ? 'pala' : 'palas'}
        {apertura && 'nombre' in apertura && apertura.nombre === e.nombre ? ', abierta desde un enlace' : ''}
      </span>
      <a href="#mina" className="font-medium text-acento hover:underline">
        {ejemplo ? 'Usar los números de tu mina' : 'Ver o cambiar sus datos'}
      </a>
      <a href="#flota" className="text-tinta-suave hover:text-tinta hover:underline">
        ¿Cuántos camiones convienen?
      </a>
      {apertura && 'error' in apertura && <span className="basis-full text-falla">El enlace traía una mina que no se pudo abrir: {apertura.error}</span>}
    </div>
  )
}

function BajadaFlota() {
  const e = useEscenario()
  const flotas = flotasABarrer(e.parametros, esPorDefecto(e))
  return (
    <>
      De {flotas[0]} a {flotas.at(-1)} camiones{flotas[1] - flotas[0] > 1 ? `, de ${flotas[1] - flotas[0]} en ${flotas[1] - flotas[0]}` : ''}, 30 turnos por flota.
    </>
  )
}

function Seccion({ id, titulo, bajada, oculta, children }: { id: string; titulo: string; bajada: ReactNode; oculta: boolean; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} hidden={oculta} className="pt-6 sm:pt-8">
      <h2 id={`${id}-titulo`} className="ancha text-[1.6rem] leading-tight font-bold tracking-[-0.01em] sm:text-[1.9rem]">
        {titulo}
      </h2>
      <p className="mt-1.5 mb-5 max-w-[70ch] text-[14px] text-tinta-tenue">{bajada}</p>
      {children}
    </section>
  )
}

const TEMAS: { valor: Tema; texto: string; icono: typeof Sun }[] = [
  { valor: 'claro', texto: 'Claro', icono: Sun },
  { valor: 'oscuro', texto: 'Oscuro', icono: Moon },
  { valor: 'sistema', texto: 'Sistema', icono: Monitor },
]

function SelectorTema() {
  const [tema] = useTema()
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex rounded-md border bg-superficie p-0.5">
      {TEMAS.map(({ valor, texto, icono: Icono }) => (
        <button
          key={valor}
          role="radio"
          aria-checked={tema === valor}
          aria-label={texto}
          title={texto}
          onClick={() => cambiarTema(valor)}
          className={cn('inline-flex h-7 w-8 items-center justify-center rounded-[5px] text-tinta-tenue hover:text-tinta', tema === valor && 'bg-hundida text-tinta')}
        >
          <Icono className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  )
}
