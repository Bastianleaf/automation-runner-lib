/** Name -> factory map with a helpful error listing what is registered. */
export class Registry<F> {
  private readonly factories = new Map<string, F>();

  constructor(private readonly kind: string) {}

  register(name: string, factory: F): void {
    if (this.factories.has(name)) throw new Error(`${this.kind} "${name}" is already registered`);
    this.factories.set(name, factory);
  }

  get(name: string): F {
    const factory = this.factories.get(name);
    if (!factory) throw new Error(`${this.kind} "${name}" is not registered. Registered: ${[...this.factories.keys()].join(", ") || "(none)"}`);
    return factory;
  }

  get names(): string[] {
    return [...this.factories.keys()];
  }
}
