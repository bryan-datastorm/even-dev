import type { AppModule } from '../_shared/app-types'
import { createQuicktestActions } from './main'

export const app: AppModule = {
  id: 'quicktest',
  name: 'Quicktest',
  pageTitle: 'Even Hub Quicktest',
  connectLabel: 'Render Quicktest UI',
  actionLabel: 'Reset Source To File',
  initialStatus: 'Quicktest ready. Paste generated code in textarea, then click Render Quicktest UI.',
  createActions: createQuicktestActions,
}

export default app
