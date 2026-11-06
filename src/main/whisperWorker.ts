import { parentPort, workerData } from 'node:worker_threads'

interface Job {
  audio: Float32Array
  model: string
  language: string
}

interface Chunk {
  timestamp: [number, number | null]
  text: string
}

const port = parentPort!
const BLOCK_SECONDS = 300
const SAMPLE_RATE = 16000

port.on('message', async (job: Job) => {
  try {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = (workerData as { cacheDir: string }).cacheDir
    env.allowLocalModels = false

    port.postMessage({ type: 'progress', stage: 'download', ratio: 0 })
    const transcriber = await pipeline('automatic-speech-recognition', `Xenova/whisper-${job.model}`, {
      dtype: 'q8',
      device: 'cpu',
      progress_callback: (p: { status: string; file?: string; progress?: number }) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          port.postMessage({ type: 'progress', stage: 'download', ratio: p.progress / 100, detail: p.file })
        }
      }
    })

    const total = job.audio.length
    const block = BLOCK_SECONDS * SAMPLE_RATE
    const segments: { start: number; end: number; text: string }[] = []
    for (let offset = 0; offset < total; offset += block) {
      port.postMessage({ type: 'progress', stage: 'transcribe', ratio: offset / total })
      const slice = job.audio.subarray(offset, Math.min(total, offset + block))
      const base = offset / SAMPLE_RATE
      const sliceDur = slice.length / SAMPLE_RATE
      const out = (await transcriber(slice, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        task: 'transcribe',
        ...(job.language !== 'auto' ? { language: job.language } : {})
      })) as { text: string; chunks?: Chunk[] }
      for (const c of out.chunks ?? []) {
        const text = c.text.trim()
        if (!text) continue
        const start = base + (c.timestamp[0] ?? 0)
        const end = base + (c.timestamp[1] ?? sliceDur)
        segments.push({ start, end: Math.max(end, start + 0.3), text })
      }
    }
    port.postMessage({ type: 'result', segments })
  } catch (e) {
    port.postMessage({ type: 'error', error: e instanceof Error ? e.message : String(e) })
  }
})
