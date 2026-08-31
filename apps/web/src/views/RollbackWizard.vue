<script setup lang="ts">
// RollbackWizard.vue —— 升级后回退到历史版本向导（R32）
// 4 步：选 release → 影响面预览 → 版本与日志确认 → 执行
import { computed, onMounted, ref, watch } from 'vue'
import type {
  ReleaseRecord,
  RollbackPreview,
  RollbackResult,
  RollbackRequest,
  BumpType,
} from '@bxverse/shared'
import { api } from '../api'
import PageHeader from '../components/PageHeader.vue'
import StatCard from '../components/StatCard.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingState from '../components/LoadingState.vue'
// useNow 暂未使用（未来可加 "X 天前" 标签）
import { useNow as _useNow } from '../composables/useNow'

const route = useRoute()
const router = useRouter()

const projectId = computed(() => String(route.params.id))
// useNow 暂未使用
void _useNow

// ============= 状态 =============
const step = ref<1 | 2 | 3 | 4>(
  Number(route.query.step) === 2 || Number(route.query.step) === 3 || Number(route.query.step) === 4
    ? (Number(route.query.step) as 2 | 3 | 4)
    : 1,
)
const targetReleaseId = ref<string>(String(route.query.targetReleaseId ?? ''))
const releases = ref<ReleaseRecord[]>([])
const releasesLoading = ref(false)
const selectedRelease = ref<ReleaseRecord | null>(null)
const preview = ref<RollbackPreview | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)
const nextVersion = ref('')
const bump = ref<BumpType>('patch')
const externalContent = ref('')
const internalContent = ref('')
const confirmed = ref(false)
const executing = ref(false)
const executeError = ref<string | null>(null)
const result = ref<RollbackResult | null>(null)
const searchQuery = ref('')

// ============= URL 同步 =============
watch([step, targetReleaseId], () => {
  void router.replace({
    query: {
      ...route.query,
      step: step.value,
      targetReleaseId: targetReleaseId.value || undefined,
    },
  })
})

// ============= 加载 =============
async function loadReleases() {
  releasesLoading.value = true
  try {
    releases.value = await api.projectReleases(projectId.value, 50)
  } catch (e) {
    releases.value = []
  } finally {
    releasesLoading.value = false
  }
}

onMounted(async () => {
  await loadReleases()
  if (targetReleaseId.value) {
    const r = releases.value.find((x) => x.id === targetReleaseId.value)
    if (r) {
      selectedRelease.value = r
      void loadPreview()
    }
  }
})

async function loadPreview() {
  if (!targetReleaseId.value) return
  previewLoading.value = true
  previewError.value = null
  try {
    preview.value = await api.rollbackPreview(projectId.value, targetReleaseId.value)
    if (preview.value) {
      nextVersion.value = preview.value.nextVersionSuggestion
      externalContent.value = preview.value.externalDraft
      internalContent.value = preview.value.internalDraft
    }
  } catch (e) {
    previewError.value = e instanceof Error ? e.message : String(e)
  } finally {
    previewLoading.value = false
  }
}

const filteredReleases = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return releases.value
  return releases.value.filter((r) => r.version.toLowerCase().includes(q))
})

const step1Valid = computed(() => !!selectedRelease.value)
const step2Valid = computed(() => !!preview.value && preview.value.riskLevel !== 'block')
const step3Valid = computed(() => !!nextVersion.value && confirmed.value)

function selectRelease(r: ReleaseRecord) {
  selectedRelease.value = r
  targetReleaseId.value = r.id
}

function nextStep() {
  if (step.value === 1) {
    if (step1Valid.value) {
      step.value = 2
      void loadPreview()
    }
  } else if (step.value === 2) {
    if (step2Valid.value) step.value = 3
  } else if (step.value === 3) {
    if (step3Valid.value) void execute()
  }
}

function prevStep() {
  if (step.value > 1) step.value = (step.value - 1) as 1 | 2 | 3
}

async function execute() {
  if (!preview.value || !selectedRelease.value) return
  executing.value = true
  executeError.value = null
  try {
    const req: RollbackRequest = {
      projectId: projectId.value,
      targetReleaseId: selectedRelease.value.id,
      nextVersion: nextVersion.value,
      bump: bump.value,
      externalContent: externalContent.value,
      internalContent: internalContent.value,
      confirmed: true,
      offline: true, // 默认离线，避免远端未配置
    }
    result.value = await api.rollbackExecute(projectId.value, req)
    step.value = 4
  } catch (e) {
    executeError.value = e instanceof Error ? e.message : String(e)
  } finally {
    executing.value = false
  }
}

function riskColor(level: string): 'warning' | 'error' | 'success' {
  if (level === 'block') return 'error'
  if (level === 'warn') return 'warning'
  return 'success'
}
</script>

<template>
  <div class="page-pad">
    <PageHeader
      :title="`回退${selectedRelease ? ` · ${selectedRelease.version}` : ''}`"
      :description="`项目 ${projectId}`"
      back-to="/"
    >
      <RouterLink
        :to="`/project/${projectId}`"
        class="px-3 h-7 flex items-center rounded-md border border-border text-text-2 hover:bg-surface-hover hover:text-text-1 transition-colors duration-fast text-13px focus-ring"
      >
        返回项目
      </RouterLink>
    </PageHeader>

    <!-- 步骤指示 -->
    <div class="flex items-center gap-2 mb-6 text-13px">
      <span :class="step === 1 ? 'font-semibold text-brand-500' : 'text-text-3'"
        >1. 选 release</span
      >
      <i aria-hidden="true" class="i-carbon-chevron-right text-text-3" />
      <span :class="step === 2 ? 'font-semibold text-brand-500' : 'text-text-3'"
        >2. 预览影响面</span
      >
      <i aria-hidden="true" class="i-carbon-chevron-right text-text-3" />
      <span :class="step === 3 ? 'font-semibold text-brand-500' : 'text-text-3'"
        >3. 确认版本与日志</span
      >
      <i aria-hidden="true" class="i-carbon-chevron-right text-text-3" />
      <span :class="step === 4 ? 'font-semibold text-brand-500' : 'text-text-3'">4. 完成</span>
    </div>

    <!-- Step 1 -->
    <div v-if="step === 1">
      <h2 class="text-base font-semibold mb-2">选择目标 release</h2>
      <p class="text-13px text-text-3 mb-4">
        回退将基于此 release 的提交作为新基版。共 {{ releases.length }} 条 release。
      </p>
      <div class="mb-3 max-w-md">
        <NInput v-model:value="searchQuery" placeholder="搜索版本号…" clearable>
          <template #prefix><i aria-hidden="true" class="i-carbon-search text-text-3" /></template>
        </NInput>
      </div>
      <LoadingState v-if="releasesLoading" block pad="loose" />
      <EmptyState
        v-else-if="releases.length === 0"
        icon="i-carbon-document"
        title="暂无发布记录"
        description="该项目下尚无任何 release，请先完成至少一次发布"
      />
      <div v-else class="space-y-2">
        <button
          v-for="r in filteredReleases"
          :key="r.id"
          class="w-full text-left p-3 rounded-md border transition-colors duration-fast focus-ring"
          :class="
            targetReleaseId === r.id
              ? 'border-brand-500 bg-brand-50'
              : 'border-border bg-surface hover:bg-surface-hover'
          "
          :aria-pressed="targetReleaseId === r.id"
          @click="selectRelease(r)"
        >
          <div class="flex items-center gap-3">
            <code class="font-mono text-base">{{ r.version }}</code>
            <span
              v-if="r.deprecated"
              class="px-2 py-0.5 rounded text-11px bg-warn-soft text-warn-700"
              >已废弃</span
            >
            <span
              v-if="r.status === 'partial'"
              class="px-2 py-0.5 rounded text-11px bg-warn-soft text-warn-700"
              >部分失败</span
            >
            <span
              v-if="r.status === 'completed' || !r.status"
              class="px-2 py-0.5 rounded text-11px bg-success-soft text-success-700"
              >已发布</span
            >
            <span class="text-12px text-text-3 ml-auto">{{
              new Date(r.date).toLocaleDateString()
            }}</span>
          </div>
        </button>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button
          class="px-4 h-9 rounded-md bg-brand-500 text-on-brand disabled:opacity-50 hover:bg-brand-600 transition-colors duration-fast focus-ring"
          :disabled="!step1Valid"
          @click="nextStep"
        >
          下一步：预览影响面
        </button>
      </div>
    </div>

    <!-- Step 2 -->
    <div v-else-if="step === 2">
      <h2 class="text-base font-semibold mb-2">影响面预览</h2>
      <LoadingState v-if="previewLoading" block pad="loose" />
      <NAlert v-else-if="previewError" type="error" :show-icon="true" title="预览失败">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <span>{{ previewError }}</span>
          <NButton size="tiny" @click="loadPreview()">重试</NButton>
        </div>
      </NAlert>
      <div v-else-if="preview">
        <div class="mb-4 p-4 rounded-md border border-border bg-surface">
          <div class="flex items-center gap-3 mb-2">
            <span class="text-13px text-text-3">回退</span>
            <code
              v-if="preview.currentRelease"
              class="font-mono px-2 py-0.5 rounded bg-warn-soft text-warn-700"
              >{{ preview.currentRelease.version }}</code
            >
            <span class="text-13px text-text-3">→</span>
            <code class="font-mono px-2 py-0.5 rounded bg-success-soft text-success-700">{{
              preview.targetVersion
            }}</code>
            <NTag :type="riskColor(preview.riskLevel)" size="small" class="ml-auto">
              {{
                preview.riskLevel === 'block'
                  ? '阻塞'
                  : preview.riskLevel === 'warn'
                    ? '警告'
                    : '安全'
              }}
            </NTag>
          </div>
          <p v-if="preview.riskReasons.length" class="text-12px text-text-2 mt-2">
            <i aria-hidden="true" class="i-carbon-warning-alt text-warn-500" />
            {{ preview.riskReasons.join('；') }}
          </p>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard
            icon="i-carbon-cube"
            :value="preview.repos.length"
            label="受响仓数"
            color="cyan"
          />
          <StatCard
            icon="i-carbon-warning-alt"
            :value="preview.riskReasons.length"
            label="风险项"
            :color="preview.riskReasons.length > 0 ? 'amber' : 'emerald'"
          />
          <StatCard
            icon="i-carbon-connect"
            :value="preview.driftColumnsAffected.length"
            label="drift 列"
            :color="preview.driftColumnsAffected.length > 0 ? 'orange' : 'emerald'"
          />
          <StatCard
            icon="i-carbon-tag"
            :value="preview.nextVersionSuggestion"
            label="建议新版本"
            color="cyan"
          />
        </div>
        <div class="rounded-md border border-border overflow-hidden">
          <table class="w-full text-13px">
            <thead class="bg-surface-2 text-text-2">
              <tr>
                <th class="text-left px-3 py-2">仓</th>
                <th class="text-left px-3 py-2">分支</th>
                <th class="text-left px-3 py-2">目标 commit</th>
                <th class="text-left px-3 py-2">当前 commit</th>
                <th class="text-left px-3 py-2">ahead</th>
                <th class="text-left px-3 py-2">dirty</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in preview.repos" :key="r.repoId" class="border-t border-border">
                <td class="px-3 py-2">{{ r.repoName }}</td>
                <td class="px-3 py-2 text-text-3">{{ r.branch || '—' }}</td>
                <td class="px-3 py-2 font-mono">{{ r.targetCommit || '—' }}</td>
                <td class="px-3 py-2 font-mono">{{ r.currentCommit || '—' }}</td>
                <td class="px-3 py-2">
                  <span v-if="r.isAhead" class="text-warn-500">ahead</span>
                  <span v-else class="text-text-3">—</span>
                </td>
                <td class="px-3 py-2">
                  <span v-if="r.dirty > 0" class="text-warn-500">{{ r.dirty }}</span>
                  <span v-else class="text-text-3">0</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="flex justify-between gap-2 mt-4">
        <button
          class="px-4 h-9 rounded-md border border-border bg-surface hover:bg-surface-hover transition-colors duration-fast focus-ring"
          @click="prevStep"
        >
          返回选 release
        </button>
        <button
          class="px-4 h-9 rounded-md bg-brand-500 text-on-brand disabled:opacity-50 hover:bg-brand-600 transition-colors duration-fast focus-ring"
          :disabled="!step2Valid"
          @click="nextStep"
        >
          下一步：确认
        </button>
      </div>
    </div>

    <!-- Step 3 -->
    <div v-else-if="step === 3">
      <h2 class="text-base font-semibold mb-2">确认版本与日志</h2>
      <div class="space-y-4 mb-4">
        <div>
          <label class="text-13px text-text-2 block mb-1">新版本号</label>
          <div class="flex gap-2">
            <NInput v-model:value="nextVersion" placeholder="例如 1.0.1" class="flex-1" />
            <NSelect
              v-model:value="bump"
              :options="[
                { label: 'patch', value: 'patch' },
                { label: 'minor', value: 'minor' },
                { label: 'major', value: 'major' },
              ]"
              style="width: 120px"
            />
          </div>
        </div>
        <div>
          <label class="text-13px text-text-2 block mb-1">对外日志</label>
          <NInput
            v-model:value="externalContent"
            type="textarea"
            :rows="6"
            placeholder="对外 release log"
          />
        </div>
        <div>
          <label class="text-13px text-text-2 block mb-1">对内日志</label>
          <NInput
            v-model:value="internalContent"
            type="textarea"
            :rows="6"
            placeholder="内部 release log"
          />
        </div>
        <div class="p-3 rounded-md border border-warn-500 bg-warn-soft">
          <NCheckbox v-model:checked="confirmed">
            <span class="text-13px text-warn-700"
              >我已确认将回退到 {{ preview?.targetVersion }} 并发布新版本 {{ nextVersion }}</span
            >
          </NCheckbox>
        </div>
      </div>
      <NAlert v-if="executeError" type="error" :show-icon="true" title="执行失败">
        {{ executeError }}
      </NAlert>
      <div class="flex justify-between gap-2 mt-4">
        <button
          class="px-4 h-9 rounded-md border border-border bg-surface hover:bg-surface-hover transition-colors duration-fast focus-ring"
          @click="prevStep"
        >
          返回预览
        </button>
        <button
          class="px-4 h-9 rounded-md bg-brand-500 text-on-brand disabled:opacity-50 hover:bg-brand-600 transition-colors duration-fast focus-ring"
          :disabled="!step3Valid || executing"
          @click="nextStep"
        >
          {{ executing ? '执行中…' : '执行回退' }}
        </button>
      </div>
    </div>

    <!-- Step 4 -->
    <div v-else-if="step === 4">
      <NResult v-if="result?.ok" status="success" title="回退完成">
        <template #footer>
          <div class="space-y-2 text-left">
            <p class="text-13px">
              新 release：<code class="font-mono">{{ result.newReleaseId }}</code>
            </p>
            <p class="text-13px">已标废弃：{{ result.deprecatedReleaseIds.length }} 条</p>
            <p v-if="result.deletedTags.length" class="text-13px">
              已删标签：{{ result.deletedTags.length }} 个
            </p>
            <p v-if="result.warnings.length" class="text-13px text-warn-500">
              警告：{{ result.warnings.join('；') }}
            </p>
            <div class="flex gap-2 mt-3">
              <RouterLink :to="`/project/${projectId}`">
                <NButton type="primary">返回项目</NButton>
              </RouterLink>
            </div>
          </div>
        </template>
      </NResult>
      <NAlert v-else type="error" :show-icon="true" title="回退未完全成功">
        <p v-if="result">{{ result.warnings.join('；') || '请查看 failedRepos' }}</p>
        <p v-else>{{ executeError }}</p>
      </NAlert>
    </div>
  </div>
</template>
