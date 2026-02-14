import type { AppActions, AppModule, SetStatus } from '../apps/_shared/app-types'

type StarsWindowApi = Window & {
  cycleMode?: () => void
}

function createStarsActions(setStatus: SetStatus): AppActions {
  let isInitialized = false

  return {
    async connect() {
      if (!isInitialized) {
        await import('../apps/stars/src/main')
        isInitialized = true
      }
      setStatus('Stars: initialized')
    },
    async action() {
      const w = window as StarsWindowApi
      if (!w.cycleMode) {
        setStatus('Stars: not initialized')
        return
      }

      w.cycleMode()
      setStatus('Stars: mode cycled')
    },
  }
}

export const app: AppModule = {
  id: 'stars',
  name: 'Stars',
  pageTitle: 'Even Hub Stars',
  connectLabel: 'Connect Stars',
  actionLabel: 'Cycle Mode',
  initialStatus: 'Stars app ready',
  createActions: createStarsActions,
}

export default app
