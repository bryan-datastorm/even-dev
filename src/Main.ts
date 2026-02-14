import type { AppModule } from '../apps/_shared/app-types'

type AppModuleShape = {
  app?: AppModule
  default?: AppModule
}

const appEntryModules = import.meta.glob('../apps/*/index.ts')
const redditSubmoduleMarker = import.meta.glob('../apps/reddit/src/even-client.ts')
const starsSubmoduleMarker = import.meta.glob('../apps/stars/src/main.ts')
const epubSubmoduleMarker = import.meta.glob('../apps/epub/src/main.ts')
const transitSubmoduleMarker = import.meta.glob('../apps/transit/package.json')

function extractAppName(modulePath: string): string {
  const match = modulePath.match(/\.\.\/apps\/([^/]+)\/index\.ts$/)
  return match?.[1] ?? ''
}

function discoveredApps(): string[] {
  const names = Object.keys(appEntryModules)
    .map(extractAppName)
    .filter(Boolean)

  if (Object.keys(redditSubmoduleMarker).length > 0) {
    names.push('reddit')
  }
  if (Object.keys(starsSubmoduleMarker).length > 0) {
    names.push('stars')
  }
  if (Object.keys(epubSubmoduleMarker).length > 0) {
    names.push('epub')
  }
  if (Object.keys(transitSubmoduleMarker).length > 0) {
    names.push('transit')
  }

  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

function resolveSelectedApp(appNames: string[]): string {
  const envApp = String(import.meta.env.VITE_APP_NAME ?? '')

  if (envApp && appNames.includes(envApp)) {
    return envApp
  }

  if (appNames.includes('demo')) {
    return 'demo'
  }

  return appNames[0] ?? ''
}

function updateStatus(text: string) {
  console.log(`[ui] ${text}`)
  const el = document.getElementById('status')
  if (el) {
    el.textContent = text
  }
}

async function boot() {
  const appNames = discoveredApps()

  if (appNames.length === 0) {
    updateStatus('No apps found in /apps')
    throw new Error('No app modules found. Add apps/<name>/index.ts')
  }

  const selectedAppName = resolveSelectedApp(appNames)
  const modulePath = `../apps/${selectedAppName}/index.ts`
  const importer = appEntryModules[modulePath]

  const module = importer
    ? ((await importer()) as AppModuleShape)
    : selectedAppName === 'reddit' && Object.keys(redditSubmoduleMarker).length > 0
      ? ((await import('./reddit-submodule-adapter')) as AppModuleShape)
      : selectedAppName === 'stars' && Object.keys(starsSubmoduleMarker).length > 0
        ? ((await import('./stars-submodule-adapter')) as AppModuleShape)
        : selectedAppName === 'epub' && Object.keys(epubSubmoduleMarker).length > 0
          ? ((await import('./epub-submodule-adapter')) as AppModuleShape)
          : selectedAppName === 'transit' && Object.keys(transitSubmoduleMarker).length > 0
            ? ((await import('./transit-submodule-adapter')) as AppModuleShape)
      : null

  if (!module) {
    updateStatus(`App not found: ${selectedAppName}`)
    throw new Error(`Missing app module: ${modulePath}`)
  }

  const loadedApp = module.app ?? module.default

  if (!loadedApp || typeof loadedApp.createActions !== 'function') {
    updateStatus(`Invalid app module: ${selectedAppName}`)
    throw new Error(`App module ${modulePath} must export 'app' or default with createActions()`)
  }

  const heading = document.querySelector('#app h1')
  const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement | null
  const actionBtn = document.getElementById('actionBtn') as HTMLButtonElement | null

  if (heading) {
    heading.textContent = loadedApp.pageTitle ?? `Even Hub ${loadedApp.name} App`
  }

  if (connectBtn) {
    connectBtn.textContent = loadedApp.connectLabel ?? `Connect ${loadedApp.name}`
  }

  if (actionBtn) {
    actionBtn.textContent = loadedApp.actionLabel ?? `${loadedApp.name} Action`
  }

  document.title = `Even Demo - ${loadedApp.name}`
  console.log('[app-loader] Selected app', {
    selectedAppName,
    appNames,
  })

  updateStatus(loadedApp.initialStatus ?? `${loadedApp.name} app ready`)
  const actions = await loadedApp.createActions(updateStatus)
  let isConnecting = false
  let isRunningAction = false

  connectBtn?.addEventListener('click', async () => {
    if (isConnecting) {
      return
    }

    isConnecting = true
    if (connectBtn) {
      connectBtn.disabled = true
    }

    try {
      await actions.connect()
    } catch (error) {
      console.error('[app-loader] connect action failed', error)
      updateStatus('Connect action failed')
    } finally {
      isConnecting = false
      if (connectBtn) {
        connectBtn.disabled = false
      }
    }
  })

  actionBtn?.addEventListener('click', async () => {
    if (isRunningAction) {
      return
    }

    isRunningAction = true
    if (actionBtn) {
      actionBtn.disabled = true
    }

    try {
      await actions.action()
    } catch (error) {
      console.error('[app-loader] secondary action failed', error)
      updateStatus('Action failed')
    } finally {
      isRunningAction = false
      if (actionBtn) {
        actionBtn.disabled = false
      }
    }
  })
}

void boot().catch((error) => {
  console.error('[app-loader] boot failed', error)
  updateStatus('App boot failed')
})
