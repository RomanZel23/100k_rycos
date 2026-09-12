export function Logo({ className = '', inverted = false }: { className?: string; inverted?: boolean }) {
  const textColor = inverted ? 'text-white' : 'text-techbay-blue';
  const subtitleColor = inverted ? 'text-techbay-lightblue' : 'text-neutral-400';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* SolutionsBay Brand Emblem (from Brandbook) */}
      <svg
        className="h-8 w-8 shrink-0"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Upper wing - TechBay Blue (#002633) */}
        <rect
          x="26"
          y="12"
          width="13"
          height="28"
          rx="6.5"
          transform="rotate(45 26 12)"
          fill="#002633"
        />
        {/* Right wing - TechBay Light Blue (#4DBFF5) */}
        <rect
          x="35"
          y="21"
          width="13"
          height="28"
          rx="6.5"
          transform="rotate(-45 35 21)"
          fill="#4DBFF5"
        />
        {/* Lower left wing - TechBay Blue (#002633) */}
        <rect
          x="14"
          y="24"
          width="13"
          height="28"
          rx="6.5"
          transform="rotate(45 14 24)"
          fill="#002633"
        />
        {/* Red Accent Dot - TechBay Red (#ED1C24) */}
        <circle cx="16" cy="30" r="5" fill="#ED1C24" />
      </svg>

      <div className="flex flex-col leading-tight">
        <span className={`text-lg font-extrabold tracking-tight ${textColor}`}>
          Solutions<span className="italic font-black text-techbay-lightblue">Bay</span>
        </span>
        <span className={`text-[10px] font-semibold tracking-wider uppercase ${subtitleColor}`}>
          100k-<span className="text-brand">RYCOS</span> Admin
        </span>
      </div>
    </div>
  )
}
