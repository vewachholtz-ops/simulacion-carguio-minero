// El acabado de la maqueta, el de las figuras de Anatomy (github.com/wheresryan22/anatomy, MIT): sólidos color papel
// con cuatro tonos de costado según hacia dónde miran y una tapa más clara, líneas finas en tres tonos (lo, mid, hi),
// un solo acento encendido y color solo cuando el color es el tema: el mineral de cobre y las fallas.
import * as THREE from 'three'

export interface Tonos {
  fondo: string
  tapa: string
  s0: string
  s1: string
  s2: string
  s3: string
  hi: string
  mid: string
  lo: string
  faint: string
  lit: string
  halo: string
  haloOpacidad: number
  cobre: string
  rojo: string
  goma: string
}

export const TONOS: Record<'claro' | 'oscuro', Tonos> = {
  claro: {
    fondo: '#fbfbfa',
    tapa: '#ffffff',
    s0: '#d9d9d6',
    s1: '#e3e3e0',
    s2: '#ececea',
    s3: '#f4f4f1',
    hi: '#26262a',
    mid: '#8a8a8f',
    lo: '#b4b4b8',
    faint: '#d4d4d6',
    lit: '#000000',
    halo: '#8a8a80',
    haloOpacidad: 0.32,
    cobre: '#c0662b',
    rojo: '#e5484d',
    goma: '#5d5d62',
  },
  oscuro: {
    fondo: '#131313',
    tapa: '#1f1f1f',
    s0: '#0f0f0f',
    s1: '#131313',
    s2: '#171717',
    s3: '#1b1b1b',
    hi: '#d4d4d4',
    mid: '#6a6a6a',
    lo: '#3e3e3e',
    faint: '#2a2a2a',
    lit: '#ffffff',
    halo: '#050505',
    haloOpacidad: 0.9,
    cobre: '#d9773b',
    rojo: '#ff6b6b',
    goma: '#080808',
  },
}

THREE.ColorManagement.enabled = false

const VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPos = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const FRAG = /* glsl */ `
uniform vec3 uTapa;
uniform vec3 uS0;
uniform vec3 uS1;
uniform vec3 uS2;
uniform vec3 uS3;
uniform vec3 uTinte;
uniform float uTinteCant;
uniform float uFacetas;
uniform float uProfundidad;
uniform float uMineral;
uniform vec3 uCobre;
uniform vec2 uLuz;
varying vec3 vPos;
varying vec3 vNormal;
void main() {
  vec3 n = uFacetas > 0.5 ? normalize(cross(dFdx(vPos), dFdy(vPos))) : normalize(vNormal);
  if (dot(n, cameraPosition - vPos) < 0.0) n = -n;
  vec2 h = n.xz;
  float lh = length(h);
  float f = lh > 1e-4 ? dot(h / lh, uLuz) * 0.5 + 0.5 : 0.5;
  vec3 lado = f < 0.3333 ? mix(uS0, uS1, f * 3.0) : (f < 0.6667 ? mix(uS1, uS2, (f - 0.3333) * 3.0) : mix(uS2, uS3, (f - 0.6667) * 3.0));
  vec3 c = mix(lado, uTapa, smoothstep(0.5, 0.93, n.y));
  // el fondo del rajo, algo más oscuro: se lee la profundidad
  float prof = clamp(-vPos.y / 112.0, 0.0, 1.0) * uProfundidad;
  c = mix(c, uS0, prof * 0.55);
  // bajo los 50 m está el mineral: un tinte leve de cobre en el terreno
  float ley = smoothstep(-46.0, -56.0, vPos.y) * uMineral;
  c = mix(c, uCobre, ley * 0.07);
  c = mix(c, uTinte, uTinteCant);
  gl_FragColor = vec4(c, 1.0);
}`

export interface OpcionesPapel {
  facetas?: boolean
  profundidad?: number
  mineral?: number
  tinte?: 'cobre' | 'rojo' | 'goma' | null
  tinteCant?: number
  doble?: boolean
}

/** Un material papel. Se guardan todos para cambiarles los tonos cuando cambia el tema. */
export class Papeles {
  private materiales: { m: THREE.ShaderMaterial; o: OpcionesPapel }[] = []
  private lineas = new Map<string, THREE.LineBasicMaterial>()
  private halos: THREE.MeshBasicMaterial[] = []
  private tonos: Tonos

  constructor(tonos: Tonos) {
    this.tonos = tonos
  }

  papel(o: OpcionesPapel = {}): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTapa: { value: new THREE.Color() },
        uS0: { value: new THREE.Color() },
        uS1: { value: new THREE.Color() },
        uS2: { value: new THREE.Color() },
        uS3: { value: new THREE.Color() },
        uTinte: { value: new THREE.Color() },
        uTinteCant: { value: o.tinteCant ?? (o.tinte ? 1 : 0) },
        uFacetas: { value: o.facetas === false ? 0 : 1 },
        uProfundidad: { value: o.profundidad ?? 0 },
        uMineral: { value: o.mineral ?? 0 },
        uCobre: { value: new THREE.Color() },
        uLuz: { value: new THREE.Vector2(-0.35, 0.94) },
      },
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      side: o.doble ? THREE.DoubleSide : THREE.FrontSide,
    })
    this.materiales.push({ m, o })
    this.pintar(m, o)
    return m
  }

  /** Una línea en uno de los tonos del tema; las del mismo tono comparten material. */
  linea(tono: 'hi' | 'mid' | 'lo' | 'faint' | 'lit' | 'cobre' | 'rojo'): THREE.LineBasicMaterial {
    let m = this.lineas.get(tono)
    if (!m) {
      m = new THREE.LineBasicMaterial({ color: this.tonos[tono] })
      this.lineas.set(tono, m)
    }
    return m
  }

  halo(): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({
      color: this.tonos.halo,
      transparent: true,
      opacity: this.tonos.haloOpacidad,
      alphaMap: texturaHalo(),
      depthWrite: false,
    })
    this.halos.push(m)
    return m
  }

  private pintar(m: THREE.ShaderMaterial, o: OpcionesPapel) {
    const t = this.tonos
    const u = m.uniforms
    u.uTapa.value.set(t.tapa)
    u.uS0.value.set(t.s0)
    u.uS1.value.set(t.s1)
    u.uS2.value.set(t.s2)
    u.uS3.value.set(t.s3)
    u.uCobre.value.set(t.cobre)
    u.uTinte.value.set(o.tinte ? t[o.tinte] : t.s0)
  }

  cambiar(tonos: Tonos) {
    this.tonos = tonos
    for (const { m, o } of this.materiales) this.pintar(m, o)
    for (const [tono, m] of this.lineas) m.color.set(tonos[tono as keyof Tonos] as string)
    for (const m of this.halos) {
      m.color.set(tonos.halo)
      m.opacity = tonos.haloOpacidad
    }
  }

  get actuales() {
    return this.tonos
  }
}

let halo: THREE.Texture | null = null
function texturaHalo() {
  if (halo) return halo
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, '#fff')
  r.addColorStop(0.55, '#8a8a8a')
  r.addColorStop(1, '#000')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  halo = new THREE.CanvasTexture(c)
  return halo
}

/** Del mundo de la mina (x este, y norte, z arriba) a las coordenadas de three (y arriba). */
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)
