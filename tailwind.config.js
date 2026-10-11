export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        indigo: {
          50: '#eef7fd', 100: '#d6ebf9', 200: '#b0d8f2', 300: '#7fbfe8', 400: '#4aa3df',
          500: '#2e8bcb', 600: '#1f74b0', 700: '#1a5c8e', 800: '#184c73', 900: '#163f5f',
        },
      },
    },
  },
  plugins: [],
}
