import React, { useRef, useEffect, useCallback } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { bgSetterClass, ensureLaneStyles, LANE_HEIGHT_PX } from '@/squiggle';
import { layoutSquiggles, type HoverBlock } from '@/squiggleLanes';
import type { EditorDiagnostic, RuffDiagnostic } from '@/types';

const SEV_LABEL_BY_SEVERITY = { error: '✕ error', warning: '⚠ warning', information: 'ⓘ info' } as const;

// Given the default font size, this is the number of lanes that fit below the text without
// needing extra padding. If more lanes are needed, we add a view zone to create extra space.
const LANES_THAT_FIT_BELOW_TEXT = 2;

const hoverMarkdown = (h: HoverBlock) => ({
  value: `**${h.checkerLabel}** · ${SEV_LABEL_BY_SEVERITY[h.severity]}\n\n${h.message}`,
});

interface CodeEditorProps {
  code: string;
  onChange: (val: string) => void;
  diagnostics: RuffDiagnostic[];
  isReady: boolean;
  typecheckerDiagnostics?: EditorDiagnostic[];
}

const CodeEditor: React.FC<CodeEditorProps> = ({ code, onChange, diagnostics, isReady, typecheckerDiagnostics = [] }) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const typecheckerDecorationsRef = useRef<string[]>([]);
  const viewZoneIdsRef = useRef<string[]>([]);

  const updateTypecheckerDecorations = useCallback((
    diags: EditorDiagnostic[],
    monaco: Monaco,
    editorInstance: editor.IStandaloneCodeEditor,
  ) => {
    const model = editorInstance.getModel();
    if (!model) return;

    const { placements, maxLane } = layoutSquiggles(diags || [], (line) =>
      model.getLineMaxColumn(line),
    );
    ensureLaneStyles(Math.max(maxLane, 1));

    // Lane 1 is closest to the text, but the CSS renders higher depth nearer the
    // text, so invert: lane 1 -> deepest depth (maxLane).
    const depthOf = (lane: number) => maxLane - lane + 1;

    const newDecorations = placements.map((p) => {
      const depth = depthOf(p.lane);
      return {
        range: new monaco.Range(p.line, p.startColumn, p.line, p.endColumn),
        options: {
          isWholeLine: false,
          inlineClassName: `squiggly-base squiggly-depth-${depth} ${bgSetterClass(p.color, depth, p.shape)}`,
          hoverMessage: p.hovers.map(hoverMarkdown),
        },
      };
    });

    typecheckerDecorationsRef.current = editorInstance.deltaDecorations(
      typecheckerDecorationsRef.current,
      newDecorations,
    );

    const maxDepthByLine = new Map<number, number>();
    for (const p of placements) {
      maxDepthByLine.set(p.line, Math.max(maxDepthByLine.get(p.line) ?? 0, depthOf(p.lane)));
    }

    editorInstance.changeViewZones((accessor: editor.IViewZoneChangeAccessor) => {
      viewZoneIdsRef.current.forEach((id) => accessor.removeZone(id));
      viewZoneIdsRef.current = [];

      for (const [line, depth] of maxDepthByLine) {
        if (depth > LANES_THAT_FIT_BELOW_TEXT) {
          const extraSpace = (depth - LANES_THAT_FIT_BELOW_TEXT) * LANE_HEIGHT_PX;
          const id = accessor.addZone({
            afterLineNumber: line,
            heightInPx: extraSpace,
            domNode: document.createElement('div'),
            suppressMouseDown: true,
          });
          viewZoneIdsRef.current.push(id);
        }
      }
    });
  }, []);

  const updateMarkers = useCallback((diags: RuffDiagnostic[], monaco: Monaco, model: editor.ITextModel | null) => {
    if (!diags || !model) {
      if (model) {
        monaco.editor.setModelMarkers(model, "ruff", []);
      }
      return;
    }

    const markers = diags.map((d) => ({
      severity: monaco.MarkerSeverity.Error, // By default mostly error/warning
      message: d.message || "Syntax issue",
      startLineNumber: d.start_location.row,
      startColumn: d.start_location.column,
      endLineNumber: d.end_location.row,
      endColumn: d.end_location.column,
    }));

    monaco.editor.setModelMarkers(model, "ruff", markers);
  }, []);

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
  }, [diagnostics, isReady, updateMarkers]);

  // Keep typechecker decorations up to date
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      updateTypecheckerDecorations(typecheckerDiagnostics, monacoRef.current, editorRef.current);
    }
  }, [typecheckerDiagnostics, updateTypecheckerDecorations]);

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
