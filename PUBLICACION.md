# Publicar Tolva en GitHub Pages

La app es una página estática: GitHub Actions la construye desde `interfaz/` y la publica con Pages. No hay servidor.

## Probar antes de publicar

```bash
uv sync --locked
uv run ruff check . && uv run ruff format --check . && uv run pytest

cd interfaz
npm ci
npm test               # el modelo de la app contra el de Python
npm run build
npx vite preview       # vista previa en http://localhost:4173
```

Para las pruebas en el navegador, con la app ya construida: `uv run playwright install chromium` y
`uv run pytest tests/test_navegador.py`.

Si cambia el modelo de Python, volver a correr `uv run carguio` (actualiza `resultados/`, que la app muestra al abrir) y
`uv run python scripts/referencia_web.py` (los promedios con que se prueba el modelo de la app), y hacer el mismo cambio
en `interfaz/src/modelo/`.

## Publicación

1. Subir el repo a GitHub. El plan gratuito de Pages requiere un repo público.
2. En el repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Cada cambio en `interfaz/` o `resultados/` que llega a `main` vuelve a publicar la app
   ([`pages.yml`](.github/workflows/pages.yml)). También se puede correr a mano en **Actions → Publicar Tolva → Run
   workflow**.
4. Comprobar la URL en una ventana privada: **https://vewachholtz-ops.github.io/simulacion-carguio-minero/**

Se publica solo `interfaz/dist`: la página y las tablas de `resultados/`.
