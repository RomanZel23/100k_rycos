'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { MenuApp } from '../../components/MenuApp';
import { Loader2 } from 'lucide-react';

export default function BrandDynamicMenuPage() {
  const params = useParams();
  const rawSlug = params?.slug;
  const slug = typeof rawSlug === 'string' ? rawSlug : Array.isArray(rawSlug) ? rawSlug[0] : 'default';

  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Ładowanie menu...</span>
        </div>
      }
    >
      <MenuApp initialBrandSlug={slug} />
    </React.Suspense>
  );
}
