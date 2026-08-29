import type { MatchState, OnlineCommandType, PendingUndo, RoomStatus, Seat } from '@/shared/bp-core'

/** 客户端在线模式的类型（与 Shared BP Core / 数据库结构对应） */

export type { OnlineCommandType, PendingUndo, RoomStatus, Seat }

export interface RoomMember {
  user_id: string
  seat: Seat
  display_name: string
}

/** 从数据库拉取的权威房间快照 */
export interface RoomSnapshot {
  room: {
    id: string
    code: string
    status: RoomStatus
    match_state: MatchState
    revision: number
    pending_action: PendingUndo | null
    expires_at: string
    host_user_id: string
    pool: { id: string; enabled: boolean }[]
  } | null
  members: RoomMember[]
}

export interface CommandResponse {
  status: 'APPLIED' | 'REJECTED'
  idempotent?: boolean
  match?: MatchState
  revision?: number
  roomStatus?: RoomStatus
  pendingUndo?: PendingUndo | null
  code?: string
  message?: string
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'syncing' | 'reconnecting' | 'offline'

/** Presence 条目（只做临时在线信息，禁止存放 BP 状态） */
export interface PresenceEntry {
  seat: Seat
  displayName: string
  onlineAt: number
}
