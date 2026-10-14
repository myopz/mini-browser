export type RemoteSession = {
  sessionId: string
  liveViewUrl: string
  pageUrl: string
  title?: string
  keepAliveMs?: number
}

export type RemoteBrowseError = {
  error: string
  code?: string
}

const API = '/api/remote-browse'

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & RemoteBrowseError
  if (!res.ok) {
    const err = new Error(data.error || `远程浏览失败（${res.status}）`)
    ;(err as Error & { code?: string }).code = data.code
    throw err
  }
  return data
}

export async function createRemoteSession(url: string): Promise<RemoteSession> {
  const res = await fetch(`${API}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return parseJson<RemoteSession>(res)
}

export async function navigateRemoteSession(
  sessionId: string,
  url: string,
): Promise<RemoteSession> {
  const res = await fetch(
    `${API}/session/${encodeURIComponent(sessionId)}/navigate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    },
  )
  return parseJson<RemoteSession>(res)
}

export async function refreshRemoteLiveView(
  sessionId: string,
): Promise<RemoteSession> {
  const res = await fetch(
    `${API}/session/${encodeURIComponent(sessionId)}/live-view`,
    { method: 'POST' },
  )
  return parseJson<RemoteSession>(res)
}

export async function closeRemoteSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API}/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
  } catch {
    /* ignore */
  }
}
