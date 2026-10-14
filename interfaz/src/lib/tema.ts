// Tema claro, oscuro o el del sistema. Los gráficos se vuelven a dibujar al cambiarlo: leen los colores del CSS.
import { useSyncExternalStore } from 'react'

export type Tema = 'claro' | 'oscuro' | 'sistema'
const CLAVE = 'rajo.tema'
const oyentes = new Set<() => void>()
let version = 0

function guardado(): Tema {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t === 'claro' || t === 'oscuro' || t === 'sistema') return t
  } catch {
    /* sin almacenamiento: el del sistema */
  }
  return 'sistema'
}

let actual: Tema = guardado()
const medio = matchMedia('(prefers-color-scheme: dark)')

function aplicar() {
  const oscuro = actual === 'oscuro' || (actual === 'sistema' && medio.matches)
  document.documentElement.classList.toggle('dark', oscuro)
  version++
  oyentes.forEach((o) => o())
}
aplicar()
medio.addEventListener('change', () => actual === 'sistema' && aplicar())

export function cambiarTema(t: Tema) {
  actual = t
  try {
    localStorage.setItem(CLAVE, t)
  } catch {
    /* no importa */
  }
  aplicar()
}

/** El tema elegido y un número que cambia cada vez que cambian los colores (para redibujar). */
export function useTema(): [Tema, number] {
  const v = useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => version,
  )
  return [actual, v]
}

/** El valor de una variable de color del tema, para los gráficos. */
export function color(variable: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${variable}`).trim()
}
