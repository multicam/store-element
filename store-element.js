const $rendered = Symbol('rendered state')

export const isMounted = (el) => el[$rendered] != null

// Mount an element, running a mount function, and marking the
// state that was rendered.
export const mounts = (mountf, el, state, handle) => {
  mountf(el, state, handle)
  el[$rendered] = state
}

// Write a state to an element with a write function.
// Retrieves previously written state so you can compare changes.
// Only writes if the state is dirty.
export const writes = (writef, el, state, handle) => {
  const prev = el[$rendered]
  if (prev !== state) {
    writef(el, prev, state, handle)
  }
  el[$rendered] = state
}

// Given a mount and a write function, create a write function
// with a consistent signature that will either mount or write,
// depending on which is needed.
export const writer = ({mount, write}) => (el, state, handle) => {
  if (!isMounted(el)) {
    mounts(mount, el, state, handle)
  } else {
    writes(write, el, state, handle)
  }
}

const $frame = Symbol('animation frame')

// Write a state to an element during the next animation frame.
// Renders once per frame at most.
export const renders = (writef, el, state, handle) => {
  const frame = requestAnimationFrame(_ => {
    writef(el, state, handle)
  })
  // Avoid extra writes by cancelling any previous renders that
  // queued the next frame.
  cancelAnimationFrame(el[$frame])
  el[$frame] = frame
}

const $state = Symbol('state')
const $shadow = Symbol('shadow')

// StoreElement is a deterministic web component,
// inspired loosely by Elm's App Architecture pattern.
export class StoreElement extends HTMLElement {
  constructor() {
    super()
    this.send = this.send.bind(this)
    this.handle = this.handle.bind(this)
    // Attach *closed* shadow. We keep the insides of the component closed
    // so that we can be sure no one is messing with the DOM, and DOM
    // writes are deterministic functions of state.
    this[$shadow] = this.attachShadow({mode: 'closed'})

    const [state, fx] = this.init(this)
    this[$state] = state

    // Immediately write initial dom
    this.write(this[$shadow], this[$state], this.handle)
    this.effect(fx)
  }

  // This lifecycle callback is called by the platform whenever an
  // attribute changes on our element.
  //
  // Override the `attribute` method to map changes to actions.
  attributeChangedCallback(name, prev, next) {
    let msg = this.attribute(name, next)
    if (msg) {
      this.send(msg)
    }
  }

  // Create initial model and effect via reading host element. 
  init(el) {
    throw new Error('Not implemented')
  }

  // Update model via message, returning a new model and effect
  update(prev, msg) {
    throw new Error('Not implemented')
  }

  // Write state updates to shadow DOM
  write(shadowRoot, state, handle) {}

  // Map events to actions
  event(event) {
    return event
  }

  // Map attribute changes to actions
  attribute(name, value) {}

  send(msg) {
    const [state, fx] = this.update(this[$state], msg)
    if (this[$state] !== state) {
      this[$state] = state
      this.render()
    }
    if (fx) {
      this.effect(fx)
    }
  }

  async effect(fx) {
    const msg = await fx
    if (msg) {
      this.send(msg)
    }
  }

  handle(event) {
    const msg = this.event(event)
    if (msg) {
      this.send(msg)
    }
  }

  render() {
    renders(this.write, this[$shadow], this[$state], this.handle)
  }
}

// Builder function allows us to define a custom StoreElement via
// method chaining and plain functions, instead of class extension.
export const create = () => class CustomStoreElement extends StoreElement {
  static init(fn) {
    this.prototype.init = fn
    return this
  }

  static update(fn) {
    this.prototype.update = fn
    return this
  }

  static write(fn) {
    this.prototype.write = fn
    return this
  }

  static event(fn) {
    this.prototype.event = fn
    return this
  }

  static attr(keys, attribute) {
    this.observedAttributes = keys
    this.prototype.attribute = attribute
    return this
  }

  static prop(key, get, tag) {
    Object.defineProperty(this.prototype, key, {
      get() {
        return get(this[$state])
      },
      set(value) {
        this.send(tag(value))
      }
    })
    return this
  }
}