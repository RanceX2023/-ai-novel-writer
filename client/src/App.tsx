import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChapterWorkspace from './components/ChapterWorkspace';
import './App.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChapterWorkspace />
    </QueryClientProvider>
  );
}

export default App;
