export function NoAccess() {
  return (
    <div className="mx-auto max-w-md">
      <div className="card mt-10 text-center">
        <h1 className="text-lg font-semibold">Admin access required</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This section is available to company owners and admins. Ask an admin if you need access.
        </p>
      </div>
    </div>
  )
}
