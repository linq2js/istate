export default istate;
export function createEmitter(): Emitter;
export function getStateList(value: any): StateList;

declare const istate: DefaultBuilder;

type Initializer<T> = () => T;

interface DefaultBuilder extends Function, StateBuilder<any> {
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

interface StateBuilder<T> {
  <T>(defaultValue: Initializer<T> | T, options?: StateOptions<T>): State<T>;
  from(states: State<any>[]): State<any[]>;
  from(states: StateMap): State<{[key: string]: any}>;
  from<T>(
    states: State<any> | State<any>[],
    selector: (...args: any[]) => T,
  ): State<T>;
}

interface StateMap {
  [key: string]: State<any>;
}

type Comparer<T> = (a: T, b: T) => boolean;

interface StateOptions<T> {
  map?(value: any): T;
  type?: 'object' | 'array' | Comparer<T>;
}

interface State<T> extends Api<T> {
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

interface Setter<T> extends Function {
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

interface Getter<T> extends Function {
  (): T;
}

interface Api<T> extends Setter<T> {
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
  watch<T>(
    subscribable: {subscribe: Function},
    transform?: (...args: any[]) => T,
  ): State<T>;
}

type Subscription = () => any;

type Unsubscribe = () => void;

interface Emitter {
  on(event: string, subscription: Subscription): Unsubscribe;
  emit(event: string, params?: any): void;
  clear(): void;
}

interface StateList {
  valid: boolean;
  multiple: boolean;
  states: State<any>[];
}
