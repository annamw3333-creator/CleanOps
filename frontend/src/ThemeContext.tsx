import React, { createContext, useContext, useState } from "react";
import { colors } from "@/src/theme";

const DEFAULT_ACCENT = "#1A5F7A";

const Ctx = createContext<{ accent: string; setAccent: (c: string) => void }>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
});

export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState(DEFAULT_ACCENT);
  const setAccent = (c?: string) => {
    const v = c || DEFAULT_ACCENT;
    if (v === accent) return;
    // Mutate the shared brand token so every inline `colors.brand` read picks it up
    // on the next render. Components are remounted via the `key={accent}` shell.
    (colors as any).brand = v;
    setAccentState(v);
  };
  return <Ctx.Provider value={{ accent, setAccent }}>{children}</Ctx.Provider>;
}
