import { describe, expect, it } from 'vitest'
import { resolveAsset } from '@/dataPack/assetResolver'

const resource = { id: 'demo', asset: undefined, avatar: '/resource.webp', assetKey: 'demo.webp' }

describe('asset resolver v0.6', () => {
  it('uses user override before asset pack and resource URLs', () => {
    expect(resolveAsset(resource, {
      userOverride: '/user.webp',
      assetPack: { id: 'pack', version: '1', baseUrl: '/pack/', overrides: { demo: '/override.webp' } },
      packManifest: { assetBaseUrl: '/data/' },
    })).toMatchObject({ url: '/user.webp', source: 'USER_OVERRIDE', health: 'OK' })
  })

  it('uses installed asset pack before resource fallback', () => {
    expect(resolveAsset(resource, { assetPack: { id: 'pack', version: '1', baseUrl: '/pack/' } })).toMatchObject({
      url: '/pack/demo.webp', source: 'ASSET_PACK',
    })
  })

  it('rejects Base64 and reports fallback health without blocking the resource', () => {
    expect(resolveAsset({ ...resource, avatar: 'data:image/png;base64,bad', assetKey: undefined })).toEqual({
      source: 'PLACEHOLDER', health: 'INVALID_URL',
    })
  })
})
