export type Initializer<T> = () => T;

export interface DefaultExport extends Function {
  <T>(defaultValue: Initializer<T> | T, options?: StateOptions<T>): State<T>;
  from<T>(
    subscribable: {subscribe: Function},
    defaultValue?: Initializer<T> | T,
    transform?: (...args: any[]) => any,
    options?: StateOptions<T>,
  ): State<T>;
  object<T>(
    defaultValue: Initializer<T> | T,
    options?: StateOptions<T>,
  ): State<T>;
  array<T>(
    defaultValue: Initializer<T> | T,
    options?: StateOptions<T>,
  ): State<T>;
  date(
    defaultValue: Initializer<Date> | Date,
    options?: StateOptions<Date>,
  ): State<Date>;
  builder<T>(
    options?: StateOptions<T>,
  ): <T>(defaultValue: Initializer<T> | T) => State<T>;
}

declare const istate: DefaultExport;

export default istate;

export type Comparer<T> = (a: T, b: T) => boolean;

export interface StateOptions<T> {
  map?(value: any): T;
  type?: 'object' | 'array' | Comparer<T>;
}

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

export function createEmitter(): Emitter;

export interface Emitter {
  on(event: string, subscription: Subscription): Unsubscribe;
  emit(event: string, params?: any): void;
  clear(): void;
}
