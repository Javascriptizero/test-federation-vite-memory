<template>
  <!-- Inline styles: MF does not put the remote's CSS files into the host's SSR HTML -->
  <section
    class="fvm-remote"
    :data-release="release"
    style="border: 2px dashed #42b883; border-radius: 8px; padding: 12px 16px; font-family: system-ui, sans-serif"
  >
    <header style="display: flex; justify-content: space-between; gap: 16px">
      <strong>{{ title }}</strong>
      <code>release {{ release }}</code>
    </header>

    <p>Built at {{ builtAt }}. This block is a separate Vue {{ vueVersion }} app bundled inside the microfrontend.</p>

    <button
      type="button"
      @click="clicks++"
    >
      Clicked {{ clicks }} times
    </button>
  </section>
</template>

<script setup lang="ts">
import { ref, version } from 'vue'

import { BUILT_AT, RELEASE } from './release'

defineProps<{ title: string }>()

const release = RELEASE
const builtAt = BUILT_AT
const vueVersion = version
const clicks = ref(0)
</script>
