import { describe, expect, it } from 'vitest'
import {
  applyRoomCommand,
  canSelectResource,
  createMatch,
  enterGame,
  getMinimumRequiredResources,
  getPhase,
  migrateDataPackV1ToV2,
  nextGame,
  selectResource,
  setGameWinner,
  startMatch,
  undoLastAction,
  validateBattleDataPack,
  type BattleResources,
  type EngineResult,
  type RoomCommandContext,
} from '../supabase/functions/_shared/bp-core/index'
import { FULL_LOADOUT_DEMO_RULE } from '../src/data/defaultRules'

const resources: BattleResources = {
  ninjas: Array.from({ length: 30 }, (_, index) => ({ id: `n-${index}`, name: `N${index}`, quality: 'A' as const, tags: [], enabled: true })),
  secretScrolls: Array.from({ length: 4 }, (_, index) => ({ id: `s-${index}`, name: `S${index}`, tags: [], enabled: true })),
  summons: Array.from({ length: 8 }, (_, index) => ({ id: `m-${index}`, name: `M${index}`, tags: [], enabled: true })),
}

function advanceNinjas(match: ReturnType<typeof startMatch>) {
  let current = match
  let index = 0
  while (getPhase(current).resourceType === 'NINJA') {
    const item = resources.ninjas[index++]
    const result = selectResource(current, 'NINJA', item.id, item)
    if (!result.ok || !result.state) throw new Error(result.reason)
    current = result.state
  }
  return current
}

function must(result: EngineResult) {
  if (!result.ok || !result.state) throw new Error(result.reason)
  return result.state
}

describe('Generic Resource Draft Framework', () => {
  it('v1 Ninja-only pack 无损迁移为 v2 空辅助资源包', () => {
    const migrated = migrateDataPackV1ToV2({
      manifest: { schemaVersion: 1, id: 'legacy', name: 'Legacy', version: '1', updatedAt: new Date().toISOString(), ninjaCount: 1 },
      ninjas: [resources.ninjas[0]],
    })
    expect(migrated.manifest).toMatchObject({ schemaVersion: 2, ninjaCount: 1, secretScrollCount: 0, summonCount: 0 })
    expect(migrated.secretScrolls).toEqual([])
    expect(validateBattleDataPack(migrated.manifest, migrated.ninjas, [], [])).toEqual([])
  })

  it('完整流程按 Ninja → Secret Scroll → Summon 推导阶段并保留通灵顺序', () => {
    let match = advanceNinjas(startMatch(createMatch(FULL_LOADOUT_DEMO_RULE)))
    expect(getPhase(match)).toMatchObject({ resourceType: 'SECRET_SCROLL', side: 'BLUE', action: 'PICK' })
    for (const [type, item] of [
      ['SECRET_SCROLL', resources.secretScrolls[0]],
      ['SECRET_SCROLL', resources.secretScrolls[1]],
      ['SUMMON', resources.summons[0]],
      ['SUMMON', resources.summons[1]],
      ['SUMMON', resources.summons[2]],
      ['SUMMON', resources.summons[3]],
      ['SUMMON', resources.summons[4]],
      ['SUMMON', resources.summons[5]],
    ] as const) {
      const result = selectResource(match, type, item.id, item)
      expect(result.ok).toBe(true)
      match = result.state!
    }
    expect(getPhase(match).status).toBe('READY')
    expect(match.games[0].blue.resources?.SUMMON?.picks).toEqual(['m-0', 'm-1', 'm-2'])
    expect(match.games[0].red.resources?.SUMMON?.picks).toEqual(['m-3', 'm-4', 'm-5'])
  })

  it('wrong phase / disabled / duplicate 被统一校验，撤销辅助资源恢复阶段', () => {
    let match = advanceNinjas(startMatch(createMatch(FULL_LOADOUT_DEMO_RULE)))
    expect(canSelectResource(match, 'SUMMON', 'm-0', resources.summons[0]).allowed).toBe(false)
    expect(canSelectResource(match, 'SECRET_SCROLL', 's-0', { ...resources.secretScrolls[0], enabled: false }).allowed).toBe(false)
    match = selectResource(match, 'SECRET_SCROLL', 's-0', resources.secretScrolls[0]).state!
    expect(canSelectResource(match, 'SECRET_SCROLL', 's-0', resources.secretScrolls[0]).allowed).toBe(false)
    const undone = undoLastAction(match)
    expect(undone.ok).toBe(true)
    expect(getPhase(undone.state!).resourceType).toBe('SECRET_SCROLL')
  })

  it('按资源类型返回最小池需求', () => {
    expect(getMinimumRequiredResources(FULL_LOADOUT_DEMO_RULE)).toEqual({ ninjas: 22, secretScrolls: 2, summons: 6 })
  })

  it('在线 SELECT_RESOURCE 由权威 phase/seat 校验，observer 永远只读', () => {
    const match = advanceNinjas(startMatch(createMatch(FULL_LOADOUT_DEMO_RULE)))
    const context: RoomCommandContext = {
      match,
      revision: 4,
      roomStatus: 'ACTIVE',
      expiresAt: Date.now() + 60_000,
      mySeat: 'BLUE',
      isHost: true,
      myUserId: 'blue',
      hostUserId: 'blue',
      seatMembers: { BLUE: { userId: 'blue', displayName: 'B' }, RED: { userId: 'red', displayName: 'R' } },
      pendingUndo: null,
      ninjas: resources.ninjas,
      resources,
      now: Date.now(),
    }
    const command = { commandId: 'c', roomId: 'r', expectedRevision: 4, type: 'SELECT_RESOURCE' as const, payload: { resourceType: 'SECRET_SCROLL' as const, resourceId: 's-0' } }
    expect(applyRoomCommand(context, command)).toMatchObject({ status: 'APPLIED', revision: 5 })
    expect(applyRoomCommand({ ...context, mySeat: 'OBSERVER', isHost: false, myUserId: 'observer' }, command)).toMatchObject({ status: 'REJECTED', code: 'NOT_PERMITTED' })
  })

  it('在线辅助资源校验 nonexistent / disabled / duplicate，且 Undo 可回退最后一次通灵', () => {
    let match = advanceNinjas(startMatch(createMatch(FULL_LOADOUT_DEMO_RULE)))
    const base = (seat: 'BLUE' | 'RED', revision: number): RoomCommandContext => ({
      match,
      revision,
      roomStatus: 'ACTIVE',
      expiresAt: Date.now() + 60_000,
      mySeat: seat,
      isHost: seat === 'BLUE',
      myUserId: seat,
      hostUserId: 'BLUE',
      seatMembers: { BLUE: { userId: 'BLUE', displayName: 'B' }, RED: { userId: 'RED', displayName: 'R' } },
      pendingUndo: null,
      ninjas: resources.ninjas,
      resources,
      now: Date.now(),
    })
    const send = (ctx: RoomCommandContext, type: 'SECRET_SCROLL' | 'SUMMON', id: string) => applyRoomCommand(ctx, {
      commandId: `${type}-${id}`,
      roomId: 'r',
      expectedRevision: ctx.revision,
      type: 'SELECT_RESOURCE',
      payload: { resourceType: type, resourceId: id },
    })
    expect(send(base('BLUE', 1), 'SECRET_SCROLL', 'missing')).toMatchObject({ status: 'REJECTED', code: 'RESOURCE_BLOCKED' })
    const disabledResources = { ...resources, secretScrolls: resources.secretScrolls.map((item) => item.id === 's-0' ? { ...item, enabled: false } : item) }
    expect(send({ ...base('BLUE', 1), resources: disabledResources }, 'SECRET_SCROLL', 's-0')).toMatchObject({ status: 'REJECTED', code: 'RESOURCE_BLOCKED' })
    const blueScroll = send(base('BLUE', 1), 'SECRET_SCROLL', 's-0')
    expect(blueScroll.status).toBe('APPLIED')
    match = blueScroll.status === 'APPLIED' ? blueScroll.match : match
    const redScroll = send(base('RED', 2), 'SECRET_SCROLL', 's-1')
    match = redScroll.status === 'APPLIED' ? redScroll.match : match
    const firstSummon = send(base('BLUE', 3), 'SUMMON', 'm-0')
    match = firstSummon.status === 'APPLIED' ? firstSummon.match : match
    expect(send(base('BLUE', 4), 'SUMMON', 'm-0')).toMatchObject({ status: 'REJECTED', code: 'RESOURCE_BLOCKED' })
    const undone = undoLastAction(match)
    expect(undone.ok).toBe(true)
    expect(undone.state?.games[0].blue.resources?.SUMMON?.picks).toEqual([])
  })

  it('辅助资源 crossGameLock 可配置并在下一局生效', () => {
    const rule = structuredClone(FULL_LOADOUT_DEMO_RULE)
    rule.resourceDrafts!.find((item) => item.resourceType === 'SECRET_SCROLL')!.crossGameLock = true
    const first = startMatch(createMatch(rule)).games[0]
    first.blue.resources = { SECRET_SCROLL: { bans: [], picks: ['s-0'] } }
    let match = startMatch(createMatch(rule))
    match.games = [first, { gameNumber: 2, blue: { bans: [], picks: [] }, red: { bans: [], picks: [] }, started: false }]
    match.currentGame = 2
    match = advanceNinjas(match)
    expect(canSelectResource(match, 'SECRET_SCROLL', 's-0', resources.secretScrolls[0])).toMatchObject({ allowed: false })
  })

  it('resetEachGame=false 时继承 loadout，且继承槽位不推进下一局序列', () => {
    const rule = structuredClone(FULL_LOADOUT_DEMO_RULE)
    rule.bestOf = 3
    rule.winsRequired = 2
    rule.resourceDrafts = [{
      resourceType: 'SECRET_SCROLL',
      enabled: true,
      slotsPerSide: 1,
      sequence: [
        { side: 'BLUE', action: 'PICK', count: 1 },
        { side: 'RED', action: 'PICK', count: 1 },
      ],
      crossGameLock: false,
      uniqueAcrossSides: true,
      banPersistence: false,
      resetEachGame: false,
    }]
    let match = startMatch(createMatch(rule, 'B', 'R'))
    match = must(selectResource(match, 'SECRET_SCROLL', 's-0', resources.secretScrolls[0]))
    match = must(selectResource(match, 'SECRET_SCROLL', 's-1', resources.secretScrolls[1]))
    match = must(enterGame(match))
    match = must(setGameWinner(match, 'BLUE'))
    match = must(nextGame(match))

    expect(match.games[1].blue.resources?.SECRET_SCROLL?.picks).toEqual(['s-0'])
    expect(match.games[1].red.resources?.SECRET_SCROLL?.picks).toEqual(['s-1'])
    expect(getPhase(match).status).toBe('READY')
    expect(getPhase(match).totalDone).toBe(0)
  })
})
