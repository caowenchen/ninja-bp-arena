import { create } from 'zustand'
import type { BattleRule, MatchState, OnlineCommandType, PendingUndo, RoomStatus, Seat } from '@bp-core'
import { supabase, isOnlineConfigured } from '@/lib/supabase'
import { roomApi } from './roomClient'
import { useNinjaStore } from '@/store/ninjaStore'
import type { ConnectionState, PresenceEntry, RoomMember } from './types'

/**
 * 在线房间 Store。
 *
 * 关键原则：
 * - 数据库 / Edge Function 是权威状态源，客户端只发送命令
 * - Realtime 只负责“有更新”的通知，收到后重新拉取权威快照
 * - presence 只存放临时在线信息（禁止存放 Ban/Pick）
 * - pendingCommand 期间禁止重复点击（正确性优先于 100ms 动画）
 */

interface OnlineRoomState {
  configOk: boolean
  userId: string | null
  authReady: boolean

  roomId: string | null
  roomCode: string | null
  roomStatus: RoomStatus | null
  roomExpiresAt: number | null
  match: MatchState | null
  revision: number
  members: RoomMember[]
  mySeat: Seat | null
  isHost: boolean
  pendingUndo: PendingUndo | null

  connection: ConnectionState
  pendingCommand: OnlineCommandType | null
  lastError: { code: string; message: string } | null
  presence: Record<string, PresenceEntry>
  onlineNinjaIds: string[] | null

  ensureAuth: () => Promise<boolean>
  createRoom: (input: { displayName: string; seat: 'BLUE' | 'RED'; rule: MatchState['rule'] }) => Promise<{ ok: boolean; code?: string; error?: string }>
  joinRoom: (input: { code: string; seat: 'AUTO' | 'BLUE' | 'RED' | 'OBSERVER'; displayName: string }) => Promise<{ ok: boolean; seat?: Seat; error?: string }>
  enterRoom: (roomId: string, code: string) => Promise<{ ok: boolean; error?: string }>
  sendCommand: (type: OnlineCommandType, payload?: { ninjaId?: string; side?: string }) => Promise<{ ok: boolean; reason?: string }>
  leaveRoom: () => void
  refreshSnapshot: () => Promise<void>
  clearError: () => void
}

let currentChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

function deriveMySeat(members: RoomMember[], userId: string | null): Seat | null {
  if (!userId) return null
  return members.find((m) => m.user_id === userId)?.seat ?? null
}

export const useOnlineRoomStore = create<OnlineRoomState>()((set, get) => ({
  configOk: isOnlineConfigured,
  userId: null,
  authReady: false,

  roomId: null,
  roomCode: null,
  roomStatus: null,
  roomExpiresAt: null,
  match: null,
  revision: -1,
  members: [],
  mySeat: null,
  isHost: false,
  pendingUndo: null,

  connection: 'idle',
  pendingCommand: null,
  lastError: null,
  presence: {},
  onlineNinjaIds: null,

  // ---- 匿名认证：首次进入在线模式自动 signInAnonymously ----
  ensureAuth: async () => {
    if (!supabase) return false
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) {
      set({ userId: data.session.user.id, authReady: true })
      return true
    }
    const { data: anon, error } = await supabase.auth.signInAnonymously()
    if (error || !anon.session) {
      set({ lastError: { code: 'AUTH_FAILED', message: '进入在线模式失败，请稍后重试' }, authReady: true })
      return false
    }
    set({ userId: anon.session.user.id, authReady: true })
    return true
  },

  createRoom: async ({ displayName, seat, rule }) => {
    if (!get().configOk) return { ok: false, error: '在线模式尚未配置' }
    try {
      const authOk = await get().ensureAuth()
      if (!authOk) return { ok: false, error: '进入在线模式失败' }
      const pool = useNinjaStore.getState().ninjas.map((n) => ({ id: n.id, enabled: n.enabled }))
      const identity = await roomApi.createRoom({ displayName, seat, rule: rule as BattleRule, pool })
      const entered = await get().enterRoom(identity.roomId, identity.code)
      return entered.ok ? { ok: true, code: identity.code } : { ok: false, error: entered.error }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  joinRoom: async ({ code, seat, displayName }) => {
    if (!get().configOk) return { ok: false, error: '在线模式尚未配置' }
    try {
      const authOk = await get().ensureAuth()
      if (!authOk) return { ok: false, error: '进入在线模式失败' }
      const identity = await roomApi.joinRoom({ code, seat, displayName })
      const entered = await get().enterRoom(identity.roomId, identity.code)
      return entered.ok ? { ok: true, seat: identity.seat } : { ok: false, error: entered.error }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  /** 进入房间：拉快照 + 订阅 Realtime / Presence（刷新恢复的入口） */
  enterRoom: async (roomId, code) => {
    if (!supabase) return { ok: false, error: '在线模式尚未配置' }
    set({ connection: 'connecting', roomId, roomCode: code, lastError: null })
    try {
      const snap = await roomApi.fetchSnapshot(roomId)
      if (!snap.room) {
        set({ connection: 'offline', lastError: { code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' } })
        return { ok: false, error: '房间不存在或你没有加入该房间' }
      }
      const userId = get().userId
      const mySeat = deriveMySeat(snap.members, userId)
      set({
        roomStatus: snap.room.status,
        roomExpiresAt: new Date(snap.room.expires_at).getTime(),
        match: snap.room.match_state,
        revision: snap.room.revision,
        members: snap.members,
        mySeat,
        isHost: snap.room.host_user_id === userId,
        pendingUndo: snap.room.pending_action ?? null,
        onlineNinjaIds: Array.isArray(snap.room.pool) ? snap.room.pool.map((n) => n.id) : null,
      })

      // 订阅：postgres_changes 通知 → 重新拉取权威快照；presence 只做在线展示
      if (currentChannel) {
        await supabase.removeChannel(currentChannel)
        currentChannel = null
      }
      const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: userId ?? 'anon' } } })
      currentChannel = channel

      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
          void get().refreshSnapshot()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, () => {
          void get().refreshSnapshot()
        })
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState() as unknown as Record<string, PresenceEntry[]>
          const map: Record<string, PresenceEntry> = {}
          for (const [key, entries] of Object.entries(state)) {
            const latest = entries[entries.length - 1]
            if (latest) map[key] = latest
          }
          set({ presence: map })
        })
        .on('presence', { event: 'join' }, () => void get().refreshSnapshot())
        .on('presence', { event: 'leave' }, () => void get().refreshSnapshot())
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            set({ connection: 'connected' })
            const me = get().members.find((m) => m.user_id === get().userId)
            if (me) {
              await channel.track({
                seat: me.seat,
                displayName: me.display_name,
                onlineAt: Date.now(),
              } satisfies PresenceEntry)
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            set({ connection: 'reconnecting' })
          } else if (status === 'CLOSED') {
            set({ connection: 'offline' })
          }
        })

      return { ok: true }
    } catch (err) {
      set({ connection: 'offline', lastError: { code: 'SNAPSHOT_FAILED', message: err instanceof Error ? err.message : String(err) } })
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  /** 信任数据库权威快照（Realtime 只触发这次刷新） */
  refreshSnapshot: async () => {
    const roomId = get().roomId
    if (!roomId || !supabase) return
    try {
      const snap = await roomApi.fetchSnapshot(roomId)
      if (!snap.room) return
      const userId = get().userId
      set({
        roomStatus: snap.room.status,
        roomExpiresAt: new Date(snap.room.expires_at).getTime(),
        match: snap.room.match_state,
        revision: snap.room.revision,
        members: snap.members,
        mySeat: deriveMySeat(snap.members, userId),
        isHost: snap.room.host_user_id === userId,
        pendingUndo: snap.room.pending_action ?? null,
        connection: get().connection === 'syncing' ? 'connected' : get().connection,
      })
    } catch {
      set({ connection: 'reconnecting' })
    }
  },

  /** 发送语义命令：服务端验证 → 应用 → 返回权威状态 */
  sendCommand: async (type, payload) => {
    const { roomId, revision, pendingCommand, match } = get()
    if (!supabase || !roomId || !match) return { ok: false, reason: '未连接房间' }
    if (pendingCommand) return { ok: false, reason: '正在确认上一步操作……' }

    const commandId = crypto.randomUUID()
    set({ pendingCommand: type, connection: 'syncing' })
    try {
      const res = await roomApi.sendCommand({ roomId, commandId, expectedRevision: revision, type, payload })
      if (res.status === 'APPLIED' && res.match) {
        set({
          match: res.match,
          revision: res.revision ?? get().revision + 1,
          roomStatus: res.roomStatus ?? get().roomStatus,
          pendingUndo: res.pendingUndo ?? null,
          pendingCommand: null,
          connection: 'connected',
        })
        return { ok: true }
      }
      const message = res.message ?? '操作被拒绝'
      set({ pendingCommand: null, connection: 'connected', lastError: { code: res.code ?? 'REJECTED', message } })
      return { ok: false, reason: message }
    } catch (err) {
      const code = (err as { code?: string }).code
      const message = err instanceof Error ? err.message : '网络异常'
      set({ pendingCommand: null, connection: code === 'REVISION_CONFLICT' ? 'connected' : 'reconnecting' })
      if (code === 'REVISION_CONFLICT') {
        set({ lastError: { code, message: '比赛状态已更新，正在同步' } })
        void get().refreshSnapshot()
        return { ok: false, reason: '比赛状态已更新，正在同步' }
      }
      set({ lastError: { code: code ?? 'NETWORK', message } })
      return { ok: false, reason: message }
    }
  },

  /** 离开页面：保留席位方便重连（数据库成员记录保留） */
  leaveRoom: () => {
    if (supabase && currentChannel) {
      void supabase.removeChannel(currentChannel)
    }
    currentChannel = null
    set({
      roomId: null,
      roomCode: null,
      roomStatus: null,
      roomExpiresAt: null,
      match: null,
      revision: -1,
      members: [],
      mySeat: null,
      isHost: false,
      pendingUndo: null,
      connection: 'idle',
      pendingCommand: null,
      presence: {},
    })
  },

  clearError: () => set({ lastError: null }),
}))
