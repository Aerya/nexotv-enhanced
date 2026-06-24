import { reactive } from 'vue'

export type Lang = 'en' | 'fr'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('nx_lang')
    if (saved === 'fr' || saved === 'en') return saved
    // Fall back to the browser language on first visit.
    if ((navigator.language || '').toLowerCase().startsWith('fr')) return 'fr'
  } catch {}
  return 'en'
}

// Shared singleton language state.
const state = reactive<{ lang: Lang }>({ lang: initialLang() })

export function useI18n() {
  function setLang(l: Lang) {
    state.lang = l
    try { localStorage.setItem('nx_lang', l) } catch {}
  }
  /** Inline translation helper: t('English', 'Français'). */
  function t(en: string, fr: string) {
    return state.lang === 'fr' ? fr : en
  }
  return { state, setLang, t }
}
