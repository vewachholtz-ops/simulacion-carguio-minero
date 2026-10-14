import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { abrirDesdeLaDireccion } from './lib/archivo'
import { usar } from './lib/escenario'
import './estilos.css'

// un enlace compartido trae la mina en la dirección (#mina=…): se abre antes de dibujar la página
abrirDesdeLaDireccion(usar)

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
