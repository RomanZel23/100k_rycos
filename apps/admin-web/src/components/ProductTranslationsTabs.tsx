'use client'

import { useState } from 'react'

// Friendly labels for the language codes we support. Falls back to the code in
// uppercase if a new one shows up here before we add a label.
const LANG_LABEL: Record<string, string> = {
  en: 'English',
  pl: 'Polski',
  ar: 'العربية',
  fr: 'Français',
  de: 'Deutsch',
  sv: 'Svenska',
}

interface Props {
  // Non-default languages only — the default-language name/description live in
  // the main product form above this component.
  languages: string[]
  initial: Record<string, { name?: string; description?: string }>
}

// Tabbed translation editor. Renders one tab per non-default language. All
// inputs are mounted at once (only the active tab is visible) so the whole form
// submits as a single payload — no controlled state to keep in sync. Input
// names follow `tr_<lang>_<attr>` and are parsed back into a translations
// object by the server action.
export function ProductTranslationsTabs({ languages, initial }: Props) {
  const [active, setActive] = useState(languages[0] ?? '')
  if (languages.length === 0) return null

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {languages.map((lang) => {
          const isActive = lang === active
          return (
            <button
              key={lang}
              type="button"
              onClick={() => setActive(lang)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'border-brand text-brand-700'
                  : 'border-transparent text-neutral-500 hover:text-brand'
              }`}
            >
              {LANG_LABEL[lang] ?? lang.toUpperCase()}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        {languages.map((lang) => (
          <div key={lang} className={lang === active ? 'space-y-3' : 'hidden'}>
            <div>
              <label className="label" htmlFor={`tr-${lang}-name`}>Name</label>
              <input
                id={`tr-${lang}-name`}
                name={`tr_${lang}_name`}
                defaultValue={initial[lang]?.name ?? ''}
                className="input"
                placeholder="Leave empty to use the default-language name"
              />
            </div>
            <div>
              <label className="label" htmlFor={`tr-${lang}-description`}>Description</label>
              <textarea
                id={`tr-${lang}-description`}
                name={`tr_${lang}_description`}
                rows={3}
                defaultValue={initial[lang]?.description ?? ''}
                className="input"
                placeholder="Leave empty to use the default-language description"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
