import { EventEmitter } from 'node:events'

// Barramento de eventos simples para alimentar o SSE.
// Eventos emitidos:
//   { type: 'job:update',   job }            -> estado do job mudou
//   { type: 'job:progress', id, stage, progress }
//   { type: 'job:log',      id, line }       -> nova linha de log
const bus = new EventEmitter()
bus.setMaxListeners(0)

export function emit(event) {
  bus.emit('event', event)
}

export function subscribe(handler) {
  bus.on('event', handler)
  return () => bus.off('event', handler)
}
