// Cifras en español de Chile: punto para los miles, coma para los decimales. Entre la cifra y su unidad va un espacio
// que no se corta (NBSP), para que «5.242 t/h» no quede partido en dos líneas.
export const NB = ' '

export function numero(n: number, decimales = 0) {
  return n.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}
export const pct = (fraccion: number, decimales = 0) => `${numero(fraccion * 100, decimales)}${NB}%`
export const th = (n: number) => `${numero(n)}${NB}t/h`
export const usdT = (n: number) => `${numero(n, 2)}${NB}USD/t`
export const minutos = (n: number, decimales = 1) => `${numero(n, decimales)}${NB}min`

/** El minuto t del turno como hora del reloj (el turno parte a las 8:00). */
export function hora(t: number, inicio = 8 * 60) {
  const total = Math.floor(inicio + t)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
