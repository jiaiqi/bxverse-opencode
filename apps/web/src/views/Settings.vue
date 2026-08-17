<script setup lang="ts">
// Settings.vue —— 设置页（外观/PWA/轮询/AI 供应商/数据仓库/安全）

import { AI_PRESET_PROVIDERS } from '@bxverse/shared'
import { useAppStore } from '../stores/app'
import { api } from '../api'
import { setToken } from '../api/http'
import { useDialog, useMessage } from 'naive-ui'

const appStore = useAppStore()
const dialog = useDialog()
const message = useMessage()

const form = reactive({
  theme: 'light' as 'light' | 'dark' | 'system',
  themeStyle: 'indigo' as 'indigo' | 'wenxi',
  pwaEnabled: true,
  pollInterval: 30_000,
  aiEnabled: false,
  aiBaseUrl: '',
  aiModel: '',
  aiApiKey: '',
  aiRoutes: {
    commit: '',
    polish: '',
    explain: '',
  },
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

// ---------- AI 供应商管理（R21/R22 智能化与多生态体系） ----------
interface ProviderView {
  id: string
  name: string
  kind: string
  baseUrl: string
  model: string
  enabled: boolean
  hasKey: boolean
}
const providers = ref<ProviderView[]>([])
const providersLoading = ref(false)

/** 供应商分类 */
type CategoryTab = 'all' | 'domestic' | 'global' | 'aggregator' | 'local' | 'custom'
const selectedCategory = ref<CategoryTab>('all')
const presetSearch = ref('')

/** 预设列表过滤 */
const filteredPresets = computed(() => {
  let list = AI_PRESET_PROVIDERS
  if (selectedCategory.value !== 'all' && selectedCategory.value !== 'custom') {
    list = list.filter(p => p.category === selectedCategory.value)
  }
  const q = presetSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(p => p.name.toLowerCase().includes(q) || p.placeholderModel.toLowerCase().includes(q) || (p.hint ?? '').toLowerCase().includes(q))
  }
  return list
})

/** 弹窗表单状态 */
const providerModal = reactive({
  open: false,
  editing: null as ProviderView | null,
  preset: 'deepseek',
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  saving: false,
  testing: false,
  testLatency: null as number | null,
  testDetail: '',
  testOk: false,
})

/** 在线拉取到的模型列表 */
const discoveredModels = ref<string[]>([])
const fetchingModels = ref(false)

/** 单张卡片测速状态缓存 */
const cardLatencyMap = ref<Record<string, { testing?: boolean; latencyMs?: number; error?: string }>>({})

const currentPreset = computed(() => AI_PRESET_PROVIDERS.find(p => p.key === providerModal.preset))

/** URL 智能纠错与建议 */
const urlFixSuggestion = computed(() => {
  const raw = providerModal.baseUrl.trim()
  if (!raw) return null
  let fixed = raw
  if (!/^https?:\/\//i.test(fixed)) {
    fixed = /^(localhost|127\.0\.0\.1)(:\d+)?/i.test(fixed) ? `http://${fixed}` : `https://${fixed}`
  }
  fixed = fixed.replace(/\/+(?:chat\/)?completions(?:\/.*)?$/i, '').replace(/\/+$/, '')
  if (fixed !== raw) return fixed
  return null
})

function applyUrlFix() {
  if (urlFixSuggestion.value) {
    providerModal.baseUrl = urlFixSuggestion.value
    message.success('已自动修复 Base URL 格式')
  }
}

const activeProvider = computed(() => providers.value.find(p => p.enabled) ?? null)

async function loadProviders() {
  providersLoading.value = true
  try {
    providers.value = await api.aiProviders()
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    providersLoading.value = false
  }
}

function openAdd() {
  providerModal.editing = null
  selectedCategory.value = 'all'
  presetSearch.value = ''
  discoveredModels.value = []
  providerModal.testLatency = null
  providerModal.testDetail = ''
  providerModal.testOk = false
  applyPreset('deepseek')
  providerModal.apiKey = ''
  providerModal.open = true
}

function applyPreset(key: string) {
  const preset = AI_PRESET_PROVIDERS.find(p => p.key === key)
  providerModal.preset = key
  discoveredModels.value = []
  providerModal.testLatency = null
  providerModal.testDetail = ''
  providerModal.testOk = false
  if (preset) {
    providerModal.name = preset.name
    providerModal.baseUrl = preset.baseUrl
    providerModal.model = preset.placeholderModel
  } else {
    providerModal.name = '自定义供应商'
    providerModal.baseUrl = 'https://'
    providerModal.model = ''
  }
}

function openEdit(p: ProviderView) {
  providerModal.editing = p
  providerModal.preset = AI_PRESET_PROVIDERS.find(x => x.baseUrl === p.baseUrl)?.key ?? 'custom'
  providerModal.name = p.name
  providerModal.baseUrl = p.baseUrl
  providerModal.model = p.model
  providerModal.apiKey = ''
  discoveredModels.value = []
  providerModal.testLatency = null
  providerModal.testDetail = ''
  providerModal.testOk = false
  providerModal.open = true
}

/** 在线拉取供应商支持的模型 */
async function fetchOnlineModels() {
  const rawUrl = providerModal.baseUrl.trim()
  if (!rawUrl) {
    message.warning('请先填写 Base URL')
    return
  }
  fetchingModels.value = true
  try {
    const res = await api.aiFetchModels({
      baseUrl: rawUrl,
      apiKey: providerModal.apiKey.trim() || undefined,
      providerId: providerModal.editing?.id,
    })
    if (res.models?.length) {
      discoveredModels.value = res.models
      message.success(`成功探测到 ${res.models.length} 个可用模型`)
      // 如果当前没有模型或不在列表中，自动填充第一个
      if (!providerModal.model || !res.models.includes(providerModal.model)) {
        providerModal.model = res.models[0]
      }
    } else {
      message.info('未获取到模型列表，请直接在输入框填写')
    }
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    fetchingModels.value = false
  }
}

/** 弹窗内连通性测试与测速 */
async function testCurrentModal() {
  const rawUrl = providerModal.baseUrl.trim()
  if (!rawUrl) {
    message.warning('请先填写 Base URL')
    return
  }
  providerModal.testing = true
  providerModal.testLatency = null
  providerModal.testDetail = ''
  providerModal.testOk = false
  try {
    const r = await api.aiTestProvider({
      providerId: providerModal.editing?.id,
      baseUrl: rawUrl,
      apiKey: providerModal.apiKey.trim() || undefined,
      model: providerModal.model.trim() || undefined,
      name: providerModal.name.trim() || undefined,
    })
    providerModal.testLatency = r.latencyMs
    providerModal.testDetail = `连通正常（耗时 ${r.latencyMs}ms，模型: ${r.model}）`
    providerModal.testOk = true
    message.success(`测试通过！响应延迟 ${r.latencyMs}ms`)
  } catch (e) {
    providerModal.testDetail = (e as Error).message
    providerModal.testOk = false
    message.error((e as Error).message)
  } finally {
    providerModal.testing = false
  }
}

/** 列表卡片直接快速测速 */
async function testCardLatency(p: ProviderView) {
  cardLatencyMap.value[p.id] = { testing: true }
  try {
    const r = await api.aiTestProvider({ providerId: p.id })
    cardLatencyMap.value[p.id] = { testing: false, latencyMs: r.latencyMs }
    message.success(`「${p.name}」连通正常（${r.latencyMs}ms）`)
  } catch (e) {
    cardLatencyMap.value[p.id] = { testing: false, error: (e as Error).message }
    message.error((e as Error).message)
  }
}

async function saveProvider() {
  const m = providerModal
  if (!m.name.trim()) { message.warning('请填写供应商名称'); return }
  const url = m.baseUrl.trim()
  if (!url || !/^https?:\/\//i.test(url)) { message.warning('Base URL 必须为有效 http(s) 地址'); return }
  if (!m.model.trim()) { message.warning('请填写或选择模型'); return }
  m.saving = true
  try {
    if (m.editing) {
      await api.aiUpdateProvider(m.editing.id, {
        name: m.name.trim(),
        baseUrl: url,
        model: m.model.trim(),
      })
      if (m.apiKey.trim()) await api.aiSetCredential(m.editing.id, m.apiKey.trim())
    } else {
      const created = await api.aiAddProvider({
        name: m.name.trim(),
        baseUrl: url,
        model: m.model.trim(),
        enabled: true,
      })
      if (m.apiKey.trim()) await api.aiSetCredential(created.id, m.apiKey.trim())
    }
    message.success('供应商已保存')
    m.open = false
    await loadProviders()
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    m.saving = false
  }
}

async function setActive(p: ProviderView) {
  try {
    await api.aiUpdateProvider(p.id, { enabled: true })
    await loadProviders()
    message.success(`已切换生效供应商：${p.name}`)
  } catch (e) {
    message.error((e as Error).message)
  }
}

function removeProvider(p: ProviderView) {
  dialog.warning({
    title: '删除供应商',
    content: `确定删除「${p.name}」？删除后引用该供应商的 AI 功能不可用，凭据一并清除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.aiDeleteProvider(p.id)
        message.success('已删除')
        await loadProviders()
      } catch (e) {
        message.error((e as Error).message)
      }
    },
  })
}

/** 启用/停用 AI 润色（即时生效） */
async function toggleAi(v: boolean) {
  form.aiEnabled = v
  try {
    await api.saveConfig({ ai: { enabled: v, baseUrl: form.aiBaseUrl, model: form.aiModel, apiKey: '' } })
    message.success(v ? 'AI 润色已启用' : 'AI 润色已停用')
  } catch (e) {
    form.aiEnabled = !v
    message.error((e as Error).message)
  }
}
watchEffect(() => {
  const c = appStore.config
  if (!c) return
  form.theme = c.theme
  form.themeStyle = c.themeStyle ?? 'indigo'
  form.pwaEnabled = c.pwa.enabled
  form.aiApiKey = c.ai.apiKey
  form.aiRoutes = {
    commit: c.ai.routes?.commit ?? '',
    polish: c.ai.routes?.polish ?? '',
    explain: c.ai.routes?.explain ?? '',
  }
  dataDir.value = c.dataDir
})

onMounted(loadProviders)

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
      ai: { enabled: form.aiEnabled, baseUrl: form.aiBaseUrl, model: form.aiModel, apiKey: '', routes: form.aiRoutes },
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
  <div class="page max-w-6xl space-y-6">
    <!-- 顶部仪表头部 -->
    <div class="glass-panel p-5 rounded-2xl flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-brand-soft border border-brand-200 flex items-center justify-center text-brand-500 shrink-0">
          <i aria-hidden="true" class="i-carbon-settings text-20px" />
        </div>
        <div class="min-w-0">
          <h1 class="text-base font-bold text-text-1 m-0 font-sans">系统控制中心</h1>
          <p class="text-xs text-text-3 mt-0.5 m-0 font-mono">外观 / 数据仓库 / PWA / 轮询 / AI 多生态模型路由 / 性能</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="chip chip-info font-mono text-11px">{{ appStore.config?.host ?? '127.0.0.1' }}:{{ appStore.config?.port ?? 8899 }}</span>
        <span class="chip font-mono text-11px">数据目录：{{ dataDir || '加载中' }}</span>
      </div>
    </div>

    <!-- 1. 外观与体验 -->
    <section class="glass-panel p-5 rounded-2xl">
      <h2 class="section-title m-0 flex items-center gap-2">
        <i aria-hidden="true" class="i-carbon-paint-brush text-brand-500" />
        <span>外观与体验</span>
        <span class="text-xs text-text-3 font-normal ml-2">主题风格 / 主题 / PWA / 轮询</span>
      </h2>
      <div class="mt-4 space-y-5">
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

    <section class="glass-panel p-5 rounded-2xl">
      <h2 class="section-title m-0 flex items-center gap-2"><i aria-hidden="true" class="i-carbon-sparkle text-brand-500" /><span>AI 多生态模型路由</span><span class="text-xs text-text-3 font-normal ml-2">已配置供应商 / 测速 / 场景特化分工</span></h2>
      <div class="mt-4 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-text-1">启用 AI 能力</div>
            <div class="text-xs text-text-3 mt-0.5">为对外发布日志提供智能润色，为 Git 面板提供提交信息生成与单文件变更解读</div>
          </div>
          <NSwitch :value="form.aiEnabled" @update:value="toggleAi" />
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-medium text-text-1">
              已配置供应商
              <span v-if="activeProvider" class="text-xs text-text-3 font-normal ml-2">当前生效：<strong class="text-text-1">{{ activeProvider.name }}</strong>（{{ activeProvider.model }}）</span>
            </div>
            <NButton size="small" type="primary" secondary @click="openAdd">
              <template #icon><i aria-hidden="true" class="i-carbon-add" /></template>
              添加供应商
            </NButton>
          </div>

          <div v-if="providersLoading" class="py-6 text-center text-text-3"><NSpin size="small" /></div>
          <div v-else-if="providers.length === 0" class="py-8 text-center text-xs text-text-3 border border-dashed border-border rounded-lg">
            <i aria-hidden="true" class="i-carbon-bot text-2xl mb-1.5 block opacity-60 text-brand-500" />
            尚未添加 AI 供应商——点击上方按钮快速选择主流供应商（DeepSeek / OpenAI / Kimi / 硅基流动 / 本地 Ollama 等）。
          </div>
          <div v-else class="space-y-2.5">
            <div
              v-for="p in providers"
              :key="p.id"
              class="flex items-center gap-3.5 px-4 py-3 rounded-lg border transition-all duration-150"
              :class="p.enabled ? 'border-brand-500 bg-brand-soft/40 shadow-sm' : 'border-border bg-surface hover:border-border-strong'"
            >
              <!-- 品牌首字徽标 -->
              <div
                class="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs shrink-0 select-none text-white shadow-xs"
                :style="{ backgroundColor: AI_PRESET_PROVIDERS.find(x => x.baseUrl === p.baseUrl)?.color ?? '#4B5563' }"
              >
                {{ p.name.slice(0, 1) }}
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-semibold text-text-1">{{ p.name }}</span>
                  <span class="code-text text-11px px-1.5 py-0.5 rounded bg-surface-alt border border-border text-text-2">{{ p.model }}</span>
                  <span v-if="p.enabled" class="chip chip-brand text-11px">当前生效</span>
                  <!-- 实时测速徽章 -->
                  <span
                    v-if="cardLatencyMap[p.id]?.latencyMs !== undefined"
                    class="chip chip-success text-11px font-mono flex items-center gap-1"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-success inline-block animate-pulse" />
                    {{ cardLatencyMap[p.id]?.latencyMs }}ms
                  </span>
                  <span
                    v-else-if="cardLatencyMap[p.id]?.error"
                    class="chip chip-warning text-11px max-w-40 truncate"
                    :title="cardLatencyMap[p.id]?.error"
                  >
                    测试失败
                  </span>
                </div>
                <div class="code-text text-xs text-text-3 truncate mt-0.5">{{ p.baseUrl }}</div>
              </div>

              <span class="text-xs shrink-0 hidden sm:inline" :class="p.hasKey ? 'text-success' : 'text-text-3'">
                {{ p.hasKey ? '● 已存密钥' : '○ 无密钥' }}
              </span>

              <div class="flex items-center gap-1 shrink-0">
                <NButton
                  size="tiny"
                  quaternary
                  :loading="cardLatencyMap[p.id]?.testing"
                  title="单独测速"
                  @click="testCardLatency(p)"
                >
                  <template #icon><i aria-hidden="true" class="i-carbon-flash" /></template>
                  测速
                </NButton>
                <NButton v-if="!p.enabled" size="tiny" quaternary type="primary" @click="setActive(p)">设为当前</NButton>
                <NButton size="tiny" quaternary @click="openEdit(p)">编辑</NButton>
                <NButton size="tiny" quaternary type="error" @click="removeProvider(p)">删除</NButton>
              </div>
            </div>
          </div>

          <!-- 场景特化 AI 模型路由分工 (R23 / 建议 2) -->
          <div v-if="providers.length > 0" class="mt-4 pt-3.5 border-t border-border space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-semibold text-text-1 flex items-center gap-1.5">
                  <i aria-hidden="true" class="i-carbon-split text-brand-500" />
                  <span>场景特化 AI 模型路由分工（可选）</span>
                </div>
                <div class="text-11px text-text-3 mt-0.5">按任务类型绑定特定模型（Commit 适合极速免费、日志适合文采优美、Diff 需深度推理）</div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <!-- 1. Commit 生成 -->
              <div class="p-2.5 rounded-lg bg-surface-alt border border-border space-y-1.5">
                <div class="text-xs font-medium text-text-1 flex items-center gap-1">
                  <i aria-hidden="true" class="i-carbon-flash text-warning" /> Commit 提交生成
                </div>
                <NSelect
                  v-model:value="form.aiRoutes.commit"
                  size="small"
                  placeholder="跟随默认供应商"
                  clearable
                  :options="[{ label: '跟随默认供应商', value: '' }, ...providers.map(p => ({ label: `${p.name} (${p.model})`, value: p.id }))]"
                />
              </div>

              <!-- 2. 对外日志润色 -->
              <div class="p-2.5 rounded-lg bg-surface-alt border border-border space-y-1.5">
                <div class="text-xs font-medium text-text-1 flex items-center gap-1">
                  <i aria-hidden="true" class="i-carbon-sparkle text-brand-500" /> 对外日志润色
                </div>
                <NSelect
                  v-model:value="form.aiRoutes.polish"
                  size="small"
                  placeholder="跟随默认供应商"
                  clearable
                  :options="[{ label: '跟随默认供应商', value: '' }, ...providers.map(p => ({ label: `${p.name} (${p.model})`, value: p.id }))]"
                />
              </div>

              <!-- 3. Diff 架构解读 -->
              <div class="p-2.5 rounded-lg bg-surface-alt border border-border space-y-1.5">
                <div class="text-xs font-medium text-text-1 flex items-center gap-1">
                  <i aria-hidden="true" class="i-carbon-bot text-brand-500" /> Diff 架构解读
                </div>
                <NSelect
                  v-model:value="form.aiRoutes.explain"
                  size="small"
                  placeholder="跟随默认供应商"
                  clearable
                  :options="[{ label: '跟随默认供应商', value: '' }, ...providers.map(p => ({ label: `${p.name} (${p.model})`, value: p.id }))]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- AI 供应商智能化添加/编辑弹窗 -->
    <NModal
      v-model:show="providerModal.open"
      preset="card"
      :title="providerModal.editing ? '编辑供应商' : '添加 AI 供应商（主流生态预设）'"
      class="w-160 max-w-95vw"
    >
      <div class="space-y-4.5">
        <!-- 新增模式下的生态分类与快速选择 -->
        <div v-if="!providerModal.editing" class="space-y-2.5 pb-3 border-b border-border">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <!-- 分类切换 -->
            <div class="flex gap-1 bg-surface-alt p-1 rounded-lg border border-border text-xs">
              <button
                class="px-2.5 py-1 rounded transition-colors duration-150"
                :class="selectedCategory === 'all' ? 'bg-surface font-semibold text-brand-600 shadow-xs' : 'text-text-2 hover:text-text-1'"
                @click="selectedCategory = 'all'"
              >
                全部生态
              </button>
              <button
                class="px-2.5 py-1 rounded transition-colors duration-150"
                :class="selectedCategory === 'domestic' ? 'bg-surface font-semibold text-brand-600 shadow-xs' : 'text-text-2 hover:text-text-1'"
                @click="selectedCategory = 'domestic'"
              >
                国内大厂
              </button>
              <button
                class="px-2.5 py-1 rounded transition-colors duration-150"
                :class="selectedCategory === 'global' ? 'bg-surface font-semibold text-brand-600 shadow-xs' : 'text-text-2 hover:text-text-1'"
                @click="selectedCategory = 'global'"
              >
                国际主流
              </button>
              <button
                class="px-2.5 py-1 rounded transition-colors duration-150"
                :class="selectedCategory === 'aggregator' ? 'bg-surface font-semibold text-brand-600 shadow-xs' : 'text-text-2 hover:text-text-1'"
                @click="selectedCategory = 'aggregator'"
              >
                聚合中转
              </button>
              <button
                class="px-2.5 py-1 rounded transition-colors duration-150"
                :class="selectedCategory === 'local' ? 'bg-surface font-semibold text-brand-600 shadow-xs' : 'text-text-2 hover:text-text-1'"
                @click="selectedCategory = 'local'"
              >
                本地私有
              </button>
              <button
                class="px-2.5 py-1 rounded transition-colors duration-150"
                :class="providerModal.preset === 'custom' ? 'bg-surface font-semibold text-brand-600 shadow-xs' : 'text-text-2 hover:text-text-1'"
                @click="applyPreset('custom')"
              >
                自定义
              </button>
            </div>

            <!-- 搜索框 -->
            <NInput
              v-model:value="presetSearch"
              size="small"
              placeholder="搜索预设…"
              class="w-36"
              clearable
            >
              <template #prefix><i aria-hidden="true" class="i-carbon-search text-text-3" /></template>
            </NInput>
          </div>

          <!-- 预设网格卡片 -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            <div
              v-for="preset in filteredPresets"
              :key="preset.key"
              class="p-2.5 rounded-lg border text-left cursor-pointer transition-all duration-150 flex items-start gap-2.5 relative"
              :class="providerModal.preset === preset.key ? 'border-brand-500 bg-brand-soft/50 shadow-xs ring-1 ring-brand-500' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-alt'"
              @click="applyPreset(preset.key)"
            >
              <span
                class="w-6 h-6 rounded flex items-center justify-center font-bold text-10px shrink-0 text-white select-none mt-0.5"
                :style="{ backgroundColor: preset.color ?? '#6B7280' }"
              >
                {{ preset.name.slice(0, 1) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-12px font-medium text-text-1 truncate">{{ preset.name }}</div>
                <div class="text-10px text-text-3 truncate code-text">{{ preset.placeholderModel }}</div>
              </div>
              <i
                v-if="providerModal.preset === preset.key"
                aria-hidden="true"
                class="i-carbon-checkmark-filled text-brand-500 text-14px shrink-0 absolute right-2 top-2"
              />
            </div>
          </div>
        </div>

        <!-- 表单项 -->
        <div class="space-y-3.5">
          <div class="field">
            <label for="ai-name" class="flex items-center justify-between">
              <span>供应商名称</span>
            </label>
            <NInput id="ai-name" v-model:value="providerModal.name" placeholder="如：DeepSeek 官方" />
          </div>

          <div class="field">
            <label for="ai-base" class="flex items-center justify-between">
              <span>Base URL（OpenAI 兼容协议地址）</span>
            </label>
            <NInput
              id="ai-base"
              v-model:value="providerModal.baseUrl"
              placeholder="https://api.deepseek.com/v1"
              :input-props="{ autocomplete: 'off', spellcheck: 'false' }"
            />
            <!-- 智能格式修复提示 -->
            <div v-if="urlFixSuggestion" class="flex items-center justify-between px-2.5 py-1.5 rounded bg-warning/10 border border-warning/30 text-xs text-warning mt-1.5">
              <span>检测到 URL 格式可规范化为：<code class="font-mono font-semibold">{{ urlFixSuggestion }}</code></span>
              <NButton size="tiny" type="warning" tertiary @click="applyUrlFix">⚡ 一键修复</NButton>
            </div>
            <span v-else class="hint">填写包含协议与版本的端点前缀，如 <code>https://api.deepseek.com/v1</code></span>
          </div>

          <div class="field">
            <div class="flex items-center justify-between mb-1">
              <label for="ai-key" class="text-xs font-medium text-text-1">API Key（仅存本机凭据库，write-only）</label>
              <a
                v-if="currentPreset?.docUrl"
                :href="currentPreset.docUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-brand-600 hover:text-brand-500 flex items-center gap-1"
              >
                <i aria-hidden="true" class="i-carbon-launch" /> 前往官网获取 API Key
              </a>
            </div>
            <NInput
              id="ai-key"
              v-model:value="providerModal.apiKey"
              type="password"
              show-password-on="click"
              :placeholder="providerModal.editing ? '已设置密钥（留空保持不变）' : 'sk-…'"
              :input-props="{ autocomplete: 'off' }"
            />
          </div>

          <!-- 智能模型选择与探测 -->
          <div class="field">
            <div class="flex items-center justify-between mb-1">
              <label for="ai-model" class="text-xs font-medium text-text-1">模型名称</label>
              <NButton
                size="tiny"
                quaternary
                :loading="fetchingModels"
                title="调用 /v1/models 接口自动拉取可用模型"
                @click="fetchOnlineModels"
              >
                <template #icon><i aria-hidden="true" class="i-carbon-search" /></template>
                智能拉取在线模型
              </NButton>
            </div>

            <!-- 如果探测到了在线模型列表，提供下拉 + 自由输入的复合模式 -->
            <div v-if="discoveredModels.length > 0" class="space-y-1.5">
              <NSelect
                v-model:value="providerModal.model"
                filterable
                tag
                placeholder="选择或输入模型名称…"
                :options="discoveredModels.map(m => ({ label: m, value: m }))"
              />
              <div class="text-11px text-success flex items-center gap-1">
                <i aria-hidden="true" class="i-carbon-checkmark" /> 已探测到 {{ discoveredModels.length }} 个在线可用模型（支持下拉选择或直接打字输入）
              </div>
            </div>
            <!-- 默认输入框 -->
            <NInput
              v-else
              id="ai-model"
              v-model:value="providerModal.model"
              placeholder="如：deepseek-chat / gpt-4o-mini"
              :input-props="{ autocomplete: 'off', spellcheck: 'false' }"
            />

            <!-- 厂商内置推荐模型标签芯片（点击即填） -->
            <div v-if="currentPreset?.recommendedModels?.length" class="mt-2">
              <div class="text-11px text-text-3 mb-1">推荐常用模型（点击填入）：</div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="rm in currentPreset.recommendedModels"
                  :key="rm.id"
                  class="px-2 py-0.5 rounded text-11px border transition-colors duration-150 flex items-center gap-1"
                  :class="providerModal.model === rm.id ? 'border-brand-500 bg-brand-soft text-brand-600 font-semibold' : 'border-border bg-surface-alt text-text-2 hover:border-border-strong'"
                  @click="providerModal.model = rm.id"
                >
                  {{ rm.label }}
                  <span v-if="rm.description" class="text-10px opacity-70">({{ rm.description }})</span>
                </button>
              </div>
            </div>
            <span v-if="currentPreset?.hint" class="hint mt-1.5 block">{{ currentPreset.hint }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3 w-full">
          <!-- 连通性测试与测速 -->
          <div class="flex items-center gap-2">
            <NButton
              secondary
              size="small"
              :loading="providerModal.testing"
              @click="testCurrentModal"
            >
              <template #icon><i aria-hidden="true" class="i-carbon-flash text-warning" /></template>
              测试连通性与测速
            </NButton>
            <span
              v-if="providerModal.testDetail"
              class="text-xs max-w-60 truncate font-mono"
              :class="providerModal.testOk ? 'text-success' : 'text-error'"
              :title="providerModal.testDetail"
            >
              {{ providerModal.testDetail }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <NButton quaternary @click="providerModal.open = false">取消</NButton>
            <NButton :loading="providerModal.saving" type="primary" @click="saveProvider">保存供应商</NButton>
          </div>
        </div>
      </template>
    </NModal>

    <section class="glass-panel p-5 rounded-2xl">
      <h2 class="section-title m-0 flex items-center gap-2"><i aria-hidden="true" class="i-carbon-renew text-brand-500" /><span>数据仓库同步</span></h2>
      <div class="mt-4 space-y-3">
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
    <section class="glass-panel p-5 rounded-2xl">
      <h2 class="section-title m-0 flex items-center gap-2"><i aria-hidden="true" class="i-carbon-locked text-brand-500" /><span>安全</span></h2>
      <div class="mt-4 flex items-center justify-between">
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
