<script setup lang="ts">
// OnboardingWizard.vue —— 首次使用引导（M5-08）
// 四步串联：欢迎 → 令牌保护 → 建项目/接仓库 → 首次发布；
// 首次启动（无项目且未完成过引导）由 App.vue 自动弹出；侧栏与命令面板可重看。

import { NModal, NButton, NPopconfirm, useMessage } from 'naive-ui'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { getToken, setToken } from '../api/http'
import { useProjectsStore } from '../stores/projects'
import { useUiStore, ONBOARDING_DONE_KEY } from '../stores/ui'
import AddProjectDialog from './AddProjectDialog.vue'
import AddRepoDialog from './AddRepoDialog.vue'

const router = useRouter()
const message = useMessage()
const projectsStore = useProjectsStore()
const uiStore = useUiStore()

const step = ref(0)
const STEP_TITLES = ['欢迎使用 BX 版本管理台', '第一步 · 保护你的服务', '第二步 · 创建项目并接入仓库', '第三步 · 完成第一次发布']

const firstProject = computed(() => projectsStore.items[0] ?? null)
const showAddProject = ref(false)
const showAddRepo = ref(false)
const rotating = ref(false)

// 令牌只展示前 4 位，复制时取完整值
const maskedToken = computed(() => {
  const t = getToken()
  return t ? `${t.slice(0, 4)}${'•'.repeat(8)}` : '（未初始化）'
})

function markDone(): void {
  localStorage.setItem(ONBOARDING_DONE_KEY, '1')
  uiStore.toggleOnboarding(false)
}

function onModalUpdate(v: boolean): void {
  // Esc / 关闭均视为跳过并记录完成，避免每次启动反复弹出
  if (!v) markDone()
}

function next(): void {
  if (step.value >= 3) {
    markDone()
    return
  }
  step.value += 1
}

async function copyToken(): Promise<void> {
  const t = getToken()
  if (!t) {
    message.warning('令牌尚未初始化，请刷新页面重试')
    return
  }
  try {
    await navigator.clipboard.writeText(t)
    message.success('访问令牌已复制到剪贴板')
  } catch {
    message.warning('剪贴板不可用（非安全上下文），请到设置页轮换后手动复制')
  }
}

async function rotateToken(): Promise<void> {
  rotating.value = true
  try {
    const res = await api.rotateToken()
    setToken(res.token)
    message.success('令牌已轮换，旧令牌即刻失效')
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    rotating.value = false
  }
}

async function copySeedCmd(): Promise<void> {
  try {
    await navigator.clipboard.writeText('pnpm seed')
    message.success('已复制 pnpm seed（需服务已启动）')
  } catch {
    message.warning('剪贴板不可用，请手动输入 pnpm seed')
  }
}

function goRelease(): void {
  markDone()
  if (firstProject.value) void router.push(`/project/${firstProject.value.id}/release`)
}
</script>

<template>
  <NModal
    :show="uiStore.onboardingOpen"
    preset="card"
    :title="STEP_TITLES[step]"
    class="w-150 max-w-95vw"
    :mask-closable="false"
    :closable="true"
    aria-label="首次使用引导"
    @update:show="onModalUpdate"
  >
    <!-- 进度点 -->
    <div class="flex justify-center gap-1.5 mb-4" aria-hidden="true">
      <span
        v-for="i in 4"
        :key="i"
        class="h-1.5 rounded-full transition-[width,background-color]"
        :class="i - 1 <= step ? 'bg-brand-500 w-5' : 'bg-border-strong w-1.5'"
      ></span>
    </div>

    <div class="min-h-44 text-sm text-text-2 leading-relaxed">
      <!-- 0 欢迎 -->
      <template v-if="step === 0">
        <p>
          bxverse 帮你把多个项目的<b class="text-text-1">版本号与更新日志</b>统一管理：
          检测变更 → 自动建议版本 → 双轨日志确认 → 预演 → 发布。
        </p>
        <p class="mt-3">
          所有数据保存在本机 <code class="font-mono text-text-1">~/.bxverse</code>，发布历史即审计档案。
          对业务仓库零侵入：永不 commit / amend / force-push。
        </p>
      </template>

      <!-- 1 令牌保护 -->
      <template v-else-if="step === 1">
        <p class="mb-3">服务启动时已生成随机访问令牌（仅本机 127.0.0.1 有效）：</p>
        <div class="flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2">
          <i aria-hidden="true" class="i-carbon-locked text-brand-500 text-15px shrink-0" />
          <code class="font-mono text-xs text-text-1 flex-1 truncate">{{ maskedToken }}</code>
          <NButton size="small" quaternary @click="copyToken">
            <i aria-hidden="true" class="i-carbon-copy" /> 复制令牌
          </NButton>
          <NPopconfirm @positive-click="rotateToken">
            <template #trigger>
              <NButton size="small" quaternary :loading="rotating" aria-label="轮换访问令牌">
                <i aria-hidden="true" class="i-carbon-renew" /> 轮换
              </NButton>
            </template>
            轮换后旧令牌立即失效，其他已打开的浏览器会话需要重新获取。确定轮换？
          </NPopconfirm>
        </div>
        <p class="mt-3 text-xs text-text-3">
          令牌存于 <code class="font-mono">credentials.json</code>（0600 权限、不进数据仓库）；非回环地址访问必须携带令牌。
        </p>
      </template>

      <!-- 2 建项目 / 接仓库 -->
      <template v-else-if="step === 2">
        <p class="mb-3">项目 = 一组相关仓库的集合（例如「主产品线」下挂前端 / 后端 / 小程序）。</p>
        <div class="space-y-2">
          <div class="flex items-start gap-3 rounded-lg border border-border p-3">
            <span class="w-6 h-6 rounded-md bg-brand-soft text-brand-600 flex items-center justify-center text-xs font-bold shrink-0" aria-hidden="true">1</span>
            <div class="flex-1">
              <b class="text-text-1">新建项目</b>
              <p class="text-xs text-text-3 mt-0.5">设置项目级版本方案：X.Y.Z 或 V 时间戳（R26）</p>
            </div>
            <NButton size="small" type="primary" secondary @click="showAddProject = true">
              <i aria-hidden="true" class="i-carbon-add" /> 新建项目
            </NButton>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-border p-3">
            <span class="w-6 h-6 rounded-md bg-brand-soft text-brand-600 flex items-center justify-center text-xs font-bold shrink-0" aria-hidden="true">2</span>
            <div class="flex-1">
              <b class="text-text-1">接入仓库：本地路径或 git 地址</b>
              <p class="text-xs text-text-3 mt-0.5">克隆白名单协议 https / ssh / git@；bxverse 永不改动你的提交历史</p>
            </div>
            <NButton size="small" secondary :disabled="!firstProject" @click="showAddRepo = true">
              <i aria-hidden="true" class="i-carbon-branch" /> 接入仓库
            </NButton>
          </div>
        </div>
        <p v-if="firstProject" class="mt-3 text-xs text-brand-500 flex items-center gap-1">
          <i aria-hidden="true" class="i-carbon-checkmark" /> 已有项目「{{ firstProject.name }}」，可以直接进入下一步
        </p>
      </template>

      <!-- 3 首次发布 -->
      <template v-else>
        <p class="mb-3">向导会自动检测变更、建议版本号、生成双轨日志草稿——你只需逐轨确认（人审为终）。</p>
        <div class="space-y-2">
          <div class="flex items-start gap-3 rounded-lg border border-border p-3">
            <i aria-hidden="true" class="i-carbon-rocket text-brand-500 text-16px mt-0.5 shrink-0" />
            <div class="flex-1">
              <b class="text-text-1">打开发布向导</b>
              <p class="text-xs text-text-3 mt-0.5">首次发布前会先跑 dry-run 预演，不产生任何副作用</p>
            </div>
            <NButton size="small" type="primary" :disabled="!firstProject" @click="goRelease">打开发布向导</NButton>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-border p-3">
            <i aria-hidden="true" class="i-carbon-terminal text-text-3 text-16px mt-0.5 shrink-0" />
            <div class="flex-1">
              <b class="text-text-1">用演示数据体验完整流程</b>
              <p class="text-xs text-text-3 mt-0.5">一键创建演示项目与 3 个示例仓库，随时可删</p>
            </div>
            <NButton size="small" quaternary @click="copySeedCmd">
              <i aria-hidden="true" class="i-carbon-copy" /> pnpm seed
            </NButton>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="flex items-center gap-2.5">
        <NButton quaternary @click="markDone">跳过引导</NButton>
        <div class="flex-1"></div>
        <NButton v-if="step > 0" quaternary @click="step -= 1">上一步</NButton>
        <NButton type="primary" @click="next">{{ step >= 3 ? '完成' : '下一步' }}</NButton>
      </div>
    </template>

    <!-- 引导内嵌复用既有对话框，保存后刷新项目列表 -->
    <AddProjectDialog v-model:show="showAddProject" @saved="projectsStore.load()" />
    <AddRepoDialog
      v-if="firstProject"
      v-model:show="showAddRepo"
      :project-id="firstProject.id"
      @added="projectsStore.load()"
    />
  </NModal>
</template>
