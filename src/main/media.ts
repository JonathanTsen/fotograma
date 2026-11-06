import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Asset, AssetKind, ImportProgress } from '@shared/types'
import { FFMPEG, FFPROBE, lastLines, run } from './ffmpeg'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const CONVERT_IMAGE_EXT = new Set(['.heic', '.heif', '.tif', '.tiff'])
const PLAYABLE_VIDEO = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1'])
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac'])
const PLAYABLE_AUDIO_ONLY = new Set([...PLAYABLE_AUDIO, 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'])
const PEAKS_RATE = 20

interface ProbeStream {
  codec_type: string
  codec_name?: string
  width?: number
  height?: number
  pix_fmt?: string
  disposition?: { attached_pic?: number }
  side_data_list?: { rotation?: number }[]
  tags?: { rotate?: string }
}

interface ProbeResult {
  streams: ProbeStream[]
  format: { duration?: string; format_name?: string }
}

async function probe(path: string): Promise<ProbeResult> {
  const r = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path])
  if (r.code !== 0) throw new Error(`ffprobe falhou: ${lastLines(r.stderr)}`)
  return JSON.parse(r.stdout.toString()) as ProbeResult
}

function rotationOf(s: ProbeStream): number {
  const side = s.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation
  if (typeof side === 'number') return side
  return s.tags?.rotate ? Number(s.tags.rotate) : 0
}

async function ffmpegWithProgress(args: string[], duration: number, onRatio: (r: number) => void): Promise<void> {
  const r = await run(FFMPEG, ['-y', '-progress', 'pipe:1', '-nostats', ...args], {
    onStdoutLine: (line) => {
      const m = /^out_time_us=(\d+)/.exec(line)
      if (m && duration > 0) onRatio(Math.min(1, Number(m[1]) / 1e6 / duration))
    }
  })
  if (r.code !== 0) throw new Error(lastLines(r.stderr))
}

async function computePeaks(path: string): Promise<number[]> {
  const sampleRate = 4000
  const r = await run(FFMPEG, ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', 'pipe:1'])
  if (r.code !== 0) return []
  const buf = r.stdout
  const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2))
  const per = sampleRate / PEAKS_RATE
  const peaks: number[] = []
  let max = 0
  for (let i = 0; i < samples.length; i += per) {
    let m = 0
    const end = Math.min(samples.length, i + per)
    for (let j = i; j < end; j++) {
      const v = Math.abs(samples[j])
      if (v > m) m = v
    }
    peaks.push(m)
    if (m > max) max = m
  }
  const norm = max > 0 ? 1 / max : 0
  return peaks.map((p) => Math.round(p * norm * 1000) / 1000)
}

export async function importMedia(
  path: string,
  cacheDir: string,
  onProgress: (p: ImportProgress) => void
): Promise<Asset> {
  await mkdir(cacheDir, { recursive: true })
  const st = await stat(path)
  const key = createHash('sha1').update(`${path}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16)
  const ext = extname(path).toLowerCase()
  const cache = (suffix: string): string => join(cacheDir, `${key}${suffix}`)
  onProgress({ path, stage: 'probe' })

  let source = path
  if (CONVERT_IMAGE_EXT.has(ext)) {
    const out = cache('.jpg')
    if (!existsSync(out)) {
      const r = await run('/usr/bin/sips', ['-s', 'format', 'jpeg', path, '--out', out])
      if (r.code !== 0) throw new Error(`Não foi possível converter a imagem: ${lastLines(r.stderr)}`)
    }
    source = out
  }

  const info = await probe(source)
  const video = info.streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const audio = info.streams.find((s) => s.codec_type === 'audio')
  const isImage = IMAGE_EXT.has(ext) || CONVERT_IMAGE_EXT.has(ext)
  const kind: AssetKind = isImage ? 'image' : video ? 'video' : audio ? 'audio' : 'image'
  if (!video && !audio) throw new Error('O arquivo não tem trilhas de vídeo ou áudio.')

  const duration = isImage ? 0 : Number(info.format.duration ?? 0)
  let width = video?.width ?? 0
  let height = video?.height ?? 0
  if (video && Math.abs(rotationOf(video)) % 180 === 90) [width, height] = [height, width]

  let playbackPath = source
  if (kind === 'video') {
    const fmt = info.format.format_name ?? ''
    const okContainer = /mp4|mov|webm|matroska/.test(fmt)
    const okVideo =
      PLAYABLE_VIDEO.has(video!.codec_name ?? '') &&
      !(video!.codec_name === 'h264' && !/^yuvj?420p$/.test(video!.pix_fmt ?? ''))
    const okAudio = !audio || PLAYABLE_AUDIO.has(audio.codec_name ?? '')
    if (!(okContainer && okVideo && okAudio)) {
      const out = cache('.proxy.mp4')
      if (!existsSync(out)) {
        onProgress({ path, stage: 'proxy', ratio: 0 })
        const tmp = cache('.proxy.tmp.mp4')
        await ffmpegWithProgress(
          ['-i', path, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
            '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp],
          duration,
          (ratio) => onProgress({ path, stage: 'proxy', ratio })
        )
        await rename(tmp, out)
      }
      playbackPath = out
    }
  } else if (kind === 'audio' && !PLAYABLE_AUDIO_ONLY.has(audio!.codec_name ?? '')) {
    const out = cache('.proxy.m4a')
    if (!existsSync(out)) {
      onProgress({ path, stage: 'proxy', ratio: 0 })
      await ffmpegWithProgress(['-i', path, '-vn', '-c:a', 'aac', '-b:a', '192k', out], duration, (ratio) =>
        onProgress({ path, stage: 'proxy', ratio })
      )
    }
    playbackPath = out
  }

  onProgress({ path, stage: 'thumbs' })
  let thumbnail: string | undefined
  let filmstrip: string | undefined
  if (kind !== 'audio') {
    thumbnail = cache('.thumb.jpg')
    if (!existsSync(thumbnail)) {
      const at = kind === 'video' ? Math.min(1, duration / 2) : 0
      const r = await run(FFMPEG, ['-y', '-v', 'error', '-ss', at.toFixed(2), '-i', playbackPath, '-frames:v', '1',
        '-vf', 'scale=320:-2', '-q:v', '4', thumbnail])
      if (r.code !== 0) thumbnail = undefined
    }
    filmstrip = thumbnail
    if (kind === 'video') {
      const strip = cache('.strip.jpg')
      if (!existsSync(strip)) {
        const n = 8
        const args = ['-y', '-v', 'error']
        for (let i = 0; i < n; i++) args.push('-ss', ((duration * (i + 0.5)) / n).toFixed(2), '-i', playbackPath)
        const chains = Array.from({ length: n }, (_, i) =>
          `[${i}:v]scale=160:90:force_original_aspect_ratio=increase,crop=160:90,setsar=1[v${i}]`)
        const joined = Array.from({ length: n }, (_, i) => `[v${i}]`).join('')
        args.push('-filter_complex', `${chains.join(';')};${joined}hstack=inputs=${n}[out]`, '-map', '[out]',
          '-frames:v', '1', '-q:v', '5', strip)
        const r = await run(FFMPEG, args)
        if (r.code === 0) filmstrip = strip
      } else {
        filmstrip = strip
      }
    }
  }

  let peaks: number[] | undefined
  if (audio) {
    onProgress({ path, stage: 'peaks' })
    peaks = await computePeaks(path)
  }

  onProgress({ path, stage: 'done' })
  return {
    id: key,
    path,
    playbackPath,
    name: basename(path),
    kind,
    duration,
    width,
    height,
    hasAudio: Boolean(audio),
    thumbnail,
    filmstrip,
    peaks,
    peaksRate: PEAKS_RATE
  }
}
