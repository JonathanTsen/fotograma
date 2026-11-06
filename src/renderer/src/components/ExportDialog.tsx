import { useRef, useState } from 'react'
import { projectDuration } from '@shared/types'
import { exportProject } from '../exporter'
import { useStore } from '../store'
import { fmtDuration } from '../util'
import { Icon } from './Icon'

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)

export function ExportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useStore((s) => s.project.settings)
  const duration = useStore((s) => projectDuration(s.project))
  const projectPath = useStore((s) => s.projectPath)
  const shortSide = Math.min(settings.width, settings.height)
  const resolutions = [
    { id: 'project', label: `Projeto (${settings.width}×${settings.height})`, scale: 1 },
    { id: '720', label: '720p', scale: 720 / shortSide },
    { id: '1080', label: '1080p', scale: 1080 / shortSide },
    { id: '2160', label: '4K', scale: 2160 / shortSide }
  ]
  const [res, setRes] = useState('project')
  const [fps, setFps] = useState(settings.fps)
  const [quality, setQuality] = useState(18)
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outPath, setOutPath] = useState<string | null>(null)
  const cancelled = useRef(false)
  const started = useRef(0)

  const scale = resolutions.find((r) => r.id === res)!.scale
  const width = even(settings.width * scale)
  const height = even(settings.height * scale)

  const run = async (): Promise<void> => {
    const base = projectPath?.split('/').pop()?.replace(/\.fotograma$/, '') ?? 'Video'
    const path = await window.api.pickExportPath(`${base}.mp4`)
    if (!path) return
    useStore.getState().setPlaying(false)
    cancelled.current = false
    started.current = performance.now()
    setOutPath(path)
    setState('running')
    setProgress(0)
    setError(null)
    try {
      await exportProject({ outPath: path, width, height, fps, crf: quality }, setProgress, () => cancelled.current)
      setState(cancelled.current ? 'idle' : 'done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  const elapsed = (performance.now() - started.current) / 1000
  const eta = progress > 0.02 ? (elapsed / progress) * (1 - progress) : null

  return (
    <div className="modal-backdrop" onPointerDown={() => state !== 'running' && onClose()}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Exportar vídeo</h2>
          {state !== 'running' && (
            <button className="icon-btn" onClick={onClose}><Icon name="close" /></button>
          )}
        </div>
        {state === 'idle' || state === 'error' ? (
          <>
            <label className="field">
              <span>Resolução</span>
              <select value={res} onChange={(e) => setRes(e.target.value)}>
                {resolutions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Taxa de quadros</span>
              <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
              </select>
            </label>
            <label className="field">
              <span>Qualidade</span>
              <select value={quality} onChange={(e) => setQuality(Number(e.target.value))}>
                <option value={14}>Máxima</option>
                <option value={18}>Alta</option>
                <option value={23}>Média</option>
                <option value={28}>Arquivo pequeno</option>
              </select>
            </label>
            <p className="muted small">
              MP4 (H.264 + AAC) · {width}×{height} · {fmtDuration(duration)}
            </p>
            {error && <p className="status error">{error}</p>}
            <button className="btn primary wide" disabled={duration <= 0} onClick={() => void run()}>
              <Icon name="download" /> Escolher destino e exportar
            </button>
          </>
        ) : state === 'running' ? (
          <>
            <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
            <p className="muted small">
              {Math.round(progress * 100)}% {eta !== null && `· cerca de ${fmtDuration(eta)} restantes`}
            </p>
            <button className="btn wide" onClick={() => { cancelled.current = true }}>Cancelar</button>
          </>
        ) : (
          <>
            <p className="status">Exportação concluída.</p>
            <p className="muted small ellipsis" title={outPath ?? ''}>{outPath}</p>
            <div className="row2">
              <button className="btn" onClick={() => outPath && void window.api.reveal(outPath)}>
                <Icon name="folder" /> Mostrar no Finder
              </button>
              <button className="btn primary" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
