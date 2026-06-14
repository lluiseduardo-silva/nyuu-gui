import { subscribe } from '../events.js'

// Stream SSE com todos os eventos da fila (atualização de job, progresso, log).
export function registerEvents(app) {
  app.get('/events', (req, reply) => {
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write('retry: 3000\n\n')

    const send = (event) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch { /* conexão caiu */ }
    }
    send({ type: 'hello' })

    const unsub = subscribe(send)
    const ping = setInterval(() => {
      try { reply.raw.write(': ping\n\n') } catch { /* noop */ }
    }, 25000)

    req.raw.on('close', () => {
      clearInterval(ping)
      unsub()
    })
  })
}
