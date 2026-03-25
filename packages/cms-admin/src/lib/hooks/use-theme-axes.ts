import { useTheme } from "next-themes";

export type Brightness = "light" | "dark" | "system";
export type Temperature = "neutral" | "cool" | "warm";

interface ThemeAxes {
  /** The raw brightness axis: "light", "dark", or "system" */
  brightness: Brightness;
  /** The temperature axis: "neutral", "cool", or "warm" */
  temperature: Temperature;
  setBrightness: (b: Brightness) => void;
  setTemperature: (t: Temperature) => void;
  /** The raw theme string from next-themes */
  rawTheme: string;
  /** The resolved theme after system preference (never "system") */
  resolvedTheme: string;
  /** True when the resolved brightness is light */
  isLight: boolean;
}

function parseTheme(theme: string): { brightness: Brightness; temperature: Temperature } {
  if (theme === "system") return { brightness: "system", temperature: "neutral" };
  if (theme === "light" || theme === "dark") return { brightness: theme, temperature: "neutral" };
  const dash = theme.indexOf("-");
  if (dash === -1) return { brightness: "dark", temperature: "neutral" };
  return {
    brightness: theme.slice(0, dash) as "light" | "dark",
    temperature: theme.slice(dash + 1) as Temperature,
  };
}

function composeTheme(brightness: Brightness, temperature: Temperature): string {
  // System mode ignores temperature — next-themes resolves to light/dark
  if (brightness === "system") return "system";
  if (temperature === "neutral") return brightness;
  return `${brightness}-${temperature}`;
}

export function useThemeAxes(): ThemeAxes {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { brightness, temperature } = parseTheme(theme ?? "system");

  return {
    brightness,
    temperature,
    setBrightness: (b: Brightness) => setTheme(composeTheme(b, temperature)),
    setTemperature: (t: Temperature) => setTheme(composeTheme(brightness, t)),
    rawTheme: theme ?? "system",
    resolvedTheme: resolvedTheme ?? "dark",
    isLight: (resolvedTheme ?? "dark").startsWith("light"),
  };
}
