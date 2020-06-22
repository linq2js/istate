# istate

A state management that is inspired on recoil

## Simple state

```jsx harmony
import istate from 'istate';

const Count = istate(0);
const Increase = () => {
  const [count, setCount] = Count();
  setCount(count + 1);
};
Increase();
console.log(Count.get()); // 1
```

## Modify state using reducer

```jsx harmony
const Increase = () => {
  const [, setCount] = Count();
  setCount((count) => count + 1);
};
```

## Handle state changing

```jsx harmony
Count.subscribe(() => console.log('count state changed'));
```

## State family

```jsx harmony
const Boxes = istate((id) => ({
  id,
  x: 0,
  y: 0,
}));

const MoveBox = (id, offsetX, offsetY) => {
  const [, setBox] = Boxes(id);
  setBox((box) => ({
    ...box,
    x: box.x + offsetX,
    y: box.y + offsetY,
  }));
};

const ResetBox = (id) => {
  const [, boxApi] = Boxes(id);
  boxApi.reset();
};
```

## State dependencies

```jsx harmony
const Counter = istate(0);
const DoubleCounter = istate(() => {
  const [counter] = Counter();
  return counter * 2;
});
const Increase = () => {
  const [counter, setCounter] = Counter();
  setCounter(counter + 1);
};

Increase(); // Counter = 1, DoubleCounter = 2
Increase(); // Counter = 2, DoubleCounter = 4
```
