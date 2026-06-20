import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /// 이미지 파일을 저장하고 삽입할 상대경로를 돌려준다.
  saveImage?: (file: File) => Promise<string>;
}

export function Editor({ value, onChange, saveImage }: Props) {
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

  return (
    <CodeMirror
      value={value}
      height="100%"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ lineNumbers: false, foldGutter: false }}
    />
  );
}
