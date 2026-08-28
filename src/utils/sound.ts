/**
 * 轻量 SoundManager 预留。
 *
 * 使用 WebAudio 合成音，不打包任何版权游戏音效；
 * 默认关闭，可在设置中开启。
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType, volume: number): void {
  const audio = getCtx()
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = audio.currentTime + startOffset
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

export type SoundName = 'select' | 'ban' | 'timeout' | 'win'

export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return
  try {
    switch (name) {
      case 'select':
        tone(880, 0, 0.08, 'sine', 0.05)
        break
      case 'ban':
        tone(220, 0, 0.16, 'square', 0.04)
        break
      case 'timeout':
        tone(330, 0, 0.2, 'square', 0.05)
        tone(262, 0.22, 0.25, 'square', 0.05)
        break
      case 'win':
        tone(523, 0, 0.12, 'sine', 0.06)
        tone(659, 0.12, 0.12, 'sine', 0.06)
        tone(784, 0.24, 0.2, 'sine', 0.06)
        break
    }
  } catch {
    /* 声音失败不影响功能 */
  }
}
