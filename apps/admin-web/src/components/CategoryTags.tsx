'use client'

import { useState } from 'react'

// Hashtag-style category input: type to get suggestions from existing categories
// (native datalist), Enter/comma to add, or type a new one to create it on save.
// Renders a hidden input per selected tag (name="category_name") so the
// surrounding server-action form submits them as category_name[].
export function CategoryTags({
  suggestions,
  initial = [],
  name = 'category_name',
}: {
  suggestions: string[]
  initial?: string[]
  name?: string
}) {
  const [tags, setTags] = useState<string[]>(initial)
  const [value, setValue] = useState('')

  const add = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t])
    setValue('')
  }
  const remove = (t: string) => setTags(tags.filter((x) => x !== t))

  const available = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-300 bg-white p-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            #{t}
            <button type="button" onClick={() => remove(t)} className="text-brand-700/70 hover:text-brand-700" aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        <input
          list="category-suggestions"
          value={value}
          onChange={(e) => {
            const v = e.target.value
            // datalist click usually fills the full value; auto-add on exact match
            if (suggestions.some((s) => s.toLowerCase() === v.trim().toLowerCase())) add(v)
            else setValue(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(value) }
            else if (e.key === 'Backspace' && value === '' && tags.length) remove(tags[tags.length - 1])
          }}
          onBlur={() => {
            if (value.trim()) add(value)
          }}
          placeholder={tags.length ? 'Add another…' : 'Type to tag, e.g. Drinks'}
          className="min-w-[8rem] flex-1 border-0 p-1 text-sm outline-none"
        />
        <datalist id="category-suggestions">
          {available.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
      {tags.map((t) => <input key={t} type="hidden" name={name} value={t} />)}
      <p className="mt-1 text-xs text-neutral-400">Press Enter to add. New tags are created automatically.</p>
    </div>
  )
}
