import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AppActions, AppModule, SetStatus } from '../apps/_shared/app-types'
import { EvenRedditClient } from '../apps/reddit/src/even-client'
import { createSimulatorControls } from '../apps/reddit/src/simulator'
import { withTimeout } from '../apps/reddit/src/utils'

function createRedditActions(setStatus: SetStatus): AppActions {
  let client: EvenRedditClient | null = null

  return {
    async connect() {
      setStatus('Reddit: connecting to Even bridge...')

      try {
        const bridge = await withTimeout(waitForEvenAppBridge(), 2500, 'waitForEvenAppBridge')
        client = new EvenRedditClient(bridge)
        await client.init()
        createSimulatorControls(client)
        setStatus('Reddit: connected. Browse posts on the glasses UI.')
      } catch (error) {
        console.warn('[reddit-adapter] connect failed', error)
        setStatus('Reddit: bridge not available. Start simulator and reconnect.')
      }
    },
    async action() {
      if (!client) {
        setStatus('Reddit: not connected')
        return
      }

      await client.reloadFeed()
      setStatus('Reddit: feed refreshed')
    },
  }
}

export const app: AppModule = {
  id: 'reddit',
  name: 'Reddit Reader',
  pageTitle: 'Even Hub Reddit Reader',
  connectLabel: 'Connect Reddit',
  actionLabel: 'Refresh Feed',
  initialStatus: 'Reddit reader ready',
  createActions: createRedditActions,
}

export default app
