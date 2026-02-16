import type { AppActions, AppModule, SetStatus } from '../apps/_shared/app-types'

function createChessActions(setStatus: SetStatus): AppActions {
  let isInitialized = false

  return {
    async connect() {
      if (isInitialized) {
        setStatus('Chess: already initialized')
        return
      }

      setStatus('Chess: initializing...')
      const chessEntry = '/apps/chess/src/' + 'main.ts'
      await import(/* @vite-ignore */ chessEntry)
      isInitialized = true
      setStatus('Chess: initialized')
    },
    async action() {
      setStatus('Chess: use ring gestures in the simulator to control the board.')
    },
  }
}

export const app: AppModule = {
  id: 'chess',
  name: 'Chess',
  pageTitle: 'Even Hub Chess',
  connectLabel: 'Connect Chess',
  actionLabel: 'Chess Help',
  initialStatus: 'Chess app ready',
  createActions: createChessActions,
}

export default app
