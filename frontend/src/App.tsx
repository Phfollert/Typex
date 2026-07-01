import './App.css';
import { useInitialState } from '@/share/initialState';
import Playground from '@/components/Playground';

function App() {
  const initial = useInitialState();
  if (initial.status === 'loading') {
    return <div className="app-loading">Loading shared workspace…</div>;
  }
  return <Playground initial={initial.state} />;
}

export default App;
