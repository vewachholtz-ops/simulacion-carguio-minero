import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/utiles'

const VARIANTES = {
  principal: 'bg-acento text-sobre-acento hover:bg-acento-hondo border border-transparent',
  contorno: 'bg-superficie text-tinta border border-linea hover:bg-hundida',
  fantasma: 'bg-transparent text-tinta-suave hover:bg-hundida hover:text-tinta border border-transparent',
}
const TAMANOS = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  icono: 'h-8 w-8 p-0 justify-center',
}

/** Las clases de un botón, para usarlas también en enlaces que se ven como botón. */
export function estiloBoton(variante: keyof typeof VARIANTES = 'contorno', tamano: keyof typeof TAMANOS = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center rounded-md font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0',
    VARIANTES[variante],
    TAMANOS[tamano],
    className,
  )
}

export const Boton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof VARIANTES; tamano?: keyof typeof TAMANOS }
>(function Boton({ variante = 'contorno', tamano = 'md', className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={estiloBoton(variante, tamano, className)}
      {...props}
    />
  )
})
