/** 指数脉冲驱动的欠阻尼响应；从零位移、零速度起步，按事件年龄解析求值。 */
export function createDampedPulse(period: number, decay: number) {
  const omega = 2 * Math.PI / period, pulseRate = 8 / period
  const response = (time: number) => time <= 0 ? 0 : Math.exp(-pulseRate * time)
    - Math.exp(-decay * time) * (Math.cos(omega * time) + (decay - pulseRate) / omega * Math.sin(omega * time))
  let peak = 0, troughAt = 0, crest = 0, crestAt = 0
  // 仅在创建时归一化第一轮响应，同时给说明页提供同源的过冲/回弹时刻。
  for (let i = 1; i <= 256; i++) {
    const time = i / 256 * period * 1.25, value = response(time)
    if (value > peak) { peak = value; troughAt = time }
    if (value < crest) { crest = value; crestAt = time }
  }
  return { period, decay, troughAt, crestAt, sample: (time: number) => time <= 0 ? 0 : -response(time) / peak }
}

export function createShortRecoil(options: { start: number; period: number; decay: number; amplitude: number; skewSign: number }) {
  const vertical = createDampedPulse(options.period, options.decay)
  const skew = createDampedPulse(options.period * 0.79, options.decay * 1.25)
  const state = { height: 0, skew: 0 }
  let sampledAge = NaN
  return {
    ...options, troughAt: options.start + vertical.troughAt, crestAt: options.start + vertical.crestAt,
    sample(age: number) {
      if (age !== sampledAge) {
        sampledAge = age
        state.height = options.amplitude * vertical.sample(age - options.start)
        state.skew = options.amplitude * 0.32 * options.skewSign * skew.sample(age - options.start - 0.035)
      }
      return state
    },
  }
}
