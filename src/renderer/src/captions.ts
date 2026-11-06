import type { CaptionSegment } from '@shared/types'

/**
 * Divide os segmentos do Whisper em legendas curtas de até `maxWords` palavras,
 * distribuindo o tempo de cada segmento proporcionalmente ao número de caracteres.
 */
export function segmentCaptions(segments: CaptionSegment[], maxWords: number): CaptionSegment[] {
  const out: CaptionSegment[] = []
  for (const seg of segments) {
    const words = seg.text.split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    const groups: string[][] = []
    for (let i = 0; i < words.length; i += maxWords) groups.push(words.slice(i, i + maxWords))
    // Evita uma última legenda com uma palavra só.
    if (groups.length > 1 && groups[groups.length - 1].length === 1) {
      groups[groups.length - 2].push(...groups.pop()!)
    }
    const totalChars = groups.reduce((n, g) => n + g.join(' ').length, 0)
    const span = seg.end - seg.start
    let cursor = seg.start
    for (const g of groups) {
      const text = g.join(' ')
      const dur = span * (text.length / totalChars)
      out.push({ start: cursor, end: cursor + dur, text })
      cursor += dur
    }
  }
  return out
}
