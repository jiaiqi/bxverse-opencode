// apps/web/src/main.ts

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { setupRouterGuards } from './router'
import { countUpDirective } from './directives/countUp'
import './styles/tokens.css'
import 'uno.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('count-up', countUpDirective)
setupRouterGuards()
app.mount('#app')
