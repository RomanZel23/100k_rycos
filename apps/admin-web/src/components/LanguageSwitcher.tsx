'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { SUPPORTED_LOCALES, AdminLocale } from '@/lib/i18n';

export function LanguageSwitcher({ currentLocale }: { currentLocale: AdminLocale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSelect = (locale: AdminLocale) => {
    if (locale === currentLocale) return;
    document.cookie = `admin_lang=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1 p-1 bg-neutral-100/80 rounded-lg border border-neutral-200">
      {SUPPORTED_LOCALES.map((l) => {
        const isActive = l.code === currentLocale;
        return (
          <button
            key={l.code}
            onClick={() => handleSelect(l.code)}
            disabled={isPending}
            title={l.label}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs font-semibold transition-all ${
              isActive
                ? 'bg-techbay-blue text-white shadow-sm'
                : 'text-neutral-600 hover:text-techbay-blue hover:bg-white'
            }`}
          >
            <span>{l.flag}</span>
            <span className="uppercase">{l.code}</span>
          </button>
        );
      })}
    </div>
  );
}
