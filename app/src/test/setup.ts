import { vi } from "vitest";

// Node 25의 실험적 localStorage가 jsdom 것과 충돌하므로 Map 기반으로 대체한다.
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  } as Storage;
}
const storage = makeStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
});
Object.defineProperty(window, "localStorage", {
  value: storage,
  configurable: true,
});

// Tauri 코어 API는 데스크톱 런타임에서만 존재하므로 테스트에서 목킹한다.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));

// jsdom에는 matchMedia가 없으므로 기본 구현을 제공한다.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
