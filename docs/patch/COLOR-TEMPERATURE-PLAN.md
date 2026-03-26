# COLOR-TEMPERATURE-PLAN.md

## Opgave

Udvid `@webhouse/cms` theming-system med en **color temperature** dimension (cool/warm) som supplement til de eksisterende light/dark modes. Resultatet er **seks themes** total:

| | Neutral (eksisterende) | Cool | Warm |
|---|---|---|---|
| **Light** | `light` ✅ | `light-cool` | `light-warm` |
| **Dark** | `dark` ✅ | `dark-cool` | `dark-warm` |

De eksisterende `light` og `dark` themes bevares uændret som neutrale defaults. Temperature-varianterne tilføjes som nye theme-options.

## Kontekst

- Stack: Next.js, React 19, TypeScript, Tailwind CSS v4 (CSS-first config), shadcn/ui, next-themes
- Eksisterende dark mode via `next-themes` med `data-theme` attribut på `<html>`
- Tailwind v4 bruger CSS-first config (ingen `tailwind.config.js`)
- Color temperature modes er en 2026 UI-trend (Chrome 124, Fibery, elevated neutrals)

## Arkitektur

### Dobbelt-akse Theme Model

To uafhængige dimensioner styret via én combined `data-theme` attribut:

```
Brightness:   light | dark
Temperature:  (neutral) | cool | warm
```

`next-themes` håndterer én `data-theme` attribut med seks mulige værdier:

```
"light"       — eksisterende neutral light
"dark"        — eksisterende neutral dark
"light-cool"  — light med blågrå undertoner
"light-warm"  — light med sand/beige undertoner
"dark-cool"   — dark med kolde undertoner
"dark-warm"   — dark med varme undertoner
```

### Intern State Model

ThemeSwitcher komponenten splitter `data-theme` i to uafhængige controls:

```typescript
type Brightness = 'light' | 'dark';
type Temperature = 'neutral' | 'cool' | 'warm';

// Parse: "dark-warm" → { brightness: "dark", temperature: "warm" }
// Parse: "light"     → { brightness: "light", temperature: "neutral" }
// Compose: { brightness: "dark", temperature: "cool" } → "dark-cool"
// Compose: { brightness: "light", temperature: "neutral" } → "light"

function parseTheme(theme: string): { brightness: Brightness; temperature: Temperature } {
  if (theme === 'light' || theme === 'dark') {
    return { brightness: theme, temperature: 'neutral' };
  }
  const [brightness, temperature] = theme.split('-') as [Brightness, Temperature];
  return { brightness, temperature };
}

function composeTheme(brightness: Brightness, temperature: Temperature): string {
  if (temperature === 'neutral') return brightness;
  return `${brightness}-${temperature}`;
}
```

---

## Token Definitioner

### Fil: `app/styles/temperature-tokens.css`

De eksisterende `light` og `dark` tokens i `globals.css` forbliver UÆNDRET. Denne fil tilføjer KUN de fire nye temperature-varianter.

```css
/* ============================================
   COLOR TEMPERATURE TOKENS
   Supplement til eksisterende light/dark themes
   ============================================ */

/* === LIGHT COOL — Blågrå neutraler === */
/* Use case: Tech, SaaS, dashboards, data-heavy UI */
[data-theme="light-cool"] {
  /* Surfaces */
  --background:        240 6% 98%;      /* #F5F7FA */
  --card:              220 14% 95%;     /* #EDF1F7 */
  --muted:             220 13% 91%;     /* #E2E8F0 */
  --popover:           240 6% 98%;
  --secondary:         220 13% 91%;

  /* Text */
  --foreground:        220 30% 15%;     /* #1A2030 */
  --card-foreground:   220 30% 15%;
  --popover-foreground: 220 30% 15%;
  --muted-foreground:  220 10% 46%;     /* #6B7588 */
  --secondary-foreground: 220 30% 15%;

  /* Borders */
  --border:            220 13% 83%;     /* #CCD4E0 */
  --input:             220 13% 83%;
  --ring:              220 60% 50%;

  /* Accent — blå-tonet */
  --accent:            220 14% 95%;
  --accent-foreground: 220 30% 15%;
  --primary:           220 60% 50%;     /* Blå primary */
  --primary-foreground: 0 0% 100%;

  /* Semantic (arves typisk, men kan finjusteres) */
  --destructive:       0 72% 51%;
  --destructive-foreground: 0 0% 100%;

  /* Radius (uændret) */
  --radius: 0.5rem;

  /* Sidebar */
  --sidebar-background:   220 14% 95%;
  --sidebar-foreground:    220 30% 15%;
  --sidebar-border:        220 13% 83%;
  --sidebar-accent:        220 14% 91%;
  --sidebar-accent-foreground: 220 30% 15%;
  --sidebar-muted-foreground:  220 10% 46%;
}

/* === LIGHT WARM — Sand, beige, cream === */
/* Use case: Lifestyle, wellness, content, premium brands */
[data-theme="light-warm"] {
  /* Surfaces */
  --background:        36 50% 97%;      /* #FFFCF7 */
  --card:              33 33% 95%;      /* #FAF5ED */
  --muted:             33 25% 90%;      /* #F0E8DA */
  --popover:           36 50% 97%;
  --secondary:         33 25% 90%;

  /* Text */
  --foreground:        30 30% 13%;      /* #2D2518 */
  --card-foreground:   30 30% 13%;
  --popover-foreground: 30 30% 13%;
  --muted-foreground:  28 14% 46%;      /* #7A6E60 */
  --secondary-foreground: 30 30% 13%;

  /* Borders */
  --border:            30 22% 78%;      /* #D4C4A8 */
  --input:             30 22% 78%;
  --ring:              28 55% 45%;

  /* Accent — amber/bronze-tonet */
  --accent:            33 33% 95%;
  --accent-foreground: 30 30% 13%;
  --primary:           28 55% 45%;      /* Amber primary */
  --primary-foreground: 0 0% 100%;

  /* Semantic */
  --destructive:       0 72% 51%;
  --destructive-foreground: 0 0% 100%;

  --radius: 0.5rem;

  /* Sidebar */
  --sidebar-background:   33 33% 93%;
  --sidebar-foreground:    30 30% 13%;
  --sidebar-border:        30 22% 78%;
  --sidebar-accent:        33 25% 88%;
  --sidebar-accent-foreground: 30 30% 13%;
  --sidebar-muted-foreground:  28 14% 46%;
}

/* === DARK COOL — Kolde mørke toner === */
/* Use case: Klassisk mørk UI, IDE-lignende, natbrug */
[data-theme="dark-cool"] {
  /* Surfaces */
  --background:        220 25% 7%;      /* #0F1218 */
  --card:              220 18% 12%;     /* #181C24 */
  --muted:             220 15% 17%;     /* #242A34 */
  --popover:           220 18% 12%;
  --secondary:         220 15% 17%;

  /* Text */
  --foreground:        220 13% 91%;     /* #E2E6EE */
  --card-foreground:   220 13% 91%;
  --popover-foreground: 220 13% 91%;
  --muted-foreground:  220 10% 46%;     /* #6B7588 */
  --secondary-foreground: 220 13% 91%;

  /* Borders */
  --border:            220 13% 22%;     /* #2E3440 */
  --input:             220 13% 22%;
  --ring:              220 60% 60%;

  /* Accent */
  --accent:            220 15% 17%;
  --accent-foreground: 220 13% 91%;
  --primary:           220 60% 60%;     /* Blå primary, lysere til dark */
  --primary-foreground: 0 0% 100%;

  /* Semantic */
  --destructive:       0 63% 51%;
  --destructive-foreground: 0 0% 100%;

  --radius: 0.5rem;

  /* Sidebar */
  --sidebar-background:   220 18% 10%;
  --sidebar-foreground:    220 13% 91%;
  --sidebar-border:        220 13% 22%;
  --sidebar-accent:        220 15% 15%;
  --sidebar-accent-foreground: 220 13% 91%;
  --sidebar-muted-foreground:  220 10% 46%;
}

/* === DARK WARM — Varme mørke toner === */
/* Use case: Cozy dark, aftenslæsning, eye-friendly dark */
[data-theme="dark-warm"] {
  /* Surfaces */
  --background:        20 10% 7%;       /* #121010 */
  --card:              25 15% 11%;      /* #211D17 */
  --muted:             25 14% 15%;      /* #2E2720 */
  --popover:           25 15% 11%;
  --secondary:         25 14% 15%;

  /* Text */
  --foreground:        30 18% 87%;      /* #E8DFD2 */
  --card-foreground:   30 18% 87%;
  --popover-foreground: 30 18% 87%;
  --muted-foreground:  28 12% 42%;      /* #7A6E60 */
  --secondary-foreground: 30 18% 87%;

  /* Borders */
  --border:            28 14% 24%;      /* #3A3128 */
  --input:             28 14% 24%;
  --ring:              28 45% 55%;

  /* Accent — amber/bronze */
  --accent:            25 14% 15%;
  --accent-foreground: 30 18% 87%;
  --primary:           28 45% 55%;      /* Varm amber primary */
  --primary-foreground: 0 0% 100%;

  /* Semantic */
  --destructive:       0 63% 51%;
  --destructive-foreground: 0 0% 100%;

  --radius: 0.5rem;

  /* Sidebar */
  --sidebar-background:   25 15% 9%;
  --sidebar-foreground:    30 18% 87%;
  --sidebar-border:        28 14% 24%;
  --sidebar-accent:        25 14% 13%;
  --sidebar-accent-foreground: 30 18% 87%;
  --sidebar-muted-foreground:  28 12% 42%;
}
```

---

### Fil: `app/providers/theme-provider.tsx`

```tsx
import { ThemeProvider as NextThemesProvider } from 'next-themes';

const ALL_THEMES = [
  'light',        // Neutral light (eksisterende)
  'dark',         // Neutral dark (eksisterende)
  'light-cool',   // Blågrå neutraler
  'light-warm',   // Sand, beige, cream
  'dark-cool',    // Kolde mørke toner
  'dark-warm',    // Varme mørke toner
] as const;

export type ThemeValue = typeof ALL_THEMES[number];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      themes={[...ALL_THEMES]}
    >
      {children}
    </NextThemesProvider>
  );
}
```

---

### Fil: `lib/hooks/use-theme-axes.ts`

Custom hook der splitter theme-værdien i to uafhængige dimensioner:

```typescript
import { useTheme } from 'next-themes';

export type Brightness = 'light' | 'dark';
export type Temperature = 'neutral' | 'cool' | 'warm';

interface ThemeAxes {
  brightness: Brightness;
  temperature: Temperature;
  setBrightness: (b: Brightness) => void;
  setTemperature: (t: Temperature) => void;
  resolvedTheme: string;
}

function parseTheme(theme: string): { brightness: Brightness; temperature: Temperature } {
  if (theme === 'light' || theme === 'dark') {
    return { brightness: theme, temperature: 'neutral' };
  }
  const parts = theme.split('-');
  return {
    brightness: parts[0] as Brightness,
    temperature: parts[1] as Temperature,
  };
}

function composeTheme(brightness: Brightness, temperature: Temperature): string {
  if (temperature === 'neutral') return brightness;
  return `${brightness}-${temperature}`;
}

export function useThemeAxes(): ThemeAxes {
  const { theme, setTheme } = useTheme();
  const { brightness, temperature } = parseTheme(theme ?? 'light');

  return {
    brightness,
    temperature,
    setBrightness: (b: Brightness) => setTheme(composeTheme(b, temperature)),
    setTemperature: (t: Temperature) => setTheme(composeTheme(brightness, t)),
    resolvedTheme: theme ?? 'light',
  };
}
```

---

### Fil: `components/ui/theme-switcher.tsx`

Dual-axis theme switcher med to uafhængige controls:

```tsx
'use client';

import { useThemeAxes, type Temperature } from '@/lib/hooks/use-theme-axes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TEMP_OPTIONS: { value: Temperature; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'cool',    label: 'Cool' },
  { value: 'warm',    label: 'Warm' },
];

export function ThemeSwitcher() {
  const { brightness, temperature, setBrightness, setTemperature } = useThemeAxes();

  return (
    <div className="flex items-center gap-3">
      {/* Brightness toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setBrightness(brightness === 'light' ? 'dark' : 'light')}
        aria-label={`Switch to ${brightness === 'light' ? 'dark' : 'light'} mode`}
      >
        {brightness === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>

      {/* Temperature selector — segmented control */}
      <div className="flex rounded-lg border p-0.5 gap-0.5">
        {TEMP_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTemperature(value)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md transition-colors',
              temperature === value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label={`${label} color temperature`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Ændringer til eksisterende filer

### `app/globals.css`

Tilføj import øverst (EFTER eksisterende token definitioner):

```css
@import './styles/temperature-tokens.css';
```

Eksisterende `:root` / `[data-theme="light"]` / `[data-theme="dark"]` blokke FORBLIVER UÆNDRET.

### `app/layout.tsx`

Ingen ændring nødvendig — `temperature-tokens.css` importeres via `globals.css`.

ThemeProvider ændringen håndterer de nye theme-værdier automatisk.

---

## System Preference Håndtering

`next-themes` understøtter `enableSystem` — men med seks themes kan vi ikke direkte mappe system preference. Strategien:

1. `enableSystem={false}` i ThemeProvider (vi styrer det selv)
2. Ved første besøg: læs `prefers-color-scheme` via `matchMedia`
3. Map til `light` eller `dark` (neutral) som default
4. Når bruger vælger temperature, gem som præference
5. Ved fremtidige besøg: brug gemt præference

Alternativt kan vi tilføje en "System" option i brightness-toggle der følger OS, mens temperature-valget bevares uafhængigt.

---

## Filer — Oversigt

| Fil | Handling | Beskrivelse |
|-----|---------|-------------|
| `app/styles/temperature-tokens.css` | **NY** | Fire temperature-variant token blokke |
| `app/providers/theme-provider.tsx` | **ÆNDRE** | Udvid themes array til seks værdier |
| `lib/hooks/use-theme-axes.ts` | **NY** | Hook der splitter theme i brightness + temperature |
| `components/ui/theme-switcher.tsx` | **NY** | Dual-axis toggle komponent |
| `app/globals.css` | **ÆNDRE** | Tilføj import af temperature-tokens.css |

## Acceptkriterier

- [ ] Eksisterende `light` og `dark` themes virker UÆNDRET (ingen regression)
- [ ] Fire nye themes virker: `light-cool`, `light-warm`, `dark-cool`, `dark-warm`
- [ ] Brightness og temperature kan toggles uafhængigt
- [ ] Alle shadcn/ui komponenter respekterer temperature tokens korrekt
- [ ] Theme skift er instant (ingen flash/flicker — next-themes håndterer dette)
- [ ] Præference persisteres i localStorage
- [ ] Contrast ratios overholder WCAG 2.1 AA i alle seks modes:
  - Body text: ≥ 4.5:1
  - Large text / UI components: ≥ 3:1
- [ ] ThemeSwitcher viser klar visuel indikation af begge dimensioner
- [ ] Ingen ændringer til eksisterende `light`/`dark` token definitioner

## Implementeringsrækkefølge

1. Opret `temperature-tokens.css` med alle fire blokke
2. Opdater `ThemeProvider` med seks themes
3. Opret `use-theme-axes` hook
4. Opret `ThemeSwitcher` komponent
5. Tilføj import i `globals.css`
6. Test alle seks themes manuelt i browser
7. Kør WCAG contrast check på alle varianter

## Fremtidige udvidelser (v2)

- **Auto-warm**: Skift automatisk til warm temperature om aftenen (baseret på tidspunkt)
- **Per-section temperature**: Tillad at individuelle sektioner/blokke overrider temperature
- **Bruger custom hue**: Lad brugeren vælge en custom accent-hue per temperature
- **High contrast varianter**: Tilføj `light-contrast` / `dark-contrast` som yderligere modes
- **System color-temperature**: Respekter eventuel fremtidig `prefers-color-temperature` media query
