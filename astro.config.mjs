// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';

import tailwindcss from '@tailwindcss/vite';

import partytown from '@astrojs/partytown';

// https://astro.build/config
export default defineConfig({
  integrations: [
    svelte(),
    partytown({
      config: {
        forward: ['dataLayer.push'],
      },
    })
  ],

  vite: {
    plugins: [tailwindcss()]
  },

  site: 'https://riparuk.github.io',
  base: '/whystoptexting',
});