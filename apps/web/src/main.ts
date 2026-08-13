// apps/web/src/main.ts

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { setupRouterGuards } from './router'
import './styles/tokens.css'
import 'uno.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
setupRouterGuards()
app.mount('#app')
