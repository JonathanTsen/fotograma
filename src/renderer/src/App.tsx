import { useEffect, useState } from 'react'
import type { ProjectFile } from '@shared/types'
import { ExportDialog } from './components/ExportDialog'
import { Icon } from './components/Icon'
import { Inspector } from './components/Inspector'
import { Preview } from './components/Preview'
import { SidePanel } from './components/SidePanel'
import { Timeline } from './components/Timeline'
import { useStore } from './store'
import { importPaths } from './util'

async function saveProject(saveAs = false): Promise<void> {
  const s = useStore.getState()
  const path = await window.api.saveProject(s.serialize(), saveAs ? null : s.projectPath)
  if (path) s.markSaved(path)
}

async function openProject(): Promise<void> {
  const r = await window.api.openProject()
  if (!r) return
  try {
    const file = JSON.parse(r.data) as ProjectFile
    if (file.app !== 'quadro') throw new Error('Arquivo não é um projeto do Quadro.')
    const assets = Object.values(file.assets)
    const exists = await window.api.filesExist(assets.map((a) => a.path))
    const missing = assets.filter((_, i) => !exists[i]).map((a) => a.name)
    useStore.getState().loadProject(file, r.path)
    if (missing.length) alert(`Arquivos não encontrados:\n${missing.join('\n')}`)
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e))
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || el.isContentEditable) return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return type !== 'range' && type !== 'checkbox' && type !== 'color'
  }
  return tag === 'SELECT'
}

export function App(): React.JSX.Element {
  const [exporting, setExporting] = useState(false)
  const [dropping, setDropping] = useState(false)
  const dirty = useStore((s) => s.dirty)
  const projectPath = useStore((s) => s.projectPath)
  const name = projectPath?.split('/').pop()?.replace(/\.quadro$/, '') ?? 'Projeto sem título'

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveProject(e.shiftKey)
        return
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void openProject()
        return
      }
      if (isTyping(e.target)) return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (s.selectedId) s.duplicateClip(s.selectedId)
      } else if (e.code === 'Space') {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if (e.key === 's' || e.key === 'S' || (mod && e.key.toLowerCase() === 'b')) {
        e.preventDefault()
        s.splitAtPlayhead()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedId) {
          e.preventDefault()
          s.deleteClip(s.selectedId)
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const step = (e.shiftKey ? 1 : 1 / s.project.settings.fps) * (e.key === 'ArrowLeft' ? -1 : 1)
        s.setPlaying(false)
        s.setTime(s.time + step)
      } else if (e.key === 'Escape') {
        s.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onDragOver = (e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setDropping(true)
    }
  }
  const onDrop = (e: React.DragEvent): void => {
    setDropping(false)
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    const paths = Array.from(e.dataTransfer.files).map((f) => window.api.pathForFile(f)).filter(Boolean)
    void importPaths(paths)
  }

  return (
    <div className="app" onDragOver={onDragOver} onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)} onDrop={onDrop}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M10 8.5v7l5.5-3.5z" fill="currentColor" /></svg>
          </span>
          Quadro
        </div>
        <div className="project-name">
          {name}
          {dirty && <span className="dirty" title="Alterações não salvas">•</span>}
        </div>
        <div className="top-actions">
          <button className="btn ghost" onClick={() => { if (!dirty || confirm('Descartar alterações não salvas?')) useStore.getState().newProject() }}>
            <Icon name="file" /> Novo
          </button>
          <button className="btn ghost" onClick={() => void openProject()}><Icon name="folder" /> Abrir</button>
          <button className="btn ghost" onClick={() => void saveProject()}><Icon name="save" /> Salvar</button>
          <button className="btn primary" onClick={() => setExporting(true)}><Icon name="download" /> Exportar</button>
        </div>
      </header>
      <main className="workspace">
        <SidePanel />
        <Preview />
        <Inspector />
      </main>
      <Timeline />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {dropping && <div className="drop-overlay">Solte para importar</div>}
    </div>
  )
}
