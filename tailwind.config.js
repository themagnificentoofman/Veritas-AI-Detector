export default {
  content: ['./index.html', './*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      keyframes: {
        'toast-in': { '0%': { transform: 'translateY(100%)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'toast-out': { '0%': { transform: 'translateY(0)', opacity: '1' }, '100%': { transform: 'translateY(20px)', opacity: '0' } },
      },
      animation: {
        'toast-in': 'toast-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-out': 'toast-out 0.2s ease-in forwards',
      },
    },
  },
  plugins: [],
};
