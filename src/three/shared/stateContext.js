class StateContext {
  constructor() {
    this._store = new Map()
    // 允许直接属性访问作为语法糖
    return new Proxy(this, {
      get(target, prop) {
        if (prop === '_store') return target._store
        if (target._store.has(prop)) return target._store.get(prop)
        return undefined
      },
      set(target, prop, value) {
        target._store.set(prop, value)
        return true
      },
      has(target, prop) {
        return target._store.has(prop)
      }
    })
  }

  set(key, val)  { this._store.set(key, val) }
  get(key)       { return this._store.get(key) }
  has(key)       { return this._store.has(key) }
  delete(key)    { this._store.delete(key) }
}

export const ctx = new StateContext()
