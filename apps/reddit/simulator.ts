import { FEED_OPTIONS, currentFeed, setCurrentFeed } from './constants'
import { appendEventLog } from '../_shared/log'

interface SimulatorClient {
  reloadFeed(): Promise<void>
}

export function createSimulatorControls(client: SimulatorClient): void {
  const existing = document.getElementById('reddit-controls')
  if (existing) return

  const appRoot = document.getElementById('app')
  if (!appRoot) return

  const wrapper = document.createElement('div')
  wrapper.id = 'reddit-controls'
  wrapper.style.marginTop = '12px'
  wrapper.style.display = 'flex'
  wrapper.style.gap = '8px'
  wrapper.style.alignItems = 'center'
  wrapper.style.flexWrap = 'wrap'

  const label = document.createElement('label')
  label.textContent = 'Feed:'
  label.htmlFor = 'reddit-feed-select'

  const select = document.createElement('select')
  select.id = 'reddit-feed-select'

  FEED_OPTIONS.forEach((feed, index) => {
    const option = document.createElement('option')
    option.value = String(index)
    option.textContent = `${feed.label} - ${feed.description}`
    if (feed === currentFeed) option.selected = true
    select.append(option)
  })

  select.addEventListener('change', () => {
    const idx = Number.parseInt(select.value, 10)
    const feed = FEED_OPTIONS[idx] ?? FEED_OPTIONS[0]
    setCurrentFeed(feed)
    appendEventLog(`Reddit: feed changed to ${feed.label}`)
    void client.reloadFeed()
  })

  wrapper.append(label, select)
  appRoot.append(wrapper)
}
