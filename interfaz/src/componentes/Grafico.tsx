// Un gráfico de Observable Plot que se ajusta al ancho de su caja y se redibuja al cambiar el tema.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTema } from '../lib/tema'
import { cn } from '../lib/utiles'

export function Grafico({
  dibujar,
  etiqueta,
  className,
}: {
  /** Arma el gráfico para un ancho dado (en px). */
  dibujar: (ancho: number) => SVGSVGElement | HTMLElement
  /** Qué muestra, para lectores de pantalla. */
  etiqueta: string
  className?: string
}) {
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  const [, version] = useTema()
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setAncho(Math.floor(el.clientWidth))
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])
  useEffect(() => {
    const el = caja.current
    if (!el || ancho < 50) return
    const grafico = dibujar(ancho)
    el.replaceChildren(grafico)
    return () => grafico.remove()
  }, [ancho, version, dibujar])
  return <div ref={caja} role="img" aria-label={etiqueta} className={cn('grafico w-full', className)} />
}
