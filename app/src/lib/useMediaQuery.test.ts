import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery";

type Listener = () => void;

let matches = false;
let listeners: Listener[] = [];

beforeEach(() => {
  matches = false;
  listeners = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_: string, cb: Listener) => listeners.push(cb),
    removeEventListener: (_: string, cb: Listener) => {
      listeners = listeners.filter((l) => l !== cb);
    },
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMediaQuery", () => {
  it("초기 매칭 상태를 반영한다", () => {
    matches = true;
    const { result } = renderHook(() => useMediaQuery("(max-width: 720px)"));
    expect(result.current).toBe(true);
  });

  it("change 이벤트로 상태가 갱신된다", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 720px)"));
    expect(result.current).toBe(false);
    act(() => {
      matches = true;
      listeners.forEach((l) => l());
    });
    expect(result.current).toBe(true);
  });

  it("언마운트 시 리스너를 정리한다", () => {
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 100px)"));
    expect(listeners.length).toBe(1);
    unmount();
    expect(listeners.length).toBe(0);
  });
});
