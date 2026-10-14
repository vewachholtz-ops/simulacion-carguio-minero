// La maqueta en la página, enmarcada como las figuras de Anatomy: arriba la figura y el título, abajo cómo moverla y
// la lectura en vivo. Si el navegador no tiene WebGL, se muestra el mapa plano de antes.
import { RotateCcw } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTema } from '../lib/tema'
import { Maqueta } from './escena'
import type { FotoMaqueta } from './estado'

const oscuro = () => document.documentElement.classList.contains('dark')

export function MaquetaVista({
  foto,
  palas,
  etiqueta,
  titulo,
  lectura,
  respaldo,
}: {
  foto: FotoMaqueta
  palas: number
  etiqueta: string
  titulo: string
  lectura: ReactNode
  /** Lo que se muestra si no hay WebGL. */
  respaldo: () => ReactNode
}) {
  const caja = useRef<HTMLDivElement>(null)
  const maqueta = useRef<Maqueta | null>(null)
  const [sinWebgl, setSinWebgl] = useState(false)
  const [, version] = useTema()

  useEffect(() => {
    if (!caja.current) return
    try {
      maqueta.current = new Maqueta(caja.current, oscuro())
    } catch {
      setSinWebgl(true)
    }
    return () => {
      maqueta.current?.liberar()
      maqueta.current = null
    }
  }, [])

  useEffect(() => {
    maqueta.current?.mostrar(foto, palas)
  }, [foto, palas])

  useEffect(() => {
    maqueta.current?.cambiarTema(oscuro())
  }, [version])

  if (sinWebgl) return <>{respaldo()}</>

  return (
    <figure className="relative m-0 h-full" aria-label={etiqueta}>
      <div ref={caja} className="absolute inset-0" role="img" aria-label={etiqueta} />
      <figcaption className="pointer-events-none absolute inset-x-4 top-3 flex items-start justify-between gap-4 font-mono text-[10.5px] tracking-[0.04em] text-tinta-tenue sm:inset-x-5 sm:top-4">
        <span className="whitespace-nowrap text-tinta-suave">Fig. 1</span>
        <span className="hidden truncate text-right tracking-[0.1em] uppercase sm:block">{titulo}</span>
      </figcaption>
      <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-4 font-mono text-[10.5px] tracking-[0.04em] text-tinta-tenue sm:inset-x-5 sm:bottom-4">
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => maqueta.current?.restablecer()}
            className="inline-flex items-center gap-1.5 rounded-sm tracking-[0.1em] uppercase hover:text-tinta"
            aria-label="Volver a la vista inicial"
          >
            <RotateCcw className="size-3" aria-hidden />
            Vista
          </button>
          <span className="hidden tracking-[0.1em] uppercase md:inline">Arrastra para girar · rueda para acercar</span>
        </span>
        <span className="text-right text-tinta-suave tabular-nums">{lectura}</span>
      </div>
    </figure>
  )
}
