import { describe, expect, it } from 'vitest'
import {
  createReplayBundle,
  createReplayFromMatch,
  migrateReplayToCurrentSchema,
  reconstructReplayAt,
  sha256Canonical,
  validateReplay,
  validateReplayBundle,
} from '../supabase/functions/_shared/bp-core/replay'
import { createMatch, enterGame, nextGame, selectNinja, setGameWinner, startMatch } from '../src/engine/bpEngine'
import { cloneRule, DEFAULT_RULE } from '../src/data/defaultRules'
import { NINJA_POOL } from '../src/data/ninjas'
import type { MatchState } from '../src/types/match'

function select(match: MatchState, index: number): MatchState {
  const ninja = NINJA_POOL[index]
  const result = selectNinja(match, ninja.id, ninja)
  if (!result.ok || !result.state) throw new Error(result.reason)
  return result.state
}

function completeMatch(): MatchState {
  let match = startMatch(createMatch(cloneRule(DEFAULT_RULE), 'Alpha', 'Beta'))
  match = { ...match, ninjaSnapshot: NINJA_POOL.map(({ id, name, enabled, quality, avatar, assetKey }) => ({ id, name, enabled, quality, avatar, assetKey })) }
  let cursor = 0
  for (let game = 1; game <= 2; game += 1) {
    const count = game === 1 ? 10 : 6
    for (let i = 0; i < count; i += 1) match = select(match, cursor++)
    match = setGameWinner(enterGame(match).state!, 'BLUE').state!
    if (game === 1) match = nextGame(match).state!
  }
  return match
}

describe('BP Replay core', () => {
  it('builds a compact, self-contained replay and reconstructs score progression', () => {
    const match = completeMatch()
    const replay = createReplayFromMatch(match)
    expect(validateReplay(replay)).toEqual({ ok: true, errors: [] })
    expect(replay.resourceSnapshot).toHaveLength(16)
    expect(replay.resourceSnapshot.length).toBeLessThan(NINJA_POOL.length)
    expect(replay.games).toHaveLength(2)
    const resultSteps = replay.actions.map((action, index) => action.type === 'RESULT' ? index + 1 : -1).filter((value) => value > 0)
    expect(reconstructReplayAt(replay, 0).score).toEqual({ blue: 0, red: 0 })
    expect(reconstructReplayAt(replay, resultSteps[0]).score).toEqual({ blue: 1, red: 0 })
    expect(reconstructReplayAt(replay, replay.actions.length).score).toEqual({ blue: 2, red: 0 })
    expect(reconstructReplayAt(replay, replay.actions.length).complete).toBe(true)
    expect(replay.resourceSnapshot[0].name).not.toBe(replay.resourceSnapshot[0].id)
  })

  it('canonical checksum is stable across object key order and detects corruption', () => {
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(sha256Canonical({ a: 1, b: 2 }))
    const bundle = createReplayBundle(createReplayFromMatch(completeMatch()))
    expect(validateReplayBundle(bundle).ok).toBe(true)
    bundle.replay.players.blue = 'tampered'
    expect(validateReplayBundle(bundle).errors.join()).toContain('checksum')
  })

  it('rejects malformed, duplicate, impossible, missing, future and unsafe inputs', () => {
    const replay = createReplayFromMatch(completeMatch())
    const duplicate = structuredClone(replay)
    duplicate.actions[1].id = duplicate.actions[0].id
    expect(validateReplay(duplicate).ok).toBe(false)
    const impossible = structuredClone(replay)
    impossible.finalScore.blue = 1
    expect(validateReplay(impossible).errors.join()).toContain('比分')
    const missing = structuredClone(replay)
    missing.resourceSnapshot.pop()
    expect(validateReplay(missing).errors.join()).toContain('缺少资源快照')
    const unsafe = structuredClone(replay)
    unsafe.resourceSnapshot[0].avatar = 'data:image/png;base64,AAAA'
    expect(validateReplay(unsafe).errors.join()).toContain('不安全')
    const future = { ...replay, schemaVersion: 99 }
    expect(validateReplay(future).errors.join()).toContain('未来版本')
    expect(migrateReplayToCurrentSchema(future).ok).toBe(false)
    expect(validateReplay({}).ok).toBe(false)
  })

  it('rejects oversized action arrays and supports the migration entry point', () => {
    const replay = createReplayFromMatch(completeMatch())
    expect(migrateReplayToCurrentSchema(replay)).toMatchObject({ ok: true })
    const huge = { ...replay, actions: Array.from({ length: 2001 }, (_, index) => ({ ...replay.actions[0], id: `a${index}` })) }
    expect(validateReplay(huge).errors.join()).toContain('过大')
  })
})
