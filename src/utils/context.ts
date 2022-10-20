import * as vscode from "vscode";

const keys = [
  "port",
  "image",
  "subscription",
  "acrResourceGroup",
  "acrName",
  "acrRepo",
  "acrTag",
  "dockerfile",
  "deploymentType",
  "manifestPath",
  "chartPath",
] as const;

type GetMethodName = `get${Capitalize<typeof keys[number]>}`;
type SetMethodName = `set${Capitalize<typeof keys[number]>}`;
type GetMethods = { [m in GetMethodName]: () => string | undefined };
type SetMethods = { [m in SetMethodName]: (val: string) => void };
export type ContextApi = GetMethods & SetMethods;

export class Context {
  private constructor(private ctx: vscode.ExtensionContext) {
    assertIs<ContextApi>(this);
    for (const key of keys) {
      const cap = capitalize(key);
      this[`get${cap}` as GetMethodName] = () => this.get(key);
      this[`set${cap}` as SetMethodName] = (val: string) => this.set(key, val);
    }
  }

  static construct(ctx: vscode.ExtensionContext): Context & ContextApi {
    return new Context(ctx) as Context & ContextApi;
  }

  private get(key: string): string | undefined {
    return this.ctx.workspaceState.get(key);
  }

  private set(key: string, val: string) {
    return this.ctx.workspaceState.update(key, val);
  }
}

declare function assertIs<T>(value: unknown): asserts value is T;
const capitalize = (s: string) => s[0].toUpperCase() + s.substring(1);
