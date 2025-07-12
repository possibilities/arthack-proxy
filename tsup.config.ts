import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    server: 'src/server.ts',
  },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  dts: false,
  bundle: true,
  outExtension() {
    return {
      js: '.js',
    }
  },
  esbuildOptions(options) {
    options.platform = 'node'
    options.format = 'esm'
  },
})
