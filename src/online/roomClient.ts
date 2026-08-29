import type { BattleRule, OnlineCommandType, Seat } from '@/shared/bp-core'
import { supabase } from '@/lib/supabase'
import type { CommandResponse, RoomSnapshot } from './types'

/**
 * 在线房间 API 封装：Edge Function 调用 + RLS 保护的快照读取。
 * UI 组件永远不直接接触这里（通过 onlineRoomStore / MatchSource 间接使用）。
 */

export interface CreateRoomInput {
  displayName: string
  seat: 'BLUE' | 'RED'
  rule: BattleRule
  pool: { id: string; enabled: boolean }[]
}

export interface JoinRoomInput {
  code: string
  seat: 'AUTO' | 'BLUE' | 'RED' | 'OBSERVER'
  displayName: string
}

export interface RoomIdentity {
  roomId: string
  code: string
  seat: Seat
  rejoined: boolean
}

function requireClient() {
  if (!supabase) throw new Error('在线模式尚未配置')
  return supabase
}

/** 统一解析 Edge Function 错误为 { code, message } */
async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const client = requireClient()
  const { data, error } = await client.functions.invoke(name, { body })
  if (error) {
    // functions.invoke 把非 2xx 放进 error（FunctionsHttpError），正文需要解析
    let payload: { error?: string; message?: string; code?: string } = {}
    if (error instanceof Error && 'context' in error) {
      try {
        payload = await (error as { context: Response }).context.json()
      } catch {
        /* ignore */
      }
    }
    throw Object.assign(new Error(payload.message ?? error.message), {
      code: payload.error ?? payload.code ?? 'NETWORK',
    })
  }
  return data as T
}

export const roomApi = {
  async createRoom(input: CreateRoomInput): Promise<RoomIdentity> {
    return callFunction<RoomIdentity>('room-create', { ...input })
  },

  async joinRoom(input: JoinRoomInput): Promise<RoomIdentity> {
    return callFunction<RoomIdentity>('room-join', { ...input })
  },

  /** 拉取权威快照（RLS：仅成员可读；非成员读取返回 null room） */
  async fetchSnapshot(roomId: string): Promise<RoomSnapshot> {
    const client = requireClient()
    const { data: room, error: roomError } = await client
      .from('rooms')
      .select('id, code, status, match_state, revision, pending_action, expires_at, host_user_id, pool')
      .eq('id', roomId)
      .maybeSingle()
    if (roomError) throw Object.assign(new Error(roomError.message), { code: 'DB_ERROR' })

    const { data: members, error: membersError } = await client
      .from('room_members')
      .select('user_id, seat, display_name')
      .eq('room_id', roomId)
    if (membersError) throw Object.assign(new Error(membersError.message), { code: 'DB_ERROR' })

    return {
      room: (room as RoomSnapshot['room']) ?? null,
      members: (members as RoomSnapshot['members']) ?? [],
    }
  },

  async fetchRoomIdByCode(code: string): Promise<string | null> {
    const client = requireClient()
    // RLS：只有成员能读到（用于刷新恢复）；未加入者必须走 joinRoom
    const { data } = await client.from('rooms').select('id').eq('code', code.toUpperCase()).maybeSingle()
    return data?.id ?? null
  },

  async sendCommand(input: {
    roomId: string
    commandId: string
    expectedRevision: number
    type: OnlineCommandType
    payload?: { ninjaId?: string; side?: string }
  }): Promise<CommandResponse> {
    return callFunction<CommandResponse>('room-command', input)
  },
}
