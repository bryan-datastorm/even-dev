import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AppActions, SetStatus } from '../_shared/app-types'
import { parseEpub } from './epub-parser'
import { EvenEpubClient } from './even-client'
import { appendEventLog, withTimeout } from './utils'

async function pickEpubFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.epub,application/epub+zip'

    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null)
    })

    input.click()
  })
}

export function createEpubActions(setStatus: SetStatus): AppActions {
  let client: EvenEpubClient | null = null

  return {
    async connect() {
      setStatus('EPUB: connecting to Even bridge...')

      try {
        const bridge = await withTimeout(waitForEvenAppBridge(), 4000, 'waitForEvenAppBridge')
        client = new EvenEpubClient(bridge)
        await client.init()

        setStatus('EPUB: connected. Click Load EPUB to choose a book.')
        appendEventLog('Bridge connected')
      } catch (error) {
        console.error('[epub] connect failed', error)
        setStatus('EPUB: bridge not available. Start simulator and reconnect.')
      }
    },

    async action() {
      if (!client) {
        setStatus('EPUB: not connected')
        return
      }

      const file = await pickEpubFile()
      if (!file) {
        setStatus('EPUB: file selection canceled')
        return
      }

      setStatus(`EPUB: loading ${file.name}...`)
      appendEventLog(`File selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)

      try {
        const data = await file.arrayBuffer()
        const book = await parseEpub(data)

        appendEventLog(`Parsed: "${book.title}" with ${book.chapters.length} chapters`)
        await client.loadBook(book)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[epub] load failed', error)
        appendEventLog(`Parse error: ${message}`)
        setStatus(`EPUB: failed to load (${message})`)
      }
    },
  }
}
