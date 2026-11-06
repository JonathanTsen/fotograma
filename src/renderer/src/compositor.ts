import type { Asset, MediaClip, Project, TextClip, Track, TransitionType } from '@shared/types'
import { cssFilter } from './presets'

export type Drawable = HTMLVideoElement | HTMLImageElement
export type SourceResolver = (clip: MediaClip, asset: Asset) => Drawable | null

interface LayerOpts {
  alpha?: number
  dx?: number
  dy?: number
  scale?: number
  blur?: number
}

export const srcTime = (clip: MediaClip, t: number): number => clip.inPoint + (t - clip.start) * clip.speed

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3)
const backOut = (p: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

/** Clipe de mídia visível em `t` e, se houver transição em andamento, o clipe anterior. */
export interface VisualSlot {
  clip: MediaClip
  prev: MediaClip | null
  progress: number
}

export function visualSlot(track: Track, t: number): VisualSlot | null {
  const clips = track.clips as MediaClip[]
  const i = clips.findIndex((c) => t >= c.start && t < c.start + c.duration)
  if (i === -1) return null
  const clip = clips[i]
  const tr = clip.transition
  if (tr && tr.duration > 0 && t < clip.start + tr.duration) {
    const prevClip = i > 0 ? clips[i - 1] : null
    const prev = prevClip && Math.abs(prevClip.start + prevClip.duration - clip.start) < 0.02 ? prevClip : null
    return { clip, prev, progress: clamp01((t - clip.start) / tr.duration) }
  }
  return { clip, prev: null, progress: 1 }
}

/** Todos os clipes de mídia cujo quadro é necessário em `t`. */
export function visibleMediaClips(project: Project, t: number): MediaClip[] {
  const out: MediaClip[] = []
  for (const track of project.tracks) {
    if (track.kind !== 'video' || track.hidden) continue
    const slot = visualSlot(track, t)
    if (!slot) continue
    out.push(slot.clip)
    if (slot.prev && slot.progress < 1) out.push(slot.prev)
  }
  return out
}

function drawMedia(
  ctx: CanvasRenderingContext2D,
  clip: MediaClip,
  asset: Asset,
  resolve: SourceResolver,
  o: LayerOpts = {}
): void {
  const src = resolve(clip, asset)
  if (!src) return
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth
  const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight
  if (!sw || !sh) return
  const tf = clip.transform
  const s = Math.min(W / sw, H / sh) * tf.scale * (o.scale ?? 1)
  const dw = sw * s
  const dh = sh * s
  ctx.save()
  ctx.globalAlpha = clamp01(tf.opacity * (o.alpha ?? 1))
  const blurScale = W / 1920
  const filter = cssFilter({ ...clip.filters, blur: clip.filters.blur + (o.blur ?? 0) }, blurScale)
  ctx.filter = filter
  ctx.translate(W / 2 + tf.x * W + (o.dx ?? 0), H / 2 + tf.y * H + (o.dy ?? 0))
  if (tf.rotation) ctx.rotate((tf.rotation * Math.PI) / 180)
  ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

function drawTransition(
  ctx: CanvasRenderingContext2D,
  type: TransitionType,
  p: number,
  a: (o?: LayerOpts) => void,
  b: (o?: LayerOpts) => void
): void {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const e = easeInOut(p)
  const clipped = (path: () => void): void => {
    ctx.save()
    ctx.beginPath()
    path()
    ctx.clip()
    b()
    ctx.restore()
  }
  switch (type) {
    case 'crossfade':
      a()
      b({ alpha: e })
      break
    case 'fadeBlack':
      if (p < 0.5) {
        a()
        ctx.fillStyle = `rgba(0,0,0,${clamp01(p * 2)})`
      } else {
        b()
        ctx.fillStyle = `rgba(0,0,0,${clamp01((1 - p) * 2)})`
      }
      ctx.fillRect(0, 0, W, H)
      break
    case 'slideLeft':
      a({ dx: -e * W })
      b({ dx: (1 - e) * W })
      break
    case 'slideRight':
      a({ dx: e * W })
      b({ dx: -(1 - e) * W })
      break
    case 'slideUp':
      a({ dy: -e * H })
      b({ dy: (1 - e) * H })
      break
    case 'wipeLeft':
      a()
      clipped(() => ctx.rect(W * (1 - e), 0, W * e, H))
      break
    case 'wipeRight':
      a()
      clipped(() => ctx.rect(0, 0, W * e, H))
      break
    case 'zoom':
      a({ scale: 1 + e * 0.6, alpha: 1 - e })
      b({ scale: 0.75 + 0.25 * e, alpha: e })
      break
    case 'circle':
      a()
      clipped(() => ctx.arc(W / 2, H / 2, (e * Math.hypot(W, H)) / 2, 0, Math.PI * 2))
      break
    case 'blur':
      a({ blur: e * 40, alpha: 1 - e })
      b({ blur: (1 - e) * 40, alpha: e })
      break
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = words[0]
    for (const w of words.slice(1)) {
      const test = `${line} ${w}`
      if (ctx.measureText(test).width > maxWidth) {
        lines.push(line)
        line = w
      } else {
        line = test
      }
    }
    lines.push(line)
  }
  return lines
}

export function drawText(ctx: CanvasRenderingContext2D, clip: TextClip, t: number): void {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const k = H / 1080
  const st = clip.style
  const lt = t - clip.start
  const d = clip.duration
  const inD = Math.min(0.45, d / 3)
  const outD = Math.min(0.35, d / 3)
  const pIn = clip.animIn === 'none' ? 1 : clamp01(lt / inD)
  const pOut = clip.animOut === 'none' ? 1 : clamp01((d - lt) / outD)

  let alpha = 1
  let dy = 0
  let scale = 1
  let reveal = 1
  const raw = st.uppercase ? clip.text.toUpperCase() : clip.text

  switch (clip.animIn) {
    case 'fade':
      alpha *= easeOut(pIn)
      break
    case 'slideUp':
      alpha *= easeOut(pIn)
      dy += (1 - easeOut(pIn)) * 60 * k
      break
    case 'slideDown':
      alpha *= easeOut(pIn)
      dy -= (1 - easeOut(pIn)) * 60 * k
      break
    case 'pop':
      alpha *= clamp01(pIn * 3)
      scale *= 0.4 + 0.6 * backOut(pIn)
      break
    case 'zoom':
      alpha *= easeOut(pIn)
      scale *= 1.6 - 0.6 * easeOut(pIn)
      break
    case 'typewriter': {
      const typeDur = Math.max(0.4, Math.min(d * 0.7, raw.length * 0.05))
      reveal = clamp01(lt / typeDur)
      break
    }
  }
  switch (clip.animOut) {
    case 'fade':
      alpha *= pOut
      break
    case 'slideDown':
      alpha *= pOut
      dy += (1 - pOut) * 60 * k
      break
    case 'pop':
      scale *= 0.4 + 0.6 * pOut
      alpha *= pOut
      break
    case 'zoom':
      scale *= 1 + (1 - pOut) * 0.6
      alpha *= pOut
      break
  }
  if (alpha <= 0.001) return

  const size = st.fontSize * k
  ctx.save()
  ctx.font = `${st.italic ? 'italic ' : ''}${st.bold ? '700' : '400'} ${size}px "${st.fontFamily}", "Helvetica Neue", sans-serif`
  ctx.textBaseline = 'middle'
  const lines = wrapLines(ctx, raw, clip.maxWidth * W)
  const lh = size * 1.22
  const widths = lines.map((l) => ctx.measureText(l).width)
  const blockW = Math.max(...widths, 1)
  const blockH = lines.length * lh
  const cx = clip.x * W
  const cy = clip.y * H + dy

  ctx.globalAlpha = alpha
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)

  if (st.background) {
    const pad = size * 0.35
    ctx.save()
    ctx.globalAlpha = alpha * st.backgroundOpacity
    ctx.fillStyle = st.background
    ctx.beginPath()
    ctx.roundRect(-blockW / 2 - pad, -blockH / 2 - pad * 0.6, blockW + pad * 2, blockH + pad * 1.2, size * 0.25)
    ctx.fill()
    ctx.restore()
  }

  const total = lines.reduce((n, l) => n + l.length, 0)
  let budget = Math.floor(total * reveal)
  ctx.textAlign = st.align
  const ax = st.align === 'left' ? -blockW / 2 : st.align === 'right' ? blockW / 2 : 0
  lines.forEach((line, i) => {
    if (budget <= 0) return
    const shown = line.slice(0, budget)
    budget -= line.length
    const y = -blockH / 2 + lh * (i + 0.5)
    if (st.strokeWidth > 0) {
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.lineWidth = st.strokeWidth * 2 * k
      ctx.strokeStyle = st.strokeColor
      ctx.strokeText(shown, ax, y)
    }
    if (st.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 10 * k
      ctx.shadowOffsetY = 3 * k
    }
    ctx.fillStyle = st.color
    ctx.fillText(shown, ax, y)
    ctx.shadowColor = 'transparent'
  })
  ctx.restore()
}

/** Desenha o quadro completo do projeto no tempo `t`. */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  assets: Record<string, Asset>,
  t: number,
  resolve: SourceResolver
): void {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  ctx.save()
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.fillStyle = project.settings.background
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track = project.tracks[i]
    if (track.hidden || track.kind === 'audio') continue
    if (track.kind === 'text') {
      for (const c of track.clips) {
        if (c.type === 'text' && t >= c.start && t < c.start + c.duration) drawText(ctx, c, t)
      }
      continue
    }
    const slot = visualSlot(track, t)
    if (!slot) continue
    const asset = assets[slot.clip.assetId]
    if (!asset) continue
    const drawB = (o?: LayerOpts): void => drawMedia(ctx, slot.clip, asset, resolve, o)
    if (slot.progress < 1 && slot.clip.transition) {
      const prev = slot.prev
      const prevAsset = prev ? assets[prev.assetId] : null
      const drawA = (o?: LayerOpts): void => {
        if (prev && prevAsset) drawMedia(ctx, prev, prevAsset, resolve, o)
      }
      drawTransition(ctx, slot.clip.transition.type, slot.progress, drawA, drawB)
    } else {
      drawB()
    }
  }
}
