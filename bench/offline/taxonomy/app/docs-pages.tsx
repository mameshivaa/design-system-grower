export function DocsPage({ page }) {
  return (
    <article className="container max-w-3xl py-6 lg:py-12">
      <div className="space-y-4">
        <h1 className="inline-block font-heading text-4xl lg:text-5xl">
          {page.title}
        </h1>
        <p className="text-xl text-muted-foreground">{page.description}</p>
      </div>
      <hr className="my-4" />
    </article>
  )
}

export function BlogPage({ post }) {
  return (
    <article className="container max-w-3xl py-6 lg:py-12">
      <div className="space-y-4">
        <h1 className="inline-block font-heading text-4xl lg:text-5xl">
          {post.title}
        </h1>
        <p className="text-xl text-muted-foreground">{post.description}</p>
      </div>
      <hr className="my-4" />
    </article>
  )
}
