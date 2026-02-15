import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import type { AppActions, SetStatus } from '../_shared/app-types'
import { appendEventLog } from '../_shared/log'
import generatedUiSource from './generated-ui.ts?raw'

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer))
  })
}

function compileContainerFromGeneratedSource(source: string): CreateStartUpPageContainer {
  const sanitizedSource = source
    .replace(/import[\s\S]*?from\s+['"]@evenrealities\/even_hub_sdk['"]\s*;?/g, '')
    .replace(/export\s+default\s+container\s*;?/g, '')

  const buildContainer = new Function(
    'CreateStartUpPageContainer',
    'ListContainerProperty',
    'TextContainerProperty',
    'ImageContainerProperty',
    'ListItemContainerProperty',
    `"use strict";
${sanitizedSource}
return container;
`,
  )

  const container = buildContainer(
    CreateStartUpPageContainer,
    ListContainerProperty,
    TextContainerProperty,
    ImageContainerProperty,
    ListItemContainerProperty,
  )

  if (!(container instanceof CreateStartUpPageContainer)) {
    throw new Error('generated-ui.ts must define `const container = new CreateStartUpPageContainer(...)`')
  }

  return container
}

function getRebuildPayload(container: CreateStartUpPageContainer): Record<string, unknown> {
  const model = container as unknown as { toJson?: () => Record<string, unknown> }
  if (typeof model.toJson === 'function') {
    return model.toJson()
  }
  return container as unknown as Record<string, unknown>
}

function getRawEventType(event: EvenHubEvent): unknown {
  const raw = (event.jsonData ?? {}) as Record<string, unknown>
  return (
    event.listEvent?.eventType ??
    event.textEvent?.eventType ??
    event.sysEvent?.eventType ??
    (event as Record<string, unknown>).eventType ??
    raw.eventType ??
    raw.event_type ??
    raw.Event_Type ??
    raw.type
  )
}

function normalizeEventType(rawEventType: unknown): OsEventTypeList | undefined {
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

function eventTypeLabel(eventType: OsEventTypeList | undefined): string {
  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      return 'CLICK'
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return 'UP'
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return 'DOWN'
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return 'DOUBLE_CLICK'
    default:
      return 'UNKNOWN'
  }
}

function ensureQuicktestEditorUi(initialSource: string, setStatus: SetStatus): {
  getSource: () => string
  resetToFileSource: () => void
} {
  const appRoot = document.getElementById('app')
  if (!appRoot) {
    return {
      getSource: () => initialSource,
      resetToFileSource: () => undefined,
    }
  }

  const existing = document.getElementById('quicktest-source-panel')
  if (existing) {
    const textarea = document.getElementById('quicktest-source-textarea') as HTMLTextAreaElement | null
    return {
      getSource: () => textarea?.value ?? initialSource,
      resetToFileSource: () => {
        if (textarea) textarea.value = initialSource
      },
    }
  }

  const panel = document.createElement('section')
  panel.id = 'quicktest-source-panel'
  panel.style.marginTop = '12px'
  panel.style.display = 'grid'
  panel.style.gap = '8px'

  const label = document.createElement('label')
  label.htmlFor = 'quicktest-source-textarea'
  label.textContent = 'Quicktest source (paste generated-ui drop-in code):'

  const exampleLink = document.createElement('a')
  const editorUrl = 'http://localhost:5174/even-ui-builder/'
  exampleLink.href = '#'
  exampleLink.target = '_blank'
  exampleLink.rel = 'noreferrer'
  exampleLink.textContent = `Open editor (external browser): ${editorUrl}`
  exampleLink.style.fontSize = '12px'
  exampleLink.style.background = '#eef2f7'
  exampleLink.style.color = '#1d4ed8'
  exampleLink.style.padding = '6px 8px'
  exampleLink.style.borderRadius = '6px'
  exampleLink.style.display = 'inline-block'
  exampleLink.style.textDecoration = 'underline'
  exampleLink.addEventListener('click', async (event) => {
    event.preventDefault()
    appendEventLog('Quicktest UI: open-editor link clicked')

    try {
      const response = await fetch('/__open_editor')
      if (response.ok) {
        const payload = await response.json() as { url?: string }
        setStatus(`Quicktest: opened editor in external browser (${payload.url ?? editorUrl})`)
        appendEventLog(`Quicktest UI: external editor opened (${payload.url ?? editorUrl})`)
        return
      }
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (payload.error) {
        setStatus(`Quicktest: ${payload.error} Start it with ./misc/editor.sh`)
        appendEventLog(`Quicktest UI: open-editor failed (${payload.error})`)
        return
      }
      setStatus('Quicktest: could not open editor. Start it with ./misc/editor.sh')
      appendEventLog('Quicktest UI: open-editor failed (unknown response)')
    } catch (error) {
      console.error('[quicktest] open editor endpoint failed', error)
      setStatus('Quicktest: failed to call open-editor endpoint. Restart ./start-even.sh')
      appendEventLog('Quicktest UI: open-editor endpoint request failed')
    }
  })

  const textarea = document.createElement('textarea')
  textarea.id = 'quicktest-source-textarea'
  textarea.value = initialSource
  textarea.spellcheck = false
  textarea.style.minHeight = '220px'
  textarea.style.width = '100%'
  textarea.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace'
  textarea.style.fontSize = '12px'

  const controls = document.createElement('div')
  controls.style.display = 'flex'
  controls.style.gap = '8px'

  const applyButton = document.createElement('button')
  applyButton.type = 'button'
  applyButton.textContent = 'Use textarea source'
  applyButton.addEventListener('click', () => {
    setStatus('Quicktest: textarea source set. Click Render Quicktest UI.')
    appendEventLog('Quicktest UI: textarea source selected')
  })

  const resetButton = document.createElement('button')
  resetButton.type = 'button'
  resetButton.textContent = 'Reset to file source'
  resetButton.addEventListener('click', () => {
    textarea.value = initialSource
    setStatus('Quicktest: reset textarea to apps/quicktest/generated-ui.ts')
    appendEventLog('Quicktest UI: source reset to file')
  })

  controls.append(applyButton, resetButton)
  panel.append(label, exampleLink, textarea, controls)
  appRoot.append(panel)

  return {
    getSource: () => textarea.value,
    resetToFileSource: () => {
      textarea.value = initialSource
    },
  }
}

export function createQuicktestActions(setStatus: SetStatus): AppActions {
  let didRenderStartup = false
  let bridgeConnected = false
  let bridgeRef: Awaited<ReturnType<typeof waitForEvenAppBridge>> | null = null
  let eventLoopRegistered = false
  const editorUi = ensureQuicktestEditorUi(generatedUiSource, setStatus)

  function registerEventLogging() {
    if (!bridgeRef || eventLoopRegistered) {
      return
    }
    appendEventLog('Quicktest: bridge event logging attached')
    bridgeRef.onEvenHubEvent((event) => {
      const rawEventType = getRawEventType(event)
      const eventType = normalizeEventType(rawEventType)
      const selected = event.listEvent?.currentSelectItemName ?? event.listEvent?.currentSelectItemIndex ?? '-'
      const containerName = event.listEvent?.containerName ?? event.textEvent?.containerName ?? '-'
      const line = `Quicktest glass: ${eventTypeLabel(eventType)} | container=${containerName} | selected=${selected}`

      appendEventLog(line)
      console.log('[quicktest] bridge event', {
        normalizedEventType: eventTypeLabel(eventType),
        rawEventType,
        selected,
        containerName,
        event,
      })
    })
    eventLoopRegistered = true
  }

  return {
    async connect() {
      try {
        const source = editorUi.getSource()
        const container = compileContainerFromGeneratedSource(source)
        appendEventLog('Quicktest: render button clicked')
        setStatus('Quicktest: connecting to bridge...')
        if (!bridgeConnected || !bridgeRef) {
          bridgeRef = await withTimeout(waitForEvenAppBridge(), 10_000)
          bridgeConnected = true
          appendEventLog('Quicktest: bridge connected')
        }
        registerEventLogging()

        if (!didRenderStartup) {
          await bridgeRef.createStartUpPageContainer(container)
          didRenderStartup = true
          setStatus('Quicktest: startup UI rendered from source input')
          appendEventLog('Quicktest: startup UI created')
          return
        }

        await bridgeRef.rebuildPageContainer(new RebuildPageContainer(getRebuildPayload(container)))
        setStatus('Quicktest: page rebuilt from source input')
        appendEventLog('Quicktest: page rebuilt')
      } catch (error) {
        console.error('[quicktest] connect failed', error)
        setStatus('Quicktest: failed to render source input (check code syntax/container)')
        appendEventLog('Quicktest: render failed')
      }
    },

    async action() {
      editorUi.resetToFileSource()
      setStatus('Quicktest: source reset to apps/quicktest/generated-ui.ts')
      appendEventLog('Quicktest: source reset button clicked')
    },
  }
}
