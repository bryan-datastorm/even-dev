import type { AppModule } from '../_shared/app-types'
import { createRedditActions } from './main'

export const app: AppModule = {
  id: 'reddit',
  name: 'Reddit Client',
  pageTitle: 'Even Hub Reddit Client',
  connectLabel: 'Connect Reddit',
  actionLabel: 'Refresh Feed',
  initialStatus: 'Reddit client ready',
  createActions: createRedditActions,
}

export default app
