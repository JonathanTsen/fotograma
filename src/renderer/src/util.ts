import type { Asset, ImportProgress } from '@shared/types'
import { useStore } from './store'

export function fmtTime(t: number, fps = 30): string {
  const total = Math.max(0, t)
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  const f = Math.floor((total % 1) * fps)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}

export function fmtDuration(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.round(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

type ImportListener = (items: Record<string, ImportProgress>) => void
const progress: Record<string, ImportProgress> = {}
const listeners = new Set<ImportListener>()

export function onImports(cb: ImportListener): () => void {
  listeners.add(cb)
  cb({ ...progress })
  return () => listeners.delete(cb)
}

function emit(): void {
  for (const l of listeners) l({ ...progress })
}

let wired = false
function wire(): void {
  if (wired) return
  wired = true
  window.api.onImportProgress((p) => {
    progress[p.path] = p
    emit()
  })
}

/** Importa arquivos em sequência e devolve os assets criados. */
export async function importPaths(paths: string[]): Promise<Asset[]> {
  wire()
  const out: Asset[] = []
  for (const path of paths) {
    progress[path] = { path, stage: 'probe' }
    emit()
    const r = await window.api.importMedia(path)
    if (r.ok) {
      useStore.getState().addAssets([r.value])
      out.push(r.value)
      delete progress[path]
    } else {
      progress[path] = { path, stage: 'error', error: r.error }
      setTimeout(() => {
        delete progress[path]
        emit()
      }, 8000)
    }
    emit()
  }
  return out
}
