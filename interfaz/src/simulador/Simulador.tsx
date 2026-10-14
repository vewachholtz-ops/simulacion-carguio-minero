// El simulador: un turno simulado entero al tiro (el mismo modelo del barrido) y reproducido en la maqueta 3D de la
// mina, con la bitácora de las palas y el chancador y los controles de la flota. Cambiar algo vuelve a simular el turno
// y deja el reloj donde estaba, para comparar la mina en el mismo minuto.
import { Minus, Pause, Play, Plus, RotateCcw, Shuffle } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Boton } from '../componentes/ui'
import { cambiar, useEscenario } from '../lib/escenario'
import { prepararMaqueta } from '../maqueta/estado'
import { MaquetaVista } from '../maqueta/MaquetaVista'
import { hora, minutos, numero, NB, pct, th } from '../lib/formato'
import { cn } from '../lib/utiles'
import { camionesEquilibrio } from '../lib/escenario'
import { factorAcoplamiento, PARAMETROS, simular } from '../modelo/simulacion'
import { Bitacora, filasBitacora } from './Bitacora'
import { preparar } from './estado'
import { palas as ubicarPalas } from './geometria'
import { Mapa } from './Mapa'

const VELOCIDADES = [
  { nombre: 'Lenta', minPorSegundo: 3 },
  { nombre: 'Normal', minPorSegundo: 10 },
  { nombre: 'Rápida', minPorSegundo: 30 },
]
const QUIETO = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function Simulador() {
  const { parametros: p, nombre } = useEscenario()
  const [semilla, setSemilla] = useState(1000)
  const [t, setT] = useState(QUIETO ? 180 : 0)
  const [andando, setAndando] = useState(!QUIETO)
  const [velocidad, setVelocidad] = useState(1)
  const mtbfGuardado = useRef(p.mtbfPala ?? PARAMETROS.mtbfPala)

  const turno = useMemo(() => simular(p, semilla, true), [p, semilla])
  const registro = turno.registro!
  const posPalas = useMemo(() => ubicarPalas(p.palas), [p.palas])
  const foto = useMemo(() => preparar(p, registro, posPalas), [p, registro, posPalas])
  const filas = useMemo(() => filasBitacora(registro, p.palas), [registro, p.palas])
  const ahora = foto(t)
  const maqueta = useMemo(() => prepararMaqueta(p, registro), [p, registro])
  const ahora3d = useMemo(() => maqueta(t), [maqueta, t])

  // el reloj: avanza mientras está andando y se ve en pantalla, y se detiene al cerrar el turno
  const tRef = useRef(t)
  tRef.current = t
  const panel = useRef<HTMLDivElement>(null)
  const [aLaVista, setALaVista] = useState(true)
  useEffect(() => {
    const el = panel.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => setALaVista(e.isIntersecting))
    o.observe(el)
    return () => o.disconnect()
  }, [])
  useEffect(() => {
    if (!andando || !aLaVista) return
    let anterior = performance.now()
    let cuadro = requestAnimationFrame(function paso(ahora) {
      const nuevo = tRef.current + ((ahora - anterior) / 1000) * VELOCIDADES[velocidad].minPorSegundo
      anterior = ahora
      if (nuevo >= p.turno) {
        setT(p.turno)
        setAndando(false)
        return
      }
      setT(nuevo)
      cuadro = requestAnimationFrame(paso)
    })
    return () => cancelAnimationFrame(cuadro)
  }, [andando, aLaVista, velocidad, p.turno])

  const efectivas = (t - p.calentamiento) / 60
  const produccion = efectivas > 1 / 6 ? ahora.toneladasEfectivas / efectivas : null
  const palasCargando = ahora.palas.filter((e) => e === 'cargando').length
  const conFallas = p.mtbfPala !== null
  const maxCamiones = Math.max(30, p.camiones, Math.ceil(camionesEquilibrio(p) * 2))
  const opcionesPalas = Array.from({ length: Math.max(3, p.palas) }, (_, i) => String(i + 1))

  return (
    <div ref={panel} className="overflow-hidden rounded-lg border bg-superficie shadow-[0_1px_0_var(--linea)]">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 border-b xl:border-r xl:border-b-0">
          <div className="h-[clamp(18rem,60vw,40rem)]">
            <MaquetaVista
              foto={ahora3d}
              palas={p.palas}
              titulo={`${nombre} · ${p.camiones} camiones · ${p.palas} ${p.palas === 1 ? 'pala' : 'palas'}`}
              lectura={`${numero(ahora.toneladas)}${NB}t al chancador`}
              etiqueta={`La mina a las ${hora(t)}: ${ahora.cuenta.cargando} camiones cargando, ${ahora.cuenta.viajando} en viaje, ${ahora.cuenta.colaPala} en cola en las palas y ${ahora.cuenta.colaChancador} en el chancador`}
              respaldo={() => (
                <Mapa
                  foto={ahora}
                  palas={posPalas}
                  etiqueta={`El rajo a las ${hora(t)}: ${ahora.cuenta.cargando} camiones cargando, ${ahora.cuenta.viajando} en viaje, ${ahora.cuenta.colaPala} en cola en las palas y ${ahora.cuenta.colaChancador} en el chancador`}
                />
              )}
            />
          </div>
          <div className="space-y-4 border-t px-4 pt-4 pb-5 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <Boton
                variante="principal"
                tamano="icono"
                className="size-9"
                aria-label={andando ? 'Pausar' : 'Reproducir el turno'}
                onClick={() => {
                  if (!andando && t >= p.turno) setT(0)
                  setAndando((a) => !a)
                }}
              >
                {andando ? <Pause aria-hidden /> : <Play aria-hidden />}
              </Boton>
              <Boton variante="fantasma" tamano="icono" className="size-9" aria-label="Volver al inicio del turno" onClick={() => setT(0)}>
                <RotateCcw aria-hidden />
              </Boton>
              <label className="flex min-w-48 flex-1 items-center gap-3">
                <span className="sr-only">Minuto del turno</span>
                <input
                  type="range"
                  min={0}
                  max={p.turno}
                  step={0.5}
                  value={t}
                  onChange={(e) => setT(Number(e.target.value))}
                  aria-valuetext={hora(t)}
                  className="w-full"
                />
              </label>
              <Segmentos
                etiqueta="Velocidad"
                opciones={VELOCIDADES.map((v) => ({ valor: v.nombre, texto: v.nombre }))}
                valor={VELOCIDADES[velocidad].nombre}
                alElegir={(v) => setVelocidad(VELOCIDADES.findIndex((x) => x.nombre === v))}
              />
            </div>
            <Bitacora filas={filas} turno={p.turno} calentamiento={p.calentamiento} t={t} alBuscar={setT} />
            <Leyenda />
          </div>
        </div>

        <aside className="flex flex-col gap-6 p-5" aria-label="Despacho">
          <div>
            <p className="text-[12.5px] text-tinta-tenue">Hora del turno</p>
            <p className="ancha cifras text-[2.6rem] leading-none font-bold tracking-tight" aria-live="off">
              {hora(t)}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Lectura nombre="Al chancador" valor={`${numero(ahora.toneladas)}${NB}t`} />
              <Lectura nombre="Producción" valor={produccion === null ? '—' : th(produccion)} nota={produccion === null ? `desde las ${hora(p.calentamiento + 10)}` : undefined} />
              <Lectura nombre="En cola en palas" valor={String(ahora.cuenta.colaPala)} />
              <Lectura nombre="En cola en chancador" valor={String(ahora.cuenta.colaChancador)} />
              <Lectura nombre="Palas cargando" valor={`${palasCargando} de ${p.palas}`} />
              <Lectura nombre="Camiones en viaje" valor={String(ahora.cuenta.viajando)} />
            </dl>
          </div>

          <div className="space-y-4 border-t pt-5">
            <Campo nombre="Camiones" detalle={`acoplamiento ${numero(factorAcoplamiento(p), 2)}`}>
              <div className="flex items-center gap-2">
                <Boton tamano="icono" aria-label="Un camión menos" disabled={p.camiones <= 1} onClick={() => cambiar({ parametros: { camiones: p.camiones - 1 } })}>
                  <Minus aria-hidden />
                </Boton>
                <input
                  type="range"
                  min={1}
                  max={maxCamiones}
                  value={p.camiones}
                  onChange={(e) => cambiar({ parametros: { camiones: Number(e.target.value) } })}
                  className="w-full"
                  aria-label="Camiones"
                />
                <Boton tamano="icono" aria-label="Un camión más" disabled={p.camiones >= maxCamiones} onClick={() => cambiar({ parametros: { camiones: p.camiones + 1 } })}>
                  <Plus aria-hidden />
                </Boton>
                <span className="ancha cifras w-8 text-right text-[1.35rem] font-bold">{p.camiones}</span>
              </div>
            </Campo>
            <Campo nombre="Palas">
              <Segmentos
                etiqueta="Palas"
                opciones={opcionesPalas.map((n) => ({ valor: n, texto: n }))}
                valor={String(p.palas)}
                alElegir={(v) => cambiar({ parametros: { palas: Number(v) } })}
                ancho
              />
            </Campo>
            <Campo nombre="Fallas de las palas" detalle={conFallas ? `una cada ${numero(p.mtbfPala! / 60, 0)}${NB}h en promedio` : undefined}>
              <Segmentos
                etiqueta="Fallas de las palas"
                opciones={[
                  { valor: 'si', texto: 'Con fallas' },
                  { valor: 'no', texto: 'Sin fallas' },
                ]}
                valor={conFallas ? 'si' : 'no'}
                alElegir={(v) => {
                  if (p.mtbfPala !== null) mtbfGuardado.current = p.mtbfPala
                  cambiar({ parametros: { mtbfPala: v === 'si' ? mtbfGuardado.current : null } })
                }}
                ancho
              />
            </Campo>
            <Boton variante="contorno" tamano="sm" className="w-full justify-center" onClick={() => setSemilla((s) => s + 1)}>
              <Shuffle aria-hidden />
              Simular otro turno
            </Boton>
          </div>

          <div className="mt-auto border-t pt-5">
            <p className="text-[13px] font-semibold">Este turno, completo</p>
            <p className="mb-3 text-[12px] text-tinta-tenue">
              {p.calentamiento > 0 ? `Sin contar los primeros ${numero(p.calentamiento)}${NB}min. ` : ''}Turno n.º {semilla - 999}.
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Lectura nombre="Producción" valor={th(turno.produccionTH)} />
              <Lectura nombre="Palas cargando" valor={pct(turno.utilizacionPalas)} />
              <Lectura nombre="Espera en pala" valor={minutos(turno.esperaPala)} />
              <Lectura nombre="Ciclo medio" valor={Number.isFinite(turno.cicloMedio) ? minutos(turno.cicloMedio) : '—'} />
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Lectura({ nombre, valor, nota }: { nombre: string; valor: string; nota?: string }) {
  return (
    <div>
      <dt className="text-[12px] leading-tight text-tinta-tenue">{nombre}</dt>
      <dd className="angosta cifras text-[1.2rem] leading-snug font-semibold">
        {valor}
        {nota && <span className="ml-1.5 text-[11.5px] font-normal text-tinta-tenue">{nota}</span>}
      </dd>
    </div>
  )
}

function Campo({ nombre, detalle, children }: { nombre: string; detalle?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{nombre}</span>
        {detalle && <span className="text-[12px] text-tinta-tenue">{detalle}</span>}
      </div>
      {children}
    </div>
  )
}

export function Segmentos({
  etiqueta,
  opciones,
  valor,
  alElegir,
  ancho,
}: {
  etiqueta: string
  opciones: { valor: string; texto: string }[]
  valor: string
  alElegir: (v: string) => void
  ancho?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className={cn('inline-flex rounded-md border bg-hundida/60 p-0.5', ancho && 'flex w-full')}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => alElegir(o.valor)}
          className={cn(
            'h-7 rounded-[5px] px-2.5 text-[13px] text-tinta-suave transition-colors hover:text-tinta',
            ancho && 'flex-1',
            valor === o.valor && 'bg-superficie font-medium text-tinta shadow-[0_0_0_1px_var(--linea)]',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

function Leyenda() {
  const muestra = (clase: string) => <span aria-hidden className={cn('inline-block h-2.5 w-4 rounded-[2px]', clase)} />
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-tinta-suave" aria-label="Leyenda">
      <li className="flex items-center gap-2">
        {muestra('border border-tinta bg-cobre')}
        Mineral: en la tolva, en la correa y en el acopio, que crece con el turno
      </li>
      <li className="flex items-center gap-2">
        {muestra('border-2 border-tinta bg-superficie')}
        Camión vaciando en el chancador (aristas marcadas)
      </li>
      <li className="flex items-center gap-2">
        {muestra('border border-falla bg-superficie')}
        Pala en falla o en reparación
      </li>
      <li className="flex items-center gap-2">
        {muestra('bg-acento')}
        Bitácora: cargando o descargando
      </li>
      <li className="flex items-center gap-2">
        {muestra('bg-falla/35')}
        Falla, esperando que termine la carga
      </li>
    </ul>
  )
}
