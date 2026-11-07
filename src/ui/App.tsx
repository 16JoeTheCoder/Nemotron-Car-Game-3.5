import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GaragePreset,
  SavedState,
  TestResult,
  TelemetrySample,
  VehicleParams,
} from '../types';
import {
  DebouncedSaver,
  emptyState,
  exportJSON,
  importJSON,
  loadState,
  saveState,
} from '../platform/storage';
import Drive from './Drive';
import Garage from './Garage';
import Telemetry from './Telemetry';
import Tests from './Tests';
import Engineering from './Engineering';

type Tab = 'Drive' | 'Garage' | 'Telemetry' | 'Tests' | 'Engineering';

const TAB_LABEL: Record<Tab, string> = {
  Drive: 'Drive',
  Garage: 'Garage',
  Telemetry: 'Telemetry',
  Tests: 'Tests',
  Engineering: 'Engineering',
};

export default function App() {
  const [state, setState] = useState<SavedState>(() => {
    const loaded = loadState();
    return loaded ?? emptyState();
  });
  const [activeTab, setActiveTab] = useState<Tab>('Drive');
  const saverRef = useRef(new DebouncedSaver((s) => saveState(s)));

  // Persist whenever state changes (debounced).
  useEffect(() => {
    saverRef.current.schedule(state);
  }, [state]);

  const params = state.setup;
  const settings = state.settings;
  const presets = state.presets;
  const results = state.records;
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetrySample | null>(null);

  const onTelemetry = useCallback((sample: TelemetrySample) => {
    setLatestTelemetry(sample);
  }, []);

  const setParams = useCallback((next: Partial<VehicleParams>) => {
    setState((s) => ({ ...s, setup: { ...s.setup, ...next } }));
  }, []);

  const loadPreset = useCallback((preset: GaragePreset) => {
    setState((s) => ({ ...s, setup: { ...preset.params } }));
  }, []);

  const addPreset = useCallback((preset: GaragePreset) => {
    setState((s) => ({ ...s, presets: [...s.presets, preset] }));
  }, []);

  const removePreset = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      presets: s.presets.filter((p) => p.name !== name),
    }));
  }, []);

  const addResult = useCallback((result: TestResult) => {
    setState((s) => ({ ...s, records: [result, ...s.records].slice(0, 50) }));
  }, []);

  const clearResults = useCallback(() => {
    setState((s) => ({ ...s, records: [] }));
  }, []);

  const handleExport = useCallback(() => {
    const json = exportJSON(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vehicle-dynamics-lab-save.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const imported = importJSON(text);
      if (imported) {
        setState(imported);
      } else {
        alert('Invalid save file.');
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Vehicle Dynamics Lab</h1>
        <nav className="app-tabs">
          {Object.keys(TAB_LABEL).map((tab) => (
            <button
              key={tab}
              className={tab === activeTab ? 'tab active' : 'tab'}
              onClick={() => setActiveTab(tab as Tab)}
            >
              {TAB_LABEL[tab as Tab]}
            </button>
          ))}
        </nav>
        <div className="app-header-actions">
          <input
            id="import-file"
            type="file"
            accept=".json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
            }}
            style={{ display: 'none' }}
          />
          <button className="btn btn-outline" onClick={handleExport}>Export Save</button>
          <button className="btn btn-outline" onClick={() => document.getElementById('import-file')?.click()}>
            Import Save
          </button>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'Drive' && (
          <Drive
            params={params}
            settings={settings}
            onTelemetry={onTelemetry}
            onSetParams={setParams}
            onTestFinished={addResult}
          />
        )}
        {activeTab === 'Garage' && (
          <Garage
            params={params}
            presets={presets}
            onSetParams={setParams}
            onLoadPreset={loadPreset}
            onAddPreset={addPreset}
            onRemovePreset={removePreset}
          />
        )}
        {activeTab === 'Telemetry' && <Telemetry sample={latestTelemetry} />}
        {activeTab === 'Tests' && (
          <Tests params={params} results={results} onClear={clearResults} />
        )}
        {activeTab === 'Engineering' && <Engineering />}
      </main>

      <footer className="app-footer">
        <span>Vehicle Dynamics Lab &middot; Bicycle-model physics &middot; SI units</span>
        <span className="footer-right">
          {results.length} test record{results.length !== 1 ? 's' : ''} saved
        </span>
      </footer>
    </div>
  );
}
