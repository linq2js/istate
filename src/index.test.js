import state, {getStateList} from 'istate';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
