import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '100k-RYCOS — Wybierz pakiet i aktywuj licencje',
  description: 'Sklep i natychmiastowy onboarding licencji 100k-RYCOS oraz terminali SBR dostarczany przez SolutionsBay.',
};

export default function GoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans antialiased">
      {children}
    </div>
  );
}
