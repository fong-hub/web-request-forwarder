import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends Blob {
    constructor(bits, name, options = {}) {
      super(bits, options)
      this.name = name
      this.lastModified = options.lastModified ?? Date.now()
    }
  }
}

const args = process.argv.slice(2)
process.argv = ['node', 'vite', ...args]

const viteEntry = pathToFileURL(resolve('node_modules/vite/bin/vite.js')).href
await import(viteEntry)
