import { useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";

interface Props {
  value: string;
  onChange: (value: string) => void;
  saveImage?: (file: File) => Promise<string>;
}

export function Editor({ value, onChange, saveImage }: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null);

  const extensions = useMemo(() => {
    const exts = [markdown(), EditorView.lineWrapping];
    if (saveImage) {
      exts.push(
        EditorView.domEventHandlers({
          paste(event, view) {
            const file = event.clipboardData?.files?.[0];
            if (!file || !file.type.startsWith("image/")) return false;
            event.preventDefault();
            void (async () => {
              try {
                const rel = await saveImage(file);
                const pos = view.state.selection.main.head;
                const text = `![](${rel})`;
                view.dispatch({
                  changes: { from: pos, insert: text },
                  selection: { anchor: pos + text.length },
                });
              } catch (e) {
                console.error("image paste failed", e);
              }
            })();
            return true;
          },
        })
      );
    }
    return exts;
  }, [saveImage]);

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

  const prefixLine = (prefix: string) => {
    const view = ref.current?.view;
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    view.dispatch({ changes: { from: line.from, insert: prefix } });
    view.focus();
  };

  return (
    <div className="editor-wrap">
      <div className="md-toolbar">
        <button onClick={() => wrap("**")} title="굵게"><b>B</b></button>
        <button onClick={() => wrap("*")} title="기울임"><i>I</i></button>
        <button onClick={() => prefixLine("# ")} title="제목1">H1</button>
        <button onClick={() => prefixLine("## ")} title="제목2">H2</button>
        <button onClick={() => prefixLine("- ")} title="목록">•</button>
        <button onClick={() => prefixLine("- [ ] ")} title="할 일">☑</button>
        <button onClick={() => wrap("`")} title="인라인 코드">{"</>"}</button>
        <button onClick={() => wrap("[", "](url)")} title="링크">🔗</button>
      </div>
      <CodeMirror
        ref={ref}
        value={value}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        basicSetup={{ lineNumbers: false, foldGutter: false }}
      />
    </div>
  );
}
