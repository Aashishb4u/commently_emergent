module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx,html}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        li: {
          bg: "#F3F2EF",
          primary: "#0A66C2",
          primaryHover: "#004182",
          text: "#191919",
          muted: "#666666",
          border: "#E0DFDC",
          success: "#057642",
          error: "#CC1016",
          ai: "#4338CA",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
