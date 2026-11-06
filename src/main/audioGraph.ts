import type { Asset, MediaClip, Project } from '@shared/types'

export interface AudioGraph {
  /** Argumentos de entrada do ffmpeg (-i ...). */
  inputs: string[]
  filter: string
  /** Rótulo do fluxo final, ex. "[aout]". */
  out: string
}

function atempoChain(speed: number): string[] {
  const factors: number[] = []
  let s = speed
  while (s > 2) {
    factors.push(2)
    s /= 2
  }
  while (s < 0.5) {
    factors.push(0.5)
    s /= 0.5
  }
  if (Math.abs(s - 1) > 1e-6) factors.push(s)
  return factors.map((f) => `atempo=${f.toFixed(6)}`)
}

/**
 * Monta a mixagem de áudio da timeline inteira. `firstInputIndex` é o índice que
 * a primeira entrada gerada terá na linha de comando final.
 */
export function buildAudioGraph(
  project: Project,
  assets: Record<string, Asset>,
  total: number,
  firstInputIndex: number
): AudioGraph {
  const inputs: string[] = []
  const chains: string[] = []
  const labels: string[] = []
  let idx = firstInputIndex
  const fmt = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'

  inputs.push('-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo')
  chains.push(`[${idx}:a]${fmt}[a0]`)
  labels.push('[a0]')
  idx++

  for (const track of project.tracks) {
    if (track.kind === 'text' || track.muted) continue
    for (const c of track.clips) {
      if (c.type !== 'media') continue
      const clip = c as MediaClip
      const asset = assets[clip.assetId]
      if (!asset || !asset.hasAudio || clip.volume <= 0) continue
      const srcDur = clip.duration * clip.speed
      inputs.push('-ss', clip.inPoint.toFixed(3), '-t', srcDur.toFixed(3), '-i', asset.path)
      const f: string[] = ['aresample=48000', ...atempoChain(clip.speed), `volume=${clip.volume.toFixed(3)}`]
      if (clip.fadeIn > 0) f.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`)
      if (clip.fadeOut > 0) {
        const st = Math.max(0, clip.duration - clip.fadeOut)
        f.push(`afade=t=out:st=${st.toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`)
      }
      const delay = Math.round(clip.start * 1000)
      if (delay > 0) f.push(`adelay=${delay}:all=1`)
      f.push(fmt)
      const label = `[a${labels.length}]`
      chains.push(`[${idx}:a]${f.join(',')}${label}`)
      labels.push(label)
      idx++
    }
  }

  chains.push(
    `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,` +
      `atrim=0:${total.toFixed(3)},${fmt}[aout]`
  )
  return { inputs, filter: chains.join(';'), out: '[aout]' }
}
