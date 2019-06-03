import { IDGenerator } from "./types";

export class RelationalIDGenerator implements IDGenerator<number> {
  protected counter: number;

  constructor() {
    this.counter = 1;
  }

  generate() {
    const id = this.counter;
    this.counter++;

    return id;
  }
}
