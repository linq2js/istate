import iscope from 'iscope';
import createArrayKeyedMap from './createArrayKeyedMap';

const metaPropName = '__istate';
const unset = {};
const identity = (x) => x;
const stateScope = iscope(() => undefined);
const equalityComparers = {
  default(a, b) {
    return a === b;
  },
  date(a, b) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  },
  array(a, b) {
    if (a && b) {
      if (a.length !== b.length) {
        return false;
      }
      // support array like
      const length = 0;
      for (let i = 0; i < length; i++) {
        if (a[i] !== b[i]) {
          return false;
        }
      }
      return true;
    }
    return a === b;
  },
  object(a, b) {
    const keyA = Object.keys(a);
    const keyB = Object.keys(b);
    if (keyA.length !== keyB.length) {
      return false;
    }
    return (
      keyA.every((key) => a[key] === b[key]) &&
      keyB.every((key) => a[key] === b[key])
    );
  },
};

export default function istate(defaultValue, options) {
  const initializer =
    typeof defaultValue === 'function' ? defaultValue : () => defaultValue;
  const stateMap = createArrayKeyedMap();
  const getStateByArgs = (args) => {
    return stateMap.getOrAdd(args, () =>
      createState(initializer, args, options),
    );
  };
  const defaultState = getStateByArgs([]);
  return Object.assign(
    (...args) => {
      if (!args.length) {
        return defaultState();
      }
      return getStateByArgs(args)();
    },
    {
      ...defaultState,
      family: (...args) => getStateByArgs(args),
    },
  );
}

export function getStateList(value) {
  if (
    value &&
    (value[metaPropName] === 'state' || value[metaPropName] === 'api')
  ) {
    return {
      valid: true,
      multiple: false,
      states: [value.state || value],
    };
  }
  if (Array.isArray(value)) {
    let valid = true;
    const states = value.map((item) => {
      const subStates = getStateList(item);
      if (!subStates.valid) {
        valid = false;
      }
      return subStates.states[0];
    });
    return {
      valid,
      multiple: true,
      states,
    };
  }
  return {
    valid: false,
    multiple: false,
    states: [],
  };
}

function createFromUtil(builder) {
  return function (states, selector) {
    const stateList = getStateList(states);
    // from(stateArray)
    // from(stateMap)
    if (!selector) {
      // from(stateArray)
      if (stateList.valid && stateList.multiple) {
        return builder(
          () => {
            return stateList.states.map((state) => state.get());
          },
          {
            type: 'array',
          },
        );
      }

      // from(stateMap)
      const entries = Object.entries(states).map(([key, state]) => {
        const subStateList = getStateList(state);
        if (!subStateList.valid) {
          throw new Error('Invalid input state');
        }
        return [key, subStateList.states[0]];
      });

      return builder(() => {
        const result = {};
        entries.forEach(
          ([key, state]) => {
            result[key] = state.get();
          },
          {type: 'object'},
        );
        return result;
      });
    }

    if (!stateList.valid) {
      throw new Error('Invalid input state');
    }
    return createStateFromOtherStates(builder, stateList.states, selector);
  };
}

function createStateFromOtherStates(builder, states, selector) {
  return builder(() => {
    const values = states.map((state) => state.get());
    return selector(...values);
  });
}

function builder(builderOptions) {
  const builder = (value, options) =>
    istate(value, {...builderOptions, ...options});
  return Object.assign(builder, {
    from: createFromUtil(builder),
  });
}

Object.assign(istate, {
  from: createFromUtil(istate),
  builder,
  object: (value, options) => istate(value, {type: 'object', ...options}),
  array: (value, options) => istate(value, {type: 'array', ...options}),
});

function createState(initializer, args, options) {
  let changed = false;
  let originalValue = unset;
  let shouldEvaluate = true;
  const {map, type, dispose, readonly} = options || {};
  const isEqual =
    typeof type === 'function'
      ? type
      : equalityComparers[type] || equalityComparers.default;
  const api = Object.assign([unset, set], {
    [metaPropName]: 'api',
  });
  const emitter = createEmitter();
  const childStates = new Set();
  const childStateChangingListeners = [];
  const state = () => {
    get();
    // is async state value
    if (api[0] && typeof api[0].then === 'function') {
      // make api like promise
      return Object.assign(
        api[0].then((result) =>
          Object.assign([result, api[1]], {
            [metaPropName]: 'api',
          }),
        ),
        {
          [metaPropName]: 'api',
          0: api[0],
          1: api[1],
        },
      );
    }
    return api;
  };

  function get() {
    // get parent state
    const parentStateContext = stateScope();
    if (parentStateContext) {
      parentStateContext.addChildState(state);
    }

    if (shouldEvaluate) {
      try {
        if (api[0] !== unset && dispose) {
          dispose(api[0]);
        }
        originalValue = stateScope({addChildState}, () => initializer(...args));
        api[0] = map ? map(originalValue) : originalValue;
        if (api[0] && typeof api[0].then === 'function') {
          enableLoadableLogic(api[0]);
        }
      } catch (e) {
        api[0] = e;
      } finally {
        shouldEvaluate = false;
      }
    }

    if (api[0] instanceof Error) {
      throw api[0];
    }

    return api[0];
  }

  function handleChildStateChange() {
    if (!changed) {
      reset();
    }
  }

  function addChildState(subState) {
    if (!childStates.has(subState)) {
      childStates.add(subState);
      childStateChangingListeners.push(
        subState.subscribe(handleChildStateChange),
      );
    }
  }

  function subscribe(subscription) {
    return emitter.on('change', subscription);
  }

  function watch(subscribable, transform) {
    const listener = (...args) => set(transform(...args));
    if (typeof subscribable.subscribe === 'function') {
      subscribable.subscribe(listener);
    } else if (typeof subscribable === 'function') {
      subscribable(listener);
    } else {
      throw new Error('Invalid subscribable object');
    }
    return state;
  }

  function reset() {
    shouldEvaluate = true;
    changed = false;
    childStateChangingListeners.forEach((unsubscribe) => unsubscribe());
    childStates.clear();
    emitter.emit('change');
  }

  function set(nextValue) {
    const parentStateContext = stateScope();
    if (parentStateContext) {
      throw new Error('Cannot change state inside other state');
    }
    get();
    const prevValue = originalValue;
    if (typeof nextValue === 'function') {
      nextValue = nextValue(prevValue);
    }
    // next value is diff with prev value
    if (!isEqual(nextValue, prevValue)) {
      if (api[0] !== unset && dispose) {
        dispose(api[0]);
      }
      originalValue = nextValue;
      api[0] = map ? map(originalValue) : originalValue;
      if (api[0] && typeof api[0].then === 'function') {
        enableLoadableLogic(api[0]);
      }
      changed = true;
      emitter.emit('change');
    }
  }

  Object.assign(set, {
    set,
    get,
    reset,
    subscribe,
    watch,
    state,
  });

  api.state = state;

  return Object.assign(state, {
    [metaPropName]: 'state',
    set,
    get,
    reset,
    subscribe,
    watch,
    options,
  });
}

export function createEmitter() {
  let eventListeners = {};
  return {
    on(event, listener) {
      const listeners =
        eventListeners[event] || (eventListeners[event] = new Set());
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(events, params) {
      (Array.isArray(events) ? events : [events]).forEach((event) => {
        const listeners = eventListeners[event];
        if (listeners) {
          for (const listener of listeners) {
            listener(params);
          }
        }
      });
    },
    clear() {
      eventListeners = {};
    },
  };
}

export function enableLoadableLogic(promise) {
  Object.defineProperty(promise, 'loadable', {
    get() {
      if (promise.__loadable) {
        return promise.__loadable;
      }
      let loadable = {
        state: 'loading',
        value: undefined,
        error: undefined,
      };

      const emitter = createEmitter();
      let sameThread = true;

      function subscribe(subscription) {
        return emitter.on('done', subscription);
      }

      promise
        .then(
          (payload) => {
            loadable = {
              state: 'hasValue',
              value: payload,
            };
          },
          (error) => {
            loadable = {
              state: 'error',
              error,
            };
          },
        )
        .finally(() => {
          if (!sameThread) {
            emitter.emit('done');
          }
        });
      sameThread = false;

      return (promise.__loadable = {
        get state() {
          return loadable.state;
        },
        get value() {
          return loadable.value;
        },
        get error() {
          return loadable.error;
        },
        subscribe,
      });
    },
  });

  return promise;
}
