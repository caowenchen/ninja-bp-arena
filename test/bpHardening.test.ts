import { describe, expect, it } from 'vitest'
import {
  analyzeRuleFeasibility, applyRoomCommand, canSelectResource, createMatch, enterGame,
  getCurrentDraftPhase, getMinimumRequiredResources, getResourceCardStatus, nextGame, normalizeBattleRule,
  rebuildTimer, selectResource, setGameWinner, startMatch, undoLastAction,
  validateBattleRule, validateMatchState,
  type BattleResources, type BattleRule, type DraftResourceType, type MatchState,
  type RoomCommandContext,
} from '../supabase/functions/_shared/bp-core/index'
import { DEFAULT_RULE, FULL_LOADOUT_DEMO_RULE, cloneRule } from '../src/data/defaultRules'
import { searchRank } from '../src/utils/format'

const pool: BattleResources = {
  ninjas: Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, name: `N${i}`, quality: 'A' as const, tags: [], enabled: true })),
  secretScrolls: Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, tags: [], enabled: true })),
  summons: Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, name: `M${i}`, tags: [], enabled: true })),
}

function resourcesOf(type: DraftResourceType) {
  return type === 'NINJA' ? pool.ninjas : type === 'SECRET_SCROLL' ? pool.secretScrolls : pool.summons
}

function newMatch(rule: BattleRule): MatchState {
  return startMatch(createMatch(rule, 'Blue', 'Red', { id: 'matrix-match', now: 1000 }), { now: 1001 })
}

function draftGame(match: MatchState): MatchState {
  let current = match
  let previousPhase = getCurrentDraftPhase(current)
  while (!previousPhase.sequenceComplete) {
    const type = previousPhase.resourceType!
    const item = resourcesOf(type).find((candidate) => canSelectResource(current, type, candidate.id, candidate).allowed)
    if (!item) throw new Error(`No ${type} available in game ${current.currentGame}`)
    const next = selectResource(current, type, item.id, item, { now: current.updatedAt + 1 })
    if (!next.ok || !next.state) throw new Error(next.reason)
    const nextPhase = getCurrentDraftPhase(next.state)
    if (nextPhase.stepIndex === previousPhase.stepIndex) expect(nextPhase.phaseKey).toBe(previousPhase.phaseKey)
    else expect(nextPhase.phaseKey).not.toBe(previousPhase.phaseKey)
    expect(validateMatchState(next.state)).toBe(true)
    current = next.state
    previousPhase = nextPhase
  }
  expect(previousPhase.status).toBe('READY')
  const entered = enterGame(current, { now: current.updatedAt + 1 })
  expect(entered.ok).toBe(true)
  expect(getCurrentDraftPhase(entered.state!).status).toBe('PLAYING')
  return entered.state!
}

describe('v0.8 normalized BP core', () => {
  it('adapts legacy rules once into the resource draft shape', () => {
    const normalized = normalizeBattleRule(DEFAULT_RULE)
    expect(normalized.resourceDrafts).toHaveLength(1)
    expect(normalized.resourceDrafts[0]).toMatchObject({ resourceType: 'NINJA', slotsPerSide: 3, crossGameLock: true })
    expect('banSequence' in normalized).toBe(false)
    expect(createMatch(DEFAULT_RULE).rule.resourceDrafts).toEqual(normalized.resourceDrafts)
  })

  for (const template of ['NINJA', 'FULL'] as const) {
    for (const bestOf of [1, 3, 5] as const) {
      for (const persistent of [false, true]) {
        for (const locked of [false, true]) {
          it(`${template} BO${bestOf} persistent=${persistent} lock=${locked} reaches correct finish`, () => {
            const rule = cloneRule(template === 'NINJA' ? DEFAULT_RULE : FULL_LOADOUT_DEMO_RULE)
            rule.bestOf = bestOf
            rule.winsRequired = (bestOf + 1) / 2
            rule.banOnlyFirstGame = false
            rule.banPersistence = persistent
            rule.usedNinjaLocked = locked
            if (rule.resourceDrafts) for (const draft of rule.resourceDrafts) {
              draft.banOnlyFirstGame = false
              draft.banPersistence = persistent
              draft.crossGameLock = locked
            }
            expect(validateBattleRule(rule)).toEqual([])
            let match = newMatch(rule)
            for (let gameIndex = 0; gameIndex < bestOf; gameIndex += 1) {
              match = draftGame(match)
              const winner = gameIndex % 2 === 0 ? 'BLUE' : 'RED'
              const result = setGameWinner(match, winner, { now: match.updatedAt + 1 })
              expect(result.ok).toBe(true)
              match = result.state!
              expect(match.score.blue).toBe(match.games.filter((g) => g.winner === 'BLUE').length)
              expect(match.score.red).toBe(match.games.filter((g) => g.winner === 'RED').length)
              expect(validateMatchState(match)).toBe(true)
              if (gameIndex < bestOf - 1) {
                expect(match.status).toBe('IN_PROGRESS')
                const priorKey = getCurrentDraftPhase(match).phaseKey
                match = nextGame(match, { now: match.updatedAt + 1 }).state!
                expect(getCurrentDraftPhase(match).phaseKey).not.toBe(priorKey)
              }
            }
            expect(match.status).toBe('MATCH_FINISHED')
            expect(nextGame(match).ok).toBe(false)
          })
        }
      }
    }
  }

  it('rejects contradictory and malformed rules, and reports pool shortage', () => {
    const bad = cloneRule(FULL_LOADOUT_DEMO_RULE)
    bad.bestOf = 4
    bad.winsRequired = 1
    bad.resourceDrafts![0].slotsPerSide = 0
    bad.resourceDrafts![1].resourceType = 'NINJA'
    bad.resourceDrafts![2].sequence = []
    expect(validateBattleRule(bad).join(' ')).toMatch(/bestOf|赛制/)
    expect(validateBattleRule(bad).join(' ')).toMatch(/winsRequired/)
    expect(validateBattleRule(bad).join(' ')).toMatch(/重复/)
    expect(validateBattleRule(bad).join(' ')).toMatch(/sequence/)
    const contradictory = cloneRule(FULL_LOADOUT_DEMO_RULE)
    contradictory.resourceDrafts![1].resetEachGame = false
    contradictory.resourceDrafts![1].crossGameLock = true
    expect(validateBattleRule(contradictory).join(' ')).toMatch(/继承阵容/)
    const shortage = analyzeRuleFeasibility(DEFAULT_RULE, { ninjas: 10 })
    expect(shortage.errors.join(' ')).toMatch(/至少 22/)
    expect(shortage.requiredResources.ninjas).toBe(22)
  })

  it('calculates transient and persistent bans and shared-side picks', () => {
    const transient = cloneRule(DEFAULT_RULE)
    transient.banOnlyFirstGame = false
    transient.banPersistence = false
    expect(getMinimumRequiredResources(transient).ninjas).toBe(22)
    transient.banPersistence = true
    expect(getMinimumRequiredResources(transient).ninjas).toBe(30)
    const shared = cloneRule(FULL_LOADOUT_DEMO_RULE)
    shared.resourceDrafts![1].uniqueAcrossSides = false
    shared.resourceDrafts![1].crossGameLock = true
    expect(getMinimumRequiredResources(shared).secretScrolls).toBe(3)
  })

  for (const type of ['SECRET_SCROLL', 'SUMMON'] as const) {
    for (const persistent of [false, true]) {
      for (const locked of [false, true]) {
        it(`${type} independently applies persistent=${persistent} and lock=${locked} at game boundary`, () => {
          const rule = cloneRule(FULL_LOADOUT_DEMO_RULE)
          rule.resourceDrafts = [{
            resourceType: type, enabled: true, slotsPerSide: 1,
            sequence: [
              { side: 'BLUE', action: 'BAN', count: 1 },
              { side: 'BLUE', action: 'PICK', count: 1 },
              { side: 'RED', action: 'PICK', count: 1 },
            ],
            crossGameLock: locked, uniqueAcrossSides: true,
            banPersistence: persistent, banOnlyFirstGame: false, resetEachGame: true,
          }]
          expect(validateBattleRule(rule)).toEqual([])
          let match = newMatch(rule)
          const items = resourcesOf(type)
          for (const item of items.slice(0, 3)) {
            const result = selectResource(match, type, item.id, item, { now: match.updatedAt + 1 })
            expect(result.ok).toBe(true)
            match = result.state!
          }
          match = enterGame(match, { now: match.updatedAt + 1 }).state!
          match = setGameWinner(match, 'BLUE', { now: match.updatedAt + 1 }).state!
          match = nextGame(match, { now: match.updatedAt + 1 }).state!
          expect(getCurrentDraftPhase(match)).toMatchObject({ resourceType: type, action: 'BAN', status: 'BANNING' })
          expect(canSelectResource(match, type, items[0].id, items[0]).allowed).toBe(!persistent)
          const ban = selectResource(match, type, items[3].id, items[3], { now: match.updatedAt + 1 })
          expect(ban.ok).toBe(true)
          match = ban.state!
          expect(canSelectResource(match, type, items[1].id, items[1]).allowed).toBe(!locked)
          expect(validateMatchState(match)).toBe(true)
        })
      }
    }
  }

  it('inherits non-reset auxiliary picks without drafting them again', () => {
    const rule = cloneRule(FULL_LOADOUT_DEMO_RULE)
    rule.resourceDrafts = [{
      resourceType: 'SECRET_SCROLL', enabled: true, slotsPerSide: 1,
      sequence: [{ side: 'BLUE', action: 'PICK', count: 1 }, { side: 'RED', action: 'PICK', count: 1 }],
      crossGameLock: false, uniqueAcrossSides: true,
      banPersistence: false, banOnlyFirstGame: false, resetEachGame: false,
    }]
    expect(validateBattleRule(rule)).toEqual([])
    let match = draftGame(newMatch(rule))
    match = setGameWinner(match, 'BLUE', { now: match.updatedAt + 1 }).state!
    match = nextGame(match, { now: match.updatedAt + 1 }).state!
    expect(getCurrentDraftPhase(match).status).toBe('READY')
    expect(match.games[1].blue.resources?.SECRET_SCROLL).toEqual(match.games[0].blue.resources?.SECRET_SCROLL)
    expect(match.games[1].red.resources?.SECRET_SCROLL).toEqual(match.games[0].red.resources?.SECRET_SCROLL)
    expect(enterGame(match).ok).toBe(true)
  })

  it('rejects incomplete, duplicate and banned READY loadouts', () => {
    let match = draftGame(newMatch(DEFAULT_RULE))
    const game = match.games[0]
    match = { ...match, games: [{ ...game, started: false, blue: { ...game.blue, picks: [game.blue.picks[0], game.blue.picks[0], game.blue.picks[2]] } }] }
    expect(getCurrentDraftPhase(match).status).toBe('READY')
    expect(enterGame(match).ok).toBe(false)
    const tampered = { ...match, score: { blue: 1, red: 0 } }
    expect(validateMatchState(tampered)).toBe(false)
  })

  it('returns identical state for the same command and leaves failures immutable', () => {
    const match = newMatch(DEFAULT_RULE)
    const before = structuredClone(match)
    const item = pool.ninjas[0]
    const context = { now: 2000, actionId: 'same-command' }
    const first = selectResource(match, 'NINJA', item.id, item, context)
    const second = selectResource(match, 'NINJA', item.id, item, context)
    expect(first).toEqual(second)
    expect(match).toEqual(before)
    for (const [type, id] of [['SUMMON', 'm0'], ['NINJA', 'missing']] as const) {
      expect(selectResource(match, type, id, resourcesOf(type).find((r) => r.id === id)).ok).toBe(false)
      expect(match).toEqual(before)
    }
    const after = first.state!
    expect(selectResource(after, 'NINJA', item.id, item).ok).toBe(false)
    expect(after).toEqual(first.state)
  })

  it('keeps direct local and online shared-command transitions identical', () => {
    const rule = cloneRule(FULL_LOADOUT_DEMO_RULE)
    rule.timerEnabled = false
    let direct = newMatch(rule)
    let remote = structuredClone(direct)
    let revision = 0
    while (!getCurrentDraftPhase(direct).sequenceComplete) {
      const phase = getCurrentDraftPhase(direct)
      const type = phase.resourceType!
      const item = resourcesOf(type).find((candidate) => canSelectResource(direct, type, candidate.id, candidate).allowed)!
      const commandId = `command-${revision}`
      const now = direct.updatedAt + 1
      direct = selectResource(direct, type, item.id, item, { now, actionId: commandId }).state!
      const ctx: RoomCommandContext = {
        match: remote, revision, roomStatus: 'ACTIVE', expiresAt: 1_000_000,
        mySeat: phase.side!, isHost: phase.side === 'BLUE', myUserId: phase.side!, hostUserId: 'BLUE',
        seatMembers: { BLUE: { userId: 'BLUE', displayName: 'Blue' }, RED: { userId: 'RED', displayName: 'Red' } },
        pendingUndo: null, ninjas: pool.ninjas, resources: pool, now,
      }
      const result = applyRoomCommand(ctx, { commandId, roomId: 'r', expectedRevision: revision, type: 'SELECT_RESOURCE', payload: { resourceType: type, resourceId: item.id } })
      expect(result.status).toBe('APPLIED')
      if (result.status !== 'APPLIED') throw new Error(result.message)
      remote = result.match
      revision = result.revision
      expect(remote).toEqual(direct)
    }
    expect(getCurrentDraftPhase(remote).status).toBe('READY')
  })

  it('rejects wrong turn, game, type, duplicate and expired undo without changing state', () => {
    const match = newMatch(DEFAULT_RULE)
    const original = structuredClone(match)
    const base: RoomCommandContext = {
      match, revision: 2, roomStatus: 'ACTIVE', expiresAt: 1_000_000,
      mySeat: 'BLUE', isHost: true, myUserId: 'BLUE', hostUserId: 'BLUE',
      seatMembers: { BLUE: { userId: 'BLUE', displayName: 'Blue' }, RED: { userId: 'RED', displayName: 'Red' } },
      pendingUndo: null, ninjas: pool.ninjas, resources: pool, now: 2000,
    }
    const cmd = { commandId: 'x', roomId: 'r', expectedRevision: 2, type: 'SELECT_RESOURCE' as const, payload: { resourceType: 'NINJA' as const, resourceId: 'n0' } }
    expect(applyRoomCommand({ ...base, mySeat: 'RED' }, cmd)).toMatchObject({ status: 'REJECTED', code: 'NOT_YOUR_TURN' })
    expect(applyRoomCommand(base, { ...cmd, payload: { ...cmd.payload, gameNumber: 2 } })).toMatchObject({ status: 'REJECTED', code: 'INVALID_COMMAND' })
    expect(applyRoomCommand(base, { ...cmd, payload: { ...cmd.payload, side: 'RED' } })).toMatchObject({ status: 'REJECTED', code: 'INVALID_COMMAND' })
    expect(applyRoomCommand(base, { ...cmd, payload: { resourceType: 'SUMMON', resourceId: 'm0' } })).toMatchObject({ status: 'REJECTED', code: 'INVALID_COMMAND' })
    expect(match).toEqual(original)
    const selected = selectResource(match, 'NINJA', 'n0', pool.ninjas[0]).state!
    const requested = applyRoomCommand({ ...base, match: selected }, { commandId: 'undo', roomId: 'r', expectedRevision: 2, type: 'REQUEST_UNDO' })
    expect(requested.status).toBe('APPLIED')
    if (requested.status !== 'APPLIED') throw new Error(requested.message)
    const expired = applyRoomCommand({ ...base, match: selected, mySeat: 'RED', myUserId: 'RED', isHost: false, revision: 3, now: 32_000, pendingUndo: requested.pendingUndo }, { commandId: 'confirm', roomId: 'r', expectedRevision: 3, type: 'CONFIRM_UNDO' })
    expect(expired).toMatchObject({ status: 'REJECTED', code: 'UNDO_EXPIRED' })
    expect(selected.history).toHaveLength(1)
    expect(undoLastAction(selected).state?.history).toHaveLength(0)
  })

  it('keeps timer deadline on same step and gives a new key on transition', () => {
    const match = newMatch(DEFAULT_RULE)
    const timed = rebuildTimer(match, 10_000)
    const first = selectResource(timed, 'NINJA', 'n0', pool.ninjas[0]).state!
    expect(getCurrentDraftPhase(first).phaseKey).not.toBe(getCurrentDraftPhase(match).phaseKey)
    expect(first.timer?.deadlineAt).toBe(timed.timer?.deadlineAt)
    expect(rebuildTimer(first, 20_000).timer?.deadlineAt).toBe(80_000)
  })

  it('handles a 500 Ninja / 100 Scroll / 100 Summon search and status pass', () => {
    const match = newMatch(FULL_LOADOUT_DEMO_RULE)
    const resources = [
      ...Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, name: `Ninja ${i}`, type: 'NINJA' as const, enabled: true })),
      ...Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, name: `Scroll ${i}`, type: 'SECRET_SCROLL' as const, enabled: true })),
      ...Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, name: `Summon ${i}`, type: 'SUMMON' as const, enabled: true })),
    ]
    const startedAt = performance.now()
    const result = resources.map(({ type, ...item }) => ({
      rank: searchRank(item, '1'),
      status: getResourceCardStatus(match, type, item).status,
    }))
    expect(result).toHaveLength(700)
    expect(result.slice(0, 500).every(({ status }) => status === 'AVAILABLE')).toBe(true)
    expect(result.slice(500).every(({ status }) => status === 'LOCKED')).toBe(true)
    expect(result.filter(({ rank }) => rank < Infinity).length).toBeGreaterThan(100)
    expect(performance.now() - startedAt).toBeLessThan(1500)
  })
})
