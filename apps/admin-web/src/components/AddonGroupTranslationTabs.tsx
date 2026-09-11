'use client'

import { useState } from 'react'

const LANG_LABEL: Record<string, string> = {
  en: 'English', pl: 'Polski', ar: 'العربية', fr: 'Français', de: 'Deutsch', sv: 'Svenska',
}

interface Option {
  id: number
  name: string
}

interface InitialPayload {
  // Server returns: { en: { group_name, options: { id: name } }, pl: {...} }
  [language: string]: { group_name?: string; options?: Record<string, string> }
}

interface Props {
  languages: string[]
  defaultLanguage: string
  options: Option[]
  initial: InitialPayload
}

// Tabs for editing a single addon group's translations (group name + each
// option name) across every non-default language enabled for the company.
// Hidden tabs are still rendered, so the whole form submits as one payload.
// Input naming convention:
//   trg_<lang>_group_name
//   tro_<lang>_<option_id>_name
// The action parses these and POSTs back the nested shape the admin-api
// endpoint expects.
export function AddonGroupTranslationTabs({ languages, defaultLanguage, options, initial }: Props) {
  const [active, setActive] = useState(languages[0] ?? '')
  if (languages.length === 0) {
    return (
      <p className="text-xs text-neutral-400">
        Only your default language ({defaultLanguage.toUpperCase()}) is enabled. Add more in
        <span className="ml-1 font-medium text-brand"> Settings → Languages</span>.
      </p>
    )
  }
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
              className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition ${
                isActive ? 'border-brand text-brand-700' : 'border-transparent text-neutral-500 hover:text-brand'
              }`}
            >
              {LANG_LABEL[lang] ?? lang.toUpperCase()}
            </button>
          )
        })}
      </div>

      <div className="mt-3 space-y-3">
        {languages.map((lang) => (
          <div key={lang} className={lang === active ? 'space-y-2' : 'hidden'}>
            <div>
              <label className="label text-xs" htmlFor={`trg-${lang}-name`}>Group name</label>
              <input
                id={`trg-${lang}-name`}
                name={`trg_${lang}_group_name`}
                defaultValue={initial[lang]?.group_name ?? ''}
                placeholder="(falls back to default)"
                className="input"
              />
            </div>
            {options.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-500">Options</p>
                {options.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 truncate text-xs text-neutral-600">{o.name}</span>
                    <input
                      name={`tro_${lang}_${o.id}_name`}
                      defaultValue={initial[lang]?.options?.[String(o.id)] ?? ''}
                      placeholder="(falls back to default)"
                      className="input"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
