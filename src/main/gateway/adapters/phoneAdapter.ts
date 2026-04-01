/**
 * Phone adapter: HTTP server on port 9876 for receiving decisions from phone.
 * Stub in Phase 3, full validation in Phase 6.
 */
import { createServer, type Server } from 'http'

type DecisionCallback = (decisionId: string, resolution: string) => void

let server: Server | null = null
const PHONE_PORT = 9876

export async function startPhoneServer(onDecision: DecisionCallback): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      // CORS headers for phone clients
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method !== 'POST' || req.url !== '/decision') {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const data = JSON.parse(body) as { decisionId?: string; resolution?: string }
          if (!data.decisionId || !data.resolution) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing decisionId or resolution' }))
            return
          }
          onDecision(data.decisionId, data.resolution)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end('Invalid JSON')
        }
      })
    })

    server.listen(PHONE_PORT, '0.0.0.0', () => {
      console.log(`[PhoneAdapter] HTTP server listening on port ${PHONE_PORT}`)
      resolve(PHONE_PORT)
    })

    server.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.warn(`[PhoneAdapter] Port ${PHONE_PORT} in use, phone adapter disabled`)
        resolve(0)
      } else {
        reject(err)
      }
    })
  })
}

export async function stopPhoneServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve())
    } else {
      resolve()
    }
  })
}
