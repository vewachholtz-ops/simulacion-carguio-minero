// La bitácora del turno: cuándo estuvo trabajando cada pala y el chancador, y cuándo estuvo una pala en reparación.
// Una línea marca el minuto que muestra el mapa; tocar la bitácora lleva a ese minuto.
import { memo, type PointerEvent, useRef } from 'react'
import type { Registro } from '../modelo/simulacion'
import { hora } from '../lib/formato'
import { cn } from '../lib/utiles'

interface Fila {
  nombre: string
  trabajo: [number, number][]
  reparacion: [number, number][]
  esperaReparacion: [number, number][]
}

export function filasBitacora(registro: Registro, palas: number): Fila[] {
  const tramos = registro.camiones.flat()
  return [
    ...Array.from({ length: palas }, (_, i) => ({
      nombre: `Pala ${i + 1}`,
      trabajo: tramos.filter((t) => t.tipo === 'carga' && t.pala === i).map((t) => [t.inicio, t.fin] as [number, number]),
      reparacion: registro.reparaciones[i].map((r) => [r.inicio, r.fin] as [number, number]),
      esperaReparacion: registro.reparaciones[i].map((r) => [r.falla, r.inicio] as [number, number]),
    })),
    {
      nombre: 'Chancador',
      trabajo: tramos.filter((t) => t.tipo === 'descarga').map((t) => [t.inicio, t.fin] as [number, number]),
      reparacion: [],
      esperaReparacion: [],
    },
  ]
}

const Barras = memo(function Barras({ filas, turno }: { filas: Fila[]; turno: number }) {
  const pos = ([a, b]: [number, number]) => ({ left: `${(100 * a) / turno}%`, width: `${(100 * Math.max(0, Math.min(b, turno) - a)) / turno}%` })
  return (
    <>
      {filas.map((f) => (
        <div key={f.nombre} className="relative h-3.5 rounded-[3px] bg-hundida">
          {/* el nombre cuelga a la izquierda de la barra, en el margen de la bitácora */}
          <span className="absolute top-0 -left-[5.25rem] w-[4.5rem] leading-[14px] whitespace-nowrap">{f.nombre}</span>
          {f.trabajo.map((t, k) => (
            <span key={k} className="absolute inset-y-0 bg-acento" style={pos(t)} />
          ))}
          {f.esperaReparacion.map((t, k) => (
            <span key={`e${k}`} className="absolute inset-y-0 bg-falla/35" style={pos(t)} />
          ))}
          {f.reparacion.map((t, k) => (
            <span key={`r${k}`} className="absolute inset-y-0 bg-falla" style={pos(t)} />
          ))}
        </div>
      ))}
    </>
  )
})

export function Bitacora({
  filas,
  turno,
  calentamiento,
  t,
  alBuscar,
}: {
  filas: Fila[]
  turno: number
  calentamiento: number
  t: number
  alBuscar: (t: number) => void
}) {
  const pista = useRef<HTMLDivElement>(null)
  const buscar = (e: PointerEvent) => {
    const caja = pista.current!.getBoundingClientRect()
    alBuscar(Math.min(turno, Math.max(0, ((e.clientX - caja.left) / caja.width) * turno)))
  }
  const marcas = Array.from({ length: Math.floor(turno / 120) + 1 }, (_, k) => k * 120)
  return (
    <div className="pl-[5.25rem] text-[12px] text-tinta-tenue">
      <div
        ref={pista}
        className="relative cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          buscar(e)
        }}
        onPointerMove={(e) => e.buttons === 1 && buscar(e)}
        role="presentation"
      >
        <div className="relative mb-1 h-[14px]">
          <span
            className="absolute inset-y-0 left-0 rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--hundida)_0_4px,transparent_4px_8px)]"
            style={{ width: `${(100 * calentamiento) / turno}%` }}
          />
          <span className="absolute top-0 left-1 text-[11px] leading-[14px]">calentamiento</span>
        </div>
        <div className="grid gap-1.5">
          <Barras filas={filas} turno={turno} />
        </div>
        <div className="relative mt-1 h-4">
          {marcas.map((m) => (
            <span
              key={m}
              className={cn('cifras absolute', m === 0 ? '' : m >= turno ? '-translate-x-full' : '-translate-x-1/2')}
              style={{ left: `${(100 * m) / turno}%` }}
            >
              {hora(m)}
            </span>
          ))}
        </div>
        <span aria-hidden className="pointer-events-none absolute top-0 bottom-5 w-0.5 -translate-x-1/2 rounded-full bg-tinta" style={{ left: `${(100 * t) / turno}%` }} />
      </div>
    </div>
  )
}
