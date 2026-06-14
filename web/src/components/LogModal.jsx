import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useEvents } from '../useEvents.js'

export default function LogModal({ job, onClose }) {
  const [lines, setLines] = useState([])
  const boxRef = useRef(null)

  useEffect(() => {
    api.jobLog(job.id).then(({ log }) => setLines(log ? log.split('\n').filter(Boolean) : []))
  }, [job.id])

  useEvents((ev) => {
    if (ev.type === 'job:log' && ev.id === job.id) {
      setLines((prev) => [...prev, ev.line])
    }
  })

  useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <b>Log — {job.name}</b>
          <button className="btn x" onClick={onClose}>fechar</button>
        </header>
        <div className="log" ref={boxRef}>
          {lines.length ? lines.join('\n') : 'sem log ainda...'}
        </div>
      </div>
    </div>
  )
}
