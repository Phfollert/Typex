import React, { useRef, useEffect } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { bgSetterClass } from '../squiggle';

interface CodeEditorProps {
  code: string;
  onChange: (val: string) => void;
  diagnostics: any[];
  isReady: boolean;
  typecheckerDiagnostics?: any[];
}

const CodeEditor: React.FC<CodeEditorProps> = ({ code, onChange, diagnostics, isReady, typecheckerDiagnostics = [] }) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const typecheckerDecorationsRef = useRef<string[]>([]);
  const viewZoneIdsRef = useRef<string[]>([]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    updateMarkers(diagnostics, monaco, editor.getModel());
    updateTypecheckerDecorations(typecheckerDiagnostics, monaco, editor);
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    onChange(value);
  };

  // Ruff markers are owned by the parent (validated per file) and arrive via props.
  useEffect(() => {
    if (isReady && monacoRef.current && editorRef.current) {
      updateMarkers(diagnostics, monacoRef.current, editorRef.current.getModel());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics, isReady]);

  // Keep typechecker decorations up to date
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      updateTypecheckerDecorations(typecheckerDiagnostics, monacoRef.current, editorRef.current);
    }
  }, [typecheckerDiagnostics]);

  const updateTypecheckerDecorations = (diags: any[], monaco: Monaco, editorInstance: editor.IStandaloneCodeEditor) => {
    // 1. Group diagnostics by line to assign depth dynamically
    const lineDepths: Record<number, Set<string>> = {}; // line -> Set of checkers
    const diagsWithDepth = (diags || []).map(d => {
      if (!lineDepths[d.line]) {
        lineDepths[d.line] = new Set();
      }
      lineDepths[d.line].add(d.checker);

      // Determine the depth (1-indexed) based on the order of checkers on this line
      const depth = Array.from(lineDepths[d.line]).indexOf(d.checker) + 1;
      return { ...d, depth };
    });

    const newDecorations = diagsWithDepth.map(d => {
      const setter = bgSetterClass(d.color, d.depth, 'wavy');
      return {
        range: new monaco.Range(d.line, d.character, d.endLine || d.line, d.endColumn || (d.character + 10)),
        options: {
          isWholeLine: false,
          inlineClassName: `squiggly-base squiggly-depth-${d.depth} ${setter}`,
          hoverMessage: { value: `**${d.checkerLabel ?? d.checker}**: ${d.message}` }
        }
      };
    });

    typecheckerDecorationsRef.current = editorInstance.deltaDecorations(typecheckerDecorationsRef.current, newDecorations);

    // Use Monaco View Zones to reactively push the next line down
    editorInstance.changeViewZones((accessor) => {
      // Remove old zones
      viewZoneIdsRef.current.forEach(id => accessor.removeZone(id));
      viewZoneIdsRef.current = [];

      // Add new zones for lines that need extra space
      Object.entries(lineDepths).forEach(([lineStr, checkers]) => {
        const line = parseInt(lineStr, 10);
        const maxDepth = checkers.size;
        const height = maxDepth * 3; // 3px per depth level

        // If height > 6, it overflows the natural line gap, requiring extra space
        if (height > 6) {
          const extraSpace = height - 4; // Buffer to prevent overlap
          const domNode = document.createElement('div');

          const id = accessor.addZone({
            afterLineNumber: line,
            heightInPx: extraSpace,
            domNode: domNode,
            suppressMouseDown: true
          });
          viewZoneIdsRef.current.push(id);
        }
      });
    });
  };

  const updateMarkers = (diags: any[], monaco: Monaco, model: editor.ITextModel | null) => {
    if (!diags || !model) {
      if (model) {
        monaco.editor.setModelMarkers(model, "ruff", []);
      }
      return;
    }

    const markers = diags.map((d) => {
      // Handle the case where location/end_location might be named differently in WASM API
      const start = d.location || d.start_location || { row: 1, column: 1 };
      const end = d.end_location || d.location || { row: 1, column: 1 };

      return {
        severity: monaco.MarkerSeverity.Error, // By default mostly error/warning
        message: d.message || "Syntax issue",
        startLineNumber: start.row,
        startColumn: start.column,
        endLineNumber: end.row,
        endColumn: end.column,
      };
    });

    monaco.editor.setModelMarkers(model, "ruff", markers);
  };

  return (
    <div className="editor-wrapper">
      <Editor
        height="100%"
        theme="vs-dark"
        defaultLanguage="python"
        value={code}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', monospace",
          fontLigatures: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          padding: { top: 16 },
          hover: { above: false }
        }}
      />
    </div>
  );
};

export default CodeEditor;
