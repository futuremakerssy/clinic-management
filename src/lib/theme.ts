export type Theme = "light" | "dark"

export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem("clinic_theme")
    if (saved === "light" || saved === "dark") {
      return saved
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark"
    }
  } catch {}
  return "light"
}

export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem("clinic_theme", theme)
  } catch {}

  if (typeof document !== "undefined") {
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }
}
