const PATHS = {
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  start: 'M6 5h2v14H6zM9.5 12 19 5v14z',
  end: 'M16 5h2v14h-2zM5 5l9.5 7L5 19z',
  split: 'M12 3v18M7 8l-3 4 3 4M17 8l3 4-3 4',
  trash: 'M5 7h14M10 4h4M7 7l1 13h8l1-13',
  undo: 'M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  eyeOff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6M6.5 7.6C3.8 9.3 2 12 2 12s3.5 6 10 6a9.6 9.6 0 0 0 4-.9',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z',
  media: 'M4 5h16v14H4zM10 9v6l5-3z',
  text: 'M5 6h14M12 6v13M9 19h6',
  transition: 'M4 6h7v12H4zM13 6h7v12h-7zM9 12h6',
  filter: 'M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM8 10a6 6 0 1 0 8 0',
  captions: 'M3 6h18v12H3zM7 11h3M7 14h6M13 11h4M15 14h2',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  folder: 'M3 7h6l2 2h10v10H3z',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  zoomIn: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5M10 7v6M7 10h6',
  zoomOut: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5M7 10h6',
  close: 'M6 6l12 12M18 6 6 18',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): React.JSX.Element {
  const filled = name === 'play' || name === 'pause' || name === 'start' || name === 'end'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
