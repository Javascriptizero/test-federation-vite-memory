<template>
  <main class="host">
    <header>
      <h1>fvm host</h1>
      <p>
        Home page of the Nuxt host, rendered at {{ renderedAt }}.
        Below is the <code>fvm_remote</code> microfrontend, server-rendered through
        <code>@module-federation/nuxt</code> with the <code>vm</code> strategy of <code>@module-federation/vite</code>.
      </p>
      <p>
        Memory and the globals the remote left on this server:
        <a href="/api/memory">/api/memory</a> (<a href="/api/memory?gc=1">after GC</a>).
      </p>
    </header>

    <FvmRemoteApp title="Microfrontend inside the host" />

    <footer>
      <p>Host content below the microfrontend.</p>
    </footer>
  </main>
</template>

<script setup lang="ts">
// useState: the server timestamp goes through the payload, so hydration matches
const renderedAt = useState('renderedAt', () => new Date().toISOString())
</script>

<style>
.host {
  max-width: 760px;
  margin: 32px auto;
  font-family: system-ui, sans-serif;
  display: grid;
  gap: 16px;
}
</style>
