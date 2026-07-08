export function LoadingButton() {
  return (
    <button className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium">
      <span className="mr-2 h-4 w-4 animate-spin" />
      Saving
    </button>
  )
}

export function BackLink() {
  return (
    <a className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium">
      <span className="mr-2 h-4 w-4" />
      Back
    </a>
  )
}
