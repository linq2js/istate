import {useRef, useEffect, useState} from 'react';
import iscope from 'iscope';
import createArrayKeyedMap from './createArrayKeyedMap';

const unset = {};
const stateScope = iscope(() => undefined);

export default function istate(defaultValue) {
  const initializer =
    typeof defaultValue === 'function' ? defaultValue : () => defaultValue;
  const stateMap = createArrayKeyedMap();
  const getStateByArgs = (args) => {
    return stateMap.getOrAdd(args, () => createState(initializer, args));
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

function createState(initializer, args) {
  let changed = false;
  const api = [unset, set];
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
    return api;
  };

  function get() {
    if (api[0] === unset) {
      try {
        api[0] = stateScope({addChildState}, () => initializer(...args));
      } catch (e) {
        api[0] = e;
      }
    }

    if (api[0] instanceof Error) {
      throw api[0];
    }

    return api[0];
  }

  function handleSubStateChange() {
    if (!changed) {
      api[0] = unset;
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
    api[0] = unset;
    changed = false;
    emitter.emit('change');
  }

  function set(nextValue) {
    const parentStateContext = stateScope();
    if (parentStateContext) {
      throw new Error('Cannot change state inside other state');
    }
    const prevValue = get();
    if (typeof nextValue === 'function') {
      nextValue = nextValue(prevValue);
    }
    // next value is diff with prev value
    if (nextValue !== prevValue) {
      api[0] = nextValue;
      changed = true;
      emitter.emit('change');
    }
  }

  Object.assign(set, {
    type: 'api',
    set,
    get,
    reset,
    subscribe,
  });

  return Object.assign(state, {
    type: 'state',
    set,
    get,
    reset,
    subscribe,
  });
}

function createEmitter() {
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
