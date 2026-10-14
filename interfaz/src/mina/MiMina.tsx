// «Tu mina»: escribir los números de una operación propia (o partir de cero), ver al tiro las cuentas que salen de
// ellos, y guardar, compartir, descargar o abrir el escenario. El simulador y el barrido de flota usan lo que esté
// aquí; mientras falte un dato, siguen con el último escenario completo.
import { Download, FilePlus2, FolderOpen, Link2, RotateCcw, Save, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Boton } from '../componentes/ui'
import { aArchivo, borrar, deArchivo, descargar, enlace, guardados, guardar, type Guardado, nombreArchivo } from '../lib/archivo'
import { camionesEquilibrio, EJEMPLO, type Escenario, escenarioActual, useEscenario, usar } from '../lib/escenario'
import { NB, numero, pct, th } from '../lib/formato'
import { cn } from '../lib/utiles'
import { cargaMedia, cicloSinColas, factorAcoplamiento, type Parametros } from '../modelo/simulacion'
import { Comparar } from './Comparar'
import { Formulario } from './Formulario'
import { type Clave, desdeEscenario, enBlanco, type Formulario as F, leer } from './textos'

export function MiMina() {
  const e = useEscenario()
  const [f, setF] = useState<F>(() => desdeEscenario(e))
  const reflejado = useRef(e)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [lista, setLista] = useState<Guardado[]>(() => guardados())

  // si el escenario cambia desde afuera (los controles del simulador), el formulario cambia solo esos datos
  useEffect(() => {
    if (e === reflejado.current) return
    const antes = desdeEscenario(reflejado.current)
    const ahora = desdeEscenario(e)
    reflejado.current = e
    setF((f) => {
      const textos = { ...f.textos }
      for (const k of Object.keys(ahora.textos) as Clave[]) if (ahora.textos[k] !== antes.textos[k]) textos[k] = ahora.textos[k]
      return {
        nombre: ahora.nombre !== antes.nombre ? ahora.nombre : f.nombre,
        modoRuta: ahora.modoRuta !== antes.modoRuta ? ahora.modoRuta : f.modoRuta,
        conFallas: ahora.conFallas !== antes.conFallas ? ahora.conFallas : f.conFallas,
        textos,
      }
    })
  }, [e])

  const lectura = useMemo(() => leer(f), [f])

  const editar = (nuevo: F) => {
    setF(nuevo)
    const l = leer(nuevo)
    if (l.escenario && JSON.stringify(l.escenario) !== JSON.stringify(escenarioActual())) {
      reflejado.current = l.escenario
      usar(l.escenario)
    }
  }

  const abrir = (nuevo: Escenario, texto: string) => {
    reflejado.current = nuevo
    setF(desdeEscenario(nuevo))
    usar(nuevo)
    setMensaje({ texto })
  }

  const completo = lectura.escenario
  const avisar = (texto: string, error = false) => setMensaje({ texto, error })

  const alGuardar = () => {
    if (!completo) return
    const reemplaza = lista.some((g) => g.archivo.nombre === completo.nombre)
    if (!guardar(completo)) return avisar('Este navegador no deja guardar (¿ventana privada?). Descarga el escenario para no perderlo.', true)
    setLista(guardados())
    avisar(reemplaza ? `Guardada «${completo.nombre}» (reemplazó la que tenía ese nombre).` : `Guardada «${completo.nombre}» en este navegador.`)
  }

  const alCompartir = async () => {
    if (!completo) return
    const url = enlace(completo)
    try {
      await navigator.clipboard.writeText(url)
      avisar('Enlace copiado. Quien lo abra ve esta mina con todos sus datos; no pasa por ningún servidor.')
    } catch {
      window.prompt('Copia este enlace:', url)
    }
  }

  const alDescargar = () => {
    if (!completo) return
    descargar(`${nombreArchivo(completo.nombre)}.json`, JSON.stringify(aArchivo(completo), null, 2), 'application/json')
    avisar('Descargado. Ábrelo aquí con «Abrir archivo» o córrelo en Python: uv run carguio --escenario archivo.json')
  }

  const archivo = useRef<HTMLInputElement>(null)
  const alAbrirArchivo = async (file: File) => {
    try {
      const nuevo = deArchivo(JSON.parse(await file.text()))
      abrir(nuevo, `Abriste «${nuevo.nombre}» desde ${file.name}.`)
    } catch (err) {
      avisar(`No pude abrir ${file.name}: ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
          <span className="text-[12.5px] text-tinta-suave">Nombre de la mina o del escenario</span>
          <input
            value={f.nombre}
            onChange={(ev) => editar({ ...f, nombre: ev.target.value })}
            maxLength={80}
            className="ancha h-11 w-full rounded-md border bg-superficie px-3 text-[1.25rem] font-semibold tracking-tight"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Boton variante="principal" onClick={alGuardar} disabled={!completo}>
            <Save aria-hidden />
            Guardar
          </Boton>
          <Boton onClick={() => void alCompartir()} disabled={!completo}>
            <Link2 aria-hidden />
            Copiar enlace
          </Boton>
          <Boton onClick={alDescargar} disabled={!completo}>
            <Download aria-hidden />
            Descargar
          </Boton>
          <Boton onClick={() => archivo.current?.click()}>
            <FolderOpen aria-hidden />
            Abrir archivo
          </Boton>
          <input
            ref={archivo}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Abrir un escenario guardado (.json)"
            onChange={(ev) => {
              const file = ev.target.files?.[0]
              if (file) void alAbrirArchivo(file)
              ev.target.value = ''
            }}
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <button
          onClick={() => {
            setF(enBlanco())
            setMensaje({ texto: 'Mina en blanco: llena los datos marcados. Mientras falte alguno, la página sigue con la mina anterior.' })
          }}
          className="inline-flex items-center gap-1.5 text-acento hover:underline"
        >
          <FilePlus2 className="size-3.5" aria-hidden />
          Empezar una mina en blanco
        </button>
        <button onClick={() => abrir(EJEMPLO, 'Volviste a la mina de ejemplo.')} className="inline-flex items-center gap-1.5 text-tinta-suave hover:text-tinta hover:underline">
          <RotateCcw className="size-3.5" aria-hidden />
          Volver a la mina de ejemplo
        </button>
        {mensaje && (
          <p role="status" className={cn('basis-full text-tinta-suave', mensaje.error && 'text-falla')}>
            {mensaje.texto}
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Formulario f={f} cambiar={editar} />
        <div className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          {completo ? (
            <Cuentas e={completo} />
          ) : (
            <Panel titulo="Faltan datos">
              {lectura.faltan.length > 0 && (
                <p>
                  Completa {lectura.faltan.length === 1 ? 'este dato' : `estos ${lectura.faltan.length} datos`}: {lectura.faltan.join(', ')}.
                </p>
              )}
              {lectura.problemas.length > 0 && <p className="text-falla">{lectura.problemas.join(' ')}</p>}
              <p className="mt-2 text-tinta-tenue">
                Mientras tanto, el simulador y el barrido siguen con «{e.nombre}».
              </p>
            </Panel>
          )}
          <Guardadas
            lista={lista}
            actual={e.nombre}
            alAbrir={(g) => {
              try {
                const nuevo = deArchivo(g.archivo)
                abrir(nuevo, `Abriste «${nuevo.nombre}».`)
              } catch (err) {
                avisar(err instanceof Error ? err.message : String(err), true)
              }
            }}
            alBorrar={(nombre) => {
              borrar(nombre)
              setLista(guardados())
              avisar(`Borraste «${nombre}» de este navegador.`)
            }}
          />
        </div>
      </div>

      <Comparar lista={lista} />
    </div>
  )
}

function Panel({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="rounded-lg border bg-superficie px-4 py-3.5 text-[13.5px] leading-relaxed text-tinta-suave">
      <h3 className="mb-1.5 text-[14.5px] font-semibold text-tinta">{titulo}</h3>
      {children}
    </section>
  )
}

/** Cuentas que salen directo de los números, sin colas ni azar: dan la escala antes de simular. */
function Cuentas({ e }: { e: Escenario }) {
  const p = e.parametros
  const c = calcular(p)
  const metaTH = e.meta ? e.meta / (p.turno / 60) : null
  const acople = factorAcoplamiento(p)
  return (
    <Panel titulo="Con estos números">
      <dl className="space-y-2">
        <Fila nombre="Ciclo de un camión, sin esperas" valor={`${numero(c.ciclo, 1)}${NB}min`} />
        <Fila nombre="Lo que mueve un camión" valor={th(c.porCamion)} />
        <Fila nombre={`Lo máximo que cargan ${p.palas === 1 ? 'la pala' : `las ${p.palas} palas`}`} valor={th(c.palas)} nota={p.mtbfPala === null ? undefined : `con ${pct(c.disponibilidad)} del tiempo sin fallas`} />
        <Fila nombre="Lo máximo que recibe el chancador" valor={th(c.chancador)} />
        <Fila nombre="Camiones para que las palas no esperen" valor={numero(c.equilibrio, 1)} nota="factor de acoplamiento 1" />
      </dl>
      <p className="mt-3 border-t pt-3 text-tinta">
        {acople < 0.9
          ? `Con ${p.camiones} camiones las palas van a esperar camión: la flota es el límite.`
          : acople > 1.1
            ? `Con ${p.camiones} camiones sobran camiones: van a hacer cola en las palas.`
            : `Con ${p.camiones} camiones la flota está cerca del equilibrio con las palas.`}
      </p>
      {metaTH !== null && (
        <p className="mt-2">
          Tu meta, {numero(e.meta!)}{NB}t por turno, es {th(metaTH)}.{' '}
          {metaTH > Math.min(c.palas, c.chancador)
            ? `Es más de lo que ${c.palas <= c.chancador ? 'pueden cargar las palas' : 'recibe el chancador'}: no se llega agregando camiones.`
            : `Las palas dan para eso; el barrido de flota dice con cuántos camiones se llega.`}
        </p>
      )}
      <p className="mt-2 text-[12.5px] text-tinta-tenue">Cuentas sin colas ni azar. El simulador y el barrido las ponen a prueba.</p>
    </Panel>
  )
}

export function calcular(p: Parametros) {
  const carga = cargaMedia(p)
  const ciclo = cicloSinColas(p)
  const descarga = (p.descarga[0] + p.descarga[1] + p.descarga[2]) / 3
  const disponibilidad = p.mtbfPala === null ? 1 : p.mtbfPala / (p.mtbfPala + p.mttrPala)
  return {
    ciclo,
    porCamion: (p.capacidadT * 60) / ciclo,
    palas: ((p.palas * p.capacidadT * 60) / carga) * disponibilidad,
    chancador: descarga > 0 ? (p.capacidadT * 60) / descarga : Number.POSITIVE_INFINITY,
    disponibilidad,
    equilibrio: camionesEquilibrio(p),
  }
}

function Fila({ nombre, valor, nota }: { nombre: string; valor: string; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="leading-snug">
        {nombre}
        {nota && <span className="block text-[12px] text-tinta-tenue">{nota}</span>}
      </dt>
      <dd className="angosta cifras shrink-0 text-[15px] font-semibold text-tinta">{valor}</dd>
    </div>
  )
}

function Guardadas({
  lista,
  actual,
  alAbrir,
  alBorrar,
}: {
  lista: Guardado[]
  actual: string
  alAbrir: (g: Guardado) => void
  alBorrar: (nombre: string) => void
}) {
  const [borrando, setBorrando] = useState<string | null>(null)
  return (
    <Panel titulo="Guardadas en este navegador">
      {lista.length === 0 ? (
        <p className="text-tinta-tenue">Todavía ninguna. «Guardar» deja la mina aquí; para llevarla a otro computador, descárgala o copia el enlace.</p>
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {lista.map((g) => {
            const q = g.archivo.parametros
            return (
              <li key={g.archivo.nombre} className={cn('flex items-center gap-2 rounded-md px-1 py-1', g.archivo.nombre === actual && 'bg-acento-tinte/60')}>
                <button onClick={() => alAbrir(g)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium text-tinta hover:underline">{g.archivo.nombre}</span>
                  <span className="block text-[12px] text-tinta-tenue">
                    {q.n_camiones} camiones, {q.n_palas} {q.n_palas === 1 ? 'pala' : 'palas'}, {numero(q.capacidad_t)}{NB}t ·{' '}
                    {new Date(g.guardado).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </span>
                </button>
                {borrando === g.archivo.nombre ? (
                  <span className="flex items-center gap-1">
                    <Boton tamano="sm" variante="contorno" className="text-falla" onClick={() => (alBorrar(g.archivo.nombre), setBorrando(null))}>
                      Borrar
                    </Boton>
                    <Boton tamano="sm" variante="fantasma" onClick={() => setBorrando(null)}>
                      No
                    </Boton>
                  </span>
                ) : (
                  <Boton tamano="icono" variante="fantasma" aria-label={`Borrar «${g.archivo.nombre}»`} onClick={() => setBorrando(g.archivo.nombre)}>
                    <Trash2 aria-hidden />
                  </Boton>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
