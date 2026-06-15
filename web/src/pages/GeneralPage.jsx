import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

// Tela "Geral": caminhos, binários, padrões de par2/post, concorrência e modo mock.
export default function GeneralPage({ system, onSaved }) {
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { api.getSettings().then((d) => setS(d.settings)).catch((e) => setErr(e.message)) }, [])
  if (!s) return <div className="empty">carregando...</div>

  const upd = (path, val) => {
    setS((prev) => {
      const next = structuredClone(prev)
      const keys = path.split('.')
      let o = next
      while (keys.length > 1) o = o[keys.shift()]
      o[keys[0]] = val
      return next
    })
  }

  const save = async () => {
    setErr(''); setMsg('')
    try {
      const { settings } = await api.saveSettings(s)
      setS(settings); setMsg('Salvo!'); onSaved?.()
    } catch (e) {
      setErr('Erro: ' + e.message)
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Caminhos & binários</h2>
        <div className="grid2">
          <label className="field"><span>Pasta de saída (NZB/NFO)</span>
            <input type="text" value={s.paths.outDir} onChange={(e) => upd('paths.outDir', e.target.value)} placeholder="ex: /mnt/midias/nzbs (vazio = ./data/out)" />
          </label>
          <label className="field"><span>Workdir do par2 — disco de scratch (opcional)</span>
            <input type="text" value={s.paths.workDirBase} onChange={(e) => upd('paths.workDirBase', e.target.value)} placeholder="ex: /mnt/scratch  •  vazio = usa a pasta de saída" />
          </label>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: '.8rem' }}>
          Os volumes de recuperação do <b>par2</b> são gravados aqui. Aponte para um disco
          separado (ext4/xfs) para tirar essas micro-escritas do array principal — só o
          <b> .nzb</b> e o <b>.nfo</b> vão para a pasta de saída.
        </p>
        <div className="grid3">
          <label className="field"><span>Binário nyuu</span><input type="text" value={s.bin.nyuu} onChange={(e) => upd('bin.nyuu', e.target.value)} /></label>
          <label className="field"><span>Binário par2</span><input type="text" value={s.bin.par2} onChange={(e) => upd('bin.par2', e.target.value)} /></label>
          <label className="field"><span>Binário mediainfo</span><input type="text" value={s.bin.mediainfo} onChange={(e) => upd('bin.mediainfo', e.target.value)} /></label>
        </div>
      </div>

      <div className="card">
        <h2>Padrões de par2 & post</h2>
        <div className="grid3">
          <label className="field"><span>Redundância (%)</span><input type="number" value={s.par2.redundancy} onChange={(e) => upd('par2.redundancy', Number(e.target.value))} /></label>
          <label className="field"><span>Volumes</span><input type="number" value={s.par2.volumes} onChange={(e) => upd('par2.volumes', Number(e.target.value))} /></label>
          <label className="field"><span>Subpastas (nyuu)</span>
            <select value={s.post.subdirs} onChange={(e) => upd('post.subdirs', e.target.value)}>
              <option value="keep">keep</option>
              <option value="include">include</option>
              <option value="skip">skip</option>
            </select>
          </label>
        </div>
        <div className="grid2">
          <label className="field"><span>Memória do par2 (MB) — 0 = padrão do par2</span>
            <input type="number" min="0" value={s.par2.memoryMB ?? 0} onChange={(e) => upd('par2.memoryMB', Number(e.target.value))} placeholder="ex: 2048" />
          </label>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: '.8rem' }}>
          Mais memória = o par2 segura os blocos de recuperação na RAM e lê a fonte <b>uma vez só</b>
          {' '}(em vez de reler o conteúdo várias vezes). Acelera <b>muito</b> séries grandes.
          {system?.mem?.totalMB ? ` RAM da máquina: ~${Math.round(system.mem.totalMB / 1024)} GB — deixe folga pro resto.` : ''}
          {' '}<code>0</code> não passa <code>-m</code> (comportamento padrão).
        </p>
        <div className="grid2">
          <label className="field"><span>Concorrência (jobs simultâneos)</span>
            <input type="number" min="1" value={s.concurrency} onChange={(e) => upd('concurrency', Number(e.target.value))} />
          </label>
          <label className="row" style={{ marginTop: '1.8rem' }}>
            <input type="checkbox" checked={!!s.par2.keep} onChange={(e) => upd('par2.keep', e.target.checked)} /> Manter par2 após o post
          </label>
        </div>
        <label className="row">
          <input type="checkbox" checked={!!s.mock} onChange={(e) => upd('mock', e.target.checked)} /> Modo MOCK (simular nyuu/par2/mediainfo)
        </label>
      </div>

      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <button className="btn primary" onClick={save}>Salvar configurações</button>
    </div>
  )
}
