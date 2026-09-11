export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`text-2xl font-extrabold tracking-tight ${className}`}>
      Yalla<span className="text-brand">Order</span>
    </span>
  )
}
