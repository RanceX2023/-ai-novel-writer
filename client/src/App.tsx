import { Route, Routes } from 'react-router-dom';
import ProjectEditorPage from './pages/ProjectEditorPage';
import ProjectSetupPage from './pages/ProjectSetupPage';
import SettingsPage from './pages/SettingsPage';

const defaultProjectId = (import.meta.env.VITE_DEFAULT_PROJECT_ID || '').trim();

const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-16 text-slate-200">
    <div className="max-w-lg space-y-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">页面走丢了</h1>
      <p className="text-sm text-slate-400">请确认访问地址是否正确，或返回项目中心重新开始。</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-slate-700/80 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-brand/50 hover:text-brand"
        >
          返回项目中心
        </a>
        {defaultProjectId ? (
          <a
            href={`/project/${defaultProjectId}`}
            className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-glow transition hover:bg-brand/90"
          >
            进入默认项目
          </a>
        ) : null}
      </div>
    </div>
  </div>
);

function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectSetupPage defaultProjectId={defaultProjectId || undefined} />} />
      <Route path="/settings" element={<SettingsPage defaultProjectId={defaultProjectId || undefined} />} />
      <Route path="/project/:projectId" element={<ProjectEditorPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
