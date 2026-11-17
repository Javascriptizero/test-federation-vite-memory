import { mount } from './app/client'

const el = document.querySelector('#app')

// Standalone mode: the same app the host gets, without SSR
if (el) {
  mount(el, { title: 'fvm remote, standalone' })
}
