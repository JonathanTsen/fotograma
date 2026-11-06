// Modelo de dados compartilhado entre o processo principal e a interface.

export type AssetKind = 'video' | 'audio' | 'image'

export interface Asset {
  id: string
  /** Caminho original escolhido pelo usuário. Usado na exportação de áudio. */
  path: string
  /** Arquivo reproduzível pelo Chromium (original ou proxy H.264). */
  playbackPath: string
  name: string
  kind: AssetKind
  /** Duração em segundos (0 para imagens). */
  duration: number
  width: number
  height: number
  hasAudio: boolean
  thumbnail?: string
  filmstrip?: string
  /** Picos de áudio normalizados (0..1), `peaksRate` amostras por segundo. */
  peaks?: number[]
  peaksRate: number
}

export interface Filters {
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
  sepia: number
  grayscale: number
}

export const DEFAULT_FILTERS: Filters = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0
}

export type TransitionType =
  | 'crossfade'
  | 'fadeBlack'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'wipeLeft'
  | 'wipeRight'
  | 'zoom'
  | 'circle'
  | 'blur'

export interface Transition {
  type: TransitionType
  duration: number
}

export interface Transform {
  /** Deslocamento relativo à largura/altura do quadro (-1..1). */
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}

export const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }

export interface MediaClip {
  id: string
  type: 'media'
  assetId: string
  /** Início na timeline (s). */
  start: number
  /** Duração na timeline (s). */
  duration: number
  /** Ponto de entrada no arquivo de origem (s). */
  inPoint: number
  speed: number
  volume: number
  fadeIn: number
  fadeOut: number
  filters: Filters
  filterPreset: string | null
  transform: Transform
  /** Transição de entrada, aplicada contra o clipe anterior adjacente na mesma trilha. */
  transition: Transition | null
}

export type TextAnimIn = 'none' | 'fade' | 'slideUp' | 'slideDown' | 'pop' | 'zoom' | 'typewriter'
export type TextAnimOut = 'none' | 'fade' | 'slideDown' | 'pop' | 'zoom'

export interface TextStyle {
  fontFamily: string
  /** Tamanho em px para um quadro de 1080 de altura. */
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  uppercase: boolean
  align: 'left' | 'center' | 'right'
  strokeColor: string
  strokeWidth: number
  background: string | null
  backgroundOpacity: number
  shadow: boolean
}

export interface TextClip {
  id: string
  type: 'text'
  start: number
  duration: number
  text: string
  style: TextStyle
  /** Centro do bloco de texto, 0..1. */
  x: number
  y: number
  /** Largura máxima relativa ao quadro, 0..1. */
  maxWidth: number
  animIn: TextAnimIn
  animOut: TextAnimOut
}

export type Clip = MediaClip | TextClip

export type TrackKind = 'video' | 'audio' | 'text'

export interface Track {
  id: string
  kind: TrackKind
  name: string
  muted: boolean
  hidden: boolean
  clips: Clip[]
}

export interface ProjectSettings {
  width: number
  height: number
  fps: number
  background: string
}

export interface Project {
  version: 1
  settings: ProjectSettings
  /** Ordem de exibição: índice 0 é a camada mais à frente. */
  tracks: Track[]
}

export interface ProjectFile {
  app: 'fotograma'
  version: 1
  project: Project
  assets: Record<string, Asset>
}

export interface CaptionSegment {
  start: number
  end: number
  text: string
}

export type WhisperModel = 'tiny' | 'base' | 'small'

export interface TranscribeRequest {
  project: Project
  assets: Record<string, Asset>
  model: WhisperModel
  language: string
}

export interface TranscribeProgress {
  stage: 'audio' | 'download' | 'load' | 'transcribe' | 'done'
  /** 0..1 quando conhecido. */
  ratio?: number
  detail?: string
}

export interface ExportRequest {
  outPath: string
  width: number
  height: number
  fps: number
  crf: number
  duration: number
  project: Project
  assets: Record<string, Asset>
}

export interface ImportProgress {
  path: string
  stage: 'probe' | 'proxy' | 'thumbs' | 'peaks' | 'done' | 'error'
  ratio?: number
  error?: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export function projectDuration(project: Project): number {
  let end = 0
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.start + clip.duration)
  }
  return end
}
