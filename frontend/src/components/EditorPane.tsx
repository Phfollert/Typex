import React from 'react';
import CodeEditor from './CodeEditor';
import type { EditorDiagnostic } from '@/types';

interface EditorPaneProps {
  file: string;
  fileNames: string[];
  content: string;
  onChangeContent: (content: string) => void;
  onSelectFile: (file: string) => void;
  onClose: (() => void) | null;
  ruffDiagnostics: any[];
  typecheckerDiagnostics: EditorDiagnostic[];
  isReady: boolean;
}

const EditorPane: React.FC<EditorPaneProps> = ({
  file,
  fileNames,
  content,
  onChangeContent,
  onSelectFile,
  onClose,
  ruffDiagnostics,
  typecheckerDiagnostics,
  isReady,
}) => {
  return (
    <div className="editor-column">
      <div className="editor-column-header">
        <select
          className="file-select"
          value={file}
          onChange={(e) => onSelectFile(e.target.value)}
        >
          {fileNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {onClose && (
          <button className="pane-close" onClick={onClose} title="Close pane">✕</button>
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
