import type { FocusScope } from '../editor/focus'

export type ThemeChoice = 'light' | 'sepia' | 'dark' | 'black' | 'system'

export interface Settings {
  fontSize: number
  fontFamily: FontChoice
  theme: ThemeChoice
  /** Render markdown inline while typing. Off gives a totally uniform page. */
  liveMarkdown: boolean
  focusScope: FocusScope
  typewriter: boolean
  /** Backspace disabled — the text can only grow. */
  hardcore: boolean
  /** Width of the writing column in pixels. */
  measure: number
  lineHeight: number
  /** Countdown length in minutes. */
  timerMinutes: number
  /** Session word goal; 0 disables it. */
  goalWords: number
  sidebarOpen: boolean
}

/**
 * Every font the app can render, all of them faces macOS ships. Nothing is
 * bundled: the system faces render and kern best in WKWebView, and the app
 * carries no font files at all.
 *
 * Keyed rather than free-form strings on purpose: a stored setting is
 * validated with `value in FONT_STACKS`, so a font that no longer exists here
 * (the bundled Lato and display faces that used to ship) falls back to the
 * default instead of writing an unknown family into the CSS.
 */
export const FONT_STACKS = {
  system: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
  // New York, the system serif.
  serif: "ui-serif, 'New York', Georgia, serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",

  georgia: "Georgia, serif",
  baskerville: "Baskerville, Georgia, serif",
  palatino: "Palatino, Georgia, serif",
  iowan: "'Iowan Old Style', Palatino, Georgia, serif",
  charter: "Charter, Georgia, serif",
  hoefler: "'Hoefler Text', Georgia, serif",
  cochin: "Cochin, Georgia, serif",
  didot: "Didot, Georgia, serif",
  times: "'Times New Roman', Times, serif",
  typewriter: "'American Typewriter', Courier, monospace",
  rockwell: "Rockwell, Georgia, serif",
  optima: "Optima, sans-serif",
  futura: "Futura, sans-serif",
  avenir: "'Avenir Next', Avenir, sans-serif",
  gillsans: "'Gill Sans', sans-serif",
  helvetica: "'Helvetica Neue', Helvetica, sans-serif",
  courier: "'Courier New', Courier, monospace",
} as const satisfies Record<string, string>

export type FontChoice = keyof typeof FONT_STACKS

export const FONT_LABELS: Record<FontChoice, string> = {
  system: 'System',
  serif: 'Serif',
  mono: 'Mono',
  georgia: 'Georgia',
  baskerville: 'Baskerville',
  palatino: 'Palatino',
  iowan: 'Iowan Old Style',
  charter: 'Charter',
  hoefler: 'Hoefler Text',
  cochin: 'Cochin',
  didot: 'Didot',
  times: 'Times New Roman',
  typewriter: 'American Typewriter',
  rockwell: 'Rockwell',
  optima: 'Optima',
  futura: 'Futura',
  avenir: 'Avenir',
  gillsans: 'Gill Sans',
  helvetica: 'Helvetica',
  courier: 'Courier',
}

/** The three the menu lists first. */
export const BAR_FONTS: FontChoice[] = ['system', 'serif', 'mono']

export const ALL_FONTS = Object.keys(FONT_STACKS) as FontChoice[]

// --- Random -----------------------------------------------------------------

/** Two probes: two fonts sharing one width rarely share both. */
const PROBES = ['mmmwwwiiil0OQ gjpqy', 'The quick brown fox, 1234567890']

let cachedCandidates: FontChoice[] | null = null


/**
 * The fonts this machine can actually render, one per distinct face.
 *
 * `document.fonts.check` cannot answer this: it accounts for fallback and so
 * says yes to families that are not installed. Measuring can. A family that is
 * missing renders as whatever generic it falls back to and therefore measures
 * exactly like that generic, while an installed family almost never matches
 * all three generics at once.
 *
 * The second pass drops duplicates, so Random never "changes" the font
 * without changing a pixel, which would read as a broken button.
 */
export async function randomCandidates(): Promise<FontChoice[]> {
  if (cachedCandidates) return cachedCandidates

  const context =
    typeof document === 'undefined'
      ? null
      : document.createElement('canvas').getContext('2d')
  if (!context) return (cachedCandidates = BAR_FONTS)

  const widths = (family: string) =>
    PROBES.map((probe) => {
      context.font = `72px ${family}`
      return Math.round(context.measureText(probe).width)
    })

  const generics = ['monospace', 'serif', 'sans-serif']
  const genericWidths = generics.map(widths)

  const seen = new Set<string>()
  const pool: FontChoice[] = []

  for (const font of ALL_FONTS) {
    const stack = FONT_STACKS[font]
    const installed = generics.every((generic, index) => {
      const fallback = genericWidths[index]
      const measured = widths(`${stack}, ${generic}`)
      return measured.some((value, probe) => value !== fallback?.[probe])
    })
    if (!installed) continue

    const signature = widths(stack).join(':')
    if (seen.has(signature)) continue
    seen.add(signature)
    pool.push(font)
  }

  // A machine with almost nothing installed must still have a working button.
  cachedCandidates = pool.length > 1 ? pool : BAR_FONTS
  return cachedCandidates
}

/**
 * Never a no-op: picking the font already showing would read as a dead button,
 * so the current one is excluded before the draw.
 */
export function pickRandomFont(
  current: FontChoice,
  candidates: FontChoice[],
  random: () => number = Math.random,
): FontChoice {
  const others = candidates.filter((font) => font !== current)
  if (others.length === 0) return current
  const index = Math.min(others.length - 1, Math.floor(random() * others.length))
  return others[index] ?? current
}

/** Cycled by clicking the size control, matching the original's stepping. */
export const FONT_SIZES = [16, 18, 20, 22, 24, 26, 28] as const

/**
 * The order the theme control walks, and now the Format menu too. Excludes
 * `system`, which is a preference rather than a stop on the round trip.
 */
export const THEME_CYCLE = ['light', 'sepia', 'dark', 'black'] as const

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 18,
  fontFamily: 'system',
  theme: 'light',
  liveMarkdown: true,
  focusScope: 'off',
  typewriter: false,
  hardcore: false,
  measure: 700,
  lineHeight: 1.6,
  timerMinutes: 15,
  goalWords: 0,
  sidebarOpen: true,
}

/**
 * On a phone the sidebar is an overlay covering the canvas, so opening there by
 * default would hide the writing surface on first launch. Only applies when
 * nothing has been stored yet; an explicit choice always wins.
 */
function defaultSidebarOpen(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerWidth > 720
}

const STORAGE_KEY = 'blank.settings.v1'

function isFontChoice(value: unknown): value is FontChoice {
  return typeof value === 'string' && value in FONT_STACKS
}

function isThemeChoice(value: unknown): value is ThemeChoice {
  return (
    value === 'light' ||
    value === 'sepia' ||
    value === 'dark' ||
    value === 'black' ||
    value === 'system'
  )
}

function isFocusScope(value: unknown): value is FocusScope {
  return value === 'off' || value === 'sentence' || value === 'paragraph' || value === 'line'
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/**
 * The default leading tightened from 1.7 to 1.6, and settings persist
 * wholesale, so every earlier install has the literal 1.7 stored without ever
 * having chosen it — no UI edits this field. Treat that one value as "the old
 * default" and move it forward; anything else was set by hand and is kept.
 */
function coerceLineHeight(value: unknown, fallback: number): number {
  if (value === 1.7) return fallback
  return clamp(value as number, 1.2, 2.6, fallback)
}

/**
 * Settings come from disk and may be stale, hand-edited, or from a newer
 * version. Validate every field rather than trusting the blob, so one bad
 * value can't leave the app unusable with no way to fix it from the UI.
 */
export function coerceSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const input = raw as Partial<Record<keyof Settings, unknown>>
  const d = DEFAULT_SETTINGS

  return {
    fontSize: clamp(input.fontSize as number, 12, 48, d.fontSize),
    fontFamily: isFontChoice(input.fontFamily) ? input.fontFamily : d.fontFamily,
    theme: isThemeChoice(input.theme) ? input.theme : d.theme,
    liveMarkdown: typeof input.liveMarkdown === 'boolean' ? input.liveMarkdown : d.liveMarkdown,
    focusScope: isFocusScope(input.focusScope) ? input.focusScope : d.focusScope,
    typewriter: typeof input.typewriter === 'boolean' ? input.typewriter : d.typewriter,
    hardcore: typeof input.hardcore === 'boolean' ? input.hardcore : d.hardcore,
    measure: clamp(input.measure as number, 380, 1400, d.measure),
    lineHeight: coerceLineHeight(input.lineHeight, d.lineHeight),
    timerMinutes: clamp(input.timerMinutes as number, 1, 180, d.timerMinutes),
    goalWords: clamp(input.goalWords as number, 0, 100_000, d.goalWords),
    sidebarOpen: typeof input.sidebarOpen === 'boolean' ? input.sidebarOpen : d.sidebarOpen,
  }
}

export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return { ...DEFAULT_SETTINGS, sidebarOpen: defaultSidebarOpen() }
    }
    return coerceSettings(JSON.parse(stored))
  } catch {
    return { ...DEFAULT_SETTINGS, sidebarOpen: defaultSidebarOpen() }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Private browsing or a full quota. Losing preferences is survivable;
    // losing the user's text is not, so this must never throw.
  }
}

/** Resolve `system` against the OS preference. */
export function effectiveTheme(theme: ThemeChoice): Exclude<ThemeChoice, 'system'> {
  if (theme !== 'system') return theme
  const prefersDark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

/** Push settings into the CSS custom properties the whole UI reads. */
export function applySettingsToDocument(settings: Settings): void {
  const root = document.documentElement
  root.style.setProperty('--blank-font', FONT_STACKS[settings.fontFamily])
  root.style.setProperty('--blank-font-size', `${settings.fontSize}px`)
  root.style.setProperty('--blank-line-height', String(settings.lineHeight))
  root.style.setProperty('--blank-measure', `${settings.measure}px`)
  root.dataset['theme'] = effectiveTheme(settings.theme)

  // The meta tag is static markup, so without this the phone's status bar and
  // address bar stayed the light theme's white behind a black canvas. Read the
  // resolved token rather than repeating the palette: one source of truth.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const background = getComputedStyle(root).getPropertyValue('--blank-bg').trim()
    if (background) meta.setAttribute('content', background)
  }
}
