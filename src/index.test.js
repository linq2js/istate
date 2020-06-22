import istate from 'istate';

test('simple state', () => {
  const Count = istate(0);
  const Increase = () => {
    const [count, setCount] = Count();
    setCount(count + 1);
  };
  Increase();
  Increase();
  Increase();
  expect(Count.get()).toBe(3);
});

test('reset state', () => {
  const Count = istate(0);
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
  const Count = istate(1);
  const Double = istate(() => {
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
  const Count = istate(() => {
    evalState();
    throw new Error();
  });
  expect(() => Count.get()).toThrowError();
  expect(() => Count.get()).toThrowError();
  expect(evalState).toBeCalledTimes(1);
});

test('state family', () => {
  const Numbers = istate(() => 1);
  expect(Numbers.family(0).get()).toBe(1);
  expect(Numbers.family(1000).get()).toBe(1);
  Numbers.family(0).set(2);
  Numbers.family(1000).set(4);
  expect(Numbers.family(0).get()).toBe(2);
  expect(Numbers.family(1000).get()).toBe(4);
});
