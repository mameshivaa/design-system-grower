export function EmailField({ error }) {
  return (
    <div className="grid gap-1">
      <input className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      {error && <p className="px-1 text-red-600 text-xs">{error}</p>}
    </div>
  )
}

export function PasswordField({ error }) {
  return (
    <div className="grid gap-1">
      <input className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      {error && <p className="px-1 text-red-600 text-xs">{error}</p>}
    </div>
  )
}

export function NameField({ error }) {
  return (
    <div className="grid gap-1">
      <input className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      {error && <p className="px-1 text-red-600 text-xs">{error}</p>}
    </div>
  )
}
