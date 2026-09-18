import { useMemo } from 'react'
import type { MatchState, Ninja } from '@bp-core'
import { useNinjaStore } from '@/store/ninjaStore'
import { buildSnapshotLookup } from '@/dataPack/matchSnapshot'

/**
 * 比赛忍者查找：快照优先（比赛创建时固化的显示数据），
 * 快照缺失时回退当前本地池，最后回退「未知忍者」。
 *
 * 这样数据包更新 / 角色改名 / 角色删除都不会破坏历史赛果显示
 * （历史记录仍然显示比赛当时保存的名字）。
 */
export function useNinjaLookup(match: MatchState | null | undefined): {
  getById: (id: string) => (Ninja & { __fromSnapshot?: boolean }) | undefined
  nameOf: (id: string) => string
  avatarOf: (id: string) => string | undefined
} {
  const snapshot = match?.ninjaSnapshot
  const storeGetById = useNinjaStore((s) => s.getById)

  return useMemo(() => {
    const snap = buildSnapshotLookup(snapshot)
    const getById = (id: string) => {
      const fromSnapshot = snap.get(id)
      if (fromSnapshot) {
        return {
          id: fromSnapshot.id,
          name: fromSnapshot.name,
          quality: fromSnapshot.quality,
          enabled: fromSnapshot.enabled,
          avatar: fromSnapshot.avatar,
          assetKey: fromSnapshot.assetKey,
          tags: [],
          __fromSnapshot: true,
        }
      }
      return storeGetById(id)
    }
    return {
      getById,
      nameOf: (id) => getById(id)?.name ?? '未知忍者',
      avatarOf: (id) => getById(id)?.avatar,
    }
  }, [snapshot, storeGetById])
}
