import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function Editor({ value, onChange }: Props) {
  return (
    <CodeMirror
      value={value}
      height="100%"
      extensions={[markdown(), EditorView.lineWrapping]}
      onChange={onChange}
      basicSetup={{ lineNumbers: false, foldGutter: false }}
    />
  );
}
