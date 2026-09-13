export function Logo({ className = '', inverted = false }: { className?: string; inverted?: boolean }) {
  const logoSrc = inverted ? '/solutionsbay-logo-white.svg' : '/solutionsbay-logo.svg';
  const subtitleColor = inverted ? 'text-techbay-lightblue' : 'text-neutral-400';

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt="SolutionsBay"
          className="h-8 w-auto max-w-[200px] object-contain"
        />
      </div>
      <span className={`text-[10px] font-bold tracking-wider uppercase pl-0.5 ${subtitleColor}`}>
        100k-<span className="text-brand">RYCOS</span> Admin
      </span>
    </div>
  )
}
