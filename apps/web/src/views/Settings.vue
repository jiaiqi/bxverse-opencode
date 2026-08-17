<script setup lang="ts">
// Settings.vue —— 设置页（外观/PWA/轮询/AI/数据仓库/安全）

import { useAppStore } from '../stores/app'
import PageHeader from '../components/PageHeader.vue'
import { api } from '../api'
import { setToken } from '../api/http'
import { useDialog, useMessage } from 'naive-ui'

const appStore = useAppStore()
const dialog = useDialog()
const message = useMessage()

const form = reactive({
  theme: 'system' as 'light' | 'dark' | 'system',
  themeStyle: 'indigo' as 'indigo' | 'wenxi',
  pwaEnabled: true,
  pollInterval: 30_000,
  aiEnabled: false,
  aiBaseUrl: '',
  aiModel: '',
  aiApiKey: '',
})

/** 检测周期：UI 以「秒」呈现，配置/存储为毫秒 */
const pollSeconds = computed({
  get: () => Math.round(form.pollInterval / 1000),
  set: (v: number | null) => {
    form.pollInterval = Math.max(5, Math.min(3600, Math.round(v ?? 30))) * 1000
  },
})
const saving = ref(false)
const syncing = ref(false)
const syncResult = ref('')
const dataDir = ref('')

watchEffect(() => {
  const c = appStore.config
  if (!c) return
  form.theme = c.theme
  form.themeStyle = c.themeStyle ?? 'indigo'
  form.pwaEnabled = c.pwa.enabled
  form.pollInterval = c.pollInterval
  form.aiEnabled = c.ai.enabled
  form.aiBaseUrl = c.ai.baseUrl
  form.aiModel = c.ai.model
  form.aiApiKey = c.ai.apiKey
  dataDir.value = c.dataDir
})

/** 主题风格即时预览：点击即切换并保存，无需等「保存全部设置」 */
async function pickStyle(style: 'indigo' | 'wenxi') {
  form.themeStyle = style
  await appStore.setThemeStyle(style)
}

async function save() {
  saving.value = true
  try {
    await appStore.setTheme(form.theme)
    await api.saveConfig({
      theme: form.theme,
      themeStyle: form.themeStyle,
      pwa: { enabled: form.pwaEnabled },
      pollInterval: form.pollInterval,
      ai: { enabled: form.aiEnabled, baseUrl: form.aiBaseUrl, model: form.aiModel, apiKey: form.aiApiKey },
    })
    message.success('设置已保存')
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

async function sync(action: 'pull' | 'push') {
  syncing.value = true
  syncResult.value = ''
  try {
    const result = await api.sync(action)
    syncResult.value = result.ok ? `${action} 完成` : String(result.message ?? '失败')
  } catch (e) {
    syncResult.value = (e as Error).message
  } finally {
    syncing.value = false
  }
}

function rotateToken() {
  dialog.warning({
    title: '轮换访问令牌',
    content: '轮换后旧 token 立即失效，所有已打开页面需要刷新重新引导。确定继续？',
    positiveText: '轮换',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const { token } = await api.rotateToken()
        setToken(token)
        message.success('已轮换，请刷新页面')
      } catch (e) {
        message.error((e as Error).message)
      }
    },
  })
}
</script>

<template>
  <div class="page max-w-3xl">
    <PageHeader title="设置" icon="i-carbon-settings" />

    <section>
      <h2 class="section-title"><i aria-hidden="true" class="i-carbon-paint-brush text-brand-500" /> 外观与体验</h2>
      <div class="card card-pad mt-4 space-y-5">
        <!-- R20 主题风格：indigo 标准套件 / wenxi 深色玻璃拟态套件（点击即时预览） -->
        <div>
          <div class="text-sm font-medium text-text-1">主题风格</div>
          <div class="text-xs text-text-3 mt-0.5">indigo 为默认靛蓝套件（亮/暗/跟随系统）；WenXi 为深色玻璃拟态套件（翠绿强调，仅深色）</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <button
              class="flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors duration-150 focus-ring bg-surface"
              :class="form.themeStyle === 'indigo' ? 'border-brand-500 bg-brand-soft shadow-[0_0_0_1px_var(--bx-brand-500)]' : 'border-border hover:border-border-strong'"
              :aria-pressed="form.themeStyle === 'indigo'"
              @click="pickStyle('indigo')"
            >
              <!-- swatch：精密仪器深色基底 + 翠绿强调点（对齐原型 .theme-opt） -->
              <span class="w-10 h-10 rounded-[10px] border border-border shrink-0 relative overflow-hidden bg-[#0B0D10]">
                <span class="absolute w-3.5 h-3.5 rounded-[4px] bg-brand-500" style="left: 12px; top: 12px" />
              </span>
              <span class="min-w-0">
                <span class="block text-13px font-semibold text-text-1">Indigo 标准</span>
                <span class="block text-xs text-text-3 mt-0.5">亮 / 暗 / 跟随系统</span>
              </span>
              <i
                aria-hidden="true"
                v-if="form.themeStyle === 'indigo'"
                class="i-carbon-checkmark-filled ml-auto text-16px text-brand-500"
              />
            </button>
            <button
              class="flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors duration-150 focus-ring bg-surface"
              :class="form.themeStyle === 'wenxi' ? 'border-brand-500 bg-brand-soft shadow-[0_0_0_1px_var(--bx-brand-500)]' : 'border-border hover:border-border-strong'"
              :aria-pressed="form.themeStyle === 'wenxi'"
              @click="pickStyle('wenxi')"
            >
              <span class="w-10 h-10 rounded-[10px] border border-border shrink-0 relative overflow-hidden bg-[#050507]">
                <span class="absolute w-3.5 h-3.5 rounded-[4px] bg-brand-500" style="left: 12px; top: 12px; box-shadow: 0 0 8px rgba(0,201,110,.5)" />
              </span>
              <span class="min-w-0">
                <span class="block text-13px font-semibold text-text-1">WenXi 深色玻璃</span>
                <span class="block text-xs text-text-3 mt-0.5">近纯黑基底 · 翠绿强调 · 仅深色</span>
              </span>
              <i
                aria-hidden="true"
                v-if="form.themeStyle === 'wenxi'"
                class="i-carbon-checkmark-filled ml-auto text-16px text-brand-500"
              />
            </button>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-text-1">主题</div>
            <div class="text-xs text-text-3 mt-0.5" :class="{ 'opacity-70': form.themeStyle === 'wenxi' }">
              {{ form.themeStyle === 'wenxi' ? 'WenXi 风格固定为深色，主题切换暂不可用（切回 Indigo 后恢复）' : 'system 时跟随操作系统' }}
            </div>
          </div>
          <NRadioGroup v-model:value="form.theme" :disabled="form.themeStyle === 'wenxi'">
            <NRadioButton value="light"><i aria-hidden="true" class="i-carbon-sun mr-1" /> 亮</NRadioButton>
            <NRadioButton value="dark"><i aria-hidden="true" class="i-carbon-moon mr-1" /> 暗</NRadioButton>
            <NRadioButton value="system"><i aria-hidden="true" class="i-carbon-screen mr-1" /> 系统</NRadioButton>
          </NRadioGroup>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-text-1">PWA 安装</div>
            <div class="text-xs text-text-3 mt-0.5">开启后可用浏览器「安装应用」获得独立窗口体验</div>
          </div>
          <NSwitch v-model:value="form.pwaEnabled" />
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-text-1">变动检测周期</div>
            <div class="text-xs text-text-3 mt-0.5">仓库变更自动检测间隔（秒，如 30 = 半分钟）</div>
          </div>
          <div class="flex items-center gap-2">
            <NInputNumber v-model:value="pollSeconds" :min="5" :max="3600" :step="5" class="w-40" :input-props="{ 'aria-label': '变动检测周期（秒）' }" />
            <span class="text-xs text-text-3">秒</span>
          </div>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title"><i aria-hidden="true" class="i-carbon-sparkle text-brand-500" /> AI 日志润色（可选）</h2>
      <div class="card card-pad mt-4 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-text-1">启用 AI 润色</div>
            <div class="text-xs text-text-3 mt-0.5">对外日志草稿可一键改写为用户友好文案（仅生成草稿，仍须人工确认）</div>
          </div>
          <NSwitch v-model:value="form.aiEnabled" />
        </div>
        <template v-if="form.aiEnabled">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="field-label">Base URL（OpenAI 兼容）</label>
              <NInput v-model:value="form.aiBaseUrl" placeholder="http://127.0.0.1:11434/v1" :input-props="{ 'aria-label': 'Base URL（OpenAI 兼容）' }" />
            </div>
            <div>
              <label class="field-label">模型</label>
              <NInput v-model:value="form.aiModel" placeholder="qwen2.5:7b" :input-props="{ 'aria-label': '模型' }" />
            </div>
          </div>
          <div>
            <label class="field-label">API Key（仅存本机）</label>
            <NInput v-model:value="form.aiApiKey" type="password" show-password-on="click" placeholder="sk-…" :input-props="{ 'aria-label': 'API Key（仅存本机）' }" />
          </div>
        </template>
      </div>
    </section>

    <section>
      <h2 class="section-title"><i aria-hidden="true" class="i-carbon-renew text-brand-500" /> 数据仓库同步</h2>
      <div class="card card-pad mt-4 space-y-3">
        <div class="code-text text-13px text-text-2 bg-surface-alt border border-border rounded-md px-3 py-2">{{ dataDir || '—' }}</div>
        <div class="flex items-center gap-2.5">
          <NButton size="small" :loading="syncing" @click="sync('pull')">
            <template #icon><i aria-hidden="true" class="i-carbon-cloud-download" /></template>
            拉取
          </NButton>
          <NButton size="small" :loading="syncing" @click="sync('push')">
            <template #icon><i aria-hidden="true" class="i-carbon-cloud-upload" /></template>
            推送
          </NButton>
          <span v-if="syncResult" class="text-xs text-text-2">{{ syncResult }}</span>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title"><i aria-hidden="true" class="i-carbon-locked text-brand-500" /> 安全</h2>
      <div class="card card-pad mt-4 flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-text-1">访问令牌</div>
          <div class="text-xs text-text-3 mt-0.5">轮换后旧令牌立即失效</div>
        </div>
        <NButton secondary type="warning" @click="rotateToken">轮换令牌</NButton>
      </div>
    </section>

    <div class="flex justify-end">
      <NButton type="primary" size="large" :loading="saving" @click="save">保存全部设置</NButton>
    </div>
  </div>
</template>
