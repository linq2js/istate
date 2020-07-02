import state, {getStateList} from 'istate';

const delay = (ms, value) =>
  new Promise((resolve) => setTimeout(resolve, ms, value));

test('simple state', () => {
  const Count = state(0);
  const Increase = () => {
    const [count, setCount] = Count();
    setCount(count + 1);
  };
  Increase();
  Increase();
  Increase();
  expect(Count.get()).toBe(3);
});

test('async state', async () => {
  const Count = state(async () => {
    await delay(10);
    return 1;
  });
  const Increase = async () => {
    const [count, setCount] = await Count();
    setCount(count + 1);
  };

  await Increase();
  expect(Count.get()).toBe(2);
});

test('reset state', () => {
  const Count = state(0);
  const Increase = () => {
    const [count, setCount] = Count();
    setCount(count + 1);
  };
  const Reset = () => {
    Count.reset();
  };
  Increase();
  Increase();
  Increase();
  Reset();
  expect(Count.get()).toBe(0);
});

test('handle state change', () => {
  const countChange = jest.fn();
  const doubleChange = jest.fn();
  const Count = state(1);
  const Double = state(() => {
    const [count] = Count();
    return count * 2;
  });

  Double.subscribe(doubleChange);
  Count.subscribe(countChange);

  expect(Double.get()).toBe(2);

  Count.set((prev) => prev + 1);

  expect(countChange).toBeCalled();
  expect(doubleChange).toBeCalled();

  expect(Double.get()).toBe(4);
});

test('throw an error if got error during evaluating state', () => {
  const evalState = jest.fn();
  const Count = state(() => {
    evalState();
    throw new Error();
  });
  expect(() => Count.get()).toThrowError();
  expect(() => Count.get()).toThrowError();
  expect(evalState).toBeCalledTimes(1);
});

test('state family', () => {
  const Numbers = state(() => 1);
  expect(Numbers.family(0).get()).toBe(1);
  expect(Numbers.family(1000).get()).toBe(1);
  Numbers.family(0).set(2);
  Numbers.family(1000).set(4);
  expect(Numbers.family(0).get()).toBe(2);
  expect(Numbers.family(1000).get()).toBe(4);
});

test('using state builder', () => {
  const style = state.builder({map: (value) => 'style: ' + value});
  const textColor = style('red');
  expect(textColor.get()).toBe('style: red');
  textColor.set('blue');
  expect(textColor.get()).toBe('style: blue');
});

test('using object state', () => {
  const original = {value: 1};
  const obj = state.object(original);
  obj.set({value: 1});
  expect(obj.get()).toBe(original);
});

test('using array state', () => {
  const original = [1, 2, 3];
  const obj = state.array(original);
  obj.set([1, 2, 3]);
  expect(obj.get()).toBe(original);
});

test('using date state', () => {
  const original = new Date();
  const obj = state.array(original);
  obj.set(new Date(original.getTime()));
  expect(obj.get()).toBe(original);
});

test('getStateList', () => {
  expect(getStateList([])).toEqual({
    valid: true,
    multiple: true,
    states: [],
  });

  expect(getStateList(false)).toEqual({
    valid: false,
    multiple: false,
    states: [],
  });

  expect(getStateList(state())).toEqual({
    valid: true,
    multiple: false,
    states: expect.anything(),
  });

  expect(getStateList([state(), state()])).toEqual({
    valid: true,
    multiple: true,
    states: expect.anything(),
  });
});

test('from', () => {
  const Count = state(1);
  const Double = state.from([Count], (count) => count * 2);
  const ValueArray = state.from([Count, Double]);
  const ValueObject = state.from({count: Count, double: Double});
  expect(Double.get()).toEqual(2);
  expect(ValueArray.get()).toEqual([1, 2]);
  expect(ValueObject.get()).toEqual({count: 1, double: 2});
});

test('loadable of state', async () => {
  const AsyncState = state(async () => {
    await delay(10);
    return 100;
  });
  const value = AsyncState.get();
  expect(value.loadable.state).toBe('loading');
  await value;
  expect(value.loadable.state).toBe('hasValue');
  expect(value.loadable.value).toBe(100);
});

test('async api', async () => {
  const state1 = state(async (multiplyBy = 1) => {
    await delay(10);
    return multiplyBy;
  });
  const state2 = state(async (multiplyBy = 1) => {
    await delay(10);
    return 2 * multiplyBy;
  });
  const [state1Value, setState1Value] = await state1();
  const [state2Value, setState2Value] = await state2();
  const values = await Promise.all([state1.get(2), state2.get(2)]);
  expect(state1Value).toBe(1);
  expect(state2Value).toBe(2);
  expect(typeof setState1Value).toBe('function');
  expect(typeof setState2Value).toBe('function');
  expect(values).toEqual([2, 4]);
});

test('generator', () => {
  const subscription = jest.fn();
  const stream = state(function* () {
    const next = yield 'first';
    yield next;
    return 'third';
  });
  stream.subscribe(subscription);
  expect(stream.get()).toBe('first');
  stream.next('second');
  expect(stream.get()).toBe('second');
  stream.next();
  expect(stream.get()).toBe('third');
  stream.next();
  expect(stream.get()).toBe('third');
  expect(subscription).toBeCalledTimes(2);
});

test('async generator', async () => {
  const subscription = jest.fn();
  const stream = state(async function* () {
    await delay(10);
    const next = yield 'first';
    await delay(10);
    yield next;
    await delay(10);
    return 'third';
  });
  stream.subscribe(subscription);
  expect(await stream.get()).toBe('first');
  const n1 = stream.next('second');
  const s1 = stream.get();
  const n2 = stream.next();
  const s2 = stream.get();
  expect(await s1).toBe('second');
  expect(await s2).toBe('third');
  stream.next();
  expect(await stream.get()).toBe(undefined);
  // console.log(await n1, await n2);
  expect(await n1).toBe(true);
  expect(await n2).toBe(false);
  expect(subscription).toBeCalledTimes(3);
});

test('func', () => {
  const stream = state(() => (a, b) => a + b, {defaultValue: 1});
  expect(stream.get()).toBe(1);
  expect(stream.next(1, 2)).toBe(true);
  expect(stream.get()).toBe(3);
});

test('generator with child state', () => {
  const parent = state(function* () {
    yield child1.get();
    yield child2.get();
  });
  const child1 = state(1);
  const child2 = state(2);

  expect(parent.get()).toBe(1);
  parent.next();
  expect(parent.get()).toBe(2);
  child1.set(3);
  expect(parent.get()).toBe(3);
  parent.next();
  expect(parent.get()).toBe(2);
});

test('map(mapper)', () => {
  const original = state(1);
  const double = original.map((value) => value * 2);

  expect(double.get()).toBe(2);

  original.set(5);

  expect(double.get()).toBe(10);
});

test('map(prop)', () => {
  const original = state({email: 'abc@def.com', country: 'USA'});
  const email = original.map('email');
  const country = original.map('country');

  expect(email.get()).toBe(original.get().email);
  expect(country.get()).toBe(original.get().country);
});

test('async map()', async () => {
  const original = state(() => delay(10, 100));
  const double = original.map((value) => value * 2);
  expect(await double.get()).toBe(200);
});

test('reduce()', () => {
  const original = state(1);
  const list = original.reduce((seed, value) => seed.concat(value), []);
  expect(list.get()).toEqual([1]);
  original.set(2);
  expect(list.get()).toEqual([1, 2]);
  original.set(3);
  expect(list.get()).toEqual([1, 2, 3]);
});

test('filter()', () => {
  const original = state(1);
  const even = original.filter((value) => value % 2 === 0, 0);
  expect(even.get()).toBe(0);
  original.set(4);
  expect(even.get()).toBe(4);
  original.set(3);
  expect(even.get()).toBe(4);
});
