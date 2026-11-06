import { projectDuration } from '@shared/types'
import { renderFrame, srcTime, visibleMediaClips } from './compositor'
import { MediaPool } from './engine'
import { useStore } from './store'

export interface ExportSettings {
  outPath: string
  width: number
  height: number
  fps: number
  crf: number
}

function waitFor(el: HTMLMediaElement, event: string, timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      el.removeEventListener(event, done)
      resolve()
    }
    const timer = setTimeout(done, timeout)
    el.addEventListener(event, done)
  })
}

async function seek(el: HTMLMediaElement, t: number): Promise<void> {
  if (el.readyState < 1) await waitFor(el, 'loadedmetadata')
  if (Math.abs(el.currentTime - t) < 1e-4 && el.readyState >= 2) return
  const seeked = waitFor(el, 'seeked')
  el.currentTime = t
  await seeked
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Falha ao codificar o quadro.'))
        void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject)
      },
      'image/jpeg',
      0.94
    )
  })
}

/**
 * Renderiza cada quadro com o mesmo compositor do preview e envia ao ffmpeg,
 * que codifica o vídeo e mixa o áudio dos arquivos originais.
 */
export async function exportProject(
  settings: ExportSettings,
  onProgress: (ratio: number) => void,
  isCancelled: () => boolean
): Promise<void> {
  const { project, assets } = useStore.getState()
  const duration = projectDuration(project)
  if (duration <= 0) throw new Error('A timeline está vazia.')

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
  document.body.appendChild(host)
  const pool = new MediaPool(host)
  pool.sync(project, assets)
  await pool.whenReady()
  const canvas = document.createElement('canvas')
  canvas.width = settings.width
  canvas.height = settings.height
  const ctx = canvas.getContext('2d')!

  const started = await window.api.exportStart({ ...settings, duration, project, assets })
  if (!started.ok) {
    pool.destroy()
    host.remove()
    throw new Error(started.error)
  }

  try {
    const frames = Math.max(1, Math.ceil(duration * settings.fps))
    for (let i = 0; i < frames; i++) {
      if (isCancelled()) {
        await window.api.exportCancel()
        return
      }
      const t = i / settings.fps
      await Promise.all(
        visibleMediaClips(project, t).map((c) => {
          const el = pool.element(c.id)
          const asset = assets[c.assetId]
          if (!el || !asset) return undefined
          el.muted = true
          return seek(el, Math.min(Math.max(0, srcTime(c, t)), Math.max(0, asset.duration - 0.03)))
        })
      )
      renderFrame(ctx, project, assets, t, pool.resolve)
      const r = await window.api.exportFrame(await toJpeg(canvas))
      if (!r.ok) throw new Error(r.error)
      onProgress((i + 1) / frames)
    }
    const done = await window.api.exportFinish()
    if (!done.ok) throw new Error(done.error)
  } catch (e) {
    await window.api.exportCancel()
    throw e
  } finally {
    pool.destroy()
    host.remove()
  }
}
