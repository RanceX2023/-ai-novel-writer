import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../ToastProvider';

const TestHarness = () => {
  const { toast, dismiss } = useToast();
  return (
    <div>
      <button
        type="button"
        onClick={() => toast({ id: 'test-toast', title: '提示标题', description: '详细说明', duration: 10000 })}
      >
        打开
      </button>
      <button type="button" onClick={() => dismiss('test-toast')}>
        关闭
      </button>
    </div>
  );
};

describe('ToastProvider', () => {
  it('renders toast message when triggered', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByText('提示标题')).toBeInTheDocument();
    expect(screen.getByText('详细说明')).toBeInTheDocument();
  });

  it('dismisses toast when dismiss is invoked', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByText('提示标题')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText('提示标题')).not.toBeInTheDocument();
  });
});
