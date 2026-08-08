import { defineConfig } from "vite";
import { resolve } from "path";

const root = import.meta.dirname;

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        ota: resolve(root, "ota.html"),
        help: resolve(root, "help.html"),
        systemCheck: resolve(root, "system-check.html"),
      },
    },
  },
});
