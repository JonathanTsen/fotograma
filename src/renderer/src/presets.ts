import type { Filters, TextAnimIn, TextAnimOut, TextStyle, TransitionType } from '@shared/types'

const base: TextStyle = {
  fontFamily: 'Helvetica Neue',
  fontSize: 72,
  color: '#ffffff',
  bold: true,
  italic: false,
  uppercase: false,
  align: 'center',
  strokeColor: '#000000',
  strokeWidth: 0,
  background: null,
  backgroundOpacity: 0.6,
  shadow: true
}

export const TEXT_PRESETS = {
  default: { label: 'Texto padrão', sample: 'Seu texto aqui', y: 0.5, animIn: 'fade', animOut: 'fade', style: base },
  title: {
    label: 'Título',
    sample: 'TÍTULO',
    y: 0.42,
    animIn: 'pop',
    animOut: 'fade',
    style: { ...base, fontFamily: 'Futura', fontSize: 140, uppercase: true }
  },
  subtitle: {
    label: 'Subtítulo',
    sample: 'Um subtítulo elegante',
    y: 0.6,
    animIn: 'slideUp',
    animOut: 'fade',
    style: { ...base, fontFamily: 'Avenir Next', fontSize: 56, bold: false }
  },
  neon: {
    label: 'Neon',
    sample: 'NEON',
    y: 0.5,
    animIn: 'zoom',
    animOut: 'zoom',
    style: { ...base, fontFamily: 'Avenir Next', fontSize: 120, color: '#7ef9ff', strokeColor: '#ff3df2', strokeWidth: 4 }
  },
  box: {
    label: 'Caixa',
    sample: 'Destaque',
    y: 0.5,
    animIn: 'slideUp',
    animOut: 'slideDown',
    style: { ...base, fontFamily: 'Avenir Next', fontSize: 64, color: '#111111', background: '#ffd84a', backgroundOpacity: 1, shadow: false }
  },
  typewriter: {
    label: 'Máquina de escrever',
    sample: 'Era uma vez...',
    y: 0.5,
    animIn: 'typewriter',
    animOut: 'fade',
    style: { ...base, fontFamily: 'Menlo', fontSize: 60, bold: false }
  },
  caption: {
    label: 'Legenda',
    sample: 'Legenda',
    y: 0.84,
    animIn: 'none',
    animOut: 'none',
    style: { ...base, fontFamily: 'Helvetica Neue', fontSize: 60, strokeWidth: 5, shadow: false }
  },
  captionBox: {
    label: 'Legenda com fundo',
    sample: 'Legenda',
    y: 0.84,
    animIn: 'none',
    animOut: 'none',
    style: { ...base, fontSize: 54, background: '#000000', backgroundOpacity: 0.65, shadow: false }
  },
  captionPop: {
    label: 'Legenda dinâmica',
    sample: 'LEGENDA',
    y: 0.72,
    animIn: 'pop',
    animOut: 'none',
    style: { ...base, fontFamily: 'Avenir Next', fontSize: 78, uppercase: true, color: '#ffe14d', strokeWidth: 6 }
  }
} satisfies Record<string, { label: string; sample: string; y: number; animIn: TextAnimIn; animOut: TextAnimOut; style: TextStyle }>

export type TextPresetId = keyof typeof TEXT_PRESETS
export const CAPTION_PRESETS: TextPresetId[] = ['caption', 'captionBox', 'captionPop']

export const FONTS = [
  'Helvetica Neue', 'Avenir Next', 'Futura', 'Gill Sans', 'Georgia', 'Times New Roman', 'Didot', 'Impact',
  'Arial Black', 'American Typewriter', 'Menlo', 'Marker Felt', 'Chalkboard SE', 'Noteworthy', 'Snell Roundhand',
  'Copperplate', 'Rockwell'
]

export const TRANSITIONS: { type: TransitionType; label: string }[] = [
  { type: 'crossfade', label: 'Dissolver' },
  { type: 'fadeBlack', label: 'Fade preto' },
  { type: 'slideLeft', label: 'Deslizar ←' },
  { type: 'slideRight', label: 'Deslizar →' },
  { type: 'slideUp', label: 'Deslizar ↑' },
  { type: 'wipeLeft', label: 'Cortina ←' },
  { type: 'wipeRight', label: 'Cortina →' },
  { type: 'zoom', label: 'Zoom' },
  { type: 'circle', label: 'Círculo' },
  { type: 'blur', label: 'Desfoque' }
]

export const FILTER_PRESETS: { id: string; label: string; filters: Filters }[] = [
  { id: 'none', label: 'Original', filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sepia: 0, grayscale: 0 } },
  { id: 'vivid', label: 'Vívido', filters: { brightness: 1.05, contrast: 1.15, saturation: 1.45, hue: 0, blur: 0, sepia: 0, grayscale: 0 } },
  { id: 'warm', label: 'Quente', filters: { brightness: 1.05, contrast: 1.05, saturation: 1.15, hue: -8, blur: 0, sepia: 0.25, grayscale: 0 } },
  { id: 'cool', label: 'Frio', filters: { brightness: 1, contrast: 1.05, saturation: 0.95, hue: 12, blur: 0, sepia: 0, grayscale: 0 } },
  { id: 'mono', label: 'P&B', filters: { brightness: 1, contrast: 1.2, saturation: 1, hue: 0, blur: 0, sepia: 0, grayscale: 1 } },
  { id: 'sepia', label: 'Sépia', filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sepia: 0.85, grayscale: 0 } },
  { id: 'faded', label: 'Desbotado', filters: { brightness: 1.1, contrast: 0.8, saturation: 0.7, hue: 0, blur: 0, sepia: 0.1, grayscale: 0 } },
  { id: 'drama', label: 'Drama', filters: { brightness: 0.9, contrast: 1.4, saturation: 0.8, hue: 0, blur: 0, sepia: 0, grayscale: 0 } },
  { id: 'dream', label: 'Sonho', filters: { brightness: 1.15, contrast: 0.9, saturation: 1.2, hue: -15, blur: 1.5, sepia: 0, grayscale: 0 } },
  { id: 'night', label: 'Noite', filters: { brightness: 0.8, contrast: 1.1, saturation: 0.7, hue: 25, blur: 0, sepia: 0, grayscale: 0 } }
]

export const ASPECTS = [
  { label: '16:9', width: 1920, height: 1080 },
  { label: '9:16', width: 1080, height: 1920 },
  { label: '1:1', width: 1080, height: 1080 },
  { label: '4:5', width: 1080, height: 1350 },
  { label: '21:9', width: 2560, height: 1080 }
]

export function cssFilter(f: Filters, blurScale = 1): string {
  const parts: string[] = []
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`)
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`)
  if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`)
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`)
  if (f.sepia > 0) parts.push(`sepia(${f.sepia})`)
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale})`)
  if (f.blur > 0) parts.push(`blur(${(f.blur * blurScale).toFixed(2)}px)`)
  return parts.length ? parts.join(' ') : 'none'
}
