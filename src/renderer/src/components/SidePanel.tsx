import { useEffect, useState } from 'react'
import type { Asset, ImportProgress, MediaClip, WhisperModel } from '@shared/types'
import { mediaUrl } from '../engine'
import { CAPTION_PRESETS, FILTER_PRESETS, TEXT_PRESETS, TRANSITIONS, cssFilter, type TextPresetId } from '../presets'
import { findClip, useStore } from '../store'
import { fmtDuration, importPaths, onImports } from '../util'
import { Icon, type IconName } from './Icon'
import { segmentCaptions } from '../captions'

type Tab = 'media' | 'text' | 'transitions' | 'filters' | 'captions'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'media', label: 'Mídia', icon: 'media' },
  { id: 'text', label: 'Texto', icon: 'text' },
  { id: 'transitions', label: 'Transições', icon: 'transition' },
  { id: 'filters', label: 'Filtros', icon: 'filter' },
  { id: 'captions', label: 'Legendas', icon: 'captions' }
]

export function SidePanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('media')
  return (
    <aside className="side">
      <nav className="side-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} title={t.label}>
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="side-body">
        {tab === 'media' && <MediaTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'transitions' && <TransitionsTab />}
        {tab === 'filters' && <FiltersTab />}
        {tab === 'captions' && <CaptionsTab />}
      </div>
    </aside>
  )
}

function MediaTab(): React.JSX.Element {
  const assets = useStore((s) => s.assets)
  const addAssetClip = useStore((s) => s.addAssetClip)
  const [imports, setImports] = useState<Record<string, ImportProgress>>({})
  useEffect(() => onImports(setImports), [])
  const list = Object.values(assets)

  const pick = async (): Promise<void> => {
    const paths = await window.api.pickMedia()
    if (paths.length) await importPaths(paths)
  }

  return (
    <div className="panel">
      <button className="btn primary wide" onClick={() => void pick()}>
        <Icon name="plus" /> Importar mídia
      </button>
      {Object.values(imports).map((p) => (
        <div key={p.path} className={`import-row ${p.stage === 'error' ? 'error' : ''}`}>
          <span className="ellipsis">{p.path.split('/').pop()}</span>
          <span className="muted">
            {p.stage === 'error' ? p.error : p.stage === 'proxy' ? `convertendo ${Math.round((p.ratio ?? 0) * 100)}%` : 'analisando…'}
          </span>
        </div>
      ))}
      {list.length === 0 && Object.keys(imports).length === 0 && (
        <p className="hint">Arraste vídeos, áudios ou imagens para a janela, ou clique em Importar.</p>
      )}
      <div className="asset-grid">
        {list.map((a) => (
          <AssetCard key={a.id} asset={a} onAdd={() => addAssetClip(a.id)} />
        ))}
      </div>
    </div>
  )
}

function AssetCard({ asset, onAdd }: { asset: Asset; onAdd: () => void }): React.JSX.Element {
  return (
    <div
      className="asset"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-fotograma-asset', asset.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDoubleClick={onAdd}
      title={asset.path}
    >
      <div className="asset-thumb">
        {asset.thumbnail ? <img src={mediaUrl(asset.thumbnail)} alt="" draggable={false} /> : <div className="audio-thumb"><Icon name="volume" size={26} /></div>}
        {asset.kind !== 'image' && <span className="badge">{fmtDuration(asset.duration)}</span>}
        <button className="asset-add" onClick={onAdd} title="Adicionar na posição do cursor">
          <Icon name="plus" size={14} />
        </button>
      </div>
      <div className="asset-name ellipsis">{asset.name}</div>
    </div>
  )
}

function TextTab(): React.JSX.Element {
  const addTextClip = useStore((s) => s.addTextClip)
  const ids = (Object.keys(TEXT_PRESETS) as TextPresetId[]).filter((id) => !CAPTION_PRESETS.includes(id))
  return (
    <div className="panel">
      <p className="hint">Clique para adicionar na posição do cursor.</p>
      <div className="preset-grid">
        {ids.map((id) => {
          const p = TEXT_PRESETS[id]
          return (
            <button key={id} className="text-preset" onClick={() => addTextClip(id)}>
              <span
                style={{
                  fontFamily: p.style.fontFamily,
                  fontWeight: p.style.bold ? 700 : 400,
                  color: p.style.color,
                  background: p.style.background ?? undefined,
                  padding: p.style.background ? '2px 8px' : undefined,
                  borderRadius: 4,
                  WebkitTextStroke: p.style.strokeWidth ? `1px ${p.style.strokeColor}` : undefined,
                  textTransform: p.style.uppercase ? 'uppercase' : undefined
                }}
              >
                {p.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function useSelectedMedia(): MediaClip | null {
  return useStore((s) => {
    if (!s.selectedId) return null
    const f = findClip(s.project, s.selectedId)
    return f && f.clip.type === 'media' && f.track.kind === 'video' ? f.clip : null
  })
}

function TransitionsTab(): React.JSX.Element {
  const clip = useSelectedMedia()
  const updateClip = useStore((s) => s.updateClip)
  return (
    <div className="panel">
      <p className="hint">
        {clip ? 'A transição é aplicada no início do clipe selecionado.' : 'Selecione um clipe de vídeo na timeline.'}
      </p>
      <div className="preset-grid">
        <button
          className={`chip ${clip && !clip.transition ? 'active' : ''}`}
          disabled={!clip}
          onClick={() => clip && updateClip<MediaClip>(clip.id, { transition: null })}
        >
          Nenhuma
        </button>
        {TRANSITIONS.map((t) => (
          <button
            key={t.type}
            className={`chip ${clip?.transition?.type === t.type ? 'active' : ''}`}
            disabled={!clip}
            onClick={() =>
              clip &&
              updateClip<MediaClip>(clip.id, {
                transition: { type: t.type, duration: Math.min(clip.transition?.duration ?? 0.8, clip.duration) }
              })
            }
          >
            <span className={`tr-swatch tr-${t.type}`} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function FiltersTab(): React.JSX.Element {
  const clip = useSelectedMedia()
  const asset = useStore((s) => (clip ? s.assets[clip.assetId] : undefined))
  const updateClip = useStore((s) => s.updateClip)
  return (
    <div className="panel">
      <p className="hint">{clip ? 'Escolha um filtro para o clipe selecionado.' : 'Selecione um clipe de vídeo na timeline.'}</p>
      <div className="filter-grid">
        {FILTER_PRESETS.map((f) => (
          <button
            key={f.id}
            className={`filter-card ${(clip?.filterPreset ?? 'none') === f.id && clip ? 'active' : ''}`}
            disabled={!clip}
            onClick={() => clip && updateClip<MediaClip>(clip.id, { filters: { ...f.filters }, filterPreset: f.id })}
          >
            <div className="filter-thumb" style={{ filter: cssFilter(f.filters, 0.3) }}>
              {asset?.thumbnail ? <img src={mediaUrl(asset.thumbnail)} alt="" /> : <div className="filter-sample" />}
            </div>
            <span>{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const LANGUAGES = [
  { id: 'portuguese', label: 'Português' },
  { id: 'english', label: 'Inglês' },
  { id: 'spanish', label: 'Espanhol' },
  { id: 'french', label: 'Francês' },
  { id: 'auto', label: 'Detectar automaticamente' }
]

function CaptionsTab(): React.JSX.Element {
  const [model, setModel] = useState<WhisperModel>('base')
  const [language, setLanguage] = useState('portuguese')
  const [preset, setPreset] = useState<TextPresetId>('caption')
  const [maxWords, setMaxWords] = useState(6)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      window.api.onTranscribeProgress((p) => {
        const pct = p.ratio !== undefined ? ` ${Math.round(p.ratio * 100)}%` : ''
        if (p.stage === 'audio') setStatus('Extraindo áudio da timeline…')
        else if (p.stage === 'download') setStatus(`Baixando modelo (só na primeira vez)…${pct}`)
        else if (p.stage === 'transcribe') setStatus(`Transcrevendo…${pct}`)
      }),
    []
  )

  const run = async (): Promise<void> => {
    const { project, assets, applyCaptions } = useStore.getState()
    setBusy(true)
    setError(null)
    setStatus('Preparando…')
    const r = await window.api.transcribe({ project, assets, model, language })
    setBusy(false)
    if (!r.ok) {
      setStatus(null)
      setError(r.error)
      return
    }
    const segments = segmentCaptions(r.value, maxWords)
    if (segments.length === 0) {
      setStatus(null)
      setError('Nenhuma fala foi detectada.')
      return
    }
    applyCaptions(segments, preset)
    setStatus(`${segments.length} legendas adicionadas em uma nova trilha.`)
  }

  return (
    <div className="panel">
      <p className="hint">
        Gera legendas a partir do áudio da timeline com o Whisper, direto no seu computador. Nenhum áudio sai da máquina; o
        modelo é baixado uma única vez.
      </p>
      <label className="field">
        <span>Idioma</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Precisão</span>
        <select value={model} onChange={(e) => setModel(e.target.value as WhisperModel)} disabled={busy}>
          <option value="tiny">Rápida (tiny, ~40 MB)</option>
          <option value="base">Equilibrada (base, ~80 MB)</option>
          <option value="small">Alta (small, ~250 MB)</option>
        </select>
      </label>
      <label className="field">
        <span>Palavras por legenda</span>
        <input type="number" min={1} max={20} value={maxWords} onChange={(e) => setMaxWords(Number(e.target.value) || 6)} disabled={busy} />
      </label>
      <div className="field">
        <span>Estilo</span>
        <div className="preset-grid">
          {CAPTION_PRESETS.map((id) => (
            <button key={id} className={`chip ${preset === id ? 'active' : ''}`} onClick={() => setPreset(id)} disabled={busy}>
              {TEXT_PRESETS[id].label}
            </button>
          ))}
        </div>
      </div>
      {busy ? (
        <button className="btn wide" onClick={() => void window.api.cancelTranscription()}>Cancelar</button>
      ) : (
        <button className="btn primary wide" onClick={() => void run()}>
          <Icon name="captions" /> Gerar legendas
        </button>
      )}
      {status && <p className="status">{status}</p>}
      {error && <p className="status error">{error}</p>}
    </div>
  )
}
