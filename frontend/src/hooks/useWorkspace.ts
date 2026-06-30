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
  initialFiles?: Record<string, string>;
}

export function useWorkspace({
  validateCode,
  isReady,
  targetVersion,
  setTargetVersion,
  initialFiles,
}: UseWorkspaceArgs) {
  const [files, setFiles] = useState<Record<string, string>>(
    () => initialFiles ?? { [DEFAULT_FILE]: DEFAULT_CODE }
  );
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

  const closeFile = (name: string) => {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setRuffByFile((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
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
    field: { files, ruffByFile, addingFile, newFileName, fileInputRef },
    config: { hasSyntaxErrors, canRun },
    events: {
      updateFileContent,
      closeFile,
      startAddFile,
      cancelAddFile,
      confirmAddFile,
      setNewFileName,
      handleUpload,
      loadExample: loadExampleEntry,
    },
  };
}
