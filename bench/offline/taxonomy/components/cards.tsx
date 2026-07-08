export function DashboardCard({ title, children }) {
  return (
    <section className="bg-background border rounded-lg p-2 shadow-sm">
      <h2 className="font-heading text-2xl">{title}</h2>
      {children}
    </section>
  )
}

export function PostCard({ title, children }) {
  return (
    <article className="bg-background border rounded-lg p-2 shadow-sm">
      <h2 className="font-heading text-2xl">{title}</h2>
      {children}
    </article>
  )
}

export function SettingsCard({ title, children }) {
  return (
    <div className="bg-background border rounded-lg p-2 shadow-sm">
      <h2 className="font-heading text-2xl">{title}</h2>
      {children}
    </div>
  )
}
