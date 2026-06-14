import { useEffect, useRef, useState } from 'react'

// Assina o stream SSE /events e chama onEvent para cada evento.
export function useEvents(onEvent) {
  const [connected, setConnected] = useState(false)
  const ref = useRef(onEvent)
  ref.current = onEvent

  useEffect(() => {
    const es = new EventSource('/events')
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      try {
        ref.current?.(JSON.parse(e.data))
      } catch {
        /* mensagens de ping/comentário */
      }
    }
    return () => es.close()
  }, [])

  return connected
}
