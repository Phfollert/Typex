import React from 'react';
import CodeEditor from './CodeEditor';
import type { EditorDiagnostic, RuffDiagnostic } from '@/types';

interface EditorPaneProps {
  file: string;
  content: string;
  onChangeContent: (content: string) => void;
  onClose: (() => void) | null;
  ruffDiagnostics: RuffDiagnostic[];
  typecheckerDiagnostics: EditorDiagnostic[];
  isReady: boolean;
}

const EditorPane: React.FC<EditorPaneProps> = ({
  file,
  content,
  onChangeContent,
  onClose,
  ruffDiagnostics,
  typecheckerDiagnostics,
  isReady,
}) => {
  return (
    <div className="editor-column">
      <div className="editor-column-header">
        <span className="file-name">{file}</span>
        {onClose && (
          <button className="pane-close" onClick={onClose} title="Delete file">✕</button>
        )}
      </div>
      <CodeEditor
        code={content}
        onChange={onChangeContent}
        diagnostics={ruffDiagnostics}
        isReady={isReady}
        typecheckerDiagnostics={typecheckerDiagnostics}
      />
    </div>
  );
};

export default EditorPane;
