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

function from(subscribable, defaultValue, transform = identity, options) {
  const state = istate(defaultValue, options);
  const listener = (...args) => state.set(transform(...args));
  if (typeof subscribable.subscribe === 'function') {
    subscribable.subscribe(listener);
  } else if (typeof subscribable === 'function') {
    subscribable(listener);
  } else {
    throw new Error('Invalid subscribable object');
  }
  return state;
}

function builder(builderOptions) {
  return (value, options) => istate(value, {...builderOptions, ...options});
}

Object.assign(istate, {
  from,
  builder,
  object: (value, options) => istate(value, {type: 'object', ...options}),
  array: (value, options) => istate(value, {type: 'array', ...options}),
});

function createState(initializer, args, options) {
  let changed = false;
  let originalValue = unset;
  let shouldEvaluate = true;
  const {map, type, dispose} = options || {};
  const isEqual =
    typeof type === 'function'
      ? type
      : equalityComparers[type] || equalityComparers.default;
  const api = Object.assign([unset, set], {
    [metaPropName]: 'api',
  });
  const emitter = createEmitter();
  const subStates = new Set();
  const childStateChangingListeners = [];
  const state = () => {
    // get parent state
    const parentStateContext = stateScope();
    if (parentStateContext) {
      parentStateContext.addChildState(state);
    }
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
    if (shouldEvaluate) {
      try {
        if (api[0] !== unset && dispose) {
          dispose(api[0]);
        }
        originalValue = stateScope({addChildState}, () => initializer(...args));
        api[0] = map ? map(originalValue) : originalValue;
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

  function handleSubStateChange() {
    if (!changed) {
      shouldEvaluate = true;
      childStateChangingListeners.forEach((unsubscribe) => unsubscribe());
      emitter.emit('change');
    }
  }

  function addChildState(subState) {
    if (!subStates.has(subState)) {
      subStates.add(subState);
      childStateChangingListeners.push(
        subState.subscribe(handleSubStateChange),
      );
    }
  }

  function subscribe(subscription) {
    return emitter.on('change', subscription);
  }

  function reset() {
    shouldEvaluate = true;
    changed = false;
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
      changed = true;
      emitter.emit('change');
    }
  }

  Object.assign(set, {
    set,
    get,
    reset,
    subscribe,
  });

  return Object.assign(state, {
    [metaPropName]: 'state',
    set,
    get,
    reset,
    subscribe,
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
