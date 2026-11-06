import { Worker } from 'node:worker_threads'
import workerPath from './whisperWorker?modulePath'
import { projectDuration, type CaptionSegment, type Result, type TranscribeProgress, type TranscribeRequest } from '@shared/types'
import { buildAudioGraph } from './audioGraph'
import { FFMPEG, lastLines, run } from './ffmpeg'

let active: Worker | null = null

export async function transcribe(
  req: TranscribeRequest,
  cacheDir: string,
  onProgress: (p: TranscribeProgress) => void
): Promise<Result<CaptionSegment[]>> {
  if (active) return { ok: false, error: 'Já existe uma transcrição em andamento.' }
  const total = projectDuration(req.project)
  if (total <= 0) return { ok: false, error: 'A timeline está vazia.' }

  onProgress({ stage: 'audio' })
  const graph = buildAudioGraph(req.project, req.assets, total, 0)
  const r = await run(FFMPEG, [
    '-v', 'error', ...graph.inputs, '-filter_complex', graph.filter, '-map', graph.out,
    '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'
  ])
  if (r.code !== 0) return { ok: false, error: `Falha ao extrair o áudio: ${lastLines(r.stderr)}` }
  // Copia para um ArrayBuffer alinhado e transferível.
  const audio = new Float32Array(r.stdout.byteLength / 4)
  new Uint8Array(audio.buffer).set(r.stdout.subarray(0, audio.byteLength))

  const worker = new Worker(workerPath, { workerData: { cacheDir } })
  active = worker
  try {
    return await new Promise<Result<CaptionSegment[]>>((resolve) => {
      worker.on('message', (msg: { type: string } & Record<string, unknown>) => {
        if (msg.type === 'progress') onProgress(msg as unknown as TranscribeProgress)
        else if (msg.type === 'result') resolve({ ok: true, value: msg.segments as CaptionSegment[] })
        else if (msg.type === 'error') resolve({ ok: false, error: String(msg.error) })
      })
      worker.on('error', (e) => resolve({ ok: false, error: e.message }))
      worker.on('exit', (code) => resolve({ ok: false, error: `Transcrição interrompida (código ${code}).` }))
      worker.postMessage({ audio, model: req.model, language: req.language }, [audio.buffer])
    })
  } finally {
    active = null
    onProgress({ stage: 'done' })
    await worker.terminate()
  }
}

export async function cancelTranscription(): Promise<void> {
  await active?.terminate()
}
