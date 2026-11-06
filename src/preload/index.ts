import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Asset,
  CaptionSegment,
  ExportRequest,
  ImportProgress,
  Result,
  TranscribeProgress,
  TranscribeRequest
} from '@shared/types'

function listen<T>(channel: string, cb: (value: T) => void): () => void {
  const handler = (_e: unknown, value: T): void => cb(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const api = {
  pickMedia: (): Promise<string[]> => ipcRenderer.invoke('media:pick'),
  importMedia: (path: string): Promise<Result<Asset>> => ipcRenderer.invoke('media:import', path),
  onImportProgress: (cb: (p: ImportProgress) => void) => listen('media:progress', cb),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  filesExist: (paths: string[]): Promise<boolean[]> => ipcRenderer.invoke('fs:exists', paths),

  saveProject: (data: string, path: string | null): Promise<string | null> =>
    ipcRenderer.invoke('project:save', data, path),
  openProject: (): Promise<{ path: string; data: string } | null> => ipcRenderer.invoke('project:open'),

  pickExportPath: (name: string): Promise<string | null> => ipcRenderer.invoke('export:pickPath', name),
  exportStart: (req: ExportRequest): Promise<Result<null>> => ipcRenderer.invoke('export:start', req),
  exportFrame: (data: Uint8Array): Promise<Result<null>> => ipcRenderer.invoke('export:frame', data),
  exportFinish: (): Promise<Result<null>> => ipcRenderer.invoke('export:finish'),
  exportCancel: (): Promise<void> => ipcRenderer.invoke('export:cancel'),

  transcribe: (req: TranscribeRequest): Promise<Result<CaptionSegment[]>> =>
    ipcRenderer.invoke('captions:transcribe', req),
  cancelTranscription: (): Promise<void> => ipcRenderer.invoke('captions:cancel'),
  onTranscribeProgress: (cb: (p: TranscribeProgress) => void) => listen('captions:progress', cb),

  reveal: (path: string): Promise<void> => ipcRenderer.invoke('shell:reveal', path)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
