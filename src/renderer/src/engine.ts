import { projectDuration, type Asset, type MediaClip, type Project } from '@shared/types'
import { renderFrame, srcTime, visibleMediaClips, type Drawable } from './compositor'
import { useStore } from './store'

export const mediaUrl = (path: string): string => `media://local/${encodeURIComponent(path)}`

/** Elementos de mídia, um por clipe, usados para tocar e desenhar quadros. */
export class MediaPool {
  private elements = new Map<string, HTMLMediaElement>()
  private images = new Map<string, HTMLImageElement>()
  constructor(private host: HTMLElement) {}

  sync(project: Project, assets: Record<string, Asset>): void {
    const live = new Set<string>()
    for (const track of project.tracks) {
      for (const c of track.clips) {
        if (c.type !== 'media') continue
        const asset = assets[c.assetId]
        if (!asset) continue
        if (asset.kind === 'image') {
          if (!this.images.has(asset.id)) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = mediaUrl(asset.playbackPath)
            this.images.set(asset.id, img)
          }
          continue
        }
        live.add(c.id)
        const existing = this.elements.get(c.id)
        if (existing && existing.dataset.asset === asset.id) continue
        existing?.remove()
        const el = document.createElement(asset.kind === 'video' ? 'video' : 'audio')
        el.crossOrigin = 'anonymous'
        el.preload = 'auto'
        el.dataset.asset = asset.id
        if (el instanceof HTMLVideoElement) el.playsInline = true
        el.src = mediaUrl(asset.playbackPath)
        el.currentTime = c.inPoint
        this.host.appendChild(el)
        this.elements.set(c.id, el)
      }
    }
    for (const [id, el] of this.elements) {
      if (!live.has(id)) {
        el.pause()
        el.removeAttribute('src')
        el.load()
        el.remove()
        this.elements.delete(id)
      }
    }
  }

  /** Resolve quando todas as imagens e vídeos têm um quadro decodificável. */
  async whenReady(timeoutMs = 15000): Promise<void> {
    const waits: Promise<void>[] = []
    for (const img of this.images.values()) {
      if (!img.complete) waits.push(img.decode().catch(() => undefined))
    }
    for (const el of this.elements.values()) {
      if (el.readyState < 2) {
        waits.push(new Promise((r) => {
          el.addEventListener('loadeddata', () => r(), { once: true })
          el.addEventListener('error', () => r(), { once: true })
        }))
      }
    }
    await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, timeoutMs))])
  }

  element(clipId: string): HTMLMediaElement | undefined {
    return this.elements.get(clipId)
  }

  resolve = (clip: MediaClip, asset: Asset): Drawable | null => {
    if (asset.kind === 'image') {
      const img = this.images.get(asset.id)
      return img && img.complete && img.naturalWidth > 0 ? img : null
    }
    const el = this.elements.get(clip.id)
    return el instanceof HTMLVideoElement && el.readyState >= 2 ? el : null
  }

  destroy(): void {
    for (const el of this.elements.values()) {
      el.pause()
      el.remove()
    }
    this.elements.clear()
    this.images.clear()
  }
}

function fadeGain(clip: MediaClip, t: number): number {
  const lt = t - clip.start
  let g = 1
  if (clip.fadeIn > 0) g *= Math.min(1, lt / clip.fadeIn)
  if (clip.fadeOut > 0) g *= Math.min(1, (clip.duration - lt) / clip.fadeOut)
  return Math.max(0, g)
}

/** Reprodução do preview: sincroniza elementos de mídia com o cursor e desenha o quadro. */
export class PreviewEngine {
  private pool: MediaPool
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private wallStart = 0
  private timeStart = 0
  private unsub: () => void

  constructor(private canvas: HTMLCanvasElement, host: HTMLElement) {
    this.ctx = canvas.getContext('2d')!
    this.pool = new MediaPool(host)
    const s = useStore.getState()
    this.pool.sync(s.project, s.assets)
    this.unsub = useStore.subscribe((state, prev) => {
      if (state.project !== prev.project || state.assets !== prev.assets) this.pool.sync(state.project, state.assets)
      if (state.playing !== prev.playing || (state.playing && state.time !== prev.time && Math.abs(state.time - this.clock()) > 0.05)) {
        this.wallStart = performance.now()
        this.timeStart = state.time
      }
    })
    this.raf = requestAnimationFrame(this.tick)
  }

  private clock(): number {
    return this.timeStart + (performance.now() - this.wallStart) / 1000
  }

  private tick = (): void => {
    const s = useStore.getState()
    const { project, assets } = s
    const { width, height } = project.settings
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    let t = s.time
    if (s.playing) {
      t = this.clock()
      const end = projectDuration(project)
      if (t >= end) {
        t = end
        useStore.setState({ time: end, playing: false })
      } else {
        useStore.setState({ time: t })
      }
    }
    this.syncMedia(project, assets, t, s.playing && t < projectDuration(project))
    renderFrame(this.ctx, project, assets, t, this.pool.resolve)
    this.raf = requestAnimationFrame(this.tick)
  }

  private syncMedia(project: Project, assets: Record<string, Asset>, t: number, playing: boolean): void {
    const visible = new Set(visibleMediaClips(project, t).map((c) => c.id))
    for (const track of project.tracks) {
      if (track.kind === 'text') continue
      for (const c of track.clips) {
        if (c.type !== 'media') continue
        const el = this.pool.element(c.id)
        const asset = assets[c.assetId]
        if (!el || !asset) continue
        const inside = t >= c.start && t < c.start + c.duration
        const needed = inside || visible.has(c.id)
        if (!needed) {
          if (!el.paused) el.pause()
          // Pré-posiciona clipes que vão começar em breve.
          if (t < c.start && c.start - t < 2 && Math.abs(el.currentTime - c.inPoint) > 0.1 && !el.seeking) {
            el.currentTime = c.inPoint
          }
          continue
        }
        const desired = Math.min(Math.max(0, srcTime(c, t)), Math.max(0, asset.duration - 0.03))
        el.muted = !inside || track.muted
        el.volume = Math.min(1, Math.max(0, c.volume * fadeGain(c, t)))
        if (el.playbackRate !== c.speed) el.playbackRate = c.speed
        if (playing) {
          if (el.paused) {
            el.currentTime = desired
            void el.play().catch(() => undefined)
          } else if (Math.abs(el.currentTime - desired) > 0.25) {
            el.currentTime = desired
          }
        } else {
          if (!el.paused) el.pause()
          if (!el.seeking && Math.abs(el.currentTime - desired) > 1 / 120) el.currentTime = desired
        }
      }
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.unsub()
    this.pool.destroy()
  }
}
