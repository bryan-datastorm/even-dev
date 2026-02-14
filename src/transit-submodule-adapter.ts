import type { AppActions, AppModule, SetStatus } from '../apps/_shared/app-types'

function createTransitActions(setStatus: SetStatus): AppActions {
  let isInitialized = false

  return {
    async connect() {
      if (isInitialized) {
        setStatus('Transit: already initialized')
        return
      }

      setStatus('Transit: initializing...')
      await import('../apps/transit/src/main')
      isInitialized = true
      setStatus('Transit: initialized')
    },
    async action() {
      setStatus('Transit: configure routes in the web UI, then use glasses list selection.')
    },
  }
}

export const app: AppModule = {
  id: 'transit',
  name: 'Transit',
  pageTitle: 'Even Hub Transit',
  connectLabel: 'Connect Transit',
  actionLabel: 'Transit Help',
  initialStatus: 'Transit app ready',
  createActions: createTransitActions,
}

export default app
