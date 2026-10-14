// El modelo: el ciclo del camión, los parámetros de la mina en pantalla (se cambian en «Tu mina») y las decisiones
// de modelamiento, con sus límites.
import { useEscenario } from '../lib/escenario'
import { NB, numero } from '../lib/formato'
import type { Parametros } from '../modelo/simulacion'

const CICLO = ['Cola en la pala', 'Posicionamiento y carga', 'Acarreo cargado', 'Cola en el chancador', 'Descarga', 'Retorno vacío']

export function Ciclo() {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13.5px]" aria-label="El ciclo de cada camión">
      {CICLO.map((paso) => (
        <li key={paso} className="flex items-center gap-1.5">
          <span className="rounded-md border bg-superficie px-2.5 py-1">{paso}</span>
          <span aria-hidden className="text-tinta-tenue">
            →
          </span>
        </li>
      ))}
      <li className="text-tinta-tenue">y vuelve a elegir pala</li>
    </ol>
  )
}

type Ruta = { campo: keyof Parametros; indice?: number } | { costo: 'camionUsdH' | 'palaUsdH' }

interface FilaParametro {
  nombre: string
  distribucion: string
  valores: { ruta: Ruta; unidad?: string; etiqueta?: string; paso?: number }[]
}

const FILAS: FilaParametro[] = [
  { nombre: 'Capacidad del camión', distribucion: 'fija', valores: [{ ruta: { campo: 'capacidadT' }, unidad: 't', paso: 10 }] },
  { nombre: 'Posicionamiento en la pala', distribucion: 'fijo', valores: [{ ruta: { campo: 'posicionamiento' }, unidad: 'min', paso: 0.1 }] },
  {
    nombre: 'Carga',
    distribucion: 'triangular',
    valores: [
      { ruta: { campo: 'carga', indice: 0 }, etiqueta: 'mín.', paso: 0.1 },
      { ruta: { campo: 'carga', indice: 1 }, etiqueta: 'moda', paso: 0.1 },
      { ruta: { campo: 'carga', indice: 2 }, etiqueta: 'máx.', unidad: 'min', paso: 0.1 },
    ],
  },
  {
    nombre: 'Acarreo cargado',
    distribucion: 'normal, no menos del 10 % de la media',
    valores: [
      { ruta: { campo: 'acarreo', indice: 0 }, etiqueta: 'media', paso: 0.5 },
      { ruta: { campo: 'acarreo', indice: 1 }, etiqueta: 'desv.', unidad: 'min', paso: 0.1 },
    ],
  },
  {
    nombre: 'Descarga en el chancador',
    distribucion: 'triangular',
    valores: [
      { ruta: { campo: 'descarga', indice: 0 }, etiqueta: 'mín.', paso: 0.1 },
      { ruta: { campo: 'descarga', indice: 1 }, etiqueta: 'moda', paso: 0.1 },
      { ruta: { campo: 'descarga', indice: 2 }, etiqueta: 'máx.', unidad: 'min', paso: 0.1 },
    ],
  },
  {
    nombre: 'Retorno vacío',
    distribucion: 'normal, no menos del 10 % de la media',
    valores: [
      { ruta: { campo: 'retorno', indice: 0 }, etiqueta: 'media', paso: 0.5 },
      { ruta: { campo: 'retorno', indice: 1 }, etiqueta: 'desv.', unidad: 'min', paso: 0.1 },
    ],
  },
  {
    nombre: 'Fallas de cada pala',
    distribucion: 'exponenciales',
    valores: [
      { ruta: { campo: 'mtbfPala' }, etiqueta: 'cada', paso: 10 },
      { ruta: { campo: 'mttrPala' }, etiqueta: 'reparación', unidad: 'min', paso: 5 },
    ],
  },
  {
    nombre: 'Costo por hora',
    distribucion: 'para el costo por tonelada',
    valores: [
      { ruta: { costo: 'camionUsdH' }, etiqueta: 'camión', paso: 10 },
      { ruta: { costo: 'palaUsdH' }, etiqueta: 'pala', unidad: 'USD/h', paso: 10 },
    ],
  },
]

export function TablaParametros() {
  const e = useEscenario()
  const leer = (r: Ruta): number | null => {
    if ('costo' in r) return e.costos[r.costo]
    const v = e.parametros[r.campo]
    return Array.isArray(v) ? v[r.indice!] : (v as number | null)
  }
  const clave = (r: Ruta) => ('costo' in r ? r.costo : `${r.campo}${r.indice ?? ''}`)
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border bg-superficie">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b text-left text-tinta-suave">
              <th className="px-4 py-2.5 font-medium">Parámetro</th>
              <th className="px-4 py-2.5 font-medium">Valor en «{e.nombre}»</th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map((f) => (
              <tr key={f.nombre} className="border-b last:border-b-0">
                <th scope="row" className="px-4 py-2 text-left align-top font-medium">
                  {f.nombre}
                  <span className="block text-[12px] font-normal text-tinta-tenue">{f.distribucion}</span>
                </th>
                <td className="px-4 py-2 align-top">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {f.valores.map((v) => {
                      const valor = leer(v.ruta)
                      const sinFallas = 'campo' in v.ruta && v.ruta.campo === 'mtbfPala' && valor === null
                      return (
                        <span key={clave(v.ruta)} className="text-tinta-tenue">
                          {v.etiqueta && <span className="text-[12.5px]">{v.etiqueta} </span>}
                          <span className="angosta cifras text-[14px] text-tinta">{sinFallas ? 'sin fallas' : (valor ?? 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })}</span>
                          {v.unidad && !sinFallas && <span className="text-[12.5px]"> {v.unidad}</span>}
                        </span>
                      )
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13.5px] text-tinta-tenue">
        Turno de {(e.parametros.turno / 60).toLocaleString('es-CL', { maximumFractionDigits: 1 })}{NB}horas; los primeros {numero(e.parametros.calentamiento)}{NB}min no se cuentan
        (calentamiento).{' '}
        <a href="#mina" className="font-medium text-acento hover:underline">
          Cámbialos en Tu mina
        </a>
        .
      </p>
    </div>
  )
}
