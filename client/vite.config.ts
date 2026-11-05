import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { readFileSync } from 'node:fs'

// Versie van PandaOS: één bron voor webapp en launcher (../version.json, verhoogd door tools/release.ps1)
// (een eventueel BOM-teken vooraan negeren)
const version = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8').replace(/^﻿/, '')) as { version: string; code: number }

export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  define: {
    __PANDAOS_VERSION__: JSON.stringify(version.version),
    __PANDAOS_VERSION_CODE__: version.code,
  },
  // Ook oudere WebViews (Chrome 100+): de Android 9-emulator kan niet verder dan Chrome 101 (32-bit x86), en
  // goedkope radio's lopen vaak achter. Moet gelijk zijn aan MIN_WEBVIEW in MainActivity.kt.
  build: {
    target: 'chrome100',
    cssTarget: 'chrome100',
  },
  server: {
    https: true,
    host: '127.0.0.1', // FORCEER Vite om op dit IP te draaien
    port: 5173,
    strictPort: true, // Zorg dat hij niet stiekem naar 5174 switcht
  }
})
