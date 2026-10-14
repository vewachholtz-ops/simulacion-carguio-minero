// La maqueta completa: arma la escena una vez, la dibuja con una cámara isométrica que se puede girar y acercar, y
// en cada cuadro solo mueve lo que cambia (camiones, palas, tolvas, el acopio y el chorro al buzón).
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { type Camion3D, camion, ESCALA_EQUIPOS, type Pala3D, pala, posarPala } from './equipos'
import type { FotoMaqueta } from './estado'
import { BLOQUE, FONDO, palas as ubicarPalas } from './mundo'
import { Papeles, TONOS, v3 } from './papel'
import { construirPlanta, moverChorro, type Planta, ponerAcopio } from './planta'
import { construirTerreno } from './terreno'

const AZIMUT = Math.PI / 4
const ELEVACION = (41 * Math.PI) / 180
const CENTRO = v3((BLOQUE.x0 + BLOQUE.x1) / 2 + 20, (BLOQUE.y0 + BLOQUE.y1) / 2, -40)

export class Maqueta {
  readonly lienzo: HTMLCanvasElement
  private render: THREE.WebGLRenderer
  private escena = new THREE.Scene()
  private camara: THREE.OrthographicCamera
  private controles: OrbitControls
  private papeles: Papeles
  private camiones: Camion3D[] = []
  private palas: Pala3D[] = []
  private nPalas = 0
  private planta: Planta
  private materiales: { goma: THREE.Material; cobre: THREE.Material; halo: THREE.Material; rojo: THREE.Material }
  private pendiente = 0
  private ultimaFoto: FotoMaqueta | null = null
  private avanceCinta = 0
  private observador: ResizeObserver
  private oscuro: boolean

  constructor(contenedor: HTMLElement, oscuro: boolean) {
    this.oscuro = oscuro
    this.papeles = new Papeles(TONOS[oscuro ? 'oscuro' : 'claro'])
    this.render = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.render.outputColorSpace = THREE.LinearSRGBColorSpace
    this.render.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.render.setClearColor(0x000000, 0)
    this.lienzo = this.render.domElement
    this.lienzo.style.display = 'block'
    this.lienzo.style.width = '100%'
    this.lienzo.style.height = '100%'
    this.lienzo.style.touchAction = 'pan-y'
    contenedor.appendChild(this.lienzo)

    this.camara = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000)
    this.colocarCamara()
    this.controles = new OrbitControls(this.camara, this.lienzo)
    this.controles.target.copy(CENTRO)
    this.controles.enableDamping = true
    this.controles.dampingFactor = 0.12
    this.controles.minPolarAngle = (24 * Math.PI) / 180
    this.controles.maxPolarAngle = (66 * Math.PI) / 180
    this.controles.minZoom = 0.85
    this.controles.maxZoom = 9
    this.controles.zoomToCursor = true
    this.controles.screenSpacePanning = true
    // en pantallas táctiles, un dedo desplaza la página; dos giran y acercan
    this.controles.touches = { ONE: -1 as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE }
    this.controles.addEventListener('change', () => {
      this.limitarObjetivo()
      this.pedir()
    })
    this.controles.update()

    this.materiales = {
      goma: this.papeles.papel({ tinte: 'goma', tinteCant: 0.82 }),
      cobre: this.papeles.papel({ tinte: 'cobre', tinteCant: 0.62 }),
      halo: this.papeles.halo(),
      rojo: new THREE.MeshBasicMaterial({ color: this.papeles.actuales.rojo }),
    }
    this.escena.add(construirTerreno(this.papeles))
    this.planta = construirPlanta(this.papeles, this.materiales.cobre)
    this.escena.add(this.planta.grupo)
    this.observador = new ResizeObserver(() => this.ajustar())
    this.observador.observe(contenedor)
    this.ajustar()
  }

  private colocarCamara() {
    const d = 2000
    this.camara.position.copy(CENTRO).add(new THREE.Vector3(Math.cos(AZIMUT) * Math.cos(ELEVACION) * d, Math.sin(ELEVACION) * d, Math.sin(AZIMUT) * Math.cos(ELEVACION) * d))
    this.camara.lookAt(CENTRO)
  }

  /** Vuelve a la vista inicial. */
  restablecer() {
    this.controles.target.copy(CENTRO)
    this.camara.zoom = 1
    this.colocarCamara()
    this.camara.updateProjectionMatrix()
    this.controles.update()
    this.pedir()
  }

  private limitarObjetivo() {
    const t = this.controles.target
    t.x = THREE.MathUtils.clamp(t.x, BLOQUE.x0, BLOQUE.x1)
    t.z = THREE.MathUtils.clamp(t.z, -BLOQUE.y1, -BLOQUE.y0)
    t.y = THREE.MathUtils.clamp(t.y, FONDO - 40, 40)
  }

  private ajustar() {
    const padre = this.lienzo.parentElement
    if (!padre) return
    const { clientWidth: w, clientHeight: h } = padre
    if (!w || !h) return
    this.render.setSize(w, h, false)
    this.encuadrar(w / h)
    this.pedir()
  }

  /** Ajusta el encuadre para que el bloque con su base quepa entero, centrado, con un margen. */
  private encuadrar(aspecto: number) {
    const { x0, x1, y0, y1, fondo } = BLOQUE
    const esquinas: THREE.Vector3[] = []
    for (const x of [x0 - 10, x1 + 10]) for (const y of [y0 - 10, y1 + 10]) for (const z of [40, fondo - 46]) esquinas.push(v3(x, y, z))
    this.camara.updateMatrixWorld()
    const vista = this.camara.matrixWorldInverse
    const caja = new THREE.Box3()
    for (const e of esquinas) caja.expandByPoint(e.clone().applyMatrix4(vista))
    const margen = 1.0
    let medioAncho = ((caja.max.x - caja.min.x) / 2) * margen
    let medioAlto = ((caja.max.y - caja.min.y) / 2) * margen
    if (medioAncho / medioAlto > aspecto) medioAlto = medioAncho / aspecto
    else medioAncho = medioAlto * aspecto
    const cx = (caja.max.x + caja.min.x) / 2
    const cy = (caja.max.y + caja.min.y) / 2
    Object.assign(this.camara, { left: cx - medioAncho, right: cx + medioAncho, top: cy + medioAlto, bottom: cy - medioAlto })
    this.camara.updateProjectionMatrix()
  }

  /** Pone los equipos que hacen falta: un camión por camión y una pala por pala. */
  private asegurarEquipos(nCamiones: number, nPalas: number) {
    while (this.camiones.length < nCamiones) {
      const c = camion(this.papeles, this.materiales)
      this.camiones.push(c)
      this.escena.add(c.raiz)
    }
    this.camiones.forEach((c, i) => (c.raiz.visible = i < nCamiones))
    if (nPalas !== this.nPalas) {
      for (const p of this.palas) this.escena.remove(p.raiz)
      this.palas = ubicarPalas(nPalas).map((u) => {
        const p = pala(this.papeles, this.materiales)
        p.raiz.position.copy(v3(u.x, u.y, FONDO))
        p.raiz.rotation.y = u.frente
        this.escena.add(p.raiz)
        return p
      })
      this.nPalas = nPalas
    }
  }

  /** Pone la mina como está en esta foto del turno. */
  mostrar(f: FotoMaqueta, nPalas: number) {
    this.ultimaFoto = f
    this.asegurarEquipos(f.camiones.length, nPalas)
    const lit = this.papeles.linea('lit')
    const hi = this.papeles.linea('hi')
    for (const c of f.camiones) {
      const m = this.camiones[c.j]
      m.raiz.position.copy(v3(c.x, c.y, c.z))
      m.raiz.rotation.set(0, c.rumbo, c.cabeceo, 'YZX')
      m.tolva.rotation.z = c.volteo * 0.92
      m.carga.visible = c.carga > 0.02
      m.carga.scale.set(1, Math.max(0.05, c.carga), 1)
      // el camión que está vaciando es el acento: se encienden sus aristas
      const encendido = c.estado === 'descarga' && c.volteo > 0
      m.raiz.traverse((o) => {
        if (o instanceof THREE.LineSegments && o.userData.tonoBase === 'hi') o.material = encendido ? lit : hi
      })
    }
    f.palas.forEach((p, i) => {
      const m = this.palas[i]
      if (!m) return
      posarPala(m, p.giro, p.balde)
      const parada = p.estado === 'falla' || p.estado === 'reparacion'
      m.baliza.visible = parada
      m.servicio.visible = p.estado === 'reparacion'
      for (const l of m.lineas) if (l.userData.tonoBase === 'hi') l.material = parada ? this.papeles.linea('rojo') : hi
    })
    ponerAcopio(this.planta.acopio, f.toneladas)
    this.planta.chorro.visible = f.vaciando > 0
    this.pedir()
  }

  cambiarTema(oscuro: boolean) {
    if (oscuro === this.oscuro) return
    this.oscuro = oscuro
    const t = TONOS[oscuro ? 'oscuro' : 'claro']
    this.papeles.cambiar(t)
    ;(this.materiales.rojo as THREE.MeshBasicMaterial).color.set(t.rojo)
    this.escena.traverse((o) => {
      const tono = o.userData.tono as keyof typeof t | undefined
      const mat = (o as THREE.Mesh).material as THREE.Material & { color?: THREE.Color; userData: { repintar?: () => void } }
      if (tono && mat?.color) mat.color.set(t[tono] as string)
      mat?.userData?.repintar?.()
    })
    if (this.ultimaFoto) this.mostrar(this.ultimaFoto, this.nPalas)
    this.pedir()
  }

  /** Pide un cuadro; mientras los controles se están asentando, sigue pidiendo. */
  pedir() {
    if (this.pendiente) return
    this.pendiente = requestAnimationFrame(() => {
      this.pendiente = 0
      const ahora = performance.now()
      if (this.planta.chorro.visible) moverChorro(this.planta.chorro, ahora / 1000)
      if (this.ultimaFoto?.vaciando) {
        // la cinta avanza: se corre el patrón de trazos
        this.avanceCinta -= 0.5
        const d = this.planta.correa.geometry.getAttribute('lineDistance') as THREE.BufferAttribute
        const largo = d.getX(1) - d.getX(0)
        d.setX(0, this.avanceCinta)
        d.setX(1, this.avanceCinta + largo)
        d.needsUpdate = true
      }
      const moviendo = this.controles.update()
      this.render.render(this.escena, this.camara)
      if (moviendo || this.planta.chorro.visible) this.pedir()
    })
  }

  liberar() {
    this.observador.disconnect()
    cancelAnimationFrame(this.pendiente)
    this.controles.dispose()
    this.render.dispose()
    this.escena.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
    })
    this.lienzo.remove()
  }
}

export { ESCALA_EQUIPOS }
