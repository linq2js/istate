export type Initializer<T> = () => T;

export default function istate<T>(defaultValue: Initializer<T> | T): State<T>;

export interface State<T> extends Api<T> {
  /**
   * get state api [currentValue, updateStateFn]
   * @param args
   */
  (...args: any[]): [T, Api<T>];

  /**
   * get state family
   * @param args
   */
  family<T>(...args: any[]): State<T>;
}

export interface Setter<T> extends Function {
  /**
   * update state value using reducer
   * @param reducer
   */
  (reducer: (prev: T) => T): void;

  /**
   * update state with specific value
   * @param value
   */
  (value: T): void;
}

export interface Getter<T> extends Function {
  (): T;
}

export interface Api<T> extends Setter<T> {
  /**
   * reset state to initial value
   */
  reset(): void;

  /**
   * change state value
   */
  set: Setter<T>;
  /**
   * get state value
   */
  get: Getter<T>;

  /**
   * listen state value changing
   * @param subscription
   */
  subscribe(subscription: Subscription): Unsubscribe;
}

export type Subscription = () => any;

export type Unsubscribe = () => void;
