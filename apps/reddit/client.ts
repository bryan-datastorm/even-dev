import {
  CreateStartUpPageContainer,
  DeviceConnectType,
  ListContainerProperty,
  ListItemContainerProperty,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'

import type { ViewState, RedditPost, RedditComment } from './types'
import {
  FEED_OPTIONS,
  TEXT_IDS,
  ITEMS_PER_PAGE,
  SWIPE_COOLDOWN_MS,
  currentFeed,
  setCurrentFeed,
} from './constants'
import { hoursAgo, clamp } from './utils'
import { fetchTopPosts, fetchComments } from './reddit-api'
import { appendEventLog } from '../_shared/log'

const CACHE_TTL_MS = 60 * 60 * 1000

export class EvenRedditClient {
  private view: ViewState = 'feeds'
  private posts: RedditPost[] = []
  private comments: RedditComment[] = []
  private selectedIndex = 0
  private savedPostIndex = 1
  private savedFeedIndex = 0
  private savedCommentIndex = 0
  private isInitializedUi = false
  private lastSwipeTime = 0

  constructor(private bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>) {}

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.bridge.getLocalStorage(key)
      if (!raw) return null
      const entry = JSON.parse(raw) as { ts: number; data: T }
      if (Date.now() - entry.ts > CACHE_TTL_MS) return null
      return entry.data
    } catch {
      return null
    }
  }

  private async cacheSet<T>(key: string, data: T): Promise<void> {
    try {
      await this.bridge.setLocalStorage(key, JSON.stringify({ ts: Date.now(), data }))
    } catch (error) {
      console.warn('Reddit: cache set failed', key, error)
    }
  }

  private swipeThrottleOk(): boolean {
    const now = Date.now()
    if (now - this.lastSwipeTime < SWIPE_COOLDOWN_MS) return false
    this.lastSwipeTime = now
    return true
  }

  async init(): Promise<void> {
    this.bridge.onDeviceStatusChanged((status) => {
      if (status.connectType === DeviceConnectType.Connected) {
        appendEventLog(`Reddit: device connected ${status.sn ?? ''}`)
      }
    })

    this.bridge.onEvenHubEvent((event) => {
      void this.onEvenHubEvent(event)
    })

    const uiOk = await this.ensureStartupUi()
    if (!uiOk) {
      throw new Error('Reddit: startup UI init failed')
    }

    await this.showFeedSelector()
  }

  async reloadFeed(): Promise<void> {
    await this.loadPosts()
  }

  private async ensureStartupUi(): Promise<boolean> {
    if (this.isInitializedUi) return true

    const containerHeight = 96
    const textContainers: TextContainerProperty[] = TEXT_IDS.map((id, idx) => new TextContainerProperty({
      xPosition: 0,
      yPosition: idx * containerHeight,
      width: 576,
      height: containerHeight,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 2,
      containerID: id,
      containerName: `item-${idx + 1}`,
      content: idx === 0 ? 'Loading...' : '',
      isEventCapture: idx === 0 ? 1 : 0,
    }))

    const result = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
      containerTotalNum: 3,
      textObject: textContainers,
    }))

    if (result !== 0) {
      appendEventLog(`Reddit: createStartUpPageContainer failed (${result})`)
      return false
    }

    this.isInitializedUi = true
    return true
  }

  private async showFeedSelector(): Promise<void> {
    this.view = 'feeds'
    this.selectedIndex = this.savedFeedIndex
    await this.renderFeedsPage()
  }

  private async renderFeedsPage(): Promise<void> {
    const names = FEED_OPTIONS.map((feed) => {
      const subs = feed.path ? feed.path.replace(/\+/g, ' ') : 'top'
      const full = `${feed.label} - ${subs}`
      return full.length > 50 ? full.slice(0, 50) : full
    })

    const feedList = new ListContainerProperty({
      containerID: 10,
      containerName: 'feeds',
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 1,
      borderColor: 13,
      borderRdaius: 6,
      paddingLength: 5,
      isEventCapture: 1,
      itemContainer: new ListItemContainerProperty({
        itemCount: FEED_OPTIONS.length,
        itemWidth: 560,
        isItemSelectBorderEn: 1,
        itemName: names,
      }),
    })

    await this.bridge.rebuildPageContainer(new RebuildPageContainer({
      containerTotalNum: 1,
      listObject: [feedList],
    }))
  }

  private async loadPosts(): Promise<void> {
    this.view = 'posts'
    this.selectedIndex = 1

    const cacheKey = `reddit:posts:${currentFeed.path}`
    const cached = await this.cacheGet<RedditPost[]>(cacheKey)
    if (cached) {
      this.posts = cached
      await this.renderPostsPage()
      return
    }

    await this.showLoadingOnGlasses(`Loading ${currentFeed.label}...`)

    try {
      this.posts = await fetchTopPosts(20)
      await this.cacheSet(cacheKey, this.posts)
      await this.renderPostsPage()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendEventLog(`Reddit: post load error ${message}`)
      await this.showLoadingOnGlasses(`Error: ${message}`)
    }
  }

  private async showLoadingOnGlasses(message: string): Promise<void> {
    const containerHeight = Math.floor(288 / ITEMS_PER_PAGE)
    const textContainers: TextContainerProperty[] = TEXT_IDS.map((id, idx) => new TextContainerProperty({
      xPosition: 12,
      yPosition: idx * containerHeight,
      width: 552,
      height: containerHeight,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 2,
      containerID: id,
      containerName: `item-${idx + 1}`,
      content: idx === 0 ? message : '',
      isEventCapture: idx === 0 ? 1 : 0,
    }))

    await this.bridge.rebuildPageContainer(new RebuildPageContainer({
      containerTotalNum: 3,
      textObject: textContainers,
    }))
  }

  private async loadCommentsForSelectedPost(): Promise<void> {
    const post = this.posts[this.selectedIndex]
    if (!post?.permalink || post.numComments <= 0) return

    this.savedPostIndex = this.selectedIndex
    this.view = 'comments'
    this.selectedIndex = 0

    const cacheKey = `reddit:comments:${post.permalink}`
    const cached = await this.cacheGet<RedditComment[]>(cacheKey)
    if (cached) {
      this.comments = cached
      await this.renderCommentsPage()
      return
    }

    await this.showLoadingOnGlasses('Loading comments...')

    try {
      this.comments = await fetchComments(post.permalink, 50)
      await this.cacheSet(cacheKey, this.comments)
      await this.renderCommentsPage()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendEventLog(`Reddit: comments load error ${message}`)
      this.comments = []
      await this.showLoadingOnGlasses(`Error: ${message}`)
      await this.renderCommentsPage()
    }
  }

  private async renderPostsPage(): Promise<void> {
    const adjustedIndex = this.selectedIndex - 1
    const startIdx = Math.floor(adjustedIndex / ITEMS_PER_PAGE) * ITEMS_PER_PAGE
    const containerHeight = Math.floor(288 / ITEMS_PER_PAGE)
    const selectedSlot = adjustedIndex - startIdx

    const textContainers: TextContainerProperty[] = []

    for (let i = 0; i < ITEMS_PER_PAGE; i += 1) {
      const postIdx = startIdx + i + 1
      const post = this.posts[postIdx]
      const containerId = TEXT_IDS[i]
      const isSelected = i === selectedSlot && Boolean(post)

      let content = ''
      if (post) {
        const ageHours = hoursAgo(post.createdUtcSeconds)
        const title = post.title.length > 60 ? `${post.title.slice(0, 60)}...` : post.title
        content = `${title}\n${postIdx}/${this.posts.length - 1} ▲ ${post.ups} ${post.subreddit} - ${post.numComments} comments\n${ageHours}h ago by ${post.author}`
      }

      textContainers.push(new TextContainerProperty({
        xPosition: 12,
        yPosition: i * containerHeight,
        width: 552,
        height: containerHeight,
        borderWidth: isSelected ? 3 : 0,
        borderColor: 5,
        paddingLength: 2,
        containerID: containerId,
        containerName: `item-${i + 1}`,
        content,
        isEventCapture: isSelected ? 1 : 0,
      }))
    }

    await this.bridge.rebuildPageContainer(new RebuildPageContainer({
      containerTotalNum: 3,
      textObject: textContainers,
    }))
  }

  private async renderCommentsPage(): Promise<void> {
    const startIdx = Math.floor(this.selectedIndex / ITEMS_PER_PAGE) * ITEMS_PER_PAGE
    const containerHeight = Math.floor(288 / ITEMS_PER_PAGE)
    const selectedSlot = this.selectedIndex - startIdx

    const textContainers: TextContainerProperty[] = []

    for (let i = 0; i < ITEMS_PER_PAGE; i += 1) {
      const commentIdx = startIdx + i
      const comment = this.comments[commentIdx]
      const containerId = TEXT_IDS[i]
      const isSelected = i === selectedSlot && Boolean(comment)

      let content = ''
      let indentX = 12
      let containerWidth = 552

      if (comment) {
        const ageHours = hoursAgo(comment.createdUtcSeconds)
        indentX = 12 + Math.min(comment.depth * 16, 200)
        containerWidth = 576 - indentX - 12
        const cleanBody = comment.body.replace(/\s+/g, ' ').trim()
        const body = cleanBody.length > 100 ? `${cleanBody.slice(0, 100)}...` : cleanBody
        content = `${commentIdx + 1}/${this.comments.length} ▲${comment.ups} ${comment.author} ${ageHours}h ago\n${body}`
      }

      textContainers.push(new TextContainerProperty({
        xPosition: indentX,
        yPosition: i * containerHeight,
        width: containerWidth,
        height: containerHeight,
        borderWidth: isSelected ? 3 : 0,
        borderColor: 5,
        paddingLength: 2,
        containerID: containerId,
        containerName: `item-${i + 1}`,
        content,
        isEventCapture: isSelected ? 1 : 0,
      }))
    }

    await this.bridge.rebuildPageContainer(new RebuildPageContainer({
      containerTotalNum: 3,
      textObject: textContainers,
    }))
  }

  private async renderCommentDetail(): Promise<void> {
    const comment = this.comments[this.savedCommentIndex]
    if (!comment) return

    const ageHours = hoursAgo(comment.createdUtcSeconds)
    const header = `▲${comment.ups} ${comment.author} ${ageHours}h ago`
    const content = `${header}\n${comment.body.trim()}`

    const textContainers: TextContainerProperty[] = [
      new TextContainerProperty({
        xPosition: 12,
        yPosition: 0,
        width: 552,
        height: 288,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 4,
        containerID: TEXT_IDS[0],
        containerName: 'item-1',
        content,
        isEventCapture: 1,
      }),
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 288,
        width: 1,
        height: 1,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 0,
        containerID: TEXT_IDS[1],
        containerName: 'item-2',
        content: '',
        isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 289,
        width: 1,
        height: 1,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 0,
        containerID: TEXT_IDS[2],
        containerName: 'item-3',
        content: '',
        isEventCapture: 0,
      }),
    ]

    await this.bridge.rebuildPageContainer(new RebuildPageContainer({
      containerTotalNum: 3,
      textObject: textContainers,
    }))
  }

  private async onEvenHubEvent(event: EvenHubEvent): Promise<void> {
    if (event.listEvent) {
      const eventType = event.listEvent.eventType
      const idx = event.listEvent.currentSelectItemIndex

      if ((eventType === OsEventTypeList.CLICK_EVENT || eventType === undefined) && this.view === 'feeds') {
        const selected = typeof idx === 'number' ? clamp(idx, 0, FEED_OPTIONS.length - 1) : this.selectedIndex
        this.savedFeedIndex = selected
        this.selectedIndex = selected
        setCurrentFeed(FEED_OPTIONS[selected])

        const browserSelect = document.getElementById('reddit-feed-select') as HTMLSelectElement | null
        if (browserSelect) browserSelect.value = String(selected)

        appendEventLog(`Reddit: feed selected ${FEED_OPTIONS[selected].label}`)
        await this.loadPosts()
      }

      return
    }

    const eventType = event.textEvent?.eventType ?? event.sysEvent?.eventType

    if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
      if (this.swipeThrottleOk()) await this.handleSwipeLeft()
      return
    }

    if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      if (this.swipeThrottleOk()) await this.handleSwipeRight()
      return
    }

    if (eventType === OsEventTypeList.CLICK_EVENT || eventType === undefined) {
      await this.handleTap()
      return
    }

    if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      await this.handleDoubleTap()
    }
  }

  private async handleSwipeLeft(): Promise<void> {
    if (this.view === 'feeds') return

    if (this.view === 'posts') {
      if (this.selectedIndex <= 1) return
      this.selectedIndex -= 1
      await this.renderPostsPage()
      return
    }

    if (this.view === 'comments') {
      if (this.selectedIndex <= 0) return
      this.selectedIndex -= 1
      await this.renderCommentsPage()
      return
    }

    if (this.view === 'comment-detail') {
      if (this.savedCommentIndex <= 0) return
      this.savedCommentIndex -= 1
      await this.renderCommentDetail()
    }
  }

  private async handleSwipeRight(): Promise<void> {
    if (this.view === 'feeds') return

    if (this.view === 'posts') {
      const maxIdx = this.posts.length - 1
      if (this.selectedIndex >= maxIdx) return
      this.selectedIndex += 1
      await this.renderPostsPage()
      return
    }

    if (this.view === 'comments') {
      const maxIdx = this.comments.length - 1
      if (this.selectedIndex >= maxIdx) return
      this.selectedIndex += 1
      await this.renderCommentsPage()
      return
    }

    if (this.view === 'comment-detail') {
      const maxIdx = this.comments.length - 1
      if (this.savedCommentIndex >= maxIdx) return
      this.savedCommentIndex += 1
      await this.renderCommentDetail()
    }
  }

  private async handleTap(): Promise<void> {
    if (this.view === 'feeds') return

    if (this.view === 'posts') {
      const post = this.posts[this.selectedIndex]
      if (!post || post.numComments <= 0) return
      await this.loadCommentsForSelectedPost()
      return
    }

    if (this.view === 'comments') {
      this.savedCommentIndex = this.selectedIndex
      this.view = 'comment-detail'
      await this.renderCommentDetail()
    }
  }

  private async handleDoubleTap(): Promise<void> {
    if (this.view === 'comment-detail') {
      this.view = 'comments'
      this.selectedIndex = this.savedCommentIndex
      await this.renderCommentsPage()
      return
    }

    if (this.view === 'comments') {
      this.view = 'posts'
      this.selectedIndex = this.savedPostIndex
      await this.renderPostsPage()
      return
    }

    if (this.view === 'posts') {
      await this.showFeedSelector()
    }
  }
}
