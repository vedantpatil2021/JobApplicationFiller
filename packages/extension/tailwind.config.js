// The widget is the only Tailwind consumer here; its CSS is inlined into a
// shadow root, so the content glob is deliberately narrow.
export default { content: ['./src/content/widget/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] }
