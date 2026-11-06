import { useEffect, useRef } from 'react'
import { projectDuration } from '@shared/types'
import { PreviewEngine } from '../engine'
import { ASPECTS } from '../presets'
import { useStore } from '../store'
import { fmtTime } from '../util'
import { Icon } from './Icon'

export function Preview(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const { width, height, fps } = useStore((s) => s.project.settings)
  const playing = useStore((s) => s.playing)
  const time = useStore((s) => s.time)
  const duration = useStore((s) => projectDuration(s.project))
  const setPlaying = useStore((s) => s.setPlaying)
  const setTime = useStore((s) => s.setTime)
  const setSettings = useStore((s) => s.setSettings)

  useEffect(() => {
    const engine = new PreviewEngine(canvasRef.current!, hostRef.current!)
    return () => engine.destroy()
  }, [])

  const aspect = ASPECTS.find((a) => a.width === width && a.height === height)?.label ?? 'custom'

  return (
    <section className="preview">
      <div className="preview-stage">
        <canvas ref={canvasRef} style={{ aspectRatio: `${width} / ${height}` }} />
        <div ref={hostRef} className="media-host" />
      </div>
      <div className="transport">
        <span className="timecode">
          {fmtTime(time, fps)} <span className="muted">/ {fmtTime(duration, fps)}</span>
        </span>
        <div className="transport-buttons">
          <button className="icon-btn" onClick={() => setTime(0)} title="Início">
            <Icon name="start" />
          </button>
          <button className="icon-btn play" onClick={() => setPlaying(!playing)} title="Reproduzir (Espaço)">
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <button className="icon-btn" onClick={() => setTime(duration)} title="Fim">
            <Icon name="end" />
          </button>
        </div>
        <select
          className="aspect"
          value={aspect}
          onChange={(e) => {
            const a = ASPECTS.find((x) => x.label === e.target.value)
            if (a) setSettings({ width: a.width, height: a.height })
          }}
          title="Proporção"
        >
          {ASPECTS.map((a) => (
            <option key={a.label} value={a.label}>{a.label}</option>
          ))}
          {aspect === 'custom' && <option value="custom">{width}×{height}</option>}
        </select>
      </div>
    </section>
  )
}
