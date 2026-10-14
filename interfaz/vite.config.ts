import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Tolva se publica en GitHub Pages (dist/, lo arma la acción de Pages). Las tablas de
// ../resultados entran a la página al construirla, así que la página muestra siempre lo mismo que el repo.

/** Deja en dist/licencias.txt la licencia de cada paquete que termina dentro de la página (React, Observable Plot, la
 * tipografía): la licencia MIT pide incluir el aviso en las copias. */
function licencias(): Plugin {
  return {
    name: 'licencias',
    apply: 'build',
    generateBundle() {
      const paquetes = new Map<string, string>()
      for (const id of this.getModuleIds()) {
        const ruta = id.replace(/\0/g, '').split('?')[0]
        const i = ruta.lastIndexOf('/node_modules/')
        if (i < 0) continue
        const resto = ruta.slice(i + '/node_modules/'.length).split('/')
        const nombre = resto[0].startsWith('@') ? `${resto[0]}/${resto[1]}` : resto[0]
        paquetes.set(nombre, join(ruta.slice(0, i), 'node_modules', nombre))
      }
      for (const fuente of ['@fontsource-variable/archivo'])
        paquetes.set(fuente, join(process.cwd(), 'node_modules', fuente))
      const partes = [...paquetes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([nombre, carpeta]) => {
          const datos = JSON.parse(readFileSync(join(carpeta, 'package.json'), 'utf8'))
          const archivo = existsSync(carpeta) ? readdirSync(carpeta).find((f) => /^(licen[cs]e|copying)/i.test(f)) : undefined
          const texto = archivo ? readFileSync(join(carpeta, archivo), 'utf8').trim() : `Licencia: ${datos.license}`
          return `${nombre} ${datos.version} (${datos.license})\n\n${texto}`
        })
      this.emitFile({
        type: 'asset',
        fileName: 'licencias.txt',
        source: `${readFileSync(join(process.cwd(), '../TERCEROS.md'), 'utf8')}\n\nLicencias del código incluido en la página.\n\n${partes.join(`\n\n${'-'.repeat(72)}\n\n`)}\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), licencias()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    // three.js en su propio archivo: cambia poco, así el navegador lo guarda entre versiones
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  server: { fs: { allow: ['..'] } },
})
