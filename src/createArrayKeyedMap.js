const emptyMap = new Map();
const unset = {};
emptyMap.value = unset;

export default function createArrayKeyedMap() {
  const root = new Map();
  root.value = unset;

  function getMap(key, createIfNotExist) {
    const keyArray = Array.isArray(key) ? key : [key];
    let prev = root;
    for (let i = 0; i < keyArray.length; i++) {
      const item = keyArray[i];
      const value = prev.get(item);
      if (typeof value === 'undefined') {
        if (!createIfNotExist) {
          return emptyMap;
        }
        const newMap = new Map();
        newMap.value = unset;
        prev.set(item, newMap);
        prev = newMap;
      } else {
        prev = value;
      }
    }
    return prev;
  }

  return {
    set(key, value) {
      getMap(key, true).value = value;
    },
    get(key) {
      const value = getMap(key, false).value;
      return value === unset ? undefined : value;
    },
    getOrAdd(key, creator) {
      const map = getMap(key, true);
      if (map.value === unset) {
        map.value = creator(key);
      }
      return map.value;
    },
    clear() {
      root.clear();
    },
    delete(key) {
      getMap(key, false).value = unset;
    },
  };
}
