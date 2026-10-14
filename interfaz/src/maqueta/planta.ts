// La planta en superficie: el muro de descarga con su buzón, el edificio del chancador primario con su puente grúa,
// la correa en su galería sobre caballetes y el acopio de mineral chancado, que crece con las toneladas del turno.
import * as THREE from 'three'
import { ACOPIO, BUZON, CHANCADOR, DESCARGA, TALLER } from './mundo'
import { type Papeles, v3 } from './papel'

type Tono = Parameters<Papeles['linea']>[0]

function solido(papeles: Papeles, geo: THREE.BufferGeometry, tono: Tono, material?: THREE.Material, angulo = 25) {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(geo, material ?? papeles.papel()))
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, angulo), papeles.linea(tono))
  g.add(l)
  return g
}

/** Caja en coordenadas del mundo (x este, y norte, z arriba). */
function cajaMundo(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const g = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0)
  const c = v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  g.translate(c.x, c.y, c.z)
  return g
}

export interface Planta {
  grupo: THREE.Group
  acopio: THREE.Group
  /** El mineral que cae al buzón mientras un camión vacía su tolva. */
  chorro: THREE.Points
  correa: THREE.Line
}

export function construirPlanta(papeles: Papeles, cobre: THREE.Material): Planta {
  const g = new THREE.Group()
  const [bx, by] = BUZON
  // plataforma de descarga: losa de hormigón con el muro tope y el buzón (tolva abierta)
  g.add(solido(papeles, cajaMundo(DESCARGA[0] - 26, bx - 12, by - 26, by + 26, -0.6, 0.4), 'mid'))
  g.add(solido(papeles, cajaMundo(bx - 15, bx - 12, by - 20, by + 20, 0.4, 2.6), 'mid'))
  // el buzón: un tronco de pirámide invertido, hundido en la plataforma
  const buzon = new THREE.CylinderGeometry(16, 6, 14, 4, 1, true)
  buzon.rotateY(Math.PI / 4)
  const pb = v3(bx, by, -6.4)
  buzon.translate(pb.x, pb.y, pb.z)
  g.add(solido(papeles, buzon, 'mid', papeles.papel({ doble: true, tinte: 'goma', tinteCant: 0.12 })))
  // muros laterales del buzón
  for (const dy of [-17, 17]) g.add(solido(papeles, cajaMundo(bx - 12, bx + 14, by + dy - 1.5, by + dy + 1.5, 0.4, 6), 'mid'))
  // edificio del chancador, al este del buzón
  const { x, y, w, d } = CHANCADOR
  const x0 = bx + 14
  const x1 = x + w + 6
  const y0 = y - 6
  const y1 = y + d - 6
  g.add(solido(papeles, cajaMundo(x0, x1, y0, y1, 0, 26), 'hi'))
  // ventanas en franjas: líneas de canto a canto en las dos caras visibles
  const ventanas: number[] = []
  for (const z of [8, 15, 22]) {
    ventanas.push(...v3(x0, y0 - 0.1, z).toArray(), ...v3(x1, y0 - 0.1, z).toArray())
    ventanas.push(...v3(x1 + 0.1, y0, z).toArray(), ...v3(x1 + 0.1, y1, z).toArray())
  }
  for (let xx = x0 + 6; xx < x1; xx += 6) ventanas.push(...v3(xx, y0 - 0.1, 0).toArray(), ...v3(xx, y0 - 0.1, 26).toArray())
  const vg = new THREE.BufferGeometry()
  vg.setAttribute('position', new THREE.Float32BufferAttribute(ventanas, 3))
  g.add(new THREE.LineSegments(vg, papeles.linea('lo')))
  // techo con antepecho y la caseta del puente grúa
  g.add(solido(papeles, cajaMundo(x0 - 1, x1 + 1, y0 - 1, y1 + 1, 26, 27.5), 'mid'))
  g.add(solido(papeles, cajaMundo(x0 + 8, x0 + 30, y0 + 10, y1 - 12, 27.5, 34), 'mid'))
  // sala eléctrica, junto al edificio
  g.add(solido(papeles, cajaMundo(x1 + 6, x1 + 22, y0, y0 + 12, 0, 7), 'mid'))
  g.add(solido(papeles, cajaMundo(x1 + 6.5, x1 + 21.5, y0 + 0.5, y0 + 11.5, 7, 7.6), 'lo'))

  // la correa: galería inclinada desde el edificio hasta la torre sobre el acopio
  const [ax, ay] = ACOPIO
  const desde = v3(x1 - 6, y1 - 4, 18)
  const hasta = v3(ax, ay, 62)
  const dir = hasta.clone().sub(desde)
  const largo = dir.length()
  const galeria = new THREE.BoxGeometry(largo, 3.2, 4.2)
  const galeriaG = solido(papeles, galeria, 'mid')
  galeriaG.position.copy(desde.clone().add(hasta).multiplyScalar(0.5))
  galeriaG.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize())
  g.add(galeriaG)
  // la cinta encima, que avanza mientras llega mineral
  const correa = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([desde.clone().setY(desde.y + 1.7), hasta.clone().setY(hasta.y + 1.7)]),
    new THREE.LineDashedMaterial({ color: papeles.actuales.cobre, dashSize: 2.2, gapSize: 3.4 }),
  )
  correa.computeLineDistances()
  correa.userData.tono = 'cobre'
  g.add(correa)
  // caballetes cada 32 m
  const n = Math.floor(largo / 32)
  for (let i = 1; i <= n; i++) {
    const p = desde.clone().lerp(hasta, i / (n + 1))
    const alto = p.y - 1.6
    for (const dz of [-2.4, 2.4]) {
      const pata = new THREE.BoxGeometry(0.9, alto, 0.9)
      const lateral = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(dz)
      pata.translate(p.x + lateral.x, alto / 2, p.z + lateral.z)
      g.add(solido(papeles, pata, 'lo'))
    }
    const viga = new THREE.BoxGeometry(0.8, 0.8, 6)
    viga.rotateY(Math.atan2(-dir.z, dir.x))
    viga.translate(p.x, alto - 0.4, p.z)
    g.add(solido(papeles, viga, 'lo'))
  }
  // torre de descarga sobre el acopio
  const torre = new THREE.BoxGeometry(6, 64, 6)
  torre.translate(hasta.x + 4, 32, hasta.z)
  g.add(solido(papeles, torre, 'mid'))

  // el acopio: un cono de mineral que se escala con las toneladas (se pone en cada cuadro)
  const acopio = new THREE.Group()
  const cono = new THREE.ConeGeometry(1, 1, 56, 1, true)
  cono.translate(0, 0.5, 0)
  const conoM = new THREE.Mesh(cono, cobre)
  acopio.add(conoM)
  const base = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2), 0.02, Math.sin((i / 64) * Math.PI * 2)))),
    papeles.linea('cobre'),
  )
  acopio.add(base)
  acopio.position.copy(v3(ax + 4, ay, 0))
  g.add(acopio)

  // el chorro de mineral al buzón
  const chorroGeo = new THREE.BufferGeometry()
  chorroGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(60 * 3), 3))
  const chorro = new THREE.Points(chorroGeo, new THREE.PointsMaterial({ color: papeles.actuales.cobre, size: 2.4, sizeAttenuation: false }))
  chorro.userData.tono = 'cobre'
  chorro.visible = false
  g.add(chorro)

  // torres de iluminación alrededor de la plataforma
  for (const [lx, ly] of [
    [DESCARGA[0] - 30, by + 40],
    [x1 + 30, y0 - 20],
    [ax - 60, ay - 70],
  ]) {
    const poste = new THREE.CylinderGeometry(0.5, 0.7, 24, 8)
    const pp = v3(lx, ly, 12)
    poste.translate(pp.x, pp.y, pp.z)
    g.add(solido(papeles, poste, 'lo', undefined, 40))
    g.add(solido(papeles, cajaMundo(lx - 3, lx + 3, ly - 1, ly + 1, 24, 26.5), 'mid'))
  }
  g.add(taller(papeles))
  return { grupo: g, acopio, chorro, correa }
}

/** El taller de camiones: una nave con tres portones altos, su patio, y los estanques de petróleo al lado. */
function taller(papeles: Papeles): THREE.Group {
  const g = new THREE.Group()
  const { x, y, w, d } = TALLER
  g.add(solido(papeles, cajaMundo(x - 12, x + w + 40, y - 14, y + d + 26, -0.4, 0.3), 'lo'))
  g.add(solido(papeles, cajaMundo(x, x + w, y, y + d, 0, 22), 'hi'))
  // techo a dos aguas: un prisma triangular a lo largo
  const techo = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(d + 2, 0), new THREE.Vector2(d / 2 + 1, 7)])
  const tg = new THREE.ExtrudeGeometry(techo, { depth: w + 2, bevelEnabled: false })
  tg.rotateY(Math.PI / 2)
  const pt = v3(x - 1, y - 1, 22)
  tg.translate(pt.x, pt.y, pt.z)
  g.add(solido(papeles, tg, 'mid'))
  // tres portones en la fachada sur, de piso a canto
  const portones: number[] = []
  for (let i = 0; i < 3; i++) {
    const cx = x + (w * (i + 0.5)) / 3
    for (const [a, b] of [
      [v3(cx - 13, y - 0.1, 0), v3(cx - 13, y - 0.1, 17)],
      [v3(cx + 13, y - 0.1, 0), v3(cx + 13, y - 0.1, 17)],
      [v3(cx - 13, y - 0.1, 17), v3(cx + 13, y - 0.1, 17)],
    ])
      portones.push(...a.toArray(), ...b.toArray())
    for (let z = 3; z < 17; z += 2.8) portones.push(...v3(cx - 13, y - 0.1, z).toArray(), ...v3(cx + 13, y - 0.1, z).toArray())
  }
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.Float32BufferAttribute(portones, 3))
  g.add(new THREE.LineSegments(pg, papeles.linea('lo')))
  // estanques de petróleo, con su muro de contención
  g.add(solido(papeles, cajaMundo(x + w + 6, x + w + 36, y + 2, y + d - 2, 0, 1.6), 'lo'))
  for (const [ex, ey] of [
    [x + w + 14, y + 12],
    [x + w + 28, y + 12],
    [x + w + 14, y + d - 12],
    [x + w + 28, y + d - 12],
  ]) {
    const est = new THREE.CylinderGeometry(5.2, 5.2, 11, 28)
    const pe = v3(ex, ey, 7.1)
    est.translate(pe.x, pe.y, pe.z)
    g.add(solido(papeles, est, 'mid', undefined, 40))
  }
  return g
}

/** El acopio para estas toneladas: un cono con el ángulo de reposo del mineral chancado (unos 37°). */
export function ponerAcopio(acopio: THREE.Group, toneladas: number) {
  const volumen = (26000 + toneladas) / 1.7
  const r = Math.cbrt(volumen / ((Math.PI / 3) * 0.75))
  acopio.scale.set(r, 0.75 * r, r)
}

/** Las partículas del chorro: caen de la tolva al buzón; t es el tiempo en segundos. */
export function moverChorro(chorro: THREE.Points, t: number) {
  const pos = chorro.geometry.getAttribute('position') as THREE.BufferAttribute
  const [bx, by] = BUZON
  for (let i = 0; i < pos.count; i++) {
    const fase = (t * 1.6 + i / pos.count) % 1
    const lado = Math.sin(i * 12.9898) * 4.5
    const p = v3(bx - 12 + fase * 8, by + lado, 6 - fase * fase * 16)
    pos.setXYZ(i, p.x, p.y, p.z)
  }
  pos.needsUpdate = true
}
