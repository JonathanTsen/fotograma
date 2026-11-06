import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * Testes de ponta a ponta no app Electron real, operado como um usuário:
 * cliques, arrastes, teclado, reprodução, salvar/abrir, exportar e legendas.
 */

const ROOT = resolve(__dirname, '..')
const FFMPEG = ffmpegPath as unknown as string
const PPS = 60 // zoom padrão da timeline (px por segundo)

let app: ElectronApplication
let page: Page
let dir: string
const errors: string[] = []

interface ClipInfo { id: string; type: string; start: number; duration: number; transition: string; label: string }

test.describe.configure({ mode: 'serial' })

function ff(args: string[]): void {
  execFileSync(FFMPEG, ['-v', 'error', '-y', ...args])
}

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fotograma-e2e-'))
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'clipA.mp4')])
  ff(['-f', 'lavfi', '-i', 'mandelbrot=size=1280x720:rate=30', '-t', '5', '-c:v', 'prores_ks', '-an', join(dir, 'clipB.mov')])
  ff(['-f', 'lavfi', '-i', 'gradients=size=1080x1080:duration=1', '-frames:v', '1', join(dir, 'photo.png')])
  execFileSync('say', ['-v', 'Luciana', '-o', join(dir, 'fala.aiff'),
    'Olá, este é um teste de legendas automáticas. O editor transcreve a fala diretamente no computador.'])

  app = await electron.launch({ args: [ROOT], cwd: ROOT })
  page = await app.firstWindow()
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.waitForSelector('.topbar')
})

test.afterAll(async () => {
  await app?.close()
})

async function mockOpenDialog(paths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths })) as typeof dialog.showOpenDialog
  }, paths)
}

async function mockSaveDialog(path: string): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath })) as typeof dialog.showSaveDialog
  }, path)
}

/** Clipes por trilha, na ordem exibida. */
async function lanes(): Promise<{ kind: string; clips: ClipInfo[] }[]> {
  return page.$$eval('.tl-row', (rows) =>
    rows.map((row) => ({
      kind: [...row.classList].find((c) => c.startsWith('kind-'))!.slice(5),
      clips: [...row.querySelectorAll<HTMLElement>('.clip')].map((c) => ({
        id: c.dataset.clipId!,
        type: c.dataset.type!,
        start: Number(c.dataset.start),
        duration: Number(c.dataset.duration),
        transition: c.dataset.transition ?? '',
        label: c.querySelector('.clip-label')?.textContent ?? ''
      }))
    }))
  )
}

async function lane(kind: string, index = 0): Promise<ClipInfo[]> {
  return (await lanes()).filter((l) => l.kind === kind)[index]?.clips ?? []
}

async function timecode(): Promise<number> {
  const text = (await page.locator('.timecode').innerText()).split('/')[0].trim()
  const [m, s, f] = text.split(':').map(Number)
  return m * 60 + s + f / 30
}

async function clickRulerAt(seconds: number): Promise<void> {
  const box = (await page.locator('.tl-ruler').boundingBox())!
  await page.mouse.click(box.x + seconds * PPS, box.y + box.height / 2)
}

async function dragBy(x0: number, y0: number, dx: number, dy = 0): Promise<void> {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + dx / 2, y0 + dy / 2, { steps: 6 })
  await page.mouse.move(x0 + dx, y0 + dy, { steps: 6 })
  await page.mouse.up()
}

const clipEl = (id: string) => page.locator(`.clip[data-clip-id="${id}"]`)

test('importa vídeo, ProRes, imagem e AIFF pelo botão Importar', async () => {
  await mockOpenDialog(['clipA.mp4', 'clipB.mov', 'photo.png', 'fala.aiff'].map((f) => join(dir, f)))
  await page.getByRole('button', { name: 'Importar mídia' }).click()
  await expect(page.locator('.asset')).toHaveCount(4, { timeout: 120_000 })
  await expect(page.locator('.import-row')).toHaveCount(0)
})

test('adiciona um clipe pelo botão + do asset', async () => {
  const card = page.locator('.asset', { hasText: 'clipA.mp4' })
  await card.hover()
  await card.locator('.asset-add').click()
  const clips = await lane('video')
  expect(clips).toHaveLength(1)
  expect(clips[0].start).toBe(0)
  expect(clips[0].duration).toBeCloseTo(6, 2)
})

test('arrasta um asset da biblioteca para a timeline', async () => {
  const target = page.locator('.tl-row.kind-video .tl-lane').first()
  const box = (await target.boundingBox())!
  await page.locator('.asset', { hasText: 'clipB.mov' }).dragTo(target, { targetPosition: { x: 8 * PPS, y: box.height / 2 } })
  const clips = await lane('video')
  expect(clips).toHaveLength(2)
  expect(clips[1].start).toBeCloseTo(8, 1)
  expect(clips[1].duration).toBeCloseTo(5, 2)
})

test('move um clipe com o mouse e ele encaixa no fim do anterior', async () => {
  const b = (await lane('video'))[1]
  const box = (await clipEl(b.id).boundingBox())!
  // Solta em ~6,1 s; o encaixe magnético deve levar para exatamente 6 s.
  await dragBy(box.x + box.width / 2, box.y + box.height / 2, -(b.start - 6.1) * PPS)
  const moved = (await lane('video'))[1]
  expect(moved.start).toBeCloseTo(6, 3)
})

test('apara as bordas direita e esquerda pelas alças', async () => {
  const b = (await lane('video'))[1]
  let box = (await clipEl(b.id).boundingBox())!
  await dragBy(box.x + box.width - 3, box.y + box.height / 2, -1 * PPS)
  let now = (await lane('video'))[1]
  expect(now.start).toBeCloseTo(6, 3)
  expect(now.duration).toBeCloseTo(4, 1)

  box = (await clipEl(b.id).boundingBox())!
  await dragBy(box.x + 3, box.y + box.height / 2, 0.5 * PPS)
  now = (await lane('video'))[1]
  expect(now.start).toBeCloseTo(6.5, 1)
  expect(now.duration).toBeCloseTo(3.5, 1)
})

test('desfaz e refaz com ⌘Z e ⇧⌘Z', async () => {
  await page.keyboard.press('Meta+z')
  expect((await lane('video'))[1].duration).toBeCloseTo(4, 1)
  await page.keyboard.press('Meta+z')
  expect((await lane('video'))[1].duration).toBeCloseTo(5, 1)
  await page.keyboard.press('Shift+Meta+z')
  expect((await lane('video'))[1].duration).toBeCloseTo(4, 1)
})

test('divide no cursor com S e apaga com Backspace', async () => {
  await page.keyboard.press('Escape')
  await clickRulerAt(2)
  expect(await timecode()).toBeCloseTo(2, 1)
  await page.keyboard.press('s')
  let clips = await lane('video')
  expect(clips).toHaveLength(3)
  expect(clips[0].duration).toBeCloseTo(2, 1)
  expect(clips[1].start).toBeCloseTo(2, 1)

  await clipEl(clips[1].id).click()
  await page.keyboard.press('Backspace')
  clips = await lane('video')
  expect(clips).toHaveLength(2)

  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Meta+z')
  expect(await lane('video')).toHaveLength(2)
  expect((await lane('video'))[0].duration).toBeCloseTo(6, 1)
})

test('reproduz em tempo real com vídeo sincronizado e pausa com Espaço', async () => {
  await page.keyboard.press('Escape')
  await clickRulerAt(0.5)
  await page.locator('.icon-btn.play').click()
  await page.waitForTimeout(2000)
  const sample = await page.evaluate(() => {
    const tc = document.querySelector('.timecode')!.textContent!.split('/')[0].trim().split(':').map(Number)
    const t = tc[0] * 60 + tc[1] + tc[2] / 30
    const playing = [...document.querySelectorAll<HTMLVideoElement>('.media-host video')].filter((v) => !v.paused)
    return { t, playing: playing.map((v) => v.currentTime) }
  })
  expect(sample.t).toBeGreaterThan(2.0)
  expect(sample.t).toBeLessThan(3.0)
  expect(sample.playing).toHaveLength(1)
  // O clipe A começa em 0 com inPoint 0: tempo do vídeo ≈ tempo da timeline.
  expect(Math.abs(sample.playing[0] - sample.t)).toBeLessThan(0.3)

  await page.keyboard.press('Space')
  const paused = await timecode()
  await page.waitForTimeout(600)
  expect(await timecode()).toBeCloseTo(paused, 2)
})

test('adiciona e edita um texto', async () => {
  await clickRulerAt(1)
  await page.locator('.side-tabs button', { hasText: 'Texto' }).click()
  await page.getByRole('button', { name: 'Título', exact: true }).click()
  expect(await lane('text')).toHaveLength(1)
  await page.locator('.inspector textarea').fill('Olá Fotograma')
  expect((await lane('text'))[0].label).toContain('Olá Fotograma')
})

test('aplica transição e filtro ao clipe selecionado', async () => {
  const b = (await lane('video'))[1]
  await clipEl(b.id).click()
  await page.locator('.side-tabs button', { hasText: 'Transições' }).click()
  await page.locator('.chip', { hasText: 'Círculo' }).click()
  expect((await lane('video'))[1].transition).toBe('circle')

  await page.locator('.side-tabs button', { hasText: 'Filtros' }).click()
  await page.locator('.filter-card', { hasText: 'P&B' }).click()
  await expect(page.locator('.filter-card.active')).toHaveText('P&B')
  await expect(page.locator('.slider', { hasText: 'P&B' }).locator('.slider-value')).toHaveText('100%')
})

test('adiciona áudio, salva, cria novo projeto e reabre', async () => {
  await page.keyboard.press('Escape')
  await clickRulerAt(0.5)
  await page.locator('.side-tabs button', { hasText: 'Mídia' }).click()
  const card = page.locator('.asset', { hasText: 'fala.aiff' })
  await card.hover()
  await card.locator('.asset-add').click()
  expect(await lane('audio')).toHaveLength(1)

  const before = await lanes()
  const projectPath = join(dir, 'teste.fotograma')
  await mockSaveDialog(projectPath)
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.locator('.project-name')).toHaveText('teste')
  expect(existsSync(projectPath)).toBe(true)
  expect(JSON.parse(readFileSync(projectPath, 'utf8')).app).toBe('fotograma')

  await page.getByRole('button', { name: 'Novo' }).click()
  expect(await lane('video')).toHaveLength(0)

  await mockOpenDialog([projectPath])
  await page.getByRole('button', { name: 'Abrir' }).click()
  await expect(page.locator('.project-name')).toHaveText('teste')
  const after = await lanes()
  expect(after.map((l) => l.clips.map((c) => [c.type, c.start, c.duration]))).toEqual(
    before.map((l) => l.clips.map((c) => [c.type, c.start, c.duration]))
  )
})

test('exporta MP4 pela janela de exportação', async () => {
  const out = join(dir, 'saida.mp4')
  await mockSaveDialog(out)
  await page.getByRole('button', { name: 'Exportar' }).click()
  await page.locator('.modal select').first().selectOption('720')
  await page.getByRole('button', { name: /Escolher destino e exportar/ }).click()
  await expect(page.getByText('Exportação concluída.')).toBeVisible({ timeout: 240_000 })
  const info = JSON.parse(
    execFileSync(ffprobeStatic.path, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', '-count_frames', out]).toString()
  ) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number; nb_read_frames?: string }[]; format: { duration: string } }
  const v = info.streams.find((x) => x.codec_type === 'video')!
  const a = info.streams.find((x) => x.codec_type === 'audio')!
  expect(v.codec_name).toBe('h264')
  expect([v.width, v.height]).toEqual([1280, 720])
  expect(a.codec_name).toBe('aac')
  const duration = Math.max(...(await lanes()).flatMap((l) => l.clips.map((c) => c.start + c.duration)))
  expect(Number(info.format.duration)).toBeCloseTo(duration, 1)
  expect(Number(v.nb_read_frames)).toBe(Math.ceil(duration * 30))
  await page.getByRole('button', { name: 'Fechar' }).click()
})

test('gera legendas automáticas pelo painel Legendas', async () => {
  await page.locator('.side-tabs button', { hasText: 'Legendas' }).click()
  await page.getByRole('button', { name: 'Gerar legendas' }).click()
  await expect(page.getByText(/legendas adicionadas/)).toBeVisible({ timeout: 280_000 })
  const captions = (await lanes()).find((l) => l.clips.some((c) => c.type === 'text') && l.clips.length > 1)!
  const text = captions.clips.map((c) => c.label).join(' ').toLowerCase()
  expect(text).toContain('teste')
  expect(text).toContain('computador')
})

test('nenhum erro no console durante a sessão', async () => {
  expect(errors).toEqual([])
})
