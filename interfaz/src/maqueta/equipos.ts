// Los equipos de la maqueta, hechos de piezas como los de verdad: el camión de extracción (chasis, cabina sobre la
// cubierta, tolva con visera, ruedas duales atrás, escalera) y la pala hidráulica (orugas, tornamesa, contrapeso,
// cabina, pluma, brazo y balde con dientes). Medidas de un camión de 220 t y una pala de unos 30 m³, en metros, a
// escala 1,6 para que se lean en la maqueta.
import * as THREE from 'three'
import { type Papeles } from './papel'

export const ESCALA_EQUIPOS = 1.6
type Tono = Parameters<Papeles['linea']>[0]

/** Una pieza: su sólido papel y sus aristas, en el mismo lugar. */
function pieza(
  papeles: Papeles,
  geo: THREE.BufferGeometry,
  tono: Tono,
  opciones: { material?: THREE.Material; angulo?: number; en?: [number, number, number]; rot?: [number, number, number] } = {},
): THREE.Group {
  const g = new THREE.Group()
  const m = new THREE.Mesh(geo, opciones.material ?? papeles.papel())
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, opciones.angulo ?? 25), papeles.linea(tono))
  l.userData.tonoBase = tono
  g.add(m, l)
  if (opciones.en) g.position.set(...opciones.en)
  if (opciones.rot) g.rotation.set(...opciones.rot)
  return g
}

/** Caja por sus límites: x adelante, y arriba, z a la derecha (coordenadas del equipo en three). */
function caja(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  return g
}

/** Un prisma a partir de un perfil en el plano x–y, extruido a lo ancho (z). */
function perfilExtruido(perfil: [number, number][], z0: number, z1: number) {
  const s = new THREE.Shape(perfil.map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false })
  g.translate(0, 0, z0)
  return g
}

function rueda(papeles: Papeles, materialGoma: THREE.Material, r: number, ancho: number, x: number, z: number): THREE.Group {
  const g = new THREE.Group()
  const llanta = new THREE.CylinderGeometry(r, r, ancho, 20)
  llanta.rotateX(Math.PI / 2)
  g.add(pieza(papeles, llanta, 'mid', { material: materialGoma, angulo: 40 }))
  const maza = new THREE.CylinderGeometry(r * 0.48, r * 0.48, ancho + 0.08, 14)
  maza.rotateX(Math.PI / 2)
  g.add(pieza(papeles, maza, 'lo', { angulo: 40 }))
  g.position.set(x, r, z)
  return g
}

export interface Camion3D {
  raiz: THREE.Group
  tolva: THREE.Group
  carga: THREE.Mesh
  lineasCarga: THREE.LineSegments
  halo: THREE.Mesh
}

/** Un camión de extracción. Mira hacia +x; la tolva gira en la bisagra de atrás. */
export function camion(papeles: Papeles, mat: { goma: THREE.Material; cobre: THREE.Material; halo: THREE.Material }): Camion3D {
  const raiz = new THREE.Group()
  const cuerpo = new THREE.Group()
  raiz.add(cuerpo)
  // ruedas: delanteras simples, traseras duales
  cuerpo.add(rueda(papeles, mat.goma, 1.75, 1.15, 3.9, -2.85), rueda(papeles, mat.goma, 1.75, 1.15, 3.9, 2.85))
  for (const z of [-3.35, -2.1, 2.1, 3.35]) cuerpo.add(rueda(papeles, mat.goma, 1.75, 1.15, -2.7, z))
  // chasis, eje trasero y parachoques
  cuerpo.add(pieza(papeles, caja(-5.2, 5.4, 1.5, 2.6, -1.3, 1.3), 'mid'))
  cuerpo.add(pieza(papeles, caja(-3.4, -2.0, 1.25, 2.2, -2.9, 2.9), 'lo'))
  cuerpo.add(pieza(papeles, caja(5.4, 6.1, 1.2, 2.9, -3.3, 3.3), 'mid'))
  // motor y radiador, con la parrilla
  cuerpo.add(pieza(papeles, caja(2.6, 5.6, 2.4, 4.6, -1.6, 1.6), 'mid'))
  const parrilla = new THREE.Group()
  for (let i = 0; i < 6; i++) parrilla.add(pieza(papeles, caja(5.6, 5.66, 2.7 + i * 0.3, 2.82 + i * 0.3, -1.3, 1.3), 'lo'))
  cuerpo.add(parrilla)
  // cubierta superior, cabina a la izquierda y baranda
  cuerpo.add(pieza(papeles, caja(2.4, 6.0, 4.6, 4.9, -3.6, 3.6), 'mid'))
  cuerpo.add(pieza(papeles, caja(3.0, 5.2, 4.9, 7.0, -3.4, -1.5), 'hi'))
  cuerpo.add(pieza(papeles, caja(5.15, 5.25, 5.5, 6.7, -3.3, -1.6), 'lo'))
  const baranda: number[] = []
  for (const [a, b] of [
    [
      [6.0, 5.9, 3.6],
      [6.0, 5.9, -1.4],
    ],
    [
      [2.5, 5.9, 3.6],
      [6.0, 5.9, 3.6],
    ],
  ])
    baranda.push(...a, ...b)
  for (const z of [3.6, 1.2, -1.2]) baranda.push(6.0, 4.9, z, 6.0, 5.9, z)
  const bg = new THREE.BufferGeometry()
  bg.setAttribute('position', new THREE.Float32BufferAttribute(baranda, 3))
  cuerpo.add(new THREE.LineSegments(bg, papeles.linea('mid')))
  // escalera diagonal al frente
  const escalera = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(6.1, 1.3, 2.4), new THREE.Vector3(6.1, 4.6, 0.6)])
  cuerpo.add(new THREE.Line(escalera, papeles.linea('mid')))

  // la tolva: piso inclinado, costados, frente y visera sobre la cabina; gira en la bisagra (x = -4.6, y = 2.8)
  const tolva = new THREE.Group()
  tolva.position.set(-4.6, 2.8, 0)
  const largo = 9.6
  const perfilCostado: [number, number][] = [
    [-1.6, 0.3],
    [largo - 0.4, 0.9],
    [largo - 0.4, 4.0],
    [-1.2, 3.4],
  ]
  tolva.add(pieza(papeles, perfilExtruido(perfilCostado, -3.85, -3.45), 'hi'))
  tolva.add(pieza(papeles, perfilExtruido(perfilCostado, 3.45, 3.85), 'hi'))
  const piso: [number, number][] = [
    [-1.6, 0.0],
    [largo - 0.4, 0.6],
    [largo - 0.4, 1.05],
    [-1.6, 0.45],
  ]
  tolva.add(pieza(papeles, perfilExtruido(piso, -3.45, 3.45), 'mid'))
  tolva.add(pieza(papeles, caja(largo - 0.9, largo - 0.4, 1.0, 4.3, -3.85, 3.85), 'hi'))
  // visera: protege la cabina, vuela sobre la cubierta
  tolva.add(pieza(papeles, caja(largo - 0.4, largo + 1.6, 4.0, 4.35, -3.85, 3.85), 'hi'))
  // refuerzos de los costados
  for (const x of [1.4, 4.2, 7.0]) {
    tolva.add(pieza(papeles, caja(x, x + 0.35, 0.8, 3.7, -4.0, -3.85), 'lo'))
    tolva.add(pieza(papeles, caja(x, x + 0.35, 0.8, 3.7, 3.85, 4.0), 'lo'))
  }
  // la carga: un montón de mineral que crece con las baldadas
  const montonGeo = monton()
  const carga = new THREE.Mesh(montonGeo, mat.cobre)
  const lineasCarga = new THREE.LineSegments(new THREE.EdgesGeometry(montonGeo, 18), papeles.linea('cobre'))
  carga.add(lineasCarga)
  carga.position.set(3.9, 0.9, 0)
  tolva.add(carga)
  cuerpo.add(tolva)

  // halo bajo el camión
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(17, 11), mat.halo)
  halo.rotation.x = -Math.PI / 2
  halo.position.set(0.3, 0.06, 0)
  raiz.add(halo)
  cuerpo.scale.setScalar(ESCALA_EQUIPOS)
  halo.scale.setScalar(ESCALA_EQUIPOS)
  return { raiz, tolva, carga, lineasCarga, halo }
}

/** El montón de mineral en la tolva: una loma baja de facetas irregulares, que se escala en alto con la carga. */
function monton() {
  const ancho = 6.6
  const largo = 8.6
  const nx = 7
  const nz = 5
  const pos: number[] = []
  const alto = (i: number, k: number) => {
    const u = i / nx
    const w = k / nz
    const borde = Math.min(u, 1 - u, w, 1 - w)
    const base = Math.min(1, borde * 4.2)
    const ruido = 0.82 + 0.18 * Math.sin(i * 2.3 + k * 1.7) * Math.cos(i * 0.7 - k * 2.1)
    return 2.6 * Math.sin((base * Math.PI) / 2) * ruido
  }
  const p = (i: number, k: number) => [-largo / 2 + (largo * i) / nx, alto(i, k), -ancho / 2 + (ancho * k) / nz]
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const [a, b, c, d] = [p(i, k), p(i + 1, k), p(i, k + 1), p(i + 1, k + 1)]
      pos.push(...a, ...c, ...b, ...b, ...c, ...d)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

export interface Pala3D {
  raiz: THREE.Group
  tornamesa: THREE.Group
  pluma: THREE.Group
  brazo: THREE.Mesh
  brazoLineas: THREE.LineSegments
  balde: THREE.Group
  baliza: THREE.Mesh
  servicio: THREE.Group
  lineas: THREE.LineSegments[]
}

/** Una pala hidráulica frontal. Mira hacia +x (la cara); la tornamesa gira hacia la derecha (+z) para cargar. */
export function pala(papeles: Papeles, mat: { goma: THREE.Material; halo: THREE.Material; rojo: THREE.Material }): Pala3D {
  const raiz = new THREE.Group()
  const cuerpo = new THREE.Group()
  raiz.add(cuerpo)
  // orugas con sus zapatas
  for (const z of [-3.3, 3.3]) {
    const oruga: [number, number][] = [
      [-4.8, 0.2],
      [4.8, 0.2],
      [5.4, 1.2],
      [4.8, 2.3],
      [-4.8, 2.3],
      [-5.4, 1.2],
    ]
    cuerpo.add(pieza(papeles, perfilExtruido(oruga, z - 1.0, z + 1.0), 'mid', { material: mat.goma }))
    for (let x = -4.2; x <= 4.3; x += 0.9) cuerpo.add(pieza(papeles, caja(x, x + 0.12, 2.3, 2.36, z - 1.0, z + 1.0), 'lo'))
    cuerpo.add(pieza(papeles, caja(-4.2, 4.2, 1.0, 2.0, z - (z > 0 ? 1.15 : -1.0), z + (z > 0 ? -1.0 : 1.15)), 'lo'))
  }
  // chasis entre las orugas
  cuerpo.add(pieza(papeles, caja(-2.8, 2.8, 1.4, 2.8, -2.3, 2.3), 'mid'))
  // la tornamesa: gira sobre el anillo
  const anillo = new THREE.CylinderGeometry(2.9, 2.9, 0.5, 28)
  anillo.translate(0, 3.05, 0)
  cuerpo.add(pieza(papeles, anillo, 'lo', { angulo: 40 }))
  const tornamesa = new THREE.Group()
  tornamesa.add(pieza(papeles, caja(-5.6, 3.2, 3.3, 7.6, -3.4, 3.4), 'hi'))
  // contrapeso atrás, con sus nervios
  tornamesa.add(pieza(papeles, caja(-6.8, -5.4, 3.3, 7.0, -3.5, 3.5), 'mid'))
  for (const y of [4.4, 5.5, 6.6]) tornamesa.add(pieza(papeles, caja(-6.86, -6.8, y, y + 0.1, -3.4, 3.4), 'lo'))
  // sala de máquinas: rejillas y dos chimeneas
  tornamesa.add(pieza(papeles, caja(-5.0, -1.0, 7.6, 8.8, -2.8, 2.8), 'mid'))
  for (let x = -4.6; x < -1.3; x += 0.7) tornamesa.add(pieza(papeles, caja(x, x + 0.3, 8.8, 8.86, -2.4, 2.4), 'lo'))
  for (const z of [-1.4, 1.4]) {
    const chimenea = new THREE.CylinderGeometry(0.28, 0.28, 1.6, 12)
    chimenea.translate(-3.6, 9.6, z)
    tornamesa.add(pieza(papeles, chimenea, 'lo', { angulo: 40 }))
  }
  // cabina en alto, adelante a la izquierda, con su pasarela y baranda
  tornamesa.add(pieza(papeles, caja(0.6, 3.0, 7.6, 10.4, -3.4, -1.4), 'hi'))
  tornamesa.add(pieza(papeles, caja(2.95, 3.02, 8.6, 10.0, -3.25, -1.55), 'lo'))
  tornamesa.add(pieza(papeles, caja(-1.0, 3.4, 7.6, 7.8, 2.0, 3.6), 'lo'))
  const baliza = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), mat.rojo)
  baliza.position.set(1.8, 10.85, -2.4)
  baliza.visible = false
  tornamesa.add(baliza)
  // la pluma: dos vigas desde el frente de la tornamesa
  const pluma = new THREE.Group()
  pluma.position.set(2.6, 5.4, 0)
  const largoPluma = 9.4
  for (const z of [-1.1, 1.1]) {
    const viga: [number, number][] = [
      [0, -0.7],
      [largoPluma, -0.35],
      [largoPluma, 0.45],
      [0, 0.9],
    ]
    pluma.add(pieza(papeles, perfilExtruido(viga, z - 0.45, z + 0.45), 'hi'))
  }
  pluma.add(pieza(papeles, caja(largoPluma - 1.2, largoPluma, -0.3, 0.4, -1.6, 1.6), 'mid'))
  // cilindros de levante
  for (const z of [-2.2, 2.2]) {
    const cil = new THREE.CylinderGeometry(0.3, 0.3, 5.8, 10)
    cil.rotateZ(-Math.PI / 2 + 0.5)
    cil.translate(2.6, -1.0, z)
    pluma.add(pieza(papeles, cil, 'lo', { angulo: 40 }))
  }
  tornamesa.add(pluma)
  // el brazo: va de la punta de la pluma al balde; se reubica en cada cuadro
  const brazoGeo = new THREE.BoxGeometry(1, 1.0, 1.9)
  brazoGeo.translate(0.5, 0, 0)
  const brazo = new THREE.Mesh(brazoGeo, papeles.papel())
  const brazoLineas = new THREE.LineSegments(new THREE.EdgesGeometry(brazoGeo), papeles.linea('hi'))
  brazo.add(brazoLineas)
  tornamesa.add(brazo)
  // el balde, con sus dientes
  const balde = new THREE.Group()
  const perfilBalde: [number, number][] = [
    [-1.2, 1.8],
    [1.0, 2.0],
    [2.2, -0.2],
    [1.3, -1.4],
    [-1.4, -1.2],
  ]
  balde.add(pieza(papeles, perfilExtruido(perfilBalde, -2.0, 2.0), 'hi'))
  for (let z = -1.6; z <= 1.65; z += 0.8) balde.add(pieza(papeles, caja(2.1, 2.7, -0.45, -0.1, z - 0.18, z + 0.18), 'mid'))
  tornamesa.add(balde)
  tornamesa.position.y = 0
  cuerpo.add(tornamesa)

  // la camioneta de mantención, que aparece mientras se repara
  const servicio = new THREE.Group()
  servicio.add(pieza(papeles, caja(-2.6, 2.6, 0.8, 1.9, -1.0, 1.0), 'mid'))
  servicio.add(pieza(papeles, caja(0.6, 2.4, 1.9, 2.8, -0.95, 0.95), 'hi'))
  servicio.add(pieza(papeles, caja(-2.5, 0.4, 1.9, 2.3, -0.95, 0.95), 'lo'))
  for (const [x, z] of [
    [1.7, -1.0],
    [1.7, 1.0],
    [-1.7, -1.0],
    [-1.7, 1.0],
  ]) {
    const r = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12)
    r.rotateX(Math.PI / 2)
    r.translate(x, 0.45, z)
    servicio.add(pieza(papeles, r, 'lo', { material: mat.goma, angulo: 40 }))
  }
  const balizaServicio = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mat.rojo)
  balizaServicio.position.set(1.6, 3.0, 0)
  servicio.add(balizaServicio)
  servicio.position.set(-2, 0, -10)
  servicio.rotation.y = 0.5
  servicio.visible = false
  cuerpo.add(servicio)

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), mat.halo)
  halo.rotation.x = -Math.PI / 2
  halo.position.set(-0.8, 0.06, 0)
  raiz.add(halo)
  cuerpo.scale.setScalar(ESCALA_EQUIPOS)
  halo.scale.setScalar(ESCALA_EQUIPOS)
  const lineas: THREE.LineSegments[] = []
  tornamesa.traverse((o) => o instanceof THREE.LineSegments && lineas.push(o))
  return { raiz, tornamesa, pluma, brazo, brazoLineas, balde, baliza, servicio, lineas }
}

/** Pone la pluma, el brazo y el balde según la altura del balde (0 excavando, 1 sobre la tolva). */
export function posarPala(p: Pala3D, giro: number, alturaBalde: number) {
  p.tornamesa.rotation.y = -giro * Math.PI * 0.47
  const a = THREE.MathUtils.lerp(0.42, 0.78, alturaBalde)
  p.pluma.rotation.z = a
  const punta = new THREE.Vector3(9.4, 0.05, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), a).add(p.pluma.position)
  // el balde: abajo y adelante cuando excava, arriba y más cerca cuando descarga
  const balde = new THREE.Vector3(THREE.MathUtils.lerp(13.6, 11.2, alturaBalde), THREE.MathUtils.lerp(1.4, 9.4, alturaBalde), 0)
  const d = balde.clone().sub(punta)
  p.brazo.position.copy(punta)
  p.brazo.scale.set(d.length(), 1, 1)
  p.brazo.rotation.set(0, 0, Math.atan2(d.y, d.x))
  p.balde.position.copy(balde)
  p.balde.rotation.z = THREE.MathUtils.lerp(-0.25, 0.9, alturaBalde)
}
