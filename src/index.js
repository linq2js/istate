import iscope from 'iscope';
import createArrayKeyedMap from './createArrayKeyedMap';

const metaPropName = '__istate';
const unset = {};
const stateScope = iscope(() => undefined);
const compareFunctions = {
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
      get(...args) {
        return args.length ? getStateByArgs(args).get() : defaultState.get();
      },
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
  let iterator;
  let stateChangedPromise;
  let stateChangedResolve;
  const {map, type, dispose, defaultValue} = options || {};
  const isEqual =
    typeof type === 'function'
      ? type
      : compareFunctions[type] || compareFunctions.default;
  const api = Object.assign([unset, set], {
    [metaPropName]: 'api',
  });
  const emitter = createEmitter();
  const childStates = new Set();
  const childStateChangingListeners = [];
  const context = {addChildState};
  const state = () => {
    get();
    // is async state value
    if (isPromiseLike(api[0])) {
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
        originalValue = stateScope(context, () => initializer(...args));
        let result = map ? map(originalValue) : originalValue;
        // is iterator
        if (result && typeof result.next === 'function') {
          iterator = result;
          result = stateScope(context, () => iterator.next());
          if (isPromiseLike(result)) {
            result = result.then(({value}) =>
              typeof value === 'function' ? value() : value,
            );
          } else {
            result =
              typeof result.value === 'function'
                ? result.value()
                : result.value;
          }
        } else if (typeof result === 'function') {
          iterator = result;
          result = defaultValue;
        }
        api[0] = result;
        if (isPromiseLike(api[0])) {
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
    iterator = undefined;
    childStateChangingListeners.forEach((unsubscribe) => unsubscribe());
    childStates.clear();
    emitter.emit('change');
    stateChangedResolve && stateChangedResolve();
    stateChangedPromise = undefined;
  }

  function processIteratorResult(nextValue) {
    return update(nextValue, true);
  }

  function processFunction(iterator, result) {
    const updated = processIteratorResult(result);
    // always trigger change event when function executed
    if (!updated) {
      emitter.emit('change');
    }
    if (isPromiseLike(result)) {
      return result.then(() => true);
    }
    return true;
  }

  function processAsyncIterator(iterator, result) {
    const valuePromise = result.then(({value}) => value);
    const donePromise = result.then(({done}) => !done);
    processIteratorResult(valuePromise);
    return donePromise;
  }

  function processSyncIterator(iterator, result) {
    if (iterator.__done) {
      return false;
    }
    const {value, done} = result;
    iterator.__done = done;
    processIteratorResult(value);
    return !done;
  }

  function next(...args) {
    return internalNext(args, (iterator, result, type) => {
      if (type === 'function') {
        return processFunction(iterator, result, type);
      }

      if (type === 'async-iterator') {
        return processAsyncIterator(iterator, result);
      }

      // sync-iterator
      return processSyncIterator(iterator, result);
    });
  }

  function internalNext(args, resolver) {
    get();

    if (!iterator) {
      return false;
    }

    if (typeof iterator === 'function') {
      return resolver(iterator, iterator(...args), 'function');
    }

    let iteratorResult = stateScope(context, () => iterator.next(args[0]));
    if (isPromiseLike(iteratorResult)) {
      return resolver(iterator, iteratorResult, 'async-iterator');
    }

    return resolver(iterator, iteratorResult, 'sync-iterator');
  }

  function last(...args) {
    get();
    if (!iterator) {
      return api[0];
    }
    if (typeof iterator === 'function') {
      throw new Error('Cannot use last() with functional state');
    }

    let parentToken;

    function doNext() {
      const result = iterator.next(args[0]);
      if (isPromiseLike(result)) {
        const token = {
          parent: parentToken,
        };
        parentToken = token;
        return enableCancellableLogic(
          result.then((asyncResult) => {
            let value = asyncResult.value;
            if (typeof value === 'function') {
              if (token.isCancelled()) {
                return api[0];
              }
              value = value();
            }
            if (asyncResult.done) {
              return value;
            }
            return doNext(value);
          }),
          token,
        );
      }

      if (result.done) {
        return result.value;
      }

      return doNext(result.value);
    }

    const lastResult = doNext();

    update(lastResult, true);

    return lastResult;
  }

  function update(nextValue, internalChange) {
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
      if (isPromiseLike(api[0])) {
        enableLoadableLogic(api[0]);
      }
      if (!internalChange) {
        changed = true;
      }
      stateChangedResolve && stateChangedResolve();
      stateChangedPromise = undefined;
      emitter.emit('change');
      return true;
    }
    return false;
  }

  function set(nextValue) {
    const parentStateContext = stateScope();
    if (parentStateContext) {
      throw new Error('Cannot change state inside other state');
    }
    get();
    update(nextValue, false);
  }

  function processResult(result, args) {
    return typeof result === 'function' ? result(...args) : result;
  }

  function filterState(predicate, prev) {
    return istate((...args) => {
      const value = get();
      if (processResult(predicate(value), args)) {
        return (prev = value);
      }
      return prev;
    });
  }

  function mapState(mapper) {
    if (typeof mapper !== 'function') {
      const prop = mapper;
      mapper = (value) =>
        typeof value === 'undefined' || value === null ? value : value[prop];
    }
    return istate((...args) => {
      const value = get();
      if (isPromiseLike(value)) {
        return value.then((result) => processResult(mapper(result), args));
      }
      return processResult(mapper(value), args);
    });
  }

  function reduceState(reducer, prev) {
    if (arguments.length < 2) {
      prev = unset;
    }
    return mapState((current) => {
      if (prev === unset) {
        prev = current;
      }
      return (...args) => (prev = processResult(reducer(prev, current), args));
    });
  }

  function stateChanged() {
    if (stateChangedPromise) {
      return stateChangedPromise;
    }
    return (stateChangedPromise = new Promise((resolve) => {
      stateChangedResolve = resolve;
    }));
  }

  Object.assign(set, {
    set,
    get,
    reset,
    subscribe,
    watch,
    state,
    next,
    last,
    changed: stateChanged,
  });

  api.state = state;

  return Object.assign(state, {
    [metaPropName]: 'state',
    set,
    get,
    reset,
    next,
    last,
    subscribe,
    watch,
    map: mapState,
    reduce: reduceState,
    filter: filterState,
    changed: stateChanged,
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

export function enableCancellableLogic(promise, token = {}) {
  if (promise.__cancellable) {
    Object.assign(token, promise.__cancellable);
    return promise;
  }

  let isCancelled = false;

  Object.assign(token, {
    cancel() {
      if (isCancelled) {
        return;
      }
      isCancelled = true;
    },
    isCancelled() {
      return isCancelled || (parent && parent.isCancelled());
    },
  });

  return Object.assign(promise, token, {
    __cancellable: token,
  });
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

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}
