import { useState } from 'react';
import './App.css';
import { useRuffValidator } from '@/hooks/useRuffValidator';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useCheckerRun } from '@/hooks/useCheckerRun';
import { useExamples } from '@/hooks/useExamples';
import { useShare } from '@/hooks/useShare';
import { readInitialShareState } from '@/share/initialState';
import Toolbar from '@/components/Toolbar';
import EditorPane from '@/components/EditorPane';
import ExamplePicker from '@/components/ExamplePicker';
import ShareButton from '@/components/ShareButton';

function App() {
  const [initial] = useState(readInitialShareState);
  const { isReady, targetVersion, setTargetVersion, validateCode } = useRuffValidator(initial?.py ?? 'py312');
  const workspace = useWorkspace({
    validateCode,
    isReady,
    targetVersion,
    setTargetVersion,
    initialFiles: initial?.files,
    initialPanes: initial?.panes,
  });
  const checkerRun = useCheckerRun({
    files: workspace.field.files,
    targetVersion,
    isReady,
    canRun: workspace.config.canRun,
    initialSelectedCheckerIds: initial?.checkers ?? null,
  });
  const share = useShare({
    files: workspace.field.files,
    panes: workspace.field.panes,
    selectedCheckerIds: checkerRun.field.selectedCheckerIds,
    targetVersion,
  });
  const exampleEntries = useExamples();

  const { files, panes, ruffByFile, addingFile, newFileName, fileInputRef } = workspace.field;
  const ws = workspace.events;
  const { checkers, selectedCheckerIds, typecheckerDiagnostics } = checkerRun.field;

  return (
    <div className="app-container">

      <div className="top-bar">
        <div className="brand">
          <div className="brand-icon">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h1>Type Explorer</h1>
        </div>
        <ShareButton status={share.config.status} onShare={share.events.share} />
      </div>

      <div className="main-content">
        <div className="editor-pane">
          <div className="pane-header">
            <div className="editor-actions">
              <span>Editor</span>
              {addingFile ? (
                <input
                  className="file-name-input"
                  autoFocus
                  placeholder="filename.py"
                  value={newFileName}
                  onChange={(e) => ws.setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') ws.confirmAddFile();
                    else if (e.key === 'Escape') ws.cancelAddFile();
                  }}
                  onBlur={ws.cancelAddFile}
                />
              ) : (
                <button className="pane-action" onClick={ws.startAddFile} title="New file">＋ File</button>
              )}
              <button className="pane-action" onClick={() => fileInputRef.current?.click()} title="Upload files">↥ Upload</button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".py,.pyi"
                style={{ display: 'none' }}
                onChange={ws.handleUpload}
              />
              <ExamplePicker entries={exampleEntries} onPick={ws.loadExample} />
            </div>
            <Toolbar
              checkers={checkers}
              targetVersion={targetVersion}
              setTargetVersion={setTargetVersion}
              selectedCheckerIds={selectedCheckerIds}
              setSelectedCheckerIds={checkerRun.events.setSelectedCheckerIds}
              isValid={!workspace.config.hasSyntaxErrors}
              isSubmitting={checkerRun.config.isSubmitting}
              runSummary={checkerRun.config.runSummary}
            />
          </div>
          <div className="editor-split">
            {panes.map((file, i) => (
              <EditorPane
                key={i}
                file={file}
                fileNames={Object.keys(files)}
                content={files[file] ?? ''}
                onChangeContent={(content) => ws.updateFileContent(file, content)}
                onSelectFile={(f) => ws.selectFileForPane(i, f)}
                onClose={panes.length > 1 ? () => ws.closePane(i) : null}
                ruffDiagnostics={ruffByFile[file] ?? []}
                typecheckerDiagnostics={typecheckerDiagnostics.filter((d) => d.file === file)}
                isReady={isReady}
              />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

export default App;
