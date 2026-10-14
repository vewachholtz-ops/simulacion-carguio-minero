// El terreno de la maqueta: el bloque cortado con sus capas de roca, el rajo con sus bancos y la rampa, el camino al
// chancador con sus pretiles, el botadero y la base sobre la que descansa todo, con su placa y su regla.
import * as THREE from 'three'
import {
  altura,
  BLOQUE,
  BORDE_PISO,
  BOTADERO,
  CAMINO_SUPERFICIE,
  enElipse,
  FONDO,
  PASO,
  type P2,
  RAJO,
  RAMPA,
  rampaEn,
  RAMPA_EJE,
} from './mundo'
import { type Papeles, v3 } from './papel'
import { suavizar } from './rutas'

const N = 1080

/** Dónde corta el borde del bloque el rayo que sale del centro del rajo hacia el punto de la elipse. */
function bordeBloque(theta: number): P2 {
  const [ex, ey] = enElipse(theta, 0)
  const dx = ex - RAJO.cx
  const dy = ey - RAJO.cy
  const t = Math.min(
    dx > 0 ? (BLOQUE.x1 - RAJO.cx) / dx : dx < 0 ? (BLOQUE.x0 - RAJO.cx) / dx : Infinity,
    dy > 0 ? (BLOQUE.y1 - RAJO.cy) / dy : dy < 0 ? (BLOQUE.y0 - RAJO.cy) / dy : Infinity,
  )
  return [RAJO.cx + dx * t, RAJO.cy + dy * t]
}

/** Las filas de la malla, como desplazamiento hacia adentro desde el borde (negativo: afuera del rajo). */
function filas(): { s: number; afuera?: number }[] {
  const out: { s: number; afuera?: number }[] = []
  for (const t of [1, 0.7, 0.45, 0.28, 0.16, 0.08, 0.03]) out.push({ s: -1, afuera: t })
  const s = new Set<number>()
  for (let k = 0; k < RAJO.bancos; k++) {
    s.add(k * PASO)
    s.add(k * PASO + RAJO.cara)
    s.add(k * PASO + RAJO.cara * 0.5)
  }
  for (let x = -40; x <= BORDE_PISO + 30; x += 2.5) s.add(Math.round(x * 100) / 100)
  for (let x = BORDE_PISO + 40; x < RAJO.b - 4; x += 12) s.add(x)
  s.add(RAJO.b - 3)
  for (const v of [...s].sort((a, b) => a - b)) out.push({ s: v })
  return out
}

function posicion(theta: number, f: { s: number; afuera?: number }): THREE.Vector3 {
  if (f.afuera !== undefined) {
    const [ex, ey] = enElipse(theta, -40)
    const [bx, by] = bordeBloque(theta)
    // del anillo exterior al borde del bloque; el camino de la rampa puede cruzar por aquí
    return v3(ex + (bx - ex) * f.afuera, ey + (by - ey) * f.afuera, 0)
  }
  const [x, y] = enElipse(theta, f.s)
  return v3(x, y, f.s < 0 ? (rampaEn(theta) && Math.abs(f.s - rampaEn(theta)!.s) < RAMPA.ancho / 2 ? rampaEn(theta)!.z : 0) : altura(theta, f.s).z)
}

export function construirTerreno(papeles: Papeles): THREE.Group {
  const g = new THREE.Group()
  g.name = 'terreno'
  const F = filas()

  // ---------------- la superficie y el rajo, en una malla polar
  const pos: number[] = []
  for (const f of F)
    for (let i = 0; i < N; i++) {
      const p = posicion((i / N) * Math.PI * 2, f)
      pos.push(p.x, p.y, p.z)
    }
  const centro = v3(RAJO.cx, RAJO.cy, FONDO)
  pos.push(centro.x, centro.y, centro.z)
  const idx: number[] = []
  for (let r = 0; r < F.length - 1; r++)
    for (let i = 0; i < N; i++) {
      const a = r * N + i
      const b = r * N + ((i + 1) % N)
      const c = (r + 1) * N + i
      const d = (r + 1) * N + ((i + 1) % N)
      idx.push(a, c, b, b, c, d)
    }
  const ultima = (F.length - 1) * N
  for (let i = 0; i < N; i++) idx.push(ultima + i, F.length * N, ultima + ((i + 1) % N))
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  g.add(new THREE.Mesh(geo, papeles.papel({ facetas: false, profundidad: 1, mineral: 1, doble: true })))

  // ---------------- líneas: crestas y pies de banco, cortadas donde pasa la rampa
  const lineas = (tono: Parameters<Papeles['linea']>[0], tramos: THREE.Vector3[][]) => {
    const p: number[] = []
    for (const t of tramos)
      for (let i = 0; i < t.length - 1; i++) p.push(t[i].x, t[i].y, t[i].z, t[i + 1].x, t[i + 1].y, t[i + 1].z)
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    const l = new THREE.LineSegments(lg, papeles.linea(tono))
    g.add(l)
    return l
  }
  const anillo = (s: number, saltarRampa = true) => {
    const tramos: THREE.Vector3[][] = []
    let actual: THREE.Vector3[] = []
    for (let i = 0; i <= N; i++) {
      const theta = (i / N) * Math.PI * 2
      const a = altura(theta, s)
      if (saltarRampa && a.enRampa > 0.02) {
        if (actual.length > 1) tramos.push(actual)
        actual = []
        continue
      }
      const [x, y] = enElipse(theta, s)
      actual.push(v3(x, y, a.z + 0.05))
    }
    if (actual.length > 1) tramos.push(actual)
    return tramos
  }
  const crestas: THREE.Vector3[][] = []
  const pies: THREE.Vector3[][] = []
  for (let k = 0; k < RAJO.bancos; k++) {
    crestas.push(...anillo(k * PASO + 0.01))
    pies.push(...anillo(k * PASO + RAJO.cara - 0.01))
  }
  lineas('mid', crestas)
  lineas('lo', pies)

  // la carpeta de la rampa: una cinta apenas más oscura sobre el corte, para que se lea como camino
  {
    const ms = RAMPA_EJE.filter((_, i) => i % 3 === 0)
    const pos: number[] = []
    const borde = (m: (typeof ms)[number], d: number) => {
      const [x, y] = enElipse(m.theta, m.s + d)
      return v3(x, y, m.z + 0.15)
    }
    for (let i = 0; i < ms.length - 1; i++) {
      const [a, b, c, d] = [borde(ms[i], -RAMPA.ancho / 2), borde(ms[i + 1], -RAMPA.ancho / 2), borde(ms[i], RAMPA.ancho / 2), borde(ms[i + 1], RAMPA.ancho / 2)]
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z)
    }
    const rg = new THREE.BufferGeometry()
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.add(new THREE.Mesh(rg, papeles.papel({ doble: true, tinte: 'goma', tinteCant: 0.05, profundidad: 1 })))
  }

  // los bordes de la rampa y su pretil del lado del vacío
  const bordeRampa = (desvio: number, alto: number) =>
    RAMPA_EJE.filter((_, i) => i % 4 === 0).map((m) => {
      const [x, y] = enElipse(m.theta, m.s + desvio)
      return v3(x, y, m.z + alto)
    })
  lineas('mid', [bordeRampa(-RAMPA.ancho / 2, 0.08), bordeRampa(RAMPA.ancho / 2, 0.08)])
  lineas('lo', [bordeRampa(RAMPA.ancho / 2 - 2.5, 1.4)])
  const eje = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(bordeRampa(0, 0.1)),
    new THREE.LineDashedMaterial({ color: papeles.linea('faint').color, dashSize: 6, gapSize: 9 }),
  )
  eje.computeLineDistances()
  eje.userData.tono = 'faint'
  g.add(eje)

  // ---------------- el camino de superficie al chancador, con sus pretiles
  const camino = suavizar(CAMINO_SUPERFICIE.map(([x, y]) => [x, y, 0] as [number, number, number]), 4)
  const lado = (desvio: number, alto: number) =>
    camino.map((p, i) => {
      const a = camino[Math.max(0, i - 1)]
      const b = camino[Math.min(camino.length - 1, i + 1)]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const l = Math.hypot(dx, dy) || 1
      return v3(p[0] + (dy / l) * desvio, p[1] - (dx / l) * desvio, alto)
    })
  const cinta: number[] = []
  const izq = lado(-RAMPA.ancho / 2, 0.12)
  const der = lado(RAMPA.ancho / 2, 0.12)
  for (let i = 0; i < camino.length - 1; i++) {
    const [a, b, c, d] = [izq[i], izq[i + 1], der[i], der[i + 1]]
    cinta.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z)
  }
  const cg = new THREE.BufferGeometry()
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cinta, 3))
  g.add(new THREE.Mesh(cg, papeles.papel({ doble: true, tinte: 'goma', tinteCant: 0.05 })))
  lineas('mid', [izq, der])
  lineas('lo', [lado(-RAMPA.ancho / 2 - 3, 1.2), lado(RAMPA.ancho / 2 + 3, 1.2)])
  const ejeCamino = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(lado(0, 0.2)),
    new THREE.LineDashedMaterial({ color: papeles.linea('faint').color, dashSize: 6, gapSize: 9 }),
  )
  ejeCamino.computeLineDistances()
  ejeCamino.userData.tono = 'faint'
  g.add(ejeCamino)

  // ---------------- el pretil de seguridad alrededor del rajo, abierto donde sale la rampa
  const pretil = anillo(-14).map((t) => t.map((q) => q.setY(1.2)))
  lineas('lo', pretil)

  // ---------------- una malla de perforación en una berma del norte: los pozos de la próxima tronadura
  const pozos: number[] = []
  for (let fila = 0; fila < 3; fila++)
    for (let i = 0; i < 26; i++) {
      const theta = 1.05 + i * 0.012 + (fila % 2) * 0.006
      const s = 2 * PASO + RAJO.cara + 4 + fila * 4.2
      const [x, y] = enElipse(theta, s)
      const a = altura(theta, s)
      if (a.enRampa > 0) continue
      const q = v3(x, y, a.z + 0.4)
      pozos.push(q.x, q.y, q.z)
    }
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pozos, 3))
  const puntos = new THREE.Points(pg, new THREE.PointsMaterial({ color: papeles.actuales.mid, size: 2, sizeAttenuation: false }))
  puntos.userData.tono = 'mid'
  g.add(puntos)

  // ---------------- reglas en los cantos del bloque: una marca cada 25 m y una mayor cada 100 m
  const reglas: number[] = []
  const { x0, x1, y0, y1 } = BLOQUE
  const marca = (a: THREE.Vector3, b: THREE.Vector3) => reglas.push(a.x, a.y, a.z, b.x, b.y, b.z)
  for (let x = Math.ceil(x0 / 25) * 25; x <= x1; x += 25) {
    const largo = x % 100 === 0 ? 14 : 7
    marca(v3(x, y0, 0.2), v3(x, y0 + largo, 0.2))
    marca(v3(x, y1, 0.2), v3(x, y1 - largo, 0.2))
  }
  for (let y = Math.ceil(y0 / 25) * 25; y <= y1; y += 25) {
    const largo = y % 100 === 0 ? 14 : 7
    marca(v3(x1, y, 0.2), v3(x1 - largo, y, 0.2))
    marca(v3(x0, y, 0.2), v3(x0 + largo, y, 0.2))
  }
  const rg = new THREE.BufferGeometry()
  rg.setAttribute('position', new THREE.Float32BufferAttribute(reglas, 3))
  g.add(new THREE.LineSegments(rg, papeles.linea('mid')))

  // ---------------- el botadero de lastre: dos plataformas con su talud
  g.add(botadero(papeles))

  // ---------------- el bloque cortado, con sus capas
  g.add(bloque(papeles))
  return g
}

/** Un tronco de elipse redondeada, de un anillo a otro, con su tapa: para el botadero. */
function botadero(papeles: Papeles): THREE.Group {
  const g = new THREE.Group()
  const anillo = (a: number, b: number, z: number) => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * Math.PI * 2
      // una elipse algo cuadrada e irregular, como un botadero real
      const ruido = 1 + 0.035 * Math.sin(3 * t + 0.6) + 0.02 * Math.sin(7 * t)
      const c = Math.cos(t)
      const s = Math.sin(t)
      const k = 1 / Math.pow(Math.pow(Math.abs(c), 3) + Math.pow(Math.abs(s), 3), 1 / 3)
      pts.push(v3(BOTADERO.cx + a * c * k * ruido, BOTADERO.cy + b * s * k * ruido, z))
    }
    return pts
  }
  const niveles = [
    { a: BOTADERO.a, b: BOTADERO.b, z: 0 },
    { a: BOTADERO.a - 38, b: BOTADERO.b - 30, z: 22 },
    { a: BOTADERO.a - 54, b: BOTADERO.b - 42, z: 22 },
    { a: BOTADERO.a - 92, b: BOTADERO.b - 66, z: 42 },
  ]
  const anillos = niveles.map((n) => anillo(n.a, n.b, n.z))
  const pos: number[] = []
  for (let r = 0; r < anillos.length - 1; r++)
    for (let i = 0; i < 96; i++) {
      const [a, b, c, d] = [anillos[r][i], anillos[r][(i + 1) % 96], anillos[r + 1][i], anillos[r + 1][(i + 1) % 96]]
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z)
    }
  const tope = anillos.at(-1)!
  const centro = tope.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / tope.length)
  for (let i = 0; i < 96; i++) {
    const [a, b] = [tope[i], tope[(i + 1) % 96]]
    pos.push(a.x, a.y, a.z, centro.x, centro.y, centro.z, b.x, b.y, b.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.add(new THREE.Mesh(geo, papeles.papel({ doble: true })))
  for (const [k, a] of anillos.entries()) {
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(a.map((p) => p.clone().setY(p.y + 0.05))), papeles.linea(k === 0 ? 'lo' : 'mid'))
    g.add(l)
  }
  return g
}

/** Las capas del terreno en el corte del bloque: suelo, lixiviado, mineral y roca. */
const CAPAS = [
  { hasta: -12, tono: 0 },
  { hasta: -50, tono: 1 },
  { hasta: -118, tono: 2, mineral: true },
  { hasta: BLOQUE.fondo, tono: 3 },
]

function bloque(papeles: Papeles): THREE.Group {
  const g = new THREE.Group()
  const { x0, x1, y0, y1, fondo } = BLOQUE
  // cada capa con su cota algo ondulada, como en un corte real
  const cota = (k: number, u: number) => (k === 0 ? 0 : CAPAS[k - 1].hasta + 3.5 * Math.sin(u / 70 + k * 1.7) + 2 * Math.sin(u / 23 + k))
  const caras: { a: P2; b: P2 }[] = [
    { a: [x0, y0], b: [x1, y0] },
    { a: [x1, y0], b: [x1, y1] },
    { a: [x1, y1], b: [x0, y1] },
    { a: [x0, y1], b: [x0, y0] },
  ]
  const materiales = [
    papeles.papel({ facetas: false }),
    papeles.papel({ facetas: false, tinte: 'goma', tinteCant: 0.04 }),
    papeles.papel({ facetas: false, tinte: 'cobre', tinteCant: 0.12 }),
    papeles.papel({ facetas: false, tinte: 'goma', tinteCant: 0.1 }),
  ]
  const lineasCapa: number[] = []
  for (const { a, b } of caras) {
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.ceil(largo / 20)
    const normal = new THREE.Vector3(b[1] - a[1], 0, b[0] - a[0]).normalize()
    for (let k = 0; k < CAPAS.length; k++) {
      const pos: number[] = []
      const nor: number[] = []
      for (let i = 0; i < n; i++) {
        const u0 = (i / n) * largo
        const u1 = ((i + 1) / n) * largo
        const p = (u: number, z: number) => v3(a[0] + ((b[0] - a[0]) * u) / largo, a[1] + ((b[1] - a[1]) * u) / largo, z)
        const arriba0 = cota(k, u0)
        const arriba1 = cota(k, u1)
        const abajo0 = k === CAPAS.length - 1 ? fondo : cota(k + 1, u0)
        const abajo1 = k === CAPAS.length - 1 ? fondo : cota(k + 1, u1)
        const [q0, q1, q2, q3] = [p(u0, arriba0), p(u1, arriba1), p(u0, abajo0), p(u1, abajo1)]
        pos.push(q0.x, q0.y, q0.z, q2.x, q2.y, q2.z, q1.x, q1.y, q1.z, q1.x, q1.y, q1.z, q2.x, q2.y, q2.z, q3.x, q3.y, q3.z)
        for (let r = 0; r < 6; r++) nor.push(normal.x, 0, normal.z)
        if (k > 0) lineasCapa.push(q0.x, q0.y, q0.z, q1.x, q1.y, q1.z)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
      g.add(new THREE.Mesh(geo, materiales[k]))
    }
  }
  const lg = new THREE.BufferGeometry()
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lineasCapa, 3))
  g.add(new THREE.LineSegments(lg, papeles.linea('lo')))
  // aristas del bloque
  const e = (x: number, y: number, z: number) => v3(x, y, z)
  const aristas = [
    [e(x0, y0, 0), e(x1, y0, 0)],
    [e(x1, y0, 0), e(x1, y1, 0)],
    [e(x1, y1, 0), e(x0, y1, 0)],
    [e(x0, y1, 0), e(x0, y0, 0)],
    [e(x0, y0, fondo), e(x1, y0, fondo)],
    [e(x1, y0, fondo), e(x1, y1, fondo)],
    [e(x0, y0, 0), e(x0, y0, fondo)],
    [e(x1, y0, 0), e(x1, y0, fondo)],
    [e(x1, y1, 0), e(x1, y1, fondo)],
    [e(x0, y1, 0), e(x0, y1, fondo)],
  ]
  const ag = new THREE.BufferGeometry()
  ag.setAttribute('position', new THREE.Float32BufferAttribute(aristas.flat().flatMap((p) => [p.x, p.y, p.z]), 3))
  g.add(new THREE.LineSegments(ag, papeles.linea('mid')))
  g.add(base(papeles))
  return g
}

/** La base de la maqueta: una placa biselada sobre cuatro patas, con su regla y su placa de nombre. */
function base(papeles: Papeles): THREE.Group {
  const g = new THREE.Group()
  const { x0, x1, y0, y1, fondo } = BLOQUE
  const borde = 28
  const alto = 22
  const placa = new THREE.BoxGeometry(x1 - x0 + 2 * borde, alto, y1 - y0 + 2 * borde)
  const m = new THREE.Mesh(placa, papeles.papel())
  const centro = v3((x0 + x1) / 2, (y0 + y1) / 2, fondo - alto / 2)
  m.position.copy(centro)
  g.add(m)
  const ar = new THREE.LineSegments(new THREE.EdgesGeometry(placa), papeles.linea('mid'))
  ar.position.copy(centro)
  g.add(ar)
  // ranura a lo largo del canto
  const ranura = [
    v3(x0 - borde, y0 - borde, fondo - alto * 0.35),
    v3(x1 + borde, y0 - borde, fondo - alto * 0.35),
    v3(x1 + borde, y1 + borde, fondo - alto * 0.35),
  ]
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ranura), papeles.linea('lo')))
  // patas
  for (const [x, y] of [
    [x0 + 30, y0 + 30],
    [x1 - 30, y0 + 30],
    [x1 - 30, y1 - 30],
    [x0 + 30, y1 - 30],
  ]) {
    const pata = new THREE.CylinderGeometry(20, 24, 26, 32)
    const pm = new THREE.Mesh(pata, papeles.papel({ facetas: false }))
    pm.position.copy(v3(x, y, fondo - alto - 13))
    g.add(pm)
    const pl = new THREE.LineSegments(new THREE.EdgesGeometry(pata, 30), papeles.linea('lo'))
    pl.position.copy(pm.position)
    g.add(pl)
  }
  // regla sobre el canto delantero: una marca cada 25 m, mayor cada 100 m
  const regla: number[] = []
  const yR = y0 - borde + 6
  const zR = fondo + 0.3
  regla.push(...v3(x0 - borde + 20, yR, zR).toArray(), ...v3(x1 + borde - 20, yR, zR).toArray())
  for (let x = x0; x <= x1; x += 25) {
    const mayor = Math.round((x - x0) / 25) % 4 === 0
    regla.push(...v3(x, yR, zR).toArray(), ...v3(x, yR - (mayor ? 14 : 7), zR).toArray())
  }
  const rg = new THREE.BufferGeometry()
  rg.setAttribute('position', new THREE.Float32BufferAttribute(regla, 3))
  g.add(new THREE.LineSegments(rg, papeles.linea('mid')))
  // placa de nombre en el frente
  const plano = new THREE.PlaneGeometry(260, 15)
  const pm = new THREE.Mesh(plano, placaGrabada(papeles))
  pm.position.copy(v3((x0 + x1) / 2 + 300, y0 - borde - 0.6, fondo - alto / 2))
  g.add(pm)
  // halo bajo la base
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 220, y1 - y0 + 220), papeles.halo())
  halo.rotation.x = -Math.PI / 2
  halo.position.copy(v3((x0 + x1) / 2, (y0 + y1) / 2 - 20, fondo - alto - 26.5))
  g.add(halo)
  return g
}

function placaGrabada(papeles: Papeles): THREE.MeshBasicMaterial {
  const c = document.createElement('canvas')
  c.width = 1040
  c.height = 60
  const ctx = c.getContext('2d')!
  const t = papeles.actuales
  const m = new THREE.MeshBasicMaterial({ transparent: true })
  const pintar = () => {
    const tonos = papeles.actuales
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.fillStyle = tonos.mid
    ctx.font = '600 30px ui-monospace, Menlo, Consolas, monospace'
    ctx.textBaseline = 'middle'
    ctx.fillText('TOLVA · CARGUÍO Y TRANSPORTE · 1 : 5 000', 16, 31)
    tex.needsUpdate = true
  }
  const tex = new THREE.CanvasTexture(c)
  m.map = tex
  m.userData.repintar = pintar
  void t
  pintar()
  return m
}
