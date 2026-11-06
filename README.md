# Quadro

Editor de vídeo desktop para macOS (Electron + React + TypeScript), com timeline multitrilha, texto animado, transições, filtros e legendas automáticas geradas localmente com Whisper.

## Recursos

- **Mídia:** importa vídeo, áudio e imagem pelo botão ou arrastando arquivos para a janela. Formatos que o Chromium não reproduz (ProRes, AIFF, H.264 10-bit, HEIC…) são convertidos automaticamente em um proxy.
- **Timeline:** várias trilhas de vídeo, áudio e texto; mover entre trilhas; aparar pelas bordas; dividir (`S`); duplicar (`⌘D`); apagar; encaixe magnético; zoom; desfazer/refazer.
- **Clipes:** velocidade de 0,25× a 4×, volume, fade de áudio, escala, posição, rotação e opacidade.
- **Cor:** 10 filtros prontos e ajustes manuais (brilho, contraste, saturação, matiz, sépia, P&B, desfoque).
- **Transições:** dissolver, fade preto, deslizar, cortina, zoom, círculo e desfoque.
- **Texto:** presets, 17 fontes do sistema, contorno, fundo, sombra e animações de entrada e saída (incluindo máquina de escrever).
- **Legendas automáticas:** transcreve o áudio da timeline com Whisper (tiny/base/small) em CPU, no próprio computador, e cria uma trilha "Legendas" editável.
- **Exportação:** MP4 H.264 + AAC em 720p, 1080p ou 4K, de 24 a 60 fps. Os quadros saem do mesmo compositor do preview, então o que você vê é o que é exportado.
- **Projetos:** salvar e abrir arquivos `.quadro` (JSON que referencia as mídias originais).

## Rodando

```bash
npm ci            # se o npm bloquear scripts de instalação: npm install-scripts approve <pacote>
npm run dev       # modo desenvolvimento
npm run build     # build de produção em out/
npm run typecheck
npm run test:e2e  # build + testes Playwright no app Electron real
```

Os testes de ponta a ponta (`tests/editor.spec.ts`) geram mídias de teste com FFmpeg e `say`, abrem o app e o operam como um usuário: importam arquivos, arrastam e aparam clipes, usam atalhos, reproduzem, salvam/abrem, exportam e geram legendas. Os diálogos nativos de arquivo são simulados.

Requisitos: Node.js 22 ou mais recente. O FFmpeg e o FFprobe vêm dos pacotes `ffmpeg-static` e `ffprobe-static`. O modelo do Whisper é baixado do Hugging Face na primeira transcrição e fica em `~/Library/Application Support/quadro/models`.

## Arquitetura

| Camada | Arquivos | Papel |
|---|---|---|
| Modelo | `src/shared/types.ts` | Projeto, trilhas, clipes e assets |
| Processo principal | `src/main/` | Protocolo `media://` com suporte a Range, importação/proxy/miniaturas (`media.ts`), mixagem de áudio em ffmpeg (`audioGraph.ts`), codificação (`exporter.ts`) e Whisper em `worker_thread` (`transcribe.ts`, `whisperWorker.ts`) |
| Interface | `src/renderer/src/` | Estado em zustand (`store.ts`), compositor em canvas 2D (`compositor.ts`) compartilhado entre o preview (`engine.ts`) e a exportação (`exporter.ts`), componentes em `components/` |

## Limitações conhecidas

- A exportação busca quadro a quadro em elementos `<video>`. Funciona e é fiel ao preview, mas é mais lenta que um pipeline nativo: cerca de 27 s para 16 s de vídeo 720p num M1.
- No preview o volume vai até 100%, porque é o limite de `HTMLMediaElement`.
- Os tempos das legendas vêm dos segmentos do Whisper e são divididos proporcionalmente ao número de caracteres. Não há alinhamento por palavra.
- Ainda não há empacotamento `.app`/`.dmg`, keyframes, chroma key, remoção de fundo nem stickers.
