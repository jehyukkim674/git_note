import { useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import {
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { formatDateYmd } from "../lib/text";

// 앱 테마 토큰을 그대로 쓰는 에디터 테마(모든 테마의 배경/글자색에 맞춤).
const cmTheme = EditorView.theme({
  "&": { backgroundColor: "var(--bg)", color: "var(--text)", height: "100%" },
  ".cm-content": { caretColor: "var(--accent)", padding: "10px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--accent-soft) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--accent-soft) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent-soft) 35%, transparent)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg)",
    color: "var(--text-dim)",
    border: "none",
  },
  ".cm-activeLineGutter": { backgroundColor: "var(--accent-soft)" },
  ".cm-placeholder": { color: "var(--text-dim)" },
  ".cm-scroller": { lineHeight: "1.6" },
});

// 마크다운 토큰 색상(테마 토큰 사용 → 라이트/다크 모두 가독).
const cmHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--accent)", fontWeight: "700" },
  { tag: t.strong, fontWeight: "700", color: "var(--text)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--accent)", textDecoration: "underline" },
  { tag: t.monospace, color: "var(--success)" },
  { tag: t.quote, color: "var(--text-dim)" },
  { tag: [t.list, t.processingInstruction], color: "var(--accent)" },
  { tag: t.contentSeparator, color: "var(--text-dim)" },
  { tag: t.comment, color: "var(--text-dim)", fontStyle: "italic" },
]);

interface Props {
  value: string;
  onChange: (value: string) => void;
  saveImage?: (file: File) => Promise<string>;
  spellcheck?: boolean;
}

interface Status {
  line: number;
  col: number;
  sel: number;
}

// 2. Enter 시 목록/체크박스를 자동으로 이어쓰거나, 빈 항목이면 종료한다.
function continueList(view: EditorView): boolean {
  const { state } = view;
  const { head, from, to } = state.selection.main;
  if (from !== to) return false;
  const line = state.doc.lineAt(head);
  const m = line.text.match(/^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?(.*)$/);
  if (!m) return false;
  const [, indent, marker, check, rest] = m;
  // 빈 항목에서 Enter → 마커 제거(목록 종료)
  if (rest.trim() === "" && (!check || check.trim() === "")) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }
  let nextMarker = marker;
  if (/^\d+\.$/.test(marker)) {
    nextMarker = `${parseInt(marker, 10) + 1}.`;
  }
  const nextCheck = check ? "[ ] " : "";
  const insert = `\n${indent}${nextMarker} ${nextCheck}`;
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + insert.length },
  });
  return true;
}

export function Editor({ value, onChange, saveImage, spellcheck }: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [status, setStatus] = useState<Status>({ line: 1, col: 1, sel: 0 });

  const statusListener = useMemo(
    () =>
      EditorView.updateListener.of((u) => {
        if (!u.selectionSet && !u.docChanged) return;
        const { head, from, to } = u.state.selection.main;
        const lineObj = u.state.doc.lineAt(head);
        setStatus({
          line: lineObj.number,
          col: head - lineObj.from + 1,
          sel: to - from,
        });
      }),
    []
  );

  const mdKeymap = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          { key: "Enter", run: continueList },
          { key: "Mod-b", run: () => (wrapRef.current("**"), true) },
          { key: "Mod-i", run: () => (wrapRef.current("*"), true) },
          { key: "Mod-k", run: () => (wrapRef.current("[", "](url)"), true) },
        ])
      ),
    []
  );

  const extensions = useMemo(() => {
    const exts = [
      markdown(),
      EditorView.lineWrapping,
      syntaxHighlighting(cmHighlight),
      highlightActiveLine(),
      placeholder("내용을 입력하세요…  (마크다운 지원 · ⌘F 찾기)"),
      closeBrackets(),
      search({ top: true }),
      statusListener,
      mdKeymap,
      keymap.of([...closeBracketsKeymap, ...searchKeymap, indentWithTab]),
      EditorView.domEventHandlers({
        paste(event, view) {
          // 7. 선택 영역 위에 URL 붙여넣기 → 마크다운 링크
          const text = event.clipboardData?.getData("text")?.trim() ?? "";
          const sel = view.state.selection.main;
          if (sel.from !== sel.to && /^https?:\/\/\S+$/.test(text)) {
            event.preventDefault();
            const selected = view.state.sliceDoc(sel.from, sel.to);
            const ins = `[${selected}](${text})`;
            view.dispatch({
              changes: { from: sel.from, to: sel.to, insert: ins },
              selection: { anchor: sel.from + ins.length },
            });
            return true;
          }
          // 이미지 붙여넣기 → 에셋 저장 후 삽입
          const file = event.clipboardData?.files?.[0];
          if (saveImage && file && file.type.startsWith("image/")) {
            event.preventDefault();
            void (async () => {
              try {
                const rel = await saveImage(file);
                const pos = view.state.selection.main.head;
                const t = `![](${rel})`;
                view.dispatch({
                  changes: { from: pos, insert: t },
                  selection: { anchor: pos + t.length },
                });
              } catch (e) {
                console.error("image paste failed", e);
              }
            })();
            return true;
          }
          return false;
        },
        dragover(event) {
          // 에디터 위 드롭을 허용하기 위해 기본 동작 차단(웹뷰 이탈 방지).
          event.preventDefault();
          return false;
        },
        drop(event, view) {
          event.preventDefault();
          const file = event.dataTransfer?.files?.[0];
          if (saveImage && file && file.type.startsWith("image/")) {
            void (async () => {
              try {
                const rel = await saveImage(file);
                const pos =
                  view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
                  view.state.selection.main.head;
                const t = `![](${rel})`;
                view.dispatch({
                  changes: { from: pos, insert: t },
                  selection: { anchor: pos + t.length },
                });
              } catch (e) {
                console.error("image drop failed", e);
              }
            })();
          }
          return true;
        },
      }),
    ];
    if (spellcheck) {
      exts.push(EditorView.contentAttributes.of({ spellcheck: "true" }));
    }
    return exts;
  }, [saveImage, spellcheck, statusListener, mdKeymap]);

  const wrap = (before: string, after = before) => {
    const view = ref.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const sel = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: `${before}${sel}${after}` },
      selection: {
        anchor: from + before.length,
        head: from + before.length + sel.length,
      },
    });
    view.focus();
  };
  const wrapRef = useRef(wrap);
  wrapRef.current = wrap;

  const prefixLine = (prefix: string) => {
    const view = ref.current?.view;
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    view.dispatch({ changes: { from: line.from, insert: prefix } });
    view.focus();
  };

  const insertAtCursor = (text: string) => {
    const view = ref.current?.view;
    if (!view) return;
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: text },
      selection: { anchor: pos + text.length },
    });
    view.focus();
  };

  const chars = value.length;
  const lines = value ? value.split("\n").length : 0;

  return (
    <div className="editor-wrap">
      <div className="md-toolbar">
        <button onClick={() => wrap("**")} title="굵게 (⌘B)"><b>B</b></button>
        <button onClick={() => wrap("*")} title="기울임 (⌘I)"><i>I</i></button>
        <button onClick={() => wrap("~~")} title="취소선"><s>S</s></button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button onClick={() => prefixLine("# ")} title="제목1">H1</button>
        <button onClick={() => prefixLine("## ")} title="제목2">H2</button>
        <button onClick={() => prefixLine("### ")} title="제목3">H3</button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button onClick={() => prefixLine("- ")} title="목록">•</button>
        <button onClick={() => prefixLine("1. ")} title="번호 목록">1.</button>
        <button onClick={() => prefixLine("- [ ] ")} title="할 일">☑</button>
        <button onClick={() => prefixLine("> ")} title="인용">❝</button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button onClick={() => wrap("`")} title="인라인 코드">{"</>"}</button>
        <button onClick={() => wrap("\n```\n", "\n```\n")} title="코드 블록">{"{ }"}</button>
        <button onClick={() => wrap("[", "](url)")} title="링크 (⌘K)">🔗</button>
        <button onClick={() => prefixLine("---\n")} title="구분선">―</button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button onClick={() => insertAtCursor(formatDateYmd(new Date()))} title="오늘 날짜 삽입">📅</button>
      </div>
      <CodeMirror
        ref={ref}
        value={value}
        height="100%"
        theme={cmTheme}
        extensions={extensions}
        onChange={onChange}
        basicSetup={{ lineNumbers: false, foldGutter: false, syntaxHighlighting: false }}
      />
      <div className="editor-status">
        <span>{lines}줄 · {chars}자</span>
        <span>
          {status.sel > 0 && <>선택 {status.sel}자 · </>}
          {status.line}:{status.col}
        </span>
      </div>
    </div>
  );
}
