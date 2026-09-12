export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`text-2xl font-extrabold tracking-tight ${className}`}>
      100k-<span className="text-brand">RYCOS</span>
    </span>
  )
}
