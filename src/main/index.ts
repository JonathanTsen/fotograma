import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { createReadStream, existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { ExportRequest, TranscribeRequest } from '@shared/types'
import { cancelExport, finishExport, startExport, writeFrame } from './exporter'
import { importMedia } from './media'
import { cancelTranscription, transcribe } from './transcribe'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true }
  }
])

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg', '.flac': 'audio/flac', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp'
}

const cacheDir = (): string => join(app.getPath('userData'), 'cache')
const modelsDir = (): string => join(app.getPath('userData'), 'models')

/** Serve arquivos locais com suporte a Range, necessário para busca em vídeos. */
async function serveMedia(request: Request): Promise<Response> {
  const path = decodeURIComponent(new URL(request.url).pathname.slice(1))
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    return new Response('not found', { status: 404 })
  }
  const headers: Record<string, string> = {
    'Content-Type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*'
  }
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start)
    end = Math.min(size - 1, end)
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
    })
  }
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream
  return new Response(body, { status: 200, headers: { ...headers, 'Content-Length': String(size) } })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#111214',
    titleBarStyle: 'hiddenInset',
    title: 'Quadro',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function registerIpc(): void {
  ipcMain.handle('media:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Mídia', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'aiff', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'tif', 'tiff'] },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle('media:import', async (e, path: string) => {
    try {
      const asset = await importMedia(path, cacheDir(), (p) => e.sender.send('media:progress', p))
      return { ok: true, value: asset }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      e.sender.send('media:progress', { path, stage: 'error', error })
      return { ok: false, error }
    }
  })

  ipcMain.handle('fs:exists', (_e, paths: string[]) => paths.map((p) => existsSync(p)))

  ipcMain.handle('project:save', async (e, data: string, path: string | null) => {
    let target = path
    if (!target) {
      const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender)!, {
        defaultPath: 'Projeto.quadro',
        filters: [{ name: 'Projeto Quadro', extensions: ['quadro'] }]
      })
      if (r.canceled || !r.filePath) return null
      target = r.filePath
    }
    await writeFile(target, data, 'utf8')
    return target
  })

  ipcMain.handle('project:open', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, {
      properties: ['openFile'],
      filters: [{ name: 'Projeto Quadro', extensions: ['quadro'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    return { path: r.filePaths[0], data: await readFile(r.filePaths[0], 'utf8') }
  })

  ipcMain.handle('export:pickPath', async (e, name: string) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender)!, {
      defaultPath: join(app.getPath('videos'), name),
      filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }]
    })
    return r.canceled ? null : (r.filePath ?? null)
  })
  ipcMain.handle('export:start', (_e, req: ExportRequest) => startExport(req))
  ipcMain.handle('export:frame', (_e, data: Uint8Array) => writeFrame(data))
  ipcMain.handle('export:finish', () => finishExport())
  ipcMain.handle('export:cancel', () => cancelExport())

  ipcMain.handle('captions:transcribe', (e, req: TranscribeRequest) =>
    transcribe(req, modelsDir(), (p) => e.sender.send('captions:progress', p))
  )
  ipcMain.handle('captions:cancel', () => cancelTranscription())

  ipcMain.handle('shell:reveal', (_e, path: string) => shell.showItemInFolder(path))
}

void app.whenReady().then(() => {
  protocol.handle('media', serveMedia)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
