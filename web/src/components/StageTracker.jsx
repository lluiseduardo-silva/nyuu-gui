import React from 'react'
import { formatDuration, stageDuration } from '../format.js'

const STATUS_ICON = { done: '✓', running: '●', failed: '✗', pending: '○' }
const SUB_LABELS = { upload: 'upload', par2: 'paridade', 'upload-par2': 'upload par2' }

function pct(v) {
  return Math.round((v || 0) * 100)
}

// Tracker de etapas de um job: status (✓/●/○/✗), barra na etapa ativa, sub-barras
// upload∥paridade no modo paralelo, e tempo por etapa.
export default function StageTracker({ stages, now }) {
  if (!Array.isArray(stages) || !stages.length) return null
  return (
    <div className="stages">
      {stages.map((s) => {
        const subs = s.subs ? Object.entries(s.subs) : []
        const showBar = s.status === 'running' && subs.length === 0
        const dur = stageDuration(s, now)
        return (
          <div className={`stage ${s.status}`} key={s.key}>
            <div className="stage-line">
              <span className="ic">{STATUS_ICON[s.status] || '○'}</span>
              <span className="lbl">{s.label}</span>
              {showBar && (
                <>
                  <span className="mini-bar"><i style={{ width: `${pct(s.progress)}%` }} /></span>
                  <span className="pct">{pct(s.progress)}%</span>
                </>
              )}
              {dur != null && <span className="dur">{formatDuration(dur)}</span>}
            </div>
            {subs.length > 0 && (
              <div className="substages">
                {subs.map(([key, v]) => (
                  <div className="substage" key={key}>
                    <span className="slbl">{SUB_LABELS[key] || key}</span>
                    <span className="mini-bar"><i style={{ width: `${pct(v.progress)}%` }} /></span>
                    <span className="pct">{pct(v.progress)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
