import { useEffect, useState } from "react";
import { applyTheme, loadTheme, saveTheme, type Mode, type PaletteId } from "../lib/themes";

/** The chosen palette and light / dark mode. Both are applied to the page and remembered in this browser. */
export function useTheme() {
  const [choice, setChoice] = useState(loadTheme);

  useEffect(() => {
    applyTheme(document.documentElement, choice.palette, choice.mode);
    saveTheme(choice);
  }, [choice]);

  return {
    palette: choice.palette,
    mode: choice.mode,
    setPalette: (palette: PaletteId) => setChoice((c) => ({ ...c, palette })),
    setMode: (mode: Mode) => setChoice((c) => ({ ...c, mode })),
  };
}
