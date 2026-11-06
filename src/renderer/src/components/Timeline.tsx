import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { projectDuration, type Asset, type Clip, type MediaClip, type Track } from '@shared/types'
import { mediaUrl } from '../engine'
import { TRANSITIONS } from '../presets'
import { useStore } from '../store'
import { fmtDuration } from '../util'
import { Icon } from './Icon'

const HEADER_W = 140
const ROW_H: Record<Track['kind'], number> = { video: 64, audio: 48, text: 36 }
const SNAP_PX = 8

export function Timeline(): React.JSX.Element {
  const project = useStore((s) => s.project)
  const assets = useStore((s) => s.assets)
  const pps = useStore((s) => s.pps)
  const snapping = useStore((s) => s.snapping)
  const selectedId = useStore((s) => s.selectedId)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const st = useStore.getState

  const scrollRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ left: 0, width: 1000 })

  useEffect(() => {
    const el = scrollRef.current!
    const update = (): void => setView({ left: el.scrollLeft, width: el.clientWidth })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  const duration = projectDuration(project)
  const laneW = Math.max(duration + 30, (view.width - HEADER_W) / pps) * pps

  const timeAt = (clientX: number): number => {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left + el.scrollLeft - HEADER_W) / pps)
  }

  const snapPoints = (excludeId: string): number[] => {
    const pts = [0, st().time]
    for (const t of st().project.tracks) {
      for (const c of t.clips) if (c.id !== excludeId) pts.push(c.start, c.start + c.duration)
    }
    return pts
  }

  const snapDelta = (values: number[], points: number[]): number => {
    if (!st().snapping) return 0
    let best = Infinity
    for (const v of values) {
      for (const p of points) {
        const d = p - v
        if (Math.abs(d) < Math.abs(best)) best = d
      }
    }
    return Math.abs(best) * pps <= SNAP_PX ? best : 0
  }

  const trackAt = (clientY: number): string | null => {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + HEADER_W + 4, clientY)
    return (hit?.closest('[data-track-id]') as HTMLElement | null)?.dataset.trackId ?? null
  }

  const startDrag = (e: React.PointerEvent, clip: Clip, track: Track, mode: 'move' | 'left' | 'right'): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    st().select(clip.id)
    const x0 = e.clientX
    const y0 = e.clientY
    const orig = { ...clip }
    const origEnd = clip.start + clip.duration
    const points = snapPoints(clip.id)
    const others = track.clips.filter((c) => c.id !== clip.id)
    const prevEnd = Math.max(0, ...others.filter((c) => c.start + c.duration <= clip.start + 1e-4).map((c) => c.start + c.duration))
    const nextStart = Math.min(Infinity, ...others.filter((c) => c.start >= origEnd - 1e-4).map((c) => c.start))
    const asset: Asset | undefined = clip.type === 'media' ? st().assets[clip.assetId] : undefined
    const timed = asset && asset.kind !== 'image'
    const media = clip.type === 'media' ? (clip as MediaClip) : null
    let began = false

    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - x0
      if (!began) {
        if (Math.abs(dx) < 3 && Math.abs(ev.clientY - y0) < 6) return
        st().beginGesture()
        began = true
      }
      const dt = dx / pps
      if (mode === 'move') {
        let ns = Math.max(0, orig.start + dt)
        ns += snapDelta([ns, ns + orig.duration], points)
        const current = st().project.tracks.find((t) => t.clips.some((c) => c.id === clip.id))
        const target = trackAt(ev.clientY)
        const targetTrack = st().project.tracks.find((t) => t.id === target)
        const trackId = targetTrack && targetTrack.kind === track.kind ? targetTrack.id : (current?.id ?? track.id)
        st().moveClip(clip.id, Math.max(0, ns), trackId)
      } else if (mode === 'left') {
        let ns = orig.start + dt
        ns += snapDelta([ns], points)
        let min = prevEnd
        if (timed && media) min = Math.max(min, orig.start - media.inPoint / media.speed)
        ns = Math.min(origEnd - 0.1, Math.max(min, ns))
        st().updateClip(clip.id, (c: Clip) => {
          c.start = ns
          c.duration = origEnd - ns
          if (c.type === 'media' && timed && media) c.inPoint = media.inPoint + (ns - orig.start) * media.speed
        })
      } else {
        let ne = origEnd + dt
        ne += snapDelta([ne], points)
        let max = nextStart
        if (timed && media && asset) max = Math.min(max, orig.start + (asset.duration - media.inPoint) / media.speed)
        ne = Math.max(orig.start + 0.1, Math.min(max, ne))
        st().updateClip(clip.id, { duration: ne - orig.start })
      }
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (began) {
        if (mode === 'move') st().settleClip(clip.id)
        st().endGesture()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const scrub = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    st().setPlaying(false)
    st().setTime(timeAt(e.clientX))
    const onMove = (ev: PointerEvent): void => st().setTime(timeAt(ev.clientX))
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onDrop = (e: React.DragEvent, trackId?: string): void => {
    const assetId = e.dataTransfer.getData('application/x-quadro-asset')
    if (!assetId) return
    e.preventDefault()
    e.stopPropagation()
    st().addAssetClip(assetId, { trackId, start: timeAt(e.clientX) })
  }
  const allowDrop = (e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('application/x-quadro-asset')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const fit = (): void => {
    const w = (scrollRef.current?.clientWidth ?? 1000) - HEADER_W - 40
    if (duration > 0) st().setPps(w / duration)
  }

  return (
    <section className="timeline">
      <div className="tl-toolbar">
        <button className="icon-btn" disabled={!canUndo} onClick={() => st().undo()} title="Desfazer (⌘Z)"><Icon name="undo" /></button>
        <button className="icon-btn" disabled={!canRedo} onClick={() => st().redo()} title="Refazer (⇧⌘Z)"><Icon name="redo" /></button>
        <span className="sep" />
        <button className="icon-btn" onClick={() => st().splitAtPlayhead()} title="Dividir no cursor (S)"><Icon name="split" /></button>
        <button className="icon-btn" disabled={!selectedId} onClick={() => selectedId && st().duplicateClip(selectedId)} title="Duplicar (⌘D)"><Icon name="copy" /></button>
        <button className="icon-btn" disabled={!selectedId} onClick={() => selectedId && st().deleteClip(selectedId)} title="Apagar (⌫)"><Icon name="trash" /></button>
        <span className="sep" />
        <button className={`icon-btn ${snapping ? 'on' : ''}`} onClick={() => st().setSnapping(!snapping)} title="Encaixe magnético"><Icon name="magnet" /></button>
        <span className="sep" />
        <span className="muted small">Nova trilha:</span>
        <button className="btn tiny" onClick={() => st().addTrack('video')}>Vídeo</button>
        <button className="btn tiny" onClick={() => st().addTrack('audio')}>Áudio</button>
        <button className="btn tiny" onClick={() => st().addTrack('text')}>Texto</button>
        <span className="grow" />
        <button className="btn tiny" onClick={fit}>Ajustar</button>
        <button className="icon-btn" onClick={() => st().setPps(pps / 1.4)} title="Diminuir zoom"><Icon name="zoomOut" /></button>
        <input className="zoom" type="range" min={Math.log(4)} max={Math.log(600)} step={0.01} value={Math.log(pps)} onChange={(e) => st().setPps(Math.exp(Number(e.target.value)))} />
        <button className="icon-btn" onClick={() => st().setPps(pps * 1.4)} title="Aumentar zoom"><Icon name="zoomIn" /></button>
      </div>
      <div className="tl-scroll" ref={scrollRef} onDragOver={allowDrop} onDrop={(e) => onDrop(e)} onPointerDown={() => st().select(null)}>
        <div className="tl-content" style={{ width: HEADER_W + laneW }}>
          <div className="tl-ruler-row">
            <div className="tl-corner" />
            <Ruler pps={pps} left={view.left} width={view.width} laneW={laneW} onPointerDown={scrub} />
          </div>
          {project.tracks.map((track) => (
            <div key={track.id} className={`tl-row kind-${track.kind}`} style={{ height: ROW_H[track.kind] }}>
              <TrackHeader track={track} />
              <div
                className="tl-lane"
                data-track-id={track.id}
                style={{ width: laneW }}
                onDragOver={allowDrop}
                onDrop={(e) => onDrop(e, track.id)}
              >
                {track.clips.map((clip) => (
                  <ClipView
                    key={clip.id}
                    clip={clip}
                    track={track}
                    asset={clip.type === 'media' ? assets[clip.assetId] : undefined}
                    pps={pps}
                    selected={clip.id === selectedId}
                    onDrag={startDrag}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="tl-drop-hint">Solte mídia aqui para criar uma nova trilha</div>
          <Playhead pps={pps} scrollRef={scrollRef} />
        </div>
      </div>
    </section>
  )
}

function TrackHeader({ track }: { track: Track }): React.JSX.Element {
  const toggle = useStore((s) => s.toggleTrack)
  return (
    <div className="tl-head" onPointerDown={(e) => e.stopPropagation()}>
      <span className="ellipsis">{track.name}</span>
      <span className="tl-head-btns">
        {track.kind !== 'audio' && (
          <button className="icon-btn small" onClick={() => toggle(track.id, 'hidden')} title={track.hidden ? 'Mostrar' : 'Ocultar'}>
            <Icon name={track.hidden ? 'eyeOff' : 'eye'} size={14} />
          </button>
        )}
        {track.kind !== 'text' && (
          <button className="icon-btn small" onClick={() => toggle(track.id, 'muted')} title={track.muted ? 'Ativar som' : 'Silenciar'}>
            <Icon name={track.muted ? 'mute' : 'volume'} size={14} />
          </button>
        )}
      </span>
    </div>
  )
}

const ClipView = memo(function ClipView(props: {
  clip: Clip
  track: Track
  asset?: Asset
  pps: number
  selected: boolean
  onDrag: (e: React.PointerEvent, clip: Clip, track: Track, mode: 'move' | 'left' | 'right') => void
}): React.JSX.Element {
  const { clip, track, asset, pps, selected, onDrag } = props
  const w = Math.max(2, clip.duration * pps)
  const media = clip.type === 'media' ? clip : null
  const showStrip = media && asset && asset.kind !== 'audio' && asset.filmstrip
  const transitionLabel = media?.transition ? TRANSITIONS.find((t) => t.type === media.transition!.type)?.label : null
  return (
    <div
      className={`clip clip-${track.kind} ${selected ? 'selected' : ''} ${track.hidden || track.muted ? 'dim' : ''}`}
      style={{
        left: clip.start * pps,
        width: w,
        backgroundImage: showStrip ? `url("${mediaUrl(asset.filmstrip!)}")` : undefined
      }}
      onPointerDown={(e) => onDrag(e, clip, track, 'move')}
      data-clip-id={clip.id}
      data-type={clip.type}
      data-start={clip.start.toFixed(3)}
      data-duration={clip.duration.toFixed(3)}
      data-transition={clip.type === 'media' ? (clip.transition?.type ?? '') : undefined}
      title={clip.type === 'text' ? clip.text : asset?.name}
    >
      {media && asset?.peaks && track.kind === 'audio' && (
        <Waveform peaks={asset.peaks} rate={asset.peaksRate} from={media.inPoint} span={media.duration * media.speed} width={w} height={ROW_H.audio - 14} />
      )}
      {media?.transition && (
        <span className="clip-transition" style={{ width: Math.min(w, media.transition.duration * pps) }} title={`Transição: ${transitionLabel}`} />
      )}
      <span className="clip-label ellipsis">
        {clip.type === 'text' ? clip.text : asset?.name ?? 'Mídia ausente'}
        {media && media.speed !== 1 && <span className="clip-badge">{media.speed}×</span>}
        {media && w > 120 && <span className="clip-dur">{fmtDuration(clip.duration)}</span>}
      </span>
      <span className="clip-handle left" onPointerDown={(e) => onDrag(e, clip, track, 'left')} />
      <span className="clip-handle right" onPointerDown={(e) => onDrag(e, clip, track, 'right')} />
    </div>
  )
})

const Waveform = memo(function Waveform(props: { peaks: number[]; rate: number; from: number; span: number; width: number; height: number }): React.JSX.Element {
  const { peaks, rate, from, span, width, height } = props
  const d = useMemo(() => {
    const bars = Math.max(1, Math.floor(width / 3))
    const mid = height / 2
    let path = ''
    for (let i = 0; i < bars; i++) {
      const t0 = from + (span * i) / bars
      const t1 = from + (span * (i + 1)) / bars
      let m = 0
      for (let k = Math.floor(t0 * rate); k <= Math.min(peaks.length - 1, Math.floor(t1 * rate)); k++) m = Math.max(m, peaks[k] ?? 0)
      const h = Math.max(1, m * (height - 2))
      path += `M${i * 3 + 1} ${(mid - h / 2).toFixed(1)}v${h.toFixed(1)}`
    }
    return path
  }, [peaks, rate, from, span, width, height])
  return (
    <svg className="waveform" width={width} height={height}>
      <path d={d} stroke="currentColor" strokeWidth={2} />
    </svg>
  )
})

function Ruler(props: { pps: number; left: number; width: number; laneW: number; onPointerDown: (e: React.PointerEvent) => void }): React.JSX.Element {
  const { pps, left, width, laneW, onPointerDown } = props
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  const step = steps.find((s) => s * pps >= 70) ?? 600
  const t0 = Math.max(0, Math.floor((left - HEADER_W) / pps / step) * step)
  const t1 = (left + width) / pps
  const ticks: number[] = []
  for (let t = t0; t <= t1 + step; t += step) ticks.push(Math.round(t * 1000) / 1000)
  const label = (t: number): string => {
    const m = Math.floor(t / 60)
    const s = t % 60
    return step < 1 ? `${m}:${s.toFixed(step < 0.5 ? 2 : 1).padStart(step < 0.5 ? 5 : 4, '0')}` : `${m}:${String(Math.round(s)).padStart(2, '0')}`
  }
  return (
    <div className="tl-ruler" style={{ width: laneW }} onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e) }}>
      {ticks.map((t) => (
        <span key={t} className="tick" style={{ left: t * pps }}>
          {label(t)}
        </span>
      ))}
    </div>
  )
}

function Playhead({ pps, scrollRef }: { pps: number; scrollRef: React.RefObject<HTMLDivElement | null> }): React.JSX.Element {
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const x = HEADER_W + time * pps
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    if (x > el.scrollLeft + el.clientWidth - 60) el.scrollLeft = x - HEADER_W - 40
    else if (x < el.scrollLeft + HEADER_W) el.scrollLeft = Math.max(0, x - HEADER_W - 40)
  }, [x, playing, scrollRef])
  return <div className="playhead" style={{ transform: `translateX(${x}px)` }} />
}
