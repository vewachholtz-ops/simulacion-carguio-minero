// Los números de la mina, agrupados como se piensan en terreno: la flota y el carguío, la ruta al chancador, la
// descarga, las fallas, el turno y los costos. Un dato vacío queda marcado; mientras falte algo, la página sigue con
// el último escenario completo.
import type { ReactNode } from 'react'
import { minutos } from '../lib/formato'
import { cn } from '../lib/utiles'
import { Segmentos } from '../simulador/Simulador'
import { type Clave, type Formulario as F, leerNumero } from './textos'

interface Props {
  f: F
  cambiar: (f: F) => void
}

export function Formulario({ f, cambiar }: Props) {
  const texto = (k: Clave, v: string) => cambiar({ ...f, textos: { ...f.textos, [k]: v } })
  const campo = (k: Clave, etiqueta: string, unidad?: string, opciones: { ancho?: string; opcional?: boolean; ayuda?: string } = {}) => (
    <Numero
      key={k}
      id={`mina-${k}`}
      etiqueta={etiqueta}
      unidad={unidad}
      valor={f.textos[k]}
      alCambiar={(v) => texto(k, v)}
      vacio={!opciones.opcional && !f.textos[k].trim()}
      malo={!!f.textos[k].trim() && leerNumero(f.textos[k]) === null}
      ancho={opciones.ancho}
    />
  )
  const viaje = (k: 'acarreo' | 'retorno') => {
    const d = leerNumero(f.textos.distanciaKm)
    const v = leerNumero(f.textos[k === 'acarreo' ? 'velocidadCargado' : 'velocidadVacio'])
    return d && v ? minutos((d / v) * 60) : '—'
  }

  return (
    <div className="divide-y rounded-lg border bg-superficie">
      <Grupo titulo="Flota y carguío" nota="La pala tarda distinto en cada camión: escribe el tiempo más corto, el más común y el más largo.">
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {campo('camiones', 'Camiones', undefined, { ancho: 'w-16' })}
          {campo('palas', 'Palas', undefined, { ancho: 'w-16' })}
          {campo('capacidadT', 'Capacidad del camión', 't')}
          {campo('posicionamiento', 'Posicionarse en la pala', 'min')}
        </div>
        <Trio etiqueta="Carga del camión" claves={['carga0', 'carga1', 'carga2']} campo={campo} />
      </Grupo>

      <Grupo titulo="Ruta al chancador" nota="Si conoces la distancia y las velocidades, los tiempos de viaje salen de ahí.">
        <Segmentos
          etiqueta="Cómo describir la ruta"
          opciones={[
            { valor: 'distancia', texto: 'Distancia y velocidad' },
            { valor: 'tiempos', texto: 'Tiempos de viaje' },
          ]}
          valor={f.modoRuta}
          alElegir={(v) => cambiar({ ...f, modoRuta: v as F['modoRuta'] })}
        />
        {f.modoRuta === 'distancia' ? (
          <>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
              {campo('distanciaKm', 'Distancia, solo ida', 'km')}
              {campo('velocidadCargado', 'Velocidad cargado', 'km/h')}
              {campo('velocidadVacio', 'Velocidad vacío', 'km/h')}
              {campo('variacionPct', 'Cuánto varía un viaje', '%', { ancho: 'w-16' })}
            </div>
            <p className="mt-2 text-[12.5px] text-tinta-tenue">
              Acarreo cargado: {viaje('acarreo')}; retorno vacío: {viaje('retorno')}. La variación es la desviación estándar como porcentaje del tiempo medio.
            </p>
          </>
        ) : (
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
            <Par etiqueta="Acarreo cargado">
              {campo('acarreo0', 'media', 'min')}
              {campo('acarreo1', 'desviación', 'min')}
            </Par>
            <Par etiqueta="Retorno vacío">
              {campo('retorno0', 'media', 'min')}
              {campo('retorno1', 'desviación', 'min')}
            </Par>
          </div>
        )}
      </Grupo>

      <Grupo titulo="Descarga en el chancador" nota="Un camión descarga a la vez; si el chancador está ocupado, espera.">
        <Trio etiqueta="Descarga" claves={['descarga0', 'descarga1', 'descarga2']} campo={campo} />
      </Grupo>

      <Grupo titulo="Fallas de las palas" nota="Al azar: a veces seguidas, a veces muy separadas, con este promedio.">
        <Segmentos
          etiqueta="Fallas de las palas"
          opciones={[
            { valor: 'si', texto: 'Con fallas' },
            { valor: 'no', texto: 'Sin fallas' },
          ]}
          valor={f.conFallas ? 'si' : 'no'}
          alElegir={(v) => cambiar({ ...f, conFallas: v === 'si' })}
        />
        {f.conFallas && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
            {campo('mtbfH', 'Una falla cada', 'h por pala')}
            {campo('mttr', 'Reparación', 'min')}
          </div>
        )}
      </Grupo>

      <Grupo titulo="Turno, costos y meta" nota="Los primeros minutos no se cuentan: la flota recién está saliendo.">
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {campo('turnoH', 'Turno', 'h', { ancho: 'w-16' })}
          {campo('calentamiento', 'Sin contar los primeros', 'min', { ancho: 'w-16' })}
          {campo('camionUsdH', 'Costo de un camión', 'USD/h')}
          {campo('palaUsdH', 'Costo de una pala', 'USD/h')}
          {campo('meta', 'Meta (opcional)', 't por turno', { ancho: 'w-24', opcional: true })}
        </div>
      </Grupo>
    </div>
  )
}

function Grupo({ titulo, nota, children }: { titulo: string; nota: string; children: ReactNode }) {
  const id = `grupo-${titulo.normalize('NFD').replace(/[^a-zA-Z]+/g, '-').toLowerCase()}`
  return (
    <div role="group" aria-labelledby={id} className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:px-5 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div>
        <p id={id} className="text-[14.5px] font-semibold">
          {titulo}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-tinta-tenue">{nota}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Trio({ etiqueta, claves, campo }: { etiqueta: string; claves: [Clave, Clave, Clave]; campo: (k: Clave, e: string, u?: string) => ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[13px] font-medium">{etiqueta}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-3">
        {campo(claves[0], 'la más corta', 'min')}
        {campo(claves[1], 'la más común', 'min')}
        {campo(claves[2], 'la más larga', 'min')}
      </div>
    </div>
  )
}

function Par({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium">{etiqueta}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-3">{children}</div>
    </div>
  )
}

function Numero({
  id,
  etiqueta,
  unidad,
  valor,
  alCambiar,
  vacio,
  malo,
  ancho = 'w-20',
}: {
  id: string
  etiqueta: string
  unidad?: string
  valor: string
  alCambiar: (v: string) => void
  vacio: boolean
  malo: boolean
  ancho?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12.5px] leading-tight text-tinta-suave">
        {etiqueta}
      </label>
      <span className="flex items-center gap-1.5">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          aria-invalid={vacio || malo || undefined}
          className={cn(
            'angosta cifras h-9 rounded-md border bg-fondo px-2.5 text-right text-[15px] text-tinta',
            ancho,
            (vacio || malo) && 'border-dashed border-cobre bg-cobre-tinte/40',
          )}
        />
        {unidad && <span className="text-[12.5px] whitespace-nowrap text-tinta-tenue">{unidad}</span>}
      </span>
    </div>
  )
}
