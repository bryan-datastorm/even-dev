// vite.config.ts
import { execFile } from 'node:child_process'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [{
    name: 'restapi-proxy',
    configureServer(server) {
      const openExternalUrl = async (target: string): Promise<void> => {
        const openCommand = process.platform === 'darwin'
          ? ['open', target]
          : process.platform === 'win32'
            ? ['cmd', '/c', 'start', '', target]
            : ['xdg-open', target]

        await new Promise<void>((resolve, reject) => {
          execFile(openCommand[0], openCommand.slice(1), (error) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          })
        })
      }

      const isEditorUrlReachable = async (target: string): Promise<boolean> => {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 900)
          const response = await fetch(target, { method: 'GET', signal: controller.signal })
          clearTimeout(timer)

          if (!response.ok) {
            return false
          }

          const contentType = response.headers.get('content-type') ?? ''
          if (!contentType.includes('text/html')) {
            return false
          }

          const body = await response.text()
          return body.includes('Smart Glasses UI Builder')
        } catch {
          return false
        }
      }

      server.middlewares.use('/__open_editor', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end('Method Not Allowed')
          return
        }

        try {
          const explicitUrl = new URL(req.url ?? '', 'http://localhost').searchParams.get('url')?.trim() ?? ''
          const candidates = [
            explicitUrl,
            'http://localhost:5174/even-ui-builder/',
            'http://127.0.0.1:5174/even-ui-builder/',
            'http://localhost:5173/even-ui-builder/',
            'http://127.0.0.1:5173/even-ui-builder/',
          ].filter(Boolean)

          let openedUrl: string | null = null
          for (const candidate of candidates) {
            if (await isEditorUrlReachable(candidate)) {
              await openExternalUrl(candidate)
              openedUrl = candidate
              break
            }
          }

          if (!openedUrl) {
            res.statusCode = 404
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, error: 'Editor dev server not reachable.' }))
            return
          }

          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, url: openedUrl }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          const message = error instanceof Error ? error.message : String(error)
          res.end(`Failed to open editor URL: ${message}`)
        }
      })

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

      server.middlewares.use('/__open_external', async (req, res) => {
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

          await openExternalUrl(target)

          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          const message = error instanceof Error ? error.message : String(error)
          res.end(`Failed to open external URL: ${message}`)
        }
      })

      // Compatibility route for the upstream reddit submodule client.
      // It expects requests like /reddit-api/r/... to proxy to old.reddit.com.
      server.middlewares.use('/reddit-api', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end('Method Not Allowed')
          return
        }

        try {
          const upstreamUrl = `https://old.reddit.com${req.url ?? ''}`
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
