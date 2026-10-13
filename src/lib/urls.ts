export function urlsRoughlyEqual(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    const strip = (u: URL) => {
      u.hash = ''
      let path = u.pathname
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
      return `${u.origin}${path}${u.search}`
    }
    return strip(ua) === strip(ub)
  } catch {
    return a.trim() === b.trim()
  }
}
