import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ffprobeStatic from 'ffprobe-static'

function unpacked(p: string): string {
  // Em um app empacotado os binários ficam fora do asar.
  return p.replace('app.asar', 'app.asar.unpacked')
}

function pick(staticPath: string | null | undefined, fallback: string): string {
  if (staticPath) {
    const p = unpacked(staticPath)
    if (existsSync(p)) return p
  }
  return fallback
}

export const FFMPEG = pick(ffmpegStatic as unknown as string, 'ffmpeg')
export const FFPROBE = pick((ffprobeStatic as { path: string }).path, 'ffprobe')

export interface RunResult {
  code: number | null
  stdout: Buffer
  stderr: string
}

export function run(
  cmd: string,
  args: string[],
  opts: { onStdoutLine?: (line: string) => void; onSpawn?: (p: ChildProcess) => void } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    opts.onSpawn?.(proc)
    const out: Buffer[] = []
    let err = ''
    let pending = ''
    proc.stdout.on('data', (d: Buffer) => {
      if (opts.onStdoutLine) {
        pending += d.toString()
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const l of lines) opts.onStdoutLine(l)
      } else {
        out.push(d)
      }
    })
    proc.stderr.on('data', (d: Buffer) => {
      err += d.toString()
      if (err.length > 20000) err = err.slice(-10000)
    })
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ code, stdout: Buffer.concat(out), stderr: err }))
  })
}

export function lastLines(text: string, n = 6): string {
  return text.trim().split('\n').slice(-n).join('\n')
}
