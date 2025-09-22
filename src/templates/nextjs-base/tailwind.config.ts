type TailwindConfig = {
  content: string[];
  theme?: {
    extend?: {
      colors?: Record<string, string | Record<string, string>>;
      borderRadius?: Record<string, string>;
      boxShadow?: Record<string, string>;
      fontFamily?: Record<string, string | string[]>;
      spacing?: Record<string, string>;
    };
  };
  plugins?: unknown[];
};

const config: TailwindConfig = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        surface: "var(--color-surface)",
        card: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-foreground)",
        },
        border: "var(--color-border)",
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground:
            "color-mix(in srgb, var(--color-foreground) 65%, white 35%)",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        "2xl": "var(--radius-md)",
        "3xl": "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        lg: "var(--shadow-md)",
      },
      fontFamily: {
        sans: ["var(--font-family-base)", "system-ui", "sans-serif"],
        heading: [
          "var(--font-family-headings)",
          "var(--font-family-base)",
          "sans-serif",
        ],
      },
      spacing: {
        4: "var(--space-4)",
        6: "var(--space-6)",
      },
    },
  },
  plugins: [],
};

export default config;
