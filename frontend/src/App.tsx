import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import './App.css';
import { useRuffValidator } from './hooks/useRuffValidator';
import Toolbar from './components/Toolbar';
import EditorPane from './components/EditorPane';
import ExamplePicker from './components/ExamplePicker';
import { loadIndex, loadExample } from './examples/loader';
import type { ExampleEntry } from './examples/types';
import type { CheckerInfo, CheckerResult, EditorDiagnostic } from './types';

const DEFAULT_FILE = 'main.py';
const AUTO_RUN_DELAY = 800; // ms of inactivity before auto-running the checkers
const DEFAULT_CODE = `from typing import Self

class C:
    def clone(self: None) -> Self:
        return self
`;

// Ruff target ("py312") -> backend python_version ("3.12")
function ruffToPythonVersion(target: string): string {
  const digits = target.replace('py', '');
  return `${digits[0]}.${digits.slice(1)}`;
}

// backend python_version ("3.12") -> Ruff target ("py312")
function pythonToRuffVersion(version: string): string {
  return `py${version.replace('.', '')}`;
}


function App() {
  const { isReady, targetVersion, setTargetVersion, validateCode } = useRuffValidator('py312');
  const [files, setFiles] = useState<Record<string, string>>({ [DEFAULT_FILE]: DEFAULT_CODE });
  const [panes, setPanes] = useState<string[]>([DEFAULT_FILE]);
  const [ruffByFile, setRuffByFile] = useState<Record<string, any[]>>({});
  const [checkers, setCheckers] = useState<CheckerInfo[]>([]);
  const [selectedCheckerIds, setSelectedCheckerIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typecheckerDiagnostics, setTypecheckerDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [runSummary, setRunSummary] = useState<string | null>(null);
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [exampleEntries, setExampleEntries] = useState<ExampleEntry[]>([]);
  // Bumped whenever the whole workspace is replaced (example load / upload), to force a
  // full re-validation of every file
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const runIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((name: string, content: string) => {
    const diags = validateCode(content);
    setRuffByFile((prev) => ({ ...prev, [name]: diags }));
    return diags;
  }, [validateCode]);

  // Clear stale typechecker squiggles as soon as any file changes
  useEffect(() => {
    setTypecheckerDiagnostics([]);
  }, [files]);

  // Validate every file when Ruff becomes ready or the target version changes
  useEffect(() => {
    if (!isReady) return;
    setRuffByFile(() => {
      const next: Record<string, any[]> = {};
      for (const [name, content] of Object.entries(files)) {
        next[name] = validateCode(content);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, targetVersion, validateCode, workspaceEpoch]);

  // Load available typecheckers from the backend instead of hardcoding them
  useEffect(() => {
    fetch('/api/checkers')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CheckerInfo[]>;
      })
      .then((data) => {
        setCheckers(data);
        setSelectedCheckerIds(data.map((c) => c.id));
      })
      .catch((err) => console.error('Failed to load checkers:', err));
  }, []);

  useEffect(() => {
    loadIndex()
      .then(setExampleEntries)
      .catch((err) => console.error('Failed to load examples:', err));
  }, []);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString();
    if (type === 'error') {
      console.error(`[${time}] ${msg}`);
    } else {
      console.log(`[${time}] ${msg}`);
    }
  };

  const runCheckers = async (runId: number) => {
    setIsSubmitting(true);
    const pythonVersion = ruffToPythonVersion(targetVersion);

    try {
      const settled = await Promise.allSettled(
        selectedCheckerIds.map((id) =>
          fetch(`/api/checkers/${id}/typecheck`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files, python_version: pythonVersion }),
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<CheckerResult>;
          })
        )
      );

      // A newer run (or edit) started while this one was in flight; drop stale results.
      if (runId !== runIdRef.current) return;

      const newDiags: EditorDiagnostic[] = [];
      const checkerById = new Map(checkers.map((c) => [c.id, c]));
      let checkersWithIssues = 0;
      settled.forEach((outcome, i) => {
        const id = selectedCheckerIds[i];
        if (outcome.status === 'rejected') {
          addLog(`[${id}] request failed: ${outcome.reason}`, 'error');
          return;
        }
        const result = outcome.value;
        if (result.error) {
          addLog(`[${result.checker} ${result.version}] failed: ${result.error}`, 'error');
          return;
        }
        const info = checkerById.get(id);
        if (!info) {
          addLog(`[${id}] unknown checker id; dropping ${result.diagnostics.length} diagnostics`, 'error');
          return;
        }
        if (result.diagnostics.some((d) => d.severity !== 'information')) checkersWithIssues++;
        for (const d of result.diagnostics) {
          newDiags.push({
            file: d.file,
            checker: result.checker,
            checkerLabel: info.label,
            color: info.color,
            line: d.line,
            character: d.column,
            endLine: d.end_line,
            endColumn: d.end_column,
            message: d.code ? `${d.message} (${d.code})` : d.message,
            severity: d.severity,
          });
        }
      });

      setTypecheckerDiagnostics(newDiags);
      setRunSummary(
        checkersWithIssues > 0
          ? `${checkersWithIssues} typechecker${checkersWithIssues === 1 ? '' : 's'} found issues`
          : 'No issues found'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Every file is validated and clean -> safe to send to the checkers.
  const canRun = Object.keys(files).every(
    (name) => Array.isArray(ruffByFile[name]) && ruffByFile[name].length === 0
  );
  const hasSyntaxErrors = Object.values(ruffByFile).some((d) => d.length > 0);

  // Debounced auto-run: fire a short delay after the files, target version, or selection
  // change. Each change invalidates any in-flight run; only runs while all files are valid.
  useEffect(() => {
    const runId = ++runIdRef.current;
    if (!isReady) return;
    // No checkers selected: there's nothing to run, so clear any stale squiggles
    // and summary instead of leaving the last run's results on screen.
    if (selectedCheckerIds.length === 0) {
      setTypecheckerDiagnostics([]);
      setRunSummary(null);
      return;
    }
    if (!canRun) return;
    const handle = setTimeout(() => runCheckers(runId), AUTO_RUN_DELAY);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, targetVersion, selectedCheckerIds, canRun, isReady]);

  const updateFileContent = (name: string, content: string) => {
    setFiles((prev) => ({ ...prev, [name]: content }));
    validateFile(name, content);
  };

  const selectFileForPane = (paneIndex: number, file: string) => {
    setPanes((prev) => prev.map((f, i) => (i === paneIndex ? file : f)));
  };

  const closePane = (paneIndex: number) => {
    setPanes((prev) => prev.filter((_, i) => i !== paneIndex));
  };

  const startAddFile = () => {
    setNewFileName('');
    setAddingFile(true);
  };

  const cancelAddFile = () => {
    setAddingFile(false);
    setNewFileName('');
  };

  const confirmAddFile = () => {
    const name = newFileName.trim();
    setAddingFile(false);
    setNewFileName('');
    if (!name) return;
    if (files[name] === undefined) {
      setFiles((prev) => ({ ...prev, [name]: '' }));
      validateFile(name, '');
    }
    setPanes((prev) => [...prev, name]);
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const uploaded: Record<string, string> = {};
    for (const file of Array.from(fileList)) {
      uploaded[file.name] = await file.text();
    }
    e.target.value = ''; // let the same file be re-selected later

    setFiles((prev) => ({ ...prev, ...uploaded }));
    for (const [name, content] of Object.entries(uploaded)) {
      validateFile(name, content);
    }

    // Open one pane per uploaded file, with the primary (non-_ .py) first.
    const names = Object.keys(uploaded);
    const primary =
      names.find((n) => n.endsWith('.py') && !n.startsWith('_')) ??
      names.find((n) => n.endsWith('.py')) ??
      names[0];
    setPanes([primary, ...names.filter((n) => n !== primary)]);
  };

  const handleLoadExample = async (entry: ExampleEntry) => {
    let loaded;
    try {
      loaded = await loadExample(entry);
    } catch (err) {
      console.error(`Failed to load example "${entry.id}":`, err);
      return;
    }

    setFiles(loaded.files);
    setPanes(loaded.order);
    if (loaded.pythonVersion) {
      setTargetVersion(pythonToRuffVersion(loaded.pythonVersion));
    }
    setWorkspaceEpoch((e) => e + 1); // triggers the bulk re-validate effect
  };

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
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmAddFile();
                    else if (e.key === 'Escape') cancelAddFile();
                  }}
                  onBlur={cancelAddFile}
                />
              ) : (
                <button className="pane-action" onClick={startAddFile} title="New file">＋ File</button>
              )}
              <button className="pane-action" onClick={() => fileInputRef.current?.click()} title="Upload files">↥ Upload</button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".py,.pyi"
                style={{ display: 'none' }}
                onChange={handleUpload}
              />
              <ExamplePicker entries={exampleEntries} onPick={handleLoadExample} />
            </div>
            <Toolbar
              checkers={checkers}
              targetVersion={targetVersion}
              setTargetVersion={setTargetVersion}
              selectedCheckerIds={selectedCheckerIds}
              setSelectedCheckerIds={setSelectedCheckerIds}
              isValid={!hasSyntaxErrors}
              isSubmitting={isSubmitting}
              runSummary={runSummary}
            />
          </div>
          <div className="editor-split">
            {panes.map((file, i) => (
              <EditorPane
                key={i}
                file={file}
                fileNames={Object.keys(files)}
                content={files[file] ?? ''}
                onChangeContent={(content) => updateFileContent(file, content)}
                onSelectFile={(f) => selectFileForPane(i, f)}
                onClose={panes.length > 1 ? () => closePane(i) : null}
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
