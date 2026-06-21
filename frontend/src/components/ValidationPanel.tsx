import React from 'react';
import type { RuffDiagnostic } from '@/types';

interface ValidationPanelProps {
  isReady: boolean;
  diagnostics: RuffDiagnostic[];
  targetVersion: string;
}

const ValidationPanel: React.FC<ValidationPanelProps> = ({ isReady, diagnostics, targetVersion }) => {
  
  if (!isReady) {
    return (
      <div className="validation-panel">
        <div className="status-badge" style={{ background: 'rgba(255,255,255,0.1)' }}>
          Loading Validator ({targetVersion})...
        </div>
      </div>
    );
  }

  const hasErrors = diagnostics.length > 0;

  return (
    <div className="validation-panel">
      
      {hasErrors ? (
        <>
          <div className="status-badge status-invalid">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>
            Contains {diagnostics.length} Syntax / Lint Issue(s)
          </div>
          
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {diagnostics.map((diag, i) => (
              <div key={i} style={{ padding: '0.75rem', background: 'var(--bg-primary)', borderLeft: '3px solid var(--error)', borderRadius: '4px', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--error)', marginRight: '0.5rem' }}>Line {diag.start_location.row}:</span>
                <span style={{ color: 'var(--text-secondary)' }}>{diag.message}</span>
                {diag.code && <span style={{ marginLeft: '0.5rem', opacity: 0.5 }}>({diag.code})</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="status-badge status-valid">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l2.504 2.528 5.968-5.881z"/></svg>
          Syntax Valid ({targetVersion})
        </div>
      )}
      
    </div>
  );
};

export default ValidationPanel;
