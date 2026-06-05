import { create } from "zustand";
import zh from "./zh.json";
import en from "./en.json";

export type Language = "zh" | "en";

const messages: Record<Language, Record<string, string>> = { zh, en };

interface I18nStore {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export const useI18n = create<I18nStore>((set, get) => ({
  lang: "zh",

  setLang: (lang) => set({ lang }),

  t: (key, params) => {
    const { lang } = get();
    const msg = messages[lang]?.[key] || messages["en"]?.[key] || key;
    if (!params) return msg;
    return msg.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
  },
}));

/** Hook for easy access: const t = useT() */
export function useT() {
  return useI18n((s) => s.t);
}
