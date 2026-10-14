// La mina de la maqueta, en metros y sin nada de dibujo: el bloque de terreno, el rajo con sus bancos, la rampa en
// espiral, los caminos y dónde está cada equipo. x apunta al este, y al norte y z hacia arriba (la superficie es z = 0).
// Las rutas que siguen los camiones salen de aquí, así que lo que se dibuja y lo que se mueve calzan.

export type P2 = [number, number]
export type P3 = [number, number, number]

/** El bloque de terreno cortado que sostiene la maqueta. */
export const BLOQUE = { x0: -440, x1: 630, y0: -360, y1: 410, fondo: -175 }

/** El rajo: elipse en superficie, ocho bancos de 14 m con su cara y su berma. */
export const RAJO = { cx: -70, cy: -10, a: 330, b: 255, alto: 14, bancos: 8, cara: 6, berma: 14 }
export const PASO = RAJO.cara + RAJO.berma
export const FONDO = -RAJO.alto * RAJO.bancos
/** Desde qué desplazamiento hacia adentro empieza el piso del rajo. */
export const BORDE_PISO = (RAJO.bancos - 1) * PASO + RAJO.cara

/** La rampa: 32 m de ancho (dos pistas y la berma de seguridad), 11 % de pendiente; baja en sentido antihorario,
 * por las paredes del norte, que son las que se ven desde la cámara. */
export const RAMPA = { ancho: 32, pendiente: 0.11, theta0: 0.18, desfase: -10, transicion: 6 }

/** Cuánto se aparta el contorno de una elipse perfecta en cada ángulo: los rajos reales no son regulares. */
const irregular = (theta: number) => 1 + 0.035 * Math.sin(2 * theta + 1.1) + 0.022 * Math.sin(3 * theta + 0.4) + 0.012 * Math.sin(5 * theta + 2.2)

/** Un punto del contorno desplazado s metros hacia adentro, en el ángulo theta. */
export function enElipse(theta: number, s: number): P2 {
  const k = irregular(theta)
  return [RAJO.cx + (RAJO.a * k - s) * Math.cos(theta), RAJO.cy + (RAJO.b * k - s) * Math.sin(theta)]
}

/** La altura del terreno del rajo según cuánto se entra desde el borde: caras de 15 m y bermas planas. */
export function perfil(s: number): number {
  if (s <= 0) return 0
  const k = Math.floor(s / PASO)
  if (k >= RAJO.bancos) return FONDO
  const u = s - k * PASO
  const t = Math.min(1, u / RAJO.cara)
  // la cara no es recta del todo: un leve redondeo en la cresta y en el pie
  const suave = t * t * (3 - 2 * t) * 0.35 + t * 0.65
  return -RAJO.alto * (k + suave)
}

// ---------------------------------------------------------------- la rampa
export interface MuestraRampa {
  theta: number
  /** Desplazamiento hacia adentro del eje de la rampa. */
  s: number
  z: number
  x: number
  y: number
  /** Metros recorridos desde la salida en superficie. */
  largo: number
}

function construirRampa(): MuestraRampa[] {
  const muestras: MuestraRampa[] = []
  let theta = RAMPA.theta0
  let largo = 0
  const desfase = (z: number) => (-z / RAJO.alto) * PASO + RAMPA.desfase
  let z = 0
  let [x, y] = enElipse(theta, desfase(0))
  muestras.push({ theta, s: desfase(0), z, x, y, largo })
  const dTheta = 0.002
  while (z > FONDO) {
    theta += dTheta
    // la altura baja con el largo; el desplazamiento sigue la pendiente media del talud
    const [nx, ny] = enElipse(theta, desfase(z))
    const paso = Math.hypot(nx - x, ny - y)
    largo += paso
    z = Math.max(FONDO, -largo * RAMPA.pendiente)
    ;[x, y] = enElipse(theta, desfase(z))
    muestras.push({ theta, s: desfase(z), z, x, y, largo })
  }
  // y sigue unos metros por el piso
  for (let i = 0; i < 25; i++) {
    theta += dTheta
    const s = desfase(FONDO) + i * 0.6
    const [nx, ny] = enElipse(theta, s)
    largo += Math.hypot(nx - x, ny - y)
    ;[x, y] = [nx, ny]
    muestras.push({ theta, s, z: FONDO, x, y, largo })
  }
  return muestras
}

export const RAMPA_EJE = construirRampa()
const THETA_FIN = RAMPA_EJE.at(-1)!.theta

/** El eje de la rampa en el ángulo theta, o null si la rampa no pasa por ahí. */
export function rampaEn(theta: number): MuestraRampa | null {
  // la rampa va de theta0 hacia ángulos mayores; se normaliza theta a ese tramo
  let t = theta
  while (t < RAMPA.theta0 - 1e-9) t += 2 * Math.PI
  while (t > THETA_FIN + 1e-9) t -= 2 * Math.PI
  if (t < RAMPA.theta0 || t > THETA_FIN) return null
  const i = (t - RAMPA.theta0) / 0.002
  const a = RAMPA_EJE[Math.floor(i)]
  const b = RAMPA_EJE[Math.min(RAMPA_EJE.length - 1, Math.floor(i) + 1)]
  if (!a) return null
  const f = i - Math.floor(i)
  return {
    theta: t,
    s: a.s + (b.s - a.s) * f,
    z: a.z + (b.z - a.z) * f,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    largo: a.largo + (b.largo - a.largo) * f,
  }
}

const suave = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

/** La altura final del terreno dentro del rajo: los bancos, cortados o rellenados donde pasa la rampa. */
export function altura(theta: number, s: number): { z: number; enRampa: number } {
  const z0 = perfil(s)
  const r = rampaEn(theta)
  if (!r) return { z: z0, enRampa: 0 }
  const d = Math.abs(s - r.s)
  const medio = RAMPA.ancho / 2
  if (d <= medio) return { z: r.z, enRampa: 1 }
  const t = suave(1 - (d - medio) / RAMPA.transicion)
  if (t <= 0) return { z: z0, enRampa: 0 }
  // hacia afuera, el corte sube en talud; hacia adentro, el relleno baja en talud
  return { z: r.z + (z0 - r.z) * (1 - t), enRampa: t }
}

/** Dónde sale la rampa a la superficie, y hacia dónde apunta al salir (subiendo). */
export const SALIDA = RAMPA_EJE[0]
export const PIE_RAMPA = RAMPA_EJE.at(-1)!

// ---------------------------------------------------------------- superficie: chancador, acopio, estacionamiento
/** El punto de descarga: el camión retrocede hasta aquí con la tolva hacia el buzón del chancador (al este). */
export const BUZON: P2 = [522, -95]
export const DESCARGA: P2 = [494, -95]
export const CHANCADOR = { x: 528, y: -121, w: 52, d: 54 }
/** El acopio de mineral chancado, que crece con las toneladas. */
export const ACOPIO: P2 = [575, 135]
/** El botadero de lastre, al norponiente. */
export const BOTADERO = { cx: -290, cy: 335, a: 135, b: 50 }
/** El taller de camiones y los estanques de petróleo, al sur de la planta. */
export const TALLER = { x: 455, y: -330, w: 120, d: 46 }

// ---------------------------------------------------------------- caminos (ejes en el plano)
export const CRUCE: P2 = [423, -101]
/** El camino de superficie desde la salida de la rampa hasta el cruce frente al chancador. */
export const CAMINO_SUPERFICIE: P2[] = (() => {
  const s = RAMPA_EJE[0]
  // la rampa sale apuntando al sur (sube en sentido horario)
  return [[s.x, s.y], [s.x + 4, s.y - 38], [s.x + 22, s.y - 90], [s.x + 62, s.y - 130], CRUCE]
})()
/** Acercarse al chancador, y retroceder hasta el punto de descarga. */
export const APROXIMACION: P2[] = [CRUCE, [448, -85], [474, -63]]
export const RETROCESO: P2[] = [[474, -63], [465, -77], [466, -89], [476, -95], DESCARGA]
/** Salir del chancador de vuelta al cruce. */
export const SALIDA_CHANCADOR: P2[] = [DESCARGA, [458, -97], CRUCE]

// ---------------------------------------------------------------- las palas en el piso del rajo
/** Dónde trabaja cada pala: repartidas por el piso, lejos del pie de la rampa, frente a la cara del último banco. */
export function palas(n: number): { x: number; y: number; theta: number; frente: number }[] {
  const tPie = PIE_RAMPA.theta
  // el arco libre: del lado opuesto al pie de la rampa
  const desde = tPie + 0.9
  const hasta = tPie + 2 * Math.PI - 0.9
  return Array.from({ length: n }, (_, i) => {
    const theta = n === 1 ? (desde + hasta) / 2 : desde + ((hasta - desde) * (i + 0.5)) / n
    const [x, y] = enElipse(theta, BORDE_PISO + 20)
    // mira hacia la cara: hacia afuera de la elipse
    const [ex, ey] = enElipse(theta, BORDE_PISO)
    return { x, y, theta, frente: Math.atan2(ey - y, ex - x) }
  })
}

/** El puesto de carga de una pala: el camión al costado, paralelo a la cara, a alcance del balde. */
export function puestoCarga(p: { x: number; y: number; frente: number }): { x: number; y: number; rumbo: number } {
  const lado = p.frente - Math.PI / 2
  return { x: p.x + 17 * Math.cos(lado) - 3 * Math.cos(p.frente), y: p.y + 17 * Math.sin(lado) - 3 * Math.sin(p.frente), rumbo: p.frente + Math.PI }
}

/** El camino por el piso desde el pie de la rampa hasta el puesto de carga de una pala. */
export function caminoPiso(p: { x: number; y: number; frente: number }): P2[] {
  const pc = puestoCarga(p)
  const atras: P2 = [pc.x - 34 * Math.cos(pc.rumbo), pc.y - 34 * Math.sin(pc.rumbo)]
  const [cx, cy] = [RAJO.cx, RAJO.cy]
  const pie: P2 = [PIE_RAMPA.x, PIE_RAMPA.y]
  // pasa por un punto entre el pie y el centro, y llega por detrás del puesto
  const medio: P2 = [(pie[0] + cx) / 2, (pie[1] + cy) / 2]
  const acerca: P2 = [(atras[0] + cx) / 2 + (atras[0] - cx) * 0.25, (atras[1] + cy) / 2 + (atras[1] - cy) * 0.25]
  return [pie, medio, acerca, atras, [pc.x, pc.y]]
}

/** Estacionamiento al inicio del turno: en el piso del rajo, junto al pie de la rampa. */
export function estacionamiento(j: number): { x: number; y: number; rumbo: number } {
  const pie: P2 = [PIE_RAMPA.x, PIE_RAMPA.y]
  const haciaCentro = Math.atan2(RAJO.cy - pie[1], RAJO.cx - pie[0])
  const fila = j % 8
  const col = Math.floor(j / 8)
  const lado = haciaCentro + Math.PI / 2
  const base: P2 = [pie[0] + 70 * Math.cos(haciaCentro), pie[1] + 70 * Math.sin(haciaCentro)]
  return {
    x: base[0] + (fila - 3.5) * 11 * Math.cos(lado) + col * 22 * Math.cos(haciaCentro),
    y: base[1] + (fila - 3.5) * 11 * Math.sin(lado) + col * 22 * Math.sin(haciaCentro),
    rumbo: haciaCentro + Math.PI,
  }
}
