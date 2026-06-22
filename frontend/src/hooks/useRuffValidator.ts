import { useState, useEffect, useCallback, useRef } from 'react';
import initRuff, { PositionEncoding, Workspace, InitOutput } from '@astral-sh/ruff-wasm-web';
import type { RuffDiagnostic } from '@/types';

// Keep track of the initial promise so we only initialize WASM once per application
let initPromise: Promise<InitOutput> | null = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = initRuff();
  }
  return initPromise;
}

export function useRuffValidator(initialVersion: string = 'py310') {
  const [targetVersion, setTargetVersion] = useState(initialVersion);
  const [isReady, setIsReady] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RuffDiagnostic[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Use a ref to hold the workspace safely without causing async closure traps
  const workspaceRef = useRef<Workspace | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      if (mounted) setIsReady(false);

      try {
        await ensureInit();

        if (mounted) {
          // Free any existing workspace before creating a new one
          if (workspaceRef.current) {
            try {
              workspaceRef.current.free();
            } catch (e) {
              console.warn("Failed to free previous workspace:", e);
            }
            workspaceRef.current = null;
          }

          const options = {
            "target-version": targetVersion,
            // Ruff is a syntax gate only: keep parser/syntax errors, drop lint findings
            // (e.g. F821) so lint noise doesn't block the typecheckers.
            lint: { select: [] },
          };

          workspaceRef.current = new Workspace(options, PositionEncoding.Utf16);
          setIsReady(true);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to initialize Ruff WASM", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
          setIsReady(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
      if (workspaceRef.current) {
        // We can free it safely now because validateCode checks the ref
        try {
          workspaceRef.current.free();
        } catch (e) {
          console.warn("Error freeing workspace on unmount:", e);
        }
        workspaceRef.current = null;
      }
    };
  }, [targetVersion]);

  const validateCode = useCallback((code: string): RuffDiagnostic[] => {
    // If the workspace has been freed or is not ready, do not attempt to validate
    if (!workspaceRef.current || !isReady) return [];

    try {
      // Workspace.check() is typed `any` by the package; it returns RuffDiagnostic[].
      const result = workspaceRef.current.check(code) as RuffDiagnostic[];
      setDiagnostics(result);
      return result;
    } catch (err) {
      console.error("Validation error:", err);
      // Wait to see if this handles the error gracefully
      return [];
    }
  }, [isReady]);

  return {
    isReady,
    error,
    targetVersion,
    setTargetVersion,
    diagnostics,
    validateCode
  };
}
