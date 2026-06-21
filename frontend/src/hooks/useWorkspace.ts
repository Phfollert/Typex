import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import type { RuffDiagnostic } from '@/types';
import type { ExampleEntry } from '@/examples/types';
import { loadExample } from '@/examples/loader';

const DEFAULT_FILE = 'main.py';
const DEFAULT_CODE = `from typing import Self

class C:
    def clone(self: None) -> Self:
        return self
`;

// backend python_version ("3.12") -> Ruff target ("py312")
function pythonToRuffVersion(version: string): string {
  return `py${version.replace('.', '')}`;
}

interface UseWorkspaceArgs {
  validateCode: (code: string) => RuffDiagnostic[];
  isReady: boolean;
  targetVersion: string;
  setTargetVersion: (version: string) => void;
}

export function useWorkspace({ validateCode, isReady, targetVersion, setTargetVersion }: UseWorkspaceArgs) {
  const [files, setFiles] = useState<Record<string, string>>({ [DEFAULT_FILE]: DEFAULT_CODE });
  const [panes, setPanes] = useState<string[]>([DEFAULT_FILE]);
  const [ruffByFile, setRuffByFile] = useState<Record<string, RuffDiagnostic[]>>({});
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  // Bumped on full workspace replacement (example load) to force re-validation.
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((name: string, content: string) => {
    const diags = validateCode(content);
    setRuffByFile((prev) => ({ ...prev, [name]: diags }));
    return diags;
  }, [validateCode]);

  // Re-validate all files when Ruff readiness or target version changes.
  useEffect(() => {
    if (!isReady) return;
    setRuffByFile(() => {
      const next: Record<string, RuffDiagnostic[]> = {};
      for (const [name, content] of Object.entries(files)) {
        next[name] = validateCode(content);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, targetVersion, validateCode, workspaceEpoch]);

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

  const loadExampleEntry = async (entry: ExampleEntry) => {
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

  const hasSyntaxErrors = Object.values(ruffByFile).some((d) => d.length > 0);
  // Every file is validated and clean -> safe to send to the checkers.
  const canRun = Object.keys(files).every(
    (name) => Array.isArray(ruffByFile[name]) && ruffByFile[name].length === 0
  );

  return {
    field: { files, panes, ruffByFile, addingFile, newFileName, fileInputRef },
    config: { hasSyntaxErrors, canRun },
    events: {
      updateFileContent,
      selectFileForPane,
      closePane,
      startAddFile,
      cancelAddFile,
      confirmAddFile,
      setNewFileName,
      handleUpload,
      loadExample: loadExampleEntry,
    },
  };
}
