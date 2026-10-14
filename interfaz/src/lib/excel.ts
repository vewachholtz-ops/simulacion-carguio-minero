// Un Excel (.xlsx) armado en el navegador: un .xlsx es un zip con unos pocos XML. Cada hoja es una tabla con su fila
// de encabezados; los números van como números (para que Excel pueda sumarlos y graficarlos) y el resto como texto.
import { strToU8, zipSync } from 'fflate'

export type Celda = string | number | null
export interface Hoja {
  nombre: string
  filas: Celda[][]
  /** Ancho de cada columna, en caracteres. */
  anchos?: number[]
}

const escapar = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)

function columna(i: number) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function hojaXml(h: Hoja) {
  const columnas = h.anchos?.length
    ? `<cols>${h.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const filas = h.filas
    .map((fila, r) => {
      const celdas = fila
        .map((v, c) => {
          const ref = `${columna(c)}${r + 1}`
          const estilo = r === 0 ? ' s="1"' : ''
          if (v === null || v === '') return ''
          if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${estilo}><v>${v}</v></c>` : ''
          return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escapar(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${celdas}</row>`
    })
    .join('')
  const congelar = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${congelar}${columnas}<sheetData>${filas}</sheetData></worksheet>`
}

/** Los bytes de un .xlsx con estas hojas (nombres de hoja de hasta 31 caracteres, sin : \ / ? * [ ]). */
export function libroExcel(hojas: Hoja[]): Uint8Array {
  const nombre = (s: string) => s.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
  const archivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
      .map((h, i) => `<sheet name="${escapar(nombre(h.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    // estilo 0: normal; estilo 1: negrita, para los encabezados
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
  }
  hojas.forEach((h, i) => (archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(hojaXml(h))))
  return zipSync(archivos, { level: 6 })
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
