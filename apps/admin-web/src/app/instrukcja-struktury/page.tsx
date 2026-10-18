import type { Metadata } from 'next'
import { Logo } from '@/components/Logo'
import { StructureGuideContent } from '../dashboard/structure/StructureGuide'

export const metadata: Metadata = {
  title: 'Instrukcja Diagramu Struktury Lokalu — 100k-RYCOS',
  description: 'Przewodnik krok po kroku: jak działa i jak konfigurować graficzny schemat lokalizacji, marek, stanowisk POS/KDS/Wydawki i urządzeń SBR w systemie 100k-RYCOS.',
}

export default function PublicStructureGuidePage() {
  return (
    <main className="min-h-screen bg-neutral-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Logo />
          <span className="text-xs font-semibold text-neutral-400">Dokumentacja online · 100k-RYCOS</span>
        </div>

        <StructureGuideContent standalone={true} />
      </div>
    </main>
  )
}
