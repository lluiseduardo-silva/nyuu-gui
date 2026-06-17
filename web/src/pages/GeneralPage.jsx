import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

// Tela "Geral": caminhos, binários, padrões de par2/post, concorrência e modo mock.
export default function GeneralPage({ system, onSaved }) {
  const [s, setS] = useState(null)
  const [algorithms, setAlgorithms] = useState([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([api.getSettings(), api.algorithms()])
      .then(([d, a]) => { setS(d.settings); setAlgorithms(a.algorithms) })
      .catch((e) => setErr(e.message))
  }, [])
  if (!s) return <div className="empty">carregando...</div>

  const algoBinKeys = [...new Set(algorithms.map((a) => a.binKey))]
  const activeAlgo = algorithms.find((a) => a.id === s.parity?.algorithm)
  const isParpar = s.parity?.algorithm === 'parpar'
  const binStatus = system?.binaries || {}

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
          <label className="field"><span>Binário nyuu {binStatus.nyuu === false && <small className="error">(não encontrado)</small>}</span><input type="text" value={s.bin.nyuu} onChange={(e) => upd('bin.nyuu', e.target.value)} /></label>
          <label className="field"><span>Binário mediainfo {binStatus.mediainfo === false && <small className="error">(não encontrado)</small>}</span><input type="text" value={s.bin.mediainfo} onChange={(e) => upd('bin.mediainfo', e.target.value)} /></label>
          {algoBinKeys.map((k) => (
            <label className="field" key={k}>
              <span>Binário {k} {binStatus[k] === false && <small className="error">(não encontrado)</small>}</span>
              <input type="text" value={s.bin[k] ?? ''} onChange={(e) => upd(`bin.${k}`, e.target.value)} />
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Padrões de paridade & post</h2>
        <div className="grid3">
          <label className="field"><span>Algoritmo de paridade</span>
            <select value={s.parity?.algorithm || ''} onChange={(e) => upd('parity.algorithm', e.target.value)}>
              {algorithms.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Redundância (%)</span><input type="number" value={s.par2.redundancy} onChange={(e) => upd('par2.redundancy', Number(e.target.value))} /></label>
          <label className="field"><span>Subpastas (nyuu)</span>
            <select value={s.post.subdirs} onChange={(e) => upd('post.subdirs', e.target.value)}>
              <option value="keep">keep</option>
              <option value="include">include</option>
              <option value="skip">skip</option>
            </select>
          </label>
        </div>

        <div className="grid3">
          {!isParpar && (
            <label className="field"><span>Volumes (par2)</span><input type="number" value={s.par2.volumes} onChange={(e) => upd('par2.volumes', Number(e.target.value))} /></label>
          )}
          {activeAlgo?.configSchema.map((f) => (
            <label className="field" key={f.key}>
              <span>{f.label}</span>
              <input
                type={f.type === 'number' ? 'number' : 'text'}
                value={s.parity?.configs?.[s.parity.algorithm]?.[f.key] ?? ''}
                placeholder={f.placeholder || ''}
                onChange={(e) => upd(`parity.configs.${s.parity.algorithm}.${f.key}`, f.type === 'number' ? Number(e.target.value) : e.target.value)}
              />
            </label>
          ))}
        </div>
        {isParpar && (
          <p className="muted" style={{ marginTop: 0, fontSize: '.8rem' }}>
            O <b>ParPar</b> controla a quantidade de arquivos de recuperação via <code>slices</code> (-s) — o campo
            {' '}<b>Volumes</b> do par2cmdline não se aplica. Redundância (%) e slices são os controles efetivos.
          </p>
        )}

        <div className="grid2">
          <label className="field"><span>Memória (MB) — 0 = padrão do algoritmo</span>
            <input type="number" min="0" value={s.par2.memoryMB ?? 0} onChange={(e) => upd('par2.memoryMB', Number(e.target.value))} placeholder="ex: 2048" />
          </label>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: '.8rem' }}>
          Mais memória = a paridade segura os blocos de recuperação na RAM e lê a fonte <b>uma vez só</b>
          {' '}(em vez de reler o conteúdo várias vezes). Acelera <b>muito</b> séries grandes.
          {system?.mem?.totalMB ? ` RAM da máquina: ~${Math.round(system.mem.totalMB / 1024)} GB — deixe folga pro resto.` : ''}
          {' '}<code>0</code> não passa <code>-m</code> (comportamento padrão).
        </p>

        <div className="grid2">
          <label className="field"><span>Concorrência (jobs simultâneos)</span>
            <input type="number" min="1" value={s.concurrency} onChange={(e) => upd('concurrency', Number(e.target.value))} />
          </label>
          <label className="field"><span>Paralelismo paridade ∥ upload</span>
            <select value={s.post?.parallelMode || 'off'} onChange={(e) => upd('post.parallelMode', e.target.value)}>
              <option value="off">desligado (sequencial)</option>
              <option value="twopass">two-pass (sobe a fonte e gera paridade juntos)</option>
            </select>
          </label>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: '.8rem' }}>
          <b>two-pass</b>: sobe a fonte enquanto gera a paridade, depois sobe os par2 e junta tudo num NZB.
          Ganha tempo em <b>releases grandes únicos</b>, mas usa <b>mais RAM e I/O</b> (paridade + upload ao mesmo tempo).
          Para uma <b>fila cheia</b>, prefira aumentar a Concorrência. Experimental.
        </p>

        <div className="grid2">
          <label className="row" style={{ marginTop: '.4rem' }}>
            <input type="checkbox" checked={!!s.par2.keep} onChange={(e) => upd('par2.keep', e.target.checked)} /> Manter par2 após o post
          </label>
        </div>
        <label className="row">
          <input type="checkbox" checked={!!s.mock} onChange={(e) => upd('mock', e.target.checked)} /> Modo MOCK (simular binários)
        </label>
      </div>

      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <button className="btn primary" onClick={save}>Salvar configurações</button>
    </div>
  )
}
