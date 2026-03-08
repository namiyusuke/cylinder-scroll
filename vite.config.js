import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        index2: resolve(__dirname, 'index2.html'),
        index3: resolve(__dirname, 'index3.html'),
      },
    },
  },
})
