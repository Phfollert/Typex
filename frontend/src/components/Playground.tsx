import { useMemo } from 'react';
import { useRuffValidator } from '@/hooks/useRuffValidator';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useCheckerCatalog } from '@/hooks/useCheckerCatalog';
import { useCheckerDiagnostics } from '@/hooks/useCheckerDiagnostics';
import { useExamples } from '@/hooks/useExamples';
import { useAutosave } from '@/hooks/useAutosave';
import { CURRENT_SHARE_VERSION, type ShareState } from '@/share/types';
import Toolbar from '@/components/Toolbar';
import EditorPane from '@/components/EditorPane';
import ExamplePicker from '@/components/ExamplePicker';
import ShareButton from '@/components/ShareButton';

interface PlaygroundProps {
  initial: ShareState | null;
}

export default function Playground({ initial }: PlaygroundProps) {
  const { isReady, targetVersion, setTargetVersion, validateCode } = useRuffValidator(initial?.py ?? 'py312');
  const workspace = useWorkspace({
    validateCode,
    isReady,
    targetVersion,
    setTargetVersion,
    initialFiles: initial?.files,
  });
  const catalog = useCheckerCatalog({ initialSelectedCheckerIds: initial?.checkers ?? null });
  const diagnostics = useCheckerDiagnostics({
    files: workspace.field.files,
    targetVersion,
    isReady,
    canRun: workspace.config.canRun,
    checkers: catalog.field.checkers,
    selectedCheckerIds: catalog.field.selectedCheckerIds,
  });
  const exampleEntries = useExamples();

  const shareState = useMemo<ShareState>(
    () => ({
      v: CURRENT_SHARE_VERSION,
      files: workspace.field.files,
      checkers: catalog.field.selectedCheckerIds,
      py: targetVersion,
    }),
    [workspace.field.files, catalog.field.selectedCheckerIds, targetVersion]
  );
  useAutosave(shareState);

  const { files, ruffByFile, addingFile, newFileName, fileInputRef } = workspace.field;
  const fileNames = Object.keys(files);
  const ws = workspace.events;
  const { checkers, selectedCheckerIds } = catalog.field;
  const { typecheckerDiagnostics } = diagnostics.field;

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
        <ShareButton state={shareState} />
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
              setSelectedCheckerIds={catalog.events.setSelectedCheckerIds}
              isValid={!workspace.config.hasSyntaxErrors}
              isChecking={diagnostics.config.isChecking}
              runSummary={diagnostics.config.runSummary}
            />
          </div>
          <div className="editor-split">
            {fileNames.map((file) => (
              <EditorPane
                key={file}
                file={file}
                content={files[file] ?? ''}
                onChangeContent={(content) => ws.updateFileContent(file, content)}
                onClose={fileNames.length > 1 ? () => ws.closeFile(file) : null}
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
