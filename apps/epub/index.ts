import type { AppModule } from '../_shared/app-types'
import { createEpubActions } from './main'

export const app: AppModule = {
  id: 'epub',
  name: 'EPUB Reader',
  pageTitle: 'Even Hub EPUB Reader',
  connectLabel: 'Connect EPUB',
  actionLabel: 'Load EPUB',
  initialStatus: 'EPUB reader ready',
  createActions: createEpubActions,
}

export default app
