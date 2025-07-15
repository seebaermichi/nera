import { defineConfig } from 'vite';

export default defineConfig({
    root: 'public',
    server: {
        open: true,
        port: 3000,
        watch: {
            usePolling: true,
        },
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
});
