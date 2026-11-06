import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { ExportRequest, Result } from '@shared/types'
import { buildAudioGraph } from './audioGraph'
import { FFMPEG, lastLines } from './ffmpeg'

interface Job {
  proc: ChildProcessWithoutNullStreams
  stderr: string
  exited: Promise<number | null>
  failed: string | null
}

let job: Job | null = null

export function startExport(req: ExportRequest): Result<null> {
  if (job) return { ok: false, error: 'Já existe uma exportação em andamento.' }
  const audio = buildAudioGraph(req.project, req.assets, req.duration, 1)
  const args = [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(req.fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    ...audio.inputs,
    '-filter_complex', audio.filter,
    '-map', '0:v', '-map', audio.out,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(req.crf), '-pix_fmt', 'yuv420p',
    '-r', String(req.fps),
    '-c:a', 'aac', '-b:a', '192k',
    '-t', req.duration.toFixed(3),
    '-movflags', '+faststart',
    req.outPath
  ]
  const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  const current: Job = {
    proc,
    stderr: '',
    failed: null,
    exited: new Promise((resolve) => proc.on('close', resolve))
  }
  proc.stderr.on('data', (d: Buffer) => {
    current.stderr = (current.stderr + d.toString()).slice(-10000)
  })
  proc.stdin.on('error', (e) => {
    current.failed = current.failed ?? e.message
  })
  proc.on('error', (e) => {
    current.failed = e.message
  })
  job = current
  return { ok: true, value: null }
}

export async function writeFrame(data: Uint8Array): Promise<Result<null>> {
  const current = job
  if (!current) return { ok: false, error: 'Nenhuma exportação ativa.' }
  if (current.failed || current.proc.exitCode !== null) {
    return { ok: false, error: lastLines(current.stderr) || current.failed || 'ffmpeg encerrou.' }
  }
  const ok = current.proc.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
  if (!ok) {
    await new Promise<void>((resolve) => {
      const done = (): void => {
        current.proc.stdin.off('drain', done)
        current.proc.off('close', done)
        resolve()
      }
      current.proc.stdin.once('drain', done)
      current.proc.once('close', done)
    })
  }
  return { ok: true, value: null }
}

export async function finishExport(): Promise<Result<null>> {
  const current = job
  if (!current) return { ok: false, error: 'Nenhuma exportação ativa.' }
  current.proc.stdin.end()
  const code = await current.exited
  job = null
  if (code !== 0) return { ok: false, error: lastLines(current.stderr) || current.failed || `ffmpeg saiu com ${code}` }
  return { ok: true, value: null }
}

export async function cancelExport(): Promise<void> {
  const current = job
  if (!current) return
  current.proc.kill('SIGKILL')
  await current.exited
  job = null
}
