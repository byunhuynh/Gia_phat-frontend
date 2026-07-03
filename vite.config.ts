// vite.config.ts
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";
  const env = loadEnv(mode, process.cwd(), "");

  // 🔥 Đọc từ .env.local, fallback về 0.0.0.0
  const NETWORK_HOST = env.VITE_DEV_HOST || "0.0.0.0";
  const NETWORK_IP = env.VITE_DEV_IP || "localhost";

  if (isDev) {
    console.log("\n🚀 Dev Server:");
    console.log(`   Local:   http://localhost:3000`);
    console.log(
      `   Network: http://${NETWORK_IP}:3000  ← Dùng cho điện thoại\n`,
    );
  }

  return {
    plugins: [react()],
    base: "/",

    server: isDev
      ? {
          host: NETWORK_HOST,
          port: 3000,
          hmr: {
            host: NETWORK_IP,
            protocol: "ws",
            port: 3000,
          },
          cors: true,
        }
      : undefined,

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },

    build: {
      outDir: "dist",
      sourcemap: false,
      target: "esnext",
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
          },
        },
      },
    },
  };
});
