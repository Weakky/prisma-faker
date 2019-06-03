export interface IDGenerator<T> {
  generate(...args: any[]): T;
}
