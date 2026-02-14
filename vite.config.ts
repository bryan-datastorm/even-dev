// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [{
    name: 'restapi-proxy',
    configureServer(server) {
      server.middlewares.use('/__restapi_proxy', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end('Method Not Allowed')
          return
        }

        try {
          const parsed = new URL(req.url ?? '', 'http://localhost')
          const target = parsed.searchParams.get('url')?.trim() ?? ''
          if (!target || (!target.startsWith('http://') && !target.startsWith('https://'))) {
            res.statusCode = 400
            res.setHeader('content-type', 'text/plain; charset=utf-8')
            res.end('Missing or invalid "url" query parameter')
            return
          }

          const upstream = await fetch(target, { method: 'GET' })
          const body = await upstream.text()
          const contentType = upstream.headers.get('content-type') ?? 'text/plain; charset=utf-8'

          res.statusCode = upstream.status
          res.setHeader('content-type', contentType)
          res.end(body)
        } catch (error) {
          res.statusCode = 502
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          const message = error instanceof Error ? error.message : String(error)
          res.end(`Proxy request failed: ${message}`)
        }
      })

      server.middlewares.use('/__reddit_proxy', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end('Method Not Allowed')
          return
        }

        try {
          const parsed = new URL(req.url ?? '', 'http://localhost')
          const path = parsed.searchParams.get('path')?.trim() ?? ''
          if (!path.startsWith('/')) {
            res.statusCode = 400
            res.setHeader('content-type', 'text/plain; charset=utf-8')
            res.end('Missing or invalid "path" query parameter')
            return
          }

          const upstreamUrl = new URL(path, 'https://old.reddit.com')
          const upstream = await fetch(upstreamUrl, {
            headers: {
              'User-Agent': 'even-dev-simulator/1.0',
              Accept: 'application/json',
            },
          })
          const body = await upstream.text()
          const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8'

          res.statusCode = upstream.status
          res.setHeader('content-type', contentType)
          res.end(body)
        } catch (error) {
          res.statusCode = 502
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          const message = error instanceof Error ? error.message : String(error)
          res.end(`Reddit proxy request failed: ${message}`)
        }
      })
    },
  }],
  server: {
    host: true,
    port: 5173
  }
})
