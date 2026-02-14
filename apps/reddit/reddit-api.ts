import type { RedditPost, RedditComment } from './types'
import { currentFeed } from './constants'

const REDDIT_PROXY_PATH = '/__reddit_proxy'

async function fetchJson(path: string, retries = 3): Promise<any> {
  const encodedPath = encodeURIComponent(path)
  const url = `${REDDIT_PROXY_PATH}?path=${encodedPath}`

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    let response: Response

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
    } catch (error) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        continue
      }
      throw error
    }

    if (!response.ok) {
      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        continue
      }
      const body = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 400)}`)
    }

    return response.json()
  }

  throw new Error('Unreachable fetchJson state')
}

export async function fetchTopPosts(limit = 30): Promise<RedditPost[]> {
  const base = currentFeed.path ? `/${currentFeed.path}/top.json` : '/top.json'
  const json = await fetchJson(`${base}?limit=${limit}&t=day&raw_json=1`)
  const children = json?.data?.children ?? []

  const posts: RedditPost[] = [
    {
      id: 'help',
      title: 'Controls: swipe to browse, tap to open comments, double tap to go back.',
      ups: 0,
      permalink: '',
      subreddit: 'even',
      author: 'system',
      createdUtcSeconds: Math.floor(Date.now() / 1000),
      numComments: 0,
    },
  ]

  for (const child of children) {
    const p = child?.data
    if (!p?.id || !p?.title) continue

    posts.push({
      id: String(p.id),
      title: String(p.title),
      ups: Number(p.ups ?? 0),
      permalink: String(p.permalink ?? ''),
      subreddit: String(p.subreddit_name_prefixed ?? ''),
      author: String(p.author ?? ''),
      createdUtcSeconds: Number(p.created_utc ?? 0),
      numComments: Number(p.num_comments ?? 0),
    })
  }

  return posts.slice(0, Math.max(1, limit + 1))
}

export async function fetchComments(permalink: string, limit = 50): Promise<RedditComment[]> {
  if (!permalink) return []

  const json = await fetchJson(`${permalink}.json?limit=${limit}&raw_json=1`)
  const commentListing = json?.[1]?.data?.children ?? []
  const comments: RedditComment[] = []

  function extractComment(child: any): void {
    if (comments.length >= limit) return
    if (child?.kind !== 't1') return

    const c = child?.data
    if (!c?.body) return

    comments.push({
      body: String(c.body),
      author: String(c.author ?? ''),
      createdUtcSeconds: Number(c.created_utc ?? 0),
      ups: Number(c.ups ?? 0),
      depth: Number(c.depth ?? 0),
    })

    if (c.replies && typeof c.replies === 'object' && c.replies.data?.children) {
      for (const reply of c.replies.data.children) {
        extractComment(reply)
      }
    }
  }

  for (const child of commentListing) {
    extractComment(child)
  }

  return comments
}
