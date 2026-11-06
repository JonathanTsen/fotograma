import type { Filters, MediaClip, TextAnimIn, TextAnimOut, TextClip, TextStyle, Transform, TransitionType } from '@shared/types'
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '@shared/types'
import { FONTS, TRANSITIONS } from '../presets'
import { findClip, useStore } from '../store'

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}): React.JSX.Element {
  return (
    <label className="slider">
      <span className="slider-label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="slider-value">{props.format ? props.format(props.value) : props.value.toFixed(2)}</span>
    </label>
  )
}

function Section({ title, children, onReset }: { title: string; children: React.ReactNode; onReset?: () => void }): React.JSX.Element {
  return (
    <div className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {onReset && <button className="link" onClick={onReset}>Redefinir</button>}
      </div>
      {children}
    </div>
  )
}

const pct = (v: number): string => `${Math.round(v * 100)}%`
const secs = (v: number): string => `${v.toFixed(1)}s`

export function Inspector(): React.JSX.Element {
  const project = useStore((s) => s.project)
  const selectedId = useStore((s) => s.selectedId)
  const found = selectedId ? findClip(project, selectedId) : null
  const selected = found ? { clip: found.clip, kind: found.track.kind } : null

  return (
    <aside className="inspector">
      {!selected && <ProjectInspector />}
      {selected?.clip.type === 'media' && <MediaInspector clip={selected.clip} isAudioTrack={selected.kind === 'audio'} />}
      {selected?.clip.type === 'text' && <TextInspector clip={selected.clip} />}
    </aside>
  )
}

function ProjectInspector(): React.JSX.Element {
  const settings = useStore((s) => s.project.settings)
  const setSettings = useStore((s) => s.setSettings)
  return (
    <>
      <h2>Projeto</h2>
      <Section title="Formato">
        <div className="row2">
          <label className="field">
            <span>Largura</span>
            <input type="number" value={settings.width} step={2} min={64} onChange={(e) => setSettings({ width: Math.max(64, Math.round(Number(e.target.value) / 2) * 2) })} />
          </label>
          <label className="field">
            <span>Altura</span>
            <input type="number" value={settings.height} step={2} min={64} onChange={(e) => setSettings({ height: Math.max(64, Math.round(Number(e.target.value) / 2) * 2) })} />
          </label>
        </div>
        <label className="field">
          <span>Quadros por segundo</span>
          <select value={settings.fps} onChange={(e) => setSettings({ fps: Number(e.target.value) })}>
            {[24, 25, 30, 50, 60].map((f) => (
              <option key={f} value={f}>{f} fps</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Cor de fundo</span>
          <input type="color" value={settings.background} onChange={(e) => setSettings({ background: e.target.value })} />
        </label>
      </Section>
      <Section title="Atalhos">
        <ul className="shortcuts">
          <li><kbd>Espaço</kbd> reproduzir / pausar</li>
          <li><kbd>S</kbd> dividir no cursor</li>
          <li><kbd>⌫</kbd> apagar clipe</li>
          <li><kbd>⌘D</kbd> duplicar clipe</li>
          <li><kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd> desfazer / refazer</li>
          <li><kbd>←</kbd> <kbd>→</kbd> avançar um quadro</li>
          <li><kbd>⌘S</kbd> salvar projeto</li>
        </ul>
      </Section>
    </>
  )
}

function MediaInspector({ clip, isAudioTrack }: { clip: MediaClip; isAudioTrack: boolean }): React.JSX.Element {
  const asset = useStore((s) => s.assets[clip.assetId])
  const updateClip = useStore((s) => s.updateClip)
  const set = (patch: Partial<MediaClip>, key: string): void => updateClip<MediaClip>(clip.id, patch, key)
  const setFilter = (k: keyof Filters, v: number): void =>
    updateClip<MediaClip>(clip.id, (c) => {
      c.filters[k] = v
      c.filterPreset = null
    }, `filter-${k}`)
  const setTf = (k: keyof Transform, v: number): void => updateClip<MediaClip>(clip.id, (c) => { c.transform[k] = v }, `tf-${k}`)
  const isImage = asset?.kind === 'image'

  const setSpeed = (speed: number): void =>
    updateClip<MediaClip>(clip.id, (c) => {
      const srcDur = c.duration * c.speed
      c.speed = speed
      c.duration = srcDur / speed
    }, 'speed')

  return (
    <>
      <h2 className="ellipsis" title={asset?.path}>{asset?.name ?? 'Clipe'}</h2>
      {asset?.hasAudio && (
        <Section title="Áudio">
          <Slider label="Volume" value={clip.volume} min={0} max={1} step={0.01} onChange={(v) => set({ volume: v }, 'volume')} format={pct} />
          <Slider label="Fade in" value={clip.fadeIn} min={0} max={Math.min(5, clip.duration / 2)} step={0.1} onChange={(v) => set({ fadeIn: v }, 'fadeIn')} format={secs} />
          <Slider label="Fade out" value={clip.fadeOut} min={0} max={Math.min(5, clip.duration / 2)} step={0.1} onChange={(v) => set({ fadeOut: v }, 'fadeOut')} format={secs} />
        </Section>
      )}
      {!isImage && (
        <Section title="Velocidade" onReset={() => setSpeed(1)}>
          <div className="preset-grid">
            {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
              <button key={s} className={`chip ${clip.speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
          </div>
          <Slider label="Personalizada" value={clip.speed} min={0.25} max={4} step={0.05} onChange={setSpeed} format={(v) => `${v.toFixed(2)}×`} />
        </Section>
      )}
      {!isAudioTrack && (
        <>
          <Section title="Transformação" onReset={() => set({ transform: { ...DEFAULT_TRANSFORM } }, 'tf-reset')}>
            <Slider label="Escala" value={clip.transform.scale} min={0.1} max={4} step={0.01} onChange={(v) => setTf('scale', v)} format={pct} />
            <Slider label="Posição X" value={clip.transform.x} min={-1} max={1} step={0.005} onChange={(v) => setTf('x', v)} format={pct} />
            <Slider label="Posição Y" value={clip.transform.y} min={-1} max={1} step={0.005} onChange={(v) => setTf('y', v)} format={pct} />
            <Slider label="Rotação" value={clip.transform.rotation} min={-180} max={180} step={1} onChange={(v) => setTf('rotation', v)} format={(v) => `${v}°`} />
            <Slider label="Opacidade" value={clip.transform.opacity} min={0} max={1} step={0.01} onChange={(v) => setTf('opacity', v)} format={pct} />
          </Section>
          <Section title="Ajustes de cor" onReset={() => set({ filters: { ...DEFAULT_FILTERS }, filterPreset: null }, 'filter-reset')}>
            <Slider label="Brilho" value={clip.filters.brightness} min={0} max={2} step={0.01} onChange={(v) => setFilter('brightness', v)} format={pct} />
            <Slider label="Contraste" value={clip.filters.contrast} min={0} max={2} step={0.01} onChange={(v) => setFilter('contrast', v)} format={pct} />
            <Slider label="Saturação" value={clip.filters.saturation} min={0} max={3} step={0.01} onChange={(v) => setFilter('saturation', v)} format={pct} />
            <Slider label="Matiz" value={clip.filters.hue} min={-180} max={180} step={1} onChange={(v) => setFilter('hue', v)} format={(v) => `${v}°`} />
            <Slider label="Sépia" value={clip.filters.sepia} min={0} max={1} step={0.01} onChange={(v) => setFilter('sepia', v)} format={pct} />
            <Slider label="P&B" value={clip.filters.grayscale} min={0} max={1} step={0.01} onChange={(v) => setFilter('grayscale', v)} format={pct} />
            <Slider label="Desfoque" value={clip.filters.blur} min={0} max={20} step={0.1} onChange={(v) => setFilter('blur', v)} format={(v) => v.toFixed(1)} />
          </Section>
          <Section title="Transição de entrada">
            <label className="field">
              <span>Tipo</span>
              <select
                value={clip.transition?.type ?? 'none'}
                onChange={(e) =>
                  set({
                    transition: e.target.value === 'none'
                      ? null
                      : { type: e.target.value as TransitionType, duration: clip.transition?.duration ?? Math.min(0.8, clip.duration) }
                  }, 'transition')
                }
              >
                <option value="none">Nenhuma</option>
                {TRANSITIONS.map((t) => (
                  <option key={t.type} value={t.type}>{t.label}</option>
                ))}
              </select>
            </label>
            {clip.transition && (
              <Slider
                label="Duração"
                value={clip.transition.duration}
                min={0.1}
                max={Math.max(0.1, Math.min(3, clip.duration))}
                step={0.05}
                onChange={(v) => updateClip<MediaClip>(clip.id, (c) => { if (c.transition) c.transition.duration = v }, 'transition-dur')}
                format={secs}
              />
            )}
          </Section>
        </>
      )}
    </>
  )
}

const ANIM_IN: { id: TextAnimIn; label: string }[] = [
  { id: 'none', label: 'Nenhuma' }, { id: 'fade', label: 'Surgir' }, { id: 'slideUp', label: 'Subir' },
  { id: 'slideDown', label: 'Descer' }, { id: 'pop', label: 'Pular' }, { id: 'zoom', label: 'Zoom' },
  { id: 'typewriter', label: 'Digitação' }
]
const ANIM_OUT: { id: TextAnimOut; label: string }[] = [
  { id: 'none', label: 'Nenhuma' }, { id: 'fade', label: 'Sumir' }, { id: 'slideDown', label: 'Descer' },
  { id: 'pop', label: 'Encolher' }, { id: 'zoom', label: 'Zoom' }
]

function TextInspector({ clip }: { clip: TextClip }): React.JSX.Element {
  const updateClip = useStore((s) => s.updateClip)
  const set = (patch: Partial<TextClip>, key: string): void => updateClip<TextClip>(clip.id, patch, key)
  const setStyle = <K extends keyof TextStyle>(k: K, v: TextStyle[K]): void =>
    updateClip<TextClip>(clip.id, (c) => { c.style[k] = v }, `style-${k}`)
  const st = clip.style
  return (
    <>
      <h2>Texto</h2>
      <Section title="Conteúdo">
        <textarea value={clip.text} rows={3} onChange={(e) => set({ text: e.target.value }, 'text')} />
      </Section>
      <Section title="Fonte">
        <label className="field">
          <span>Família</span>
          <select value={st.fontFamily} onChange={(e) => setStyle('fontFamily', e.target.value)}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
            ))}
          </select>
        </label>
        <Slider label="Tamanho" value={st.fontSize} min={12} max={300} step={1} onChange={(v) => setStyle('fontSize', v)} format={(v) => `${v}`} />
        <div className="toggles">
          <button className={`chip ${st.bold ? 'active' : ''}`} onClick={() => setStyle('bold', !st.bold)}><b>N</b></button>
          <button className={`chip ${st.italic ? 'active' : ''}`} onClick={() => setStyle('italic', !st.italic)}><i>I</i></button>
          <button className={`chip ${st.uppercase ? 'active' : ''}`} onClick={() => setStyle('uppercase', !st.uppercase)}>AA</button>
          <button className={`chip ${st.shadow ? 'active' : ''}`} onClick={() => setStyle('shadow', !st.shadow)}>Sombra</button>
        </div>
        <div className="toggles">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} className={`chip ${st.align === a ? 'active' : ''}`} onClick={() => setStyle('align', a)}>
              {a === 'left' ? 'Esquerda' : a === 'center' ? 'Centro' : 'Direita'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Cores">
        <div className="row2">
          <label className="field"><span>Texto</span><input type="color" value={st.color} onChange={(e) => setStyle('color', e.target.value)} /></label>
          <label className="field"><span>Contorno</span><input type="color" value={st.strokeColor} onChange={(e) => setStyle('strokeColor', e.target.value)} /></label>
        </div>
        <Slider label="Contorno" value={st.strokeWidth} min={0} max={20} step={0.5} onChange={(v) => setStyle('strokeWidth', v)} format={(v) => v.toFixed(1)} />
        <label className="field inline">
          <input type="checkbox" checked={st.background !== null} onChange={(e) => setStyle('background', e.target.checked ? '#000000' : null)} />
          <span>Fundo</span>
          {st.background !== null && <input type="color" value={st.background} onChange={(e) => setStyle('background', e.target.value)} />}
        </label>
        {st.background !== null && (
          <Slider label="Opacidade" value={st.backgroundOpacity} min={0} max={1} step={0.01} onChange={(v) => setStyle('backgroundOpacity', v)} format={pct} />
        )}
      </Section>
      <Section title="Posição">
        <Slider label="X" value={clip.x} min={0} max={1} step={0.005} onChange={(v) => set({ x: v }, 'x')} format={pct} />
        <Slider label="Y" value={clip.y} min={0} max={1} step={0.005} onChange={(v) => set({ y: v }, 'y')} format={pct} />
        <Slider label="Largura máx." value={clip.maxWidth} min={0.2} max={1} step={0.01} onChange={(v) => set({ maxWidth: v }, 'maxWidth')} format={pct} />
      </Section>
      <Section title="Animação">
        <label className="field">
          <span>Entrada</span>
          <select value={clip.animIn} onChange={(e) => set({ animIn: e.target.value as TextAnimIn }, 'animIn')}>
            {ANIM_IN.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Saída</span>
          <select value={clip.animOut} onChange={(e) => set({ animOut: e.target.value as TextAnimOut }, 'animOut')}>
            {ANIM_OUT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
      </Section>
    </>
  )
}
