import { Navigate, Route, Routes } from 'react-router-dom';
import ProjectEditorPage from './pages/ProjectEditorPage';

const defaultProjectId = (import.meta.env.VITE_DEFAULT_PROJECT_ID || '').trim();

const MissingProject = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-16 text-slate-200">
    <div className="max-w-lg space-y-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">尚未配置默认项目</h1>
      <p className="text-sm text-slate-400">
        请在 <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-brand">VITE_DEFAULT_PROJECT_ID</code> 环境变量中填写目标项目的 ID，
        或直接访问 <span className="font-mono text-xs">/project/&lt;项目ID&gt;</span>。
      </p>
    </div>
  </div>
);

const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-16 text-slate-200">
    <div className="max-w-lg space-y-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">页面走丢了</h1>
      <p className="text-sm text-slate-400">请确认访问地址是否正确，或返回项目编辑页重新开始。</p>
      {defaultProjectId ? (
        <a
          href={`/project/${defaultProjectId}`}
          className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-glow transition hover:bg-brand/90"
        >
          回到默认项目
        </a>
      ) : null}
    </div>
  </div>
);

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          defaultProjectId ? <Navigate to={`/project/${defaultProjectId}`} replace /> : <MissingProject />
        }
      />
      <Route path="/project/:projectId" element={<ProjectEditorPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
