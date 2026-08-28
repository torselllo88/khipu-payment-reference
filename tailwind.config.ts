import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        khipu: {
          DEFAULT: "#5b3df5",
          dark: "#3d29b0",
        },
        unlimit: {
          DEFAULT: "#0ea5a3",
          dark: "#0a7674",
        },
      },
    },
  },
  plugins: [],
};

export default config;
