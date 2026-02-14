import type { AppActions, AppModule, SetStatus } from '../apps/_shared/app-types'

function ensureEpubFileInput(): HTMLInputElement {
  const existing = document.getElementById('epub-file')
  if (existing instanceof HTMLInputElement) {
    return existing
  }

  const input = document.createElement('input')
  input.id = 'epub-file'
  input.type = 'file'
  input.accept = '.epub,application/epub+zip'
  input.style.display = 'none'
  document.body.appendChild(input)
  return input
}

function createEpubActions(setStatus: SetStatus): AppActions {
  let isInitialized = false

  return {
    async connect() {
      ensureEpubFileInput()
      if (!isInitialized) {
        await import('../apps/epub/src/main')
        isInitialized = true
      }
      setStatus('EPUB: initialized. Click Load EPUB to choose a file.')
    },
    async action() {
      const input = ensureEpubFileInput()
      input.click()
      setStatus('EPUB: choose an .epub file')
    },
  }
}

export const app: AppModule = {
  id: 'epub',
  name: 'EPUB Reader',
  pageTitle: 'Even Hub EPUB Reader',
  connectLabel: 'Connect EPUB',
  actionLabel: 'Load EPUB',
  initialStatus: 'EPUB reader ready',
  createActions: createEpubActions,
}

export default app
