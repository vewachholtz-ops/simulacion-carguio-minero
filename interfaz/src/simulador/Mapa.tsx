// El rajo desde arriba, con las palas, el chancador y cada camión donde está en el minuto que se mira.
import { memo, useLayoutEffect, useRef, useState } from 'react'
import type { Foto } from './estado'
import { ALTO, ANCHO, bancos, CAMINO_D, CHANCADOR, PIE_RAMPA, type Punto, puestoCarga } from './geometria'

const BANCOS = bancos()

/** Lo que no se mueve: el terreno, los bancos y el camino. */
const Fondo = memo(function Fondo() {
  return (
    <g aria-hidden>
      <rect width={ANCHO} height={ALTO} style={{ fill: 'var(--terreno)' }} />
      {BANCOS.map((b) => (
        <path key={b.nivel} d={b.d} style={{ fill: `var(--banco-${b.nivel})`, stroke: 'var(--cresta)' }} strokeWidth={b.nivel === 0 ? 1.4 : 0.8} />
      ))}
      <path d={CAMINO_D} fill="none" style={{ stroke: 'var(--cresta)' }} strokeWidth={19} strokeLinecap="round" strokeLinejoin="round" />
      <path d={CAMINO_D} fill="none" style={{ stroke: 'var(--camino)' }} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
      <path d={CAMINO_D} fill="none" style={{ stroke: 'var(--cresta)' }} strokeWidth={1} strokeDasharray="5 9" opacity={0.7} />
    </g>
  )
})

function Pala({ en, estado, numero, escala }: { en: Punto; estado: Foto['palas'][number]; numero: number; escala: number }) {
  const parada = estado === 'reparacion' || estado === 'falla'
  return (
    <g transform={`translate(${en[0]},${en[1]}) scale(${escala})`}>
      {estado === 'cargando' && <circle r={19} fill="none" style={{ stroke: 'var(--acento)' }} strokeWidth={2} opacity={0.45} />}
      <circle
        r={14}
        style={{
          fill: parada ? 'var(--falla)' : estado === 'cargando' ? 'var(--acento)' : 'var(--superficie)',
          stroke: parada ? 'var(--falla)' : estado === 'cargando' ? 'var(--acento)' : 'var(--tinta-tenue)',
        }}
        strokeWidth={1.5}
      />
      <text
        textAnchor="middle"
        dy="0.35em"
        className="ancha"
        style={{ fill: parada || estado === 'cargando' ? 'var(--sobre-acento)' : 'var(--tinta)', fontSize: 11, fontWeight: 700 }}
      >
        P{numero}
      </text>
      {parada && (
        <text textAnchor="middle" y={-24} style={{ fill: 'var(--falla)', fontSize: 12, fontWeight: 600 }}>
          {estado === 'falla' ? 'falla' : 'en reparación'}
        </text>
      )}
    </g>
  )
}

function Chancador({ descargando, escala }: { descargando: boolean; escala: number }) {
  const [x, y] = CHANCADOR
  return (
    <g transform={`translate(${x},${y}) scale(${Math.min(escala, 1.4)})`}>
      <rect x={-26} y={-24} width={52} height={44} rx={3} style={{ fill: 'var(--superficie)', stroke: 'var(--tinta-suave)' }} strokeWidth={1.5} />
      <path d="M-18,-10 L18,-10 L8,8 L-8,8 Z" style={{ fill: descargando ? 'var(--cobre)' : 'var(--hundida)', stroke: 'var(--tinta-suave)' }} strokeWidth={1} />
      <text textAnchor="middle" y={38} className="ancha" style={{ fill: 'var(--tinta-suave)', fontSize: 12, fontWeight: 650 }}>
        Chancador
      </text>
    </g>
  )
}

/** En pantallas angostas el mapa se achica: camiones, palas y rótulos crecen para que se sigan viendo. */
function useEscala() {
  const caja = useRef<SVGSVGElement>(null)
  const [escala, setEscala] = useState(1)
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setEscala(Math.min(2, Math.max(1, (0.62 * ANCHO) / Math.max(1, el.clientWidth))))
    medir()
    const o = new ResizeObserver(medir)
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return [caja, escala] as const
}

export function Mapa({ foto, palas, etiqueta }: { foto: Foto; palas: Punto[]; etiqueta: string }) {
  const [caja, escala] = useEscala()
  return (
    <svg ref={caja} viewBox={`0 0 ${ANCHO} ${ALTO}`} className="block h-auto w-full select-none" role="img" aria-label={etiqueta}>
      <Fondo />
      {/* los caminos del fondo del rajo, del pie de la rampa a cada pala */}
      {palas.map((p, i) => {
        const [x, y] = puestoCarga(p)
        return <path key={i} d={`M${PIE_RAMPA[0]},${PIE_RAMPA[1]}L${x},${y}`} style={{ stroke: 'var(--camino)' }} strokeWidth={11} strokeLinecap="round" opacity={0.85} />
      })}
      <Chancador descargando={foto.descargando} escala={escala} />
      {palas.map((p, i) => (
        <Pala key={i} en={p} estado={foto.palas[i]} numero={i + 1} escala={escala} />
      ))}
      {foto.camiones.map((c) => (
        <g
          key={c.j}
          transform={`translate(${c.x.toFixed(1)},${c.y.toFixed(1)}) rotate(${c.angulo.toFixed(1)}) scale(${escala})`}
          opacity={c.estado === 'espera_salida' ? 0.55 : 1}
        >
          <rect x={-9} y={-5.5} width={14} height={11} rx={2} style={{ fill: c.cargado ? 'var(--cobre)' : 'var(--superficie)', stroke: 'var(--tinta)' }} strokeWidth={1.3} />
          <rect x={5.5} y={-4.5} width={4} height={9} rx={1} style={{ fill: 'var(--tinta-suave)' }} />
        </g>
      ))}
    </svg>
  )
}
