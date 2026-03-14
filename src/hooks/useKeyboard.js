import { useEffect, useState } from 'react';

export function useKeyboard(handlers = {}) {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Show keyboard shortcuts help
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setShowHelp(prev => !prev);
        return;
      }

      // Quick navigation
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const keyMap = {
          '1': () => handlers.onTab?.('tasks'),
          '2': () => handlers.onTab?.('calendar'),
          '3': () => handlers.onTab?.('inbox'),
          '4': () => handlers.onTab?.('expense'),
          '5': () => handlers.onTab?.('report'),
          '6': () => handlers.onTab?.('dev'),
          '7': () => handlers.onTab?.('ai'),
          'n': () => handlers.onNewTask?.(),
          'f': () => handlers.onSearch?.(),
          's': () => handlers.onSettings?.(),
          'k': () => handlers.onQR?.(),
          'h': () => handlers.onHey?.(),
          'Enter': () => handlers.onSubmit?.(),
          'Escape': () => handlers.onClose?.(),
        };

        if (keyMap[e.key]) {
          e.preventDefault();
          keyMap[e.key]();
        }
      }

      // Voice shortcuts
      if (e.key === ' ' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        handlers.onVoiceToggle?.();
      }

      // Global escape
      if (e.key === 'Escape') {
        handlers.onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);

  const shortcuts = [
    { keys: 'Ctrl+1-7', desc: 'Chuyển tab' },
    { keys: 'Ctrl+N', desc: 'Thêm việc' },
    { keys: 'Ctrl+F', desc: 'Tìm kiếm' },
    { keys: 'Ctrl+K', desc: 'Quét QR' },
    { keys: 'Ctrl+H', desc: 'Hey Wory' },
    { keys: 'Ctrl+S', desc: 'Cài đặt' },
    { keys: 'Ctrl+Shift+Space', desc: 'Mic' },
    { keys: 'Ctrl+/', desc: 'Trợ giúp' },
    { keys: 'Esc', desc: 'Đóng' },
  ];

  return {
    showHelp,
    setShowHelp,
    shortcuts,
  };
}