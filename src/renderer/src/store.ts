import { create } from 'zustand'
import {
  DEFAULT_FILTERS,
  DEFAULT_TRANSFORM,
  projectDuration,
  type Asset,
  type CaptionSegment,
  type Clip,
  type MediaClip,
  type Project,
  type ProjectFile,
  type ProjectSettings,
  type TextClip,
  type Track,
  type TrackKind
} from '@shared/types'
import { TEXT_PRESETS, type TextPresetId } from './presets'

export const uid = (): string => crypto.randomUUID().slice(0, 12)

const TRACK_LABEL: Record<TrackKind, string> = { video: 'Vídeo', audio: 'Áudio', text: 'Texto' }

function newTrack(kind: TrackKind, project: Project, name?: string): Track {
  const n = project.tracks.filter((t) => t.kind === kind).length + 1
  return { id: uid(), kind, name: name ?? `${TRACK_LABEL[kind]} ${n}`, muted: false, hidden: false, clips: [] }
}

/** Insere a trilha respeitando a ordem: texto em cima, vídeo no meio, áudio embaixo. */
function insertTrack(project: Project, track: Track): void {
  const order: Record<TrackKind, number> = { text: 0, video: 1, audio: 2 }
  const idx = project.tracks.findIndex((t) => order[t.kind] >= order[track.kind])
  project.tracks.splice(idx === -1 ? project.tracks.length : idx, 0, track)
}

export function emptyProject(): Project {
  const p: Project = {
    version: 1,
    settings: { width: 1920, height: 1080, fps: 30, background: '#000000' },
    tracks: []
  }
  insertTrack(p, newTrack('video', p))
  insertTrack(p, newTrack('audio', p))
  return p
}

export function findClip(project: Project, id: string): { track: Track; clip: Clip; index: number } | null {
  for (const track of project.tracks) {
    const index = track.clips.findIndex((c) => c.id === id)
    if (index !== -1) return { track, clip: track.clips[index], index }
  }
  return null
}

export function trackKindFor(clip: Clip, assets: Record<string, Asset>): TrackKind {
  if (clip.type === 'text') return 'text'
  return assets[clip.assetId]?.kind === 'audio' ? 'audio' : 'video'
}

const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 - 1e-4 && b0 < a1 - 1e-4

function isFree(track: Track, start: number, duration: number, exceptId?: string): boolean {
  return !track.clips.some((c) => c.id !== exceptId && overlaps(start, start + duration, c.start, c.start + c.duration))
}

/** Primeiro início livre em `track` a partir de `desired`. */
function freeStart(track: Track, desired: number, duration: number, exceptId?: string): number {
  let start = Math.max(0, desired)
  const others = track.clips.filter((c) => c.id !== exceptId).sort((a, b) => a.start - b.start)
  for (let guard = 0; guard < others.length + 1; guard++) {
    const hit = others.find((c) => overlaps(start, start + duration, c.start, c.start + c.duration))
    if (!hit) break
    start = hit.start + hit.duration
  }
  return start
}

function sortClips(track: Track): void {
  track.clips.sort((a, b) => a.start - b.start)
}

function removeEmptyTracks(project: Project): void {
  project.tracks = project.tracks.filter((t) => t.clips.length > 0)
  if (!project.tracks.some((t) => t.kind === 'video')) insertTrack(project, newTrack('video', project))
}

export function mediaClipFor(asset: Asset, start: number): MediaClip {
  return {
    id: uid(),
    type: 'media',
    assetId: asset.id,
    start,
    duration: asset.kind === 'image' ? 5 : asset.duration,
    inPoint: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    filters: { ...DEFAULT_FILTERS },
    filterPreset: null,
    transform: { ...DEFAULT_TRANSFORM },
    transition: null
  }
}

export function textClipFor(preset: TextPresetId, start: number, text?: string, duration = 3): TextClip {
  const p = TEXT_PRESETS[preset]
  return {
    id: uid(),
    type: 'text',
    start,
    duration,
    text: text ?? p.sample,
    style: { ...p.style },
    x: 0.5,
    y: p.y,
    maxWidth: 0.86,
    animIn: p.animIn,
    animOut: p.animOut
  }
}

interface State {
  project: Project
  assets: Record<string, Asset>
  selectedId: string | null
  time: number
  playing: boolean
  pps: number
  snapping: boolean
  past: Project[]
  future: Project[]
  projectPath: string | null
  dirty: boolean
  gestureOpen: boolean
  lastHistoryKey: string | null
  lastHistoryAt: number

  /** Aplica uma alteração ao projeto. `history: 'coalesce:<chave>'` agrupa alterações contínuas. */
  mutate: (fn: (p: Project) => void, history?: boolean | string) => void
  beginGesture: () => void
  endGesture: () => void
  undo: () => void
  redo: () => void

  addAssets: (assets: Asset[]) => void
  addAssetClip: (assetId: string, opts?: { trackId?: string; start?: number }) => void
  addTextClip: (preset: TextPresetId) => void
  updateClip: <T extends Clip>(id: string, patch: Partial<T> | ((c: T) => void), coalesceKey?: string) => void
  moveClip: (id: string, start: number, trackId: string) => void
  settleClip: (id: string) => void
  deleteClip: (id: string) => void
  duplicateClip: (id: string) => void
  splitAtPlayhead: () => void
  addTrack: (kind: TrackKind) => void
  toggleTrack: (trackId: string, field: 'muted' | 'hidden') => void
  setSettings: (patch: Partial<ProjectSettings>) => void
  applyCaptions: (segments: CaptionSegment[], preset: TextPresetId) => void

  select: (id: string | null) => void
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  setPps: (pps: number) => void
  setSnapping: (s: boolean) => void

  newProject: () => void
  loadProject: (file: ProjectFile, path: string) => void
  markSaved: (path: string) => void
  serialize: () => string
}

export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  assets: {},
  selectedId: null,
  time: 0,
  playing: false,
  pps: 60,
  snapping: true,
  past: [],
  future: [],
  projectPath: null,
  dirty: false,
  gestureOpen: false,
  lastHistoryKey: null,
  lastHistoryAt: 0,

  mutate: (fn, history = true) => {
    const s = get()
    const next = structuredClone(s.project)
    fn(next)
    let push = history !== false && !s.gestureOpen
    if (typeof history === 'string') {
      const now = performance.now()
      if (s.lastHistoryKey === history && now - s.lastHistoryAt < 1200) push = false
      set({ lastHistoryKey: history, lastHistoryAt: now })
    } else if (push) {
      set({ lastHistoryKey: null })
    }
    set({
      project: next,
      past: push ? [...s.past, s.project].slice(-150) : s.past,
      future: push ? [] : s.future,
      dirty: true
    })
  },

  beginGesture: () => {
    const s = get()
    if (s.gestureOpen) return
    set({ past: [...s.past, s.project].slice(-150), future: [], gestureOpen: true, lastHistoryKey: null })
  },

  endGesture: () => set({ gestureOpen: false }),

  undo: () => {
    const s = get()
    const prev = s.past[s.past.length - 1]
    if (!prev) return
    const stillSelected = s.selectedId && findClip(prev, s.selectedId) ? s.selectedId : null
    set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], selectedId: stillSelected, dirty: true, lastHistoryKey: null })
  },

  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({ project: next, future: s.future.slice(1), past: [...s.past, s.project], dirty: true, lastHistoryKey: null })
  },

  addAssets: (list) => set((s) => ({ assets: { ...s.assets, ...Object.fromEntries(list.map((a) => [a.id, a])) } })),

  addAssetClip: (assetId, opts = {}) => {
    const s = get()
    const asset = s.assets[assetId]
    if (!asset) return
    const clip = mediaClipFor(asset, opts.start ?? s.time)
    const kind: TrackKind = asset.kind === 'audio' ? 'audio' : 'video'
    s.mutate((p) => {
      let track = p.tracks.find((t) => t.id === opts.trackId && t.kind === kind)
      if (track) {
        clip.start = freeStart(track, clip.start, clip.duration)
      } else {
        track = p.tracks.find((t) => t.kind === kind && isFree(t, clip.start, clip.duration))
        if (!track) {
          track = newTrack(kind, p)
          insertTrack(p, track)
        }
      }
      track.clips.push(clip)
      sortClips(track)
    })
    set({ selectedId: clip.id })
  },

  addTextClip: (preset) => {
    const s = get()
    const clip = textClipFor(preset, s.time)
    s.mutate((p) => {
      let track = p.tracks.find((t) => t.kind === 'text' && isFree(t, clip.start, clip.duration))
      if (!track) {
        track = newTrack('text', p)
        insertTrack(p, track)
      }
      track.clips.push(clip)
      sortClips(track)
    })
    set({ selectedId: clip.id })
  },

  updateClip: (id, patch, coalesceKey) => {
    get().mutate((p) => {
      const found = findClip(p, id)
      if (!found) return
      if (typeof patch === 'function') patch(found.clip as never)
      else Object.assign(found.clip, patch)
    }, coalesceKey ? `${id}:${coalesceKey}` : true)
  },

  moveClip: (id, start, trackId) => {
    get().mutate((p) => {
      const found = findClip(p, id)
      if (!found) return
      found.clip.start = Math.max(0, start)
      if (found.track.id !== trackId) {
        const target = p.tracks.find((t) => t.id === trackId)
        if (target && target.kind === found.track.kind) {
          found.track.clips.splice(found.index, 1)
          target.clips.push(found.clip)
        }
      }
    }, false)
  },

  settleClip: (id) => {
    get().mutate((p) => {
      const found = findClip(p, id)
      if (!found) return
      found.clip.start = freeStart(found.track, found.clip.start, found.clip.duration, id)
      sortClips(found.track)
      removeEmptyTracks(p)
    }, false)
  },

  deleteClip: (id) => {
    get().mutate((p) => {
      const found = findClip(p, id)
      if (!found) return
      found.track.clips.splice(found.index, 1)
      removeEmptyTracks(p)
    })
    if (get().selectedId === id) set({ selectedId: null })
  },

  duplicateClip: (id) => {
    const s = get()
    const found = findClip(s.project, id)
    if (!found) return
    const copy = { ...structuredClone(found.clip), id: uid() }
    s.mutate((p) => {
      const track = p.tracks.find((t) => t.id === found.track.id)!
      copy.start = freeStart(track, found.clip.start + found.clip.duration, copy.duration)
      track.clips.push(copy)
      sortClips(track)
    })
    set({ selectedId: copy.id })
  },

  splitAtPlayhead: () => {
    const s = get()
    const t = s.time
    const hits = (c: Clip): boolean => t > c.start + 0.05 && t < c.start + c.duration - 0.05
    const sel = s.selectedId ? findClip(s.project, s.selectedId) : null
    const targets: string[] = sel && hits(sel.clip)
      ? [sel.clip.id]
      : s.project.tracks.flatMap((tr) => tr.clips.filter(hits).map((c) => c.id))
    if (targets.length === 0) return
    let newSelected: string | null = null
    s.mutate((p) => {
      for (const id of targets) {
        const found = findClip(p, id)!
        const c = found.clip
        const leftDur = t - c.start
        const right = { ...structuredClone(c), id: uid(), start: t, duration: c.duration - leftDur }
        if (right.type === 'media' && c.type === 'media') {
          right.inPoint = c.inPoint + leftDur * c.speed
          right.transition = null
          right.fadeIn = 0
          c.fadeOut = 0
        }
        c.duration = leftDur
        found.track.clips.splice(found.index + 1, 0, right)
        if (id === s.selectedId) newSelected = right.id
      }
    })
    if (newSelected) set({ selectedId: newSelected })
  },

  addTrack: (kind) => get().mutate((p) => insertTrack(p, newTrack(kind, p))),

  toggleTrack: (trackId, field) =>
    get().mutate((p) => {
      const t = p.tracks.find((x) => x.id === trackId)
      if (t) t[field] = !t[field]
    }),

  setSettings: (patch) => get().mutate((p) => Object.assign(p.settings, patch)),

  applyCaptions: (segments, preset) => {
    get().mutate((p) => {
      const track = newTrack('text', p, 'Legendas')
      for (const seg of segments) {
        track.clips.push(textClipFor(preset, seg.start, seg.text, Math.max(0.3, seg.end - seg.start)))
      }
      // Garante que legendas consecutivas não se sobreponham.
      sortClips(track)
      for (let i = 0; i < track.clips.length - 1; i++) {
        const a = track.clips[i]
        const b = track.clips[i + 1]
        if (a.start + a.duration > b.start) a.duration = Math.max(0.1, b.start - a.start)
      }
      p.tracks.unshift(track)
    })
  },

  select: (id) => set({ selectedId: id }),
  setTime: (t) => set({ time: Math.max(0, t) }),
  setPlaying: (playing) => {
    const s = get()
    if (playing && s.time >= projectDuration(s.project) - 0.01) set({ time: 0 })
    set({ playing })
  },
  setPps: (pps) => set({ pps: Math.min(600, Math.max(4, pps)) }),
  setSnapping: (snapping) => set({ snapping }),

  newProject: () =>
    set({ project: emptyProject(), assets: {}, selectedId: null, time: 0, playing: false, past: [], future: [], projectPath: null, dirty: false }),

  loadProject: (file, path) =>
    set({ project: file.project, assets: file.assets, selectedId: null, time: 0, playing: false, past: [], future: [], projectPath: path, dirty: false }),

  markSaved: (path) => set({ projectPath: path, dirty: false }),

  serialize: () => {
    const s = get()
    const used = new Set(Object.keys(s.assets))
    const file: ProjectFile = {
      app: 'fotograma',
      version: 1,
      project: s.project,
      assets: Object.fromEntries(Object.entries(s.assets).filter(([id]) => used.has(id)))
    }
    return JSON.stringify(file)
  }
}))
