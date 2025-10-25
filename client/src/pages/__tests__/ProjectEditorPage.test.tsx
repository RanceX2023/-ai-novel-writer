import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectEditorPage from '../ProjectEditorPage';
import { ToastProvider } from '../../components/ui/ToastProvider';

const createJsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('ProjectEditorPage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/editor-context')) {
        return createJsonResponse({
          project: {
            id: '123',
            name: '测试项目',
            synopsis: '这是一个测试项目',
            outline: [],
          },
        });
      }
      if (url.endsWith('/chapters')) {
        return createJsonResponse({ chapters: [] });
      }
      if (url.endsWith('/memory')) {
        return createJsonResponse({
          memory: {
            world: [],
            facts: [],
            priorSummary: [],
            taboo: [],
          },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const renderPage = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const view = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/project/123"]}>
            <Routes>
              <Route path="/project/:projectId" element={<ProjectEditorPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    return { view, queryClient };
  };

  it('renders project information and placeholders', async () => {
    const { queryClient } = renderPage();

    await waitFor(() => expect(screen.getByText('测试项目')).toBeInTheDocument());

    expect(screen.getByText('尚未配置大纲，请在后端项目中添加 outlineNodes。')).toBeInTheDocument();
    expect(screen.getByText('暂无已保存章节')).toBeInTheDocument();
    expect(screen.getByText('记忆片段')).toBeInTheDocument();

    queryClient.clear();
  });

  it('shows toast when generating without outline selection', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderPage();

    await waitFor(() => expect(screen.getByText('测试项目')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '生成章节' }));

    await waitFor(() =>
      expect(screen.getByText('请选择章节大纲节点')).toBeInTheDocument()
    );

    queryClient.clear();
  });
});
