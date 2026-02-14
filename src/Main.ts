import { initEven } from './even'
import { updateStatus } from './ui'

type EvenInstance = Awaited<ReturnType<typeof initEven>>['even']

let evenInstance: EvenInstance | null = null

async function start() {
  const connectBtn = document.getElementById("connectBtn")
  const actionBtn = document.getElementById("actionBtn")

  connectBtn?.addEventListener("click", async () => {
    updateStatus("Connecting to Even bridge...")

    try {
      const { even } = await initEven()
      evenInstance = even

      await even.renderStartupScreen()

      if (even.mode === 'bridge') {
        updateStatus("Connected. Demo page rendered in Even Hub Simulator.")
      } else {
        updateStatus("Bridge not found. Running browser-only mock mode.")
      }

    } catch (err) {
      console.error(err)
      updateStatus("Connection failed")
    }
  })

  actionBtn?.addEventListener("click", async () => {
    if (!evenInstance) {
      updateStatus("Not connected")
      return
    }

    updateStatus("Sending demo action...")

    await evenInstance.sendDemoAction()

    updateStatus("Done")
  })
}

start()
