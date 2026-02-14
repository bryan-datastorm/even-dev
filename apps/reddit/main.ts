import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AppActions, SetStatus } from '../_shared/app-types'
import { appendEventLog } from '../_shared/log'
import { createSimulatorControls } from './simulator'
import { EvenRedditClient } from './client'

type BridgeType = Awaited<ReturnType<typeof waitForEvenAppBridge>>

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer))
  })
}

export function createRedditActions(setStatus: SetStatus): AppActions {
  let bridge: BridgeType | null = null
  let client: EvenRedditClient | null = null

  return {
    async connect() {
      setStatus('Reddit: waiting for bridge...')
      appendEventLog('Reddit: connect requested')

      try {
        bridge = await withTimeout(waitForEvenAppBridge(), 2500, 'waitForEvenAppBridge')
      } catch {
        bridge = null
      }

      if (!bridge) {
        setStatus('Reddit: bridge unavailable. Start simulator and reconnect.')
        appendEventLog('Reddit: bridge unavailable')
        return
      }

      try {
        client = new EvenRedditClient(bridge)
        await client.init()
        createSimulatorControls(client)
        setStatus('Reddit: connected. Browse feeds on glasses.')
        appendEventLog('Reddit: initialized')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatus(`Reddit: initialization failed (${message})`)
        appendEventLog(`Reddit: init failed ${message}`)
      }
    },

    async action() {
      if (!client) {
        setStatus('Reddit: not connected')
        appendEventLog('Reddit: refresh blocked (not connected)')
        return
      }

      setStatus('Reddit: refreshing feed...')
      appendEventLog('Reddit: manual refresh')

      try {
        await client.reloadFeed()
        setStatus('Reddit: feed refreshed')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatus(`Reddit: refresh failed (${message})`)
      }
    },
  }
}
