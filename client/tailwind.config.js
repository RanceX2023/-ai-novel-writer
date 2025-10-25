import defaultTheme from 'tailwindcss/defaultTheme';
import lineClamp from '@tailwindcss/line-clamp';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        brand: {
          DEFAULT: '#5b8fff',
          foreground: '#0f172a',
        },
      },
      boxShadow: {
        glow: '0 0 0 2px rgba(91, 143, 255, 0.2)',
      },
    },
  },
  plugins: [lineClamp],
};
