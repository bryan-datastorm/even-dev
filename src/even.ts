import { EvenBetterSdk } from '@jappyjan/even-better-sdk'
import { OsEventTypeList, type EvenHubEvent, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'

type RuntimeMode = 'bridge' | 'mock'
type RawHostMessage = {
  type?: unknown
  method?: unknown
  data?: unknown
}

export type EvenClient = {
  mode: RuntimeMode
  renderStartupScreen: () => Promise<void>
  sendDemoAction: () => Promise<void>
}

let bridgeClient: EvenClient | null = null

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Even bridge not detected within ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer))
  })
}

function getMockClient(): EvenClient {
  return {
    mode: 'mock',
    async renderStartupScreen() {
      console.log('[mock] Startup screen render skipped (no Even bridge)')
    },
    async sendDemoAction() {
      console.log('[mock] Demo action invoked')
    },
  }
}

function getBridgeClient(): EvenClient {
  const sdk = new EvenBetterSdk()
  const page = sdk.createPage('hub-simulator-demo')

  const title = page.addTextElement('Even Hub Simulator Demo')
  title
    .setPosition((position) => position.setX(8).setY(16))
    .setSize((size) => size.setWidth(280).setHeight(44))

  const subtitle = page.addTextElement('Running without a real device')
  subtitle
    .setPosition((position) => position.setX(8).setY(64))
    .setSize((size) => size.setWidth(280).setHeight(44))

  const lastInput = page.addTextElement('Last input: waiting...')
  lastInput
    .setPosition((position) => position.setX(8).setY(112))
    .setSize((size) => size.setWidth(280).setHeight(44))

  const inputTarget = page.addListElement([
    'Use Hub buttons to send events',
    'Up',
    'Down',
    'Click',
    'DoubleClick',
  ])
  inputTarget
    .setPosition((position) => position.setX(8).setY(164))
    .setSize((size) => size.setWidth(280).setHeight(44))
    .markAsEventCaptureElement()
  inputTarget.setIsItemSelectBorderEn(true)

  const getRawEventType = (event: EvenHubEvent): unknown => {
    const raw = (event.jsonData ?? {}) as Record<string, unknown>

    return (
      event.listEvent?.eventType ??
      event.textEvent?.eventType ??
      event.sysEvent?.eventType ??
      raw.eventType ??
      raw.event_type ??
      raw.Event_Type ??
      raw.type
    )
  }

  const normalizeEventType = (rawEventType: unknown): OsEventTypeList | undefined => {
    if (typeof rawEventType === 'number') {
      switch (rawEventType) {
        case 0:
          return OsEventTypeList.CLICK_EVENT
        case 1:
          return OsEventTypeList.SCROLL_TOP_EVENT
        case 2:
          return OsEventTypeList.SCROLL_BOTTOM_EVENT
        case 3:
          return OsEventTypeList.DOUBLE_CLICK_EVENT
        default:
          return undefined
      }
    }

    if (typeof rawEventType === 'string') {
      const value = rawEventType.toUpperCase()
      if (value.includes('DOUBLE')) return OsEventTypeList.DOUBLE_CLICK_EVENT
      if (value.includes('CLICK')) return OsEventTypeList.CLICK_EVENT
      if (value.includes('SCROLL_TOP') || value.includes('UP')) return OsEventTypeList.SCROLL_TOP_EVENT
      if (value.includes('SCROLL_BOTTOM') || value.includes('DOWN')) return OsEventTypeList.SCROLL_BOTTOM_EVENT
    }

    return undefined
  }

  const eventLabel = (eventType: OsEventTypeList | undefined): string => {
    switch (eventType) {
      case OsEventTypeList.SCROLL_TOP_EVENT:
        return 'Up'
      case OsEventTypeList.SCROLL_BOTTOM_EVENT:
        return 'Down'
      case OsEventTypeList.CLICK_EVENT:
        return 'Click'
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        return 'DoubleClick'
      default:
        return 'Unknown'
    }
  }

  const handleInputEvent = async (event: EvenHubEvent): Promise<void> => {
    const rawEventType = getRawEventType(event)
    const eventType = normalizeEventType(rawEventType)
    const label = eventLabel(eventType)

    const suffix = label === 'Unknown' ? ` (${String(rawEventType ?? 'n/a')})` : ''
    lastInput.setContent(`Last input: ${label}${suffix}`)
    await page.render()
  }

  const tryHandleRawHostMessage = async (message: unknown): Promise<void> => {
    let parsed: RawHostMessage | null = null

    if (typeof message === 'string') {
      try {
        parsed = JSON.parse(message) as RawHostMessage
      } catch {
        return
      }
    } else if (typeof message === 'object' && message !== null) {
      parsed = message as RawHostMessage
    }

    if (!parsed) {
      return
    }

    const method = String(parsed.method ?? '')
    if (method !== 'evenHubEvent') {
      return
    }

    const data = (parsed.data ?? {}) as Record<string, unknown>
    const dataType = data.type
    const jsonData = (data.jsonData ?? data.data ?? {}) as Record<string, unknown>
    const rawEventType =
      jsonData.eventType ??
      jsonData.event_type ??
      jsonData.Event_Type ??
      dataType

    const label = eventLabel(normalizeEventType(rawEventType))
    const suffix = label === 'Unknown' ? ` (${String(rawEventType ?? 'n/a')})` : ''
    lastInput.setContent(`Last input: ${label}${suffix}`)
    await page.render()
  }

  void waitForEvenAppBridge().then((bridge) => {
    bridge.onEvenHubEvent((event) => {
      void handleInputEvent(event)
    })
  })

  // Keep the wrapper listener as a fallback path.
  sdk.addEventListener((event) => {
    void handleInputEvent(event)
  })

  // Also listen to raw window events emitted by the bridge.
  window.addEventListener('evenHubEvent', (event: Event) => {
    const customEvent = event as CustomEvent<EvenHubEvent>
    if (customEvent.detail) {
      void handleInputEvent(customEvent.detail)
    }
  })

  const w = window as Window & {
    _listenEvenAppMessage?: (message: unknown) => void
  }
  const originalListenEvenAppMessage = w._listenEvenAppMessage
  w._listenEvenAppMessage = (message: unknown) => {
    void tryHandleRawHostMessage(message)

    if (typeof originalListenEvenAppMessage === 'function') {
      originalListenEvenAppMessage(message)
    }
  }

  return {
    mode: 'bridge',
    async renderStartupScreen() {
      await page.render()
    },
    async sendDemoAction() {
      subtitle.setContent(`Action sent: ${new Date().toLocaleTimeString()}`)
      await page.render()
    },
  }
}

export async function initEven(timeoutMs = 4000): Promise<{ even: EvenClient }> {
  try {
    await withTimeout(EvenBetterSdk.getRawBridge(), timeoutMs)

    if (!bridgeClient) {
      bridgeClient = getBridgeClient()
    }

    return { even: bridgeClient }
  } catch {
    return { even: getMockClient() }
  }
}
