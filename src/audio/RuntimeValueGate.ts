/** Prevents redundant Tone Param automation for unchanged scalar targets. */
export class RuntimeValueGate {
  constructor(private currentValue?: number) {}

  shouldApply(nextValue: number): boolean {
    if (Object.is(this.currentValue, nextValue)) return false;
    this.currentValue = nextValue;
    return true;
  }

  reset(currentValue?: number): void {
    this.currentValue = currentValue;
  }
}
