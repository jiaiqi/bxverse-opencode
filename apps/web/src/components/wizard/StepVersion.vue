<script setup lang="ts">
import type { ProjectDef } from '@bxverse/shared'
import { PRERELEASE_RE } from '@bxverse/shared'
import { usePublishStore } from '../../stores/publish'
import StatusBadge from '../StatusBadge.vue'
import LoadingState from '../LoadingState.vue'
import { useDialog } from 'naive-ui'

const props = defineProps<{ project: ProjectDef | undefined }>()
const store = usePublishStore()
const dialog = useDialog()

const bumpOptions = [
  { label: '自动', value: 'auto' },
  { label: '补丁 patch', value: 'patch' },
  { label: '次版本 minor', value: 'minor' },
  { label: '重大 major', value: 'major' },
]

function setBump(v: string) {
  store.bumpOverride = v as 'auto' | 'major' | 'minor' | 'patch'
  if (store.step >= 2) void rePlan()
}

async function rePlan(confirmReset = false): Promise<void> {
  const edited = store.logs.internal.state !== 'auto' || store.logs.external.state !== 'auto'
  if (edited && !confirmReset) {
    dialog.warning({
      title: '重新生成计划',
      content: '重新生成计划会重置两侧日志为自动草稿（你的人工编辑将丢失）。确定继续？',
      positiveText: '重新生成',
      negativeText: '取消',
      onPositiveClick: () => void rePlan(true),
    })
    return
  }
  if (confirmReset || edited === false) {
    store.logs.internal.state = 'auto'
    store.logs.external.state = 'auto'
    store.logs.internal.content = ''
    store.logs.external.content = ''
  }
  await store.loadPlan()
}

const bumpLabel = (b: string): string =>
  b === 'major' ? '重大' : b === 'minor' ? '次版本' : b === 'patch' ? '补丁' : '自动'

// ==================== prerelease UI（R30） ====================
type PrereleaseKind = 'stable' | 'beta' | 'rc' | 'custom'
const prereleaseKind = ref<PrereleaseKind>('stable')
const prereleaseInput = ref('')

// 初始化：从 store.prerelease 回填选择器
function syncFromStore() {
  const cur = store.prerelease.trim()
  if (!cur) {
    prereleaseKind.value = 'stable'
    prereleaseInput.value = ''
    return
  }
  if (cur === 'beta' || cur.startsWith('beta.')) {
    prereleaseKind.value = 'beta'
    prereleaseInput.value = cur
    return
  }
  if (cur === 'rc' || cur.startsWith('rc.')) {
    prereleaseKind.value = 'rc'
    prereleaseInput.value = cur
    return
  }
  prereleaseKind.value = 'custom'
  prereleaseInput.value = cur
}
syncFromStore()
watch(() => store.prerelease, syncFromStore)

const prereleaseError = computed(() => {
  if (prereleaseKind.value === 'stable') return ''
  const v = prereleaseInput.value.trim()
  if (!v) return '请输入 prerelease 标识'
  if (!PRERELEASE_RE.test(v)) return '格式非法，仅允许字母数字 .-，如 beta.1'
  return ''
})

const prereleaseOptions = [
  { label: '正式版', value: 'stable' },
  { label: 'Beta', value: 'beta' },
  { label: 'RC', value: 'rc' },
  { label: '自定义', value: 'custom' },
]

function onKindChange(v: string) {
  const k = v as PrereleaseKind
  prereleaseKind.value = k
  if (k === 'stable') {
    store.prerelease = ''
    prereleaseInput.value = ''
    if (store.step >= 2) void rePlan()
    return
  }
  if (k === 'beta') {
    prereleaseInput.value = 'beta.1'
    store.prerelease = 'beta.1'
  } else if (k === 'rc') {
    prereleaseInput.value = 'rc.1'
    store.prerelease = 'rc.1'
  } else {
    // custom：若为空则预填 beta.1 便于示例
    if (!prereleaseInput.value.trim()) prereleaseInput.value = 'beta.1'
    store.prerelease = prereleaseInput.value.trim()
  }
  if (!prereleaseError.value && store.step >= 2) void rePlan()
}

function onPrereleaseInput(v: string) {
  prereleaseInput.value = v
  store.prerelease = v.trim()
}

let prereleaseDebounce: ReturnType<typeof setTimeout> | null = null
watch(prereleaseInput, () => {
  if (prereleaseKind.value === 'stable') return
  if (prereleaseDebounce) clearTimeout(prereleaseDebounce)
  prereleaseDebounce = setTimeout(() => {
    if (prereleaseError.value) return
    if (store.step >= 2) void rePlan()
  }, 400)
})

// 本地实时预览（与 core/version 保持一致的轻量实现，不依赖服务端往返）
const SEMVER_PRERELEASE_RE_LOCAL = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+?))?(?:\.(\d{6,12}))?$/
function parsePrevPrerelease(v: string): string | undefined {
  const m = SEMVER_PRERELEASE_RE_LOCAL.exec(v.trim())
  return m?.[4]
}
function splitPrefix(s: string): { prefix: string; num?: number } {
  const m = s.match(/^(.*)\.(\d+)$/)
  if (m) return { prefix: m[1], num: Number(m[2]) }
  return { prefix: s }
}
function resolvePrereleaseLocal(prev?: string, req?: string): string | undefined {
  const r = req?.trim()
  if (!r) return undefined
  if (!PRERELEASE_RE.test(r)) throw new Error(`INVALID_PRERELEASE: ${r}`)
  if (!prev) return r
  const p = prev.trim()
  if (!PRERELEASE_RE.test(p)) throw new Error(`INVALID_PRERELEASE: ${p}`)
  const ps = splitPrefix(p)
  const rs = splitPrefix(r)
  if (ps.prefix === rs.prefix) {
    const baseNum = ps.num ?? rs.num ?? 0
    return `${ps.prefix}.${baseNum + 1}`
  }
  return r
}
function bumpSemverLocal(v: string, bump: string, pre?: string): string {
  const m = SEMVER_PRERELEASE_RE_LOCAL.exec(v.trim())
  if (!m) throw new Error(`INVALID_SEMVER: ${v}`)
  let major = Number(m[1])
  let minor = Number(m[2])
  let patch = Number(m[3])
  if (bump === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (bump === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  const base = `v${major}.${minor}.${patch}`
  const p = pre?.trim()
  if (p) {
    if (!PRERELEASE_RE.test(p)) throw new Error(`INVALID_PRERELEASE: ${p}`)
    return `${base}-${p}`
  }
  return base
}

const previewVersion = computed(() => {
  const base = props.project?.version ?? 'v0.0.0'
  const bump =
    store.bumpOverride === 'auto' ? (store.plan?.suggestedBump ?? 'patch') : store.bumpOverride
  const raw = prereleaseKind.value === 'stable' ? '' : prereleaseInput.value.trim()
  if (prereleaseKind.value !== 'stable' && raw && !PRERELEASE_RE.test(raw)) return '— 格式非法'
  if (prereleaseKind.value !== 'stable' && !raw) return '— 待输入'
  try {
    const prevPre = parsePrevPrerelease(base)
    const resolved = raw ? resolvePrereleaseLocal(prevPre, raw) : undefined
    return bumpSemverLocal(base, bump, resolved)
  } catch {
    return '—'
  }
})
const milestonePreview = computed(() =>
  previewVersion.value.startsWith('v') ? previewVersion.value : `v${previewVersion.value}`,
)
const buildTagPreview = computed(() => {
  const v = previewVersion.value.replace(/^v/, '')
  if (v.startsWith('—')) return '—'
  return `build/${v}`
})
</script>

<template>
  <div>
    <div v-if="store.planning || !store.plan">
      <LoadingState text="正在计算发布计划…" />
    </div>
    <template v-else>
      <div class="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div class="stat-label mb-1">项目版本</div>
          <div class="flex items-center gap-3">
            <span class="code-text text-text-3 line-through">{{ project?.version }}</span>
            <i aria-hidden="true" class="i-carbon-arrow-right text-text-3" />
            <span class="stat-value text-brand-500">{{ store.plan.projectVersion }}</span>
            <StatusBadge type="bump" :bump="store.plan.bump" />
            <span v-if="store.plan.suggestedBump !== store.plan.bump" class="chip text-text-3">
              建议：{{ bumpLabel(store.plan.suggestedBump) }}
            </span>
          </div>
          <div class="text-xs text-text-3 mt-1">
            build {{ store.plan.buildStamp }} · 里程碑标签
            <span class="code-text">{{ store.plan.milestoneTag }}</span>
          </div>
        </div>
        <NSelect
          v-model:value="store.bumpOverride"
          :options="bumpOptions"
          class="w-44"
          @update:value="setBump"
        />
      </div>

      <!-- R30 prerelease 版本类型与预览 -->
      <div class="mt-5 p-4 rounded-xl border border-border bg-surface-alt/40 space-y-3">
        <div class="flex items-center gap-2 text-sm font-medium text-text-1">
          <i aria-hidden="true" class="i-carbon-star" />
          版本类型
          <span class="text-xs font-normal text-text-3">正式版 / Beta / RC / 自定义</span>
        </div>
        <div class="flex items-center gap-4 flex-wrap">
          <NRadioGroup :value="prereleaseKind" @update:value="onKindChange">
            <NSpace>
              <NRadio v-for="o in prereleaseOptions" :key="o.value" :value="o.value">{{
                o.label
              }}</NRadio>
            </NSpace>
          </NRadioGroup>
        </div>
        <div v-if="prereleaseKind !== 'stable'" class="flex items-center gap-3 flex-wrap">
          <NInput
            :value="prereleaseInput"
            placeholder="beta.1"
            clearable
            class="max-w-52"
            :status="prereleaseError ? 'error' : undefined"
            autocomplete="off"
            :spellcheck="false"
            @update:value="onPrereleaseInput"
          />
          <span v-if="prereleaseError" class="text-xs text-error">{{ prereleaseError }}</span>
          <span v-else class="text-xs text-text-3"
            >校验：{{ PRERELEASE_RE.test(prereleaseInput.trim()) ? '合法' : '待输入' }} · 示例
            beta.1 / rc.1</span
          >
        </div>
        <div class="rounded-lg bg-surface px-3 py-2.5 border border-border/60 space-y-1 text-xs">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-text-3">预览版本</span>
            <span class="code-text text-brand-500 font-mono text-sm">{{ previewVersion }}</span>
            <span class="text-text-3">→ 计划版本 {{ store.plan.projectVersion }}</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap text-text-3">
            <span>标签预览</span>
            <span class="code-text font-mono">{{ milestonePreview }}</span>
            <span>·</span>
            <span class="code-text font-mono">{{ buildTagPreview }}</span>
          </div>
          <div class="text-[11px] text-text-3">
            链路：v1.2.0-beta.1 → v1.2.0-beta.2（同标识递增）→ v1.2.0（切正式版）；不同标识如
            beta→rc 直接覆盖
          </div>
        </div>
      </div>

      <div class="mt-6">
        <div class="section-title text-base mb-3">
          参与发布的仓库（{{ store.plan.changed.length }}）
        </div>
        <div class="card border divide-y divide-border overflow-hidden">
          <div
            v-for="r in store.plan.changed"
            :key="r.repoId"
            class="px-4 py-3 flex items-center gap-3 flex-wrap"
          >
            <i aria-hidden="true" class="i-carbon-git-branch text-brand-500" />
            <span class="font-medium text-text-1 text-sm min-w-30">{{ r.name }}</span>
            <span class="code-text text-xs text-text-3"
              >{{ r.from?.slice(0, 7) ?? '首次' }} → {{ r.to?.slice(0, 7) }}</span
            >
            <span class="version-badge"><span class="tick"></span>{{ r.version }}</span>
            <span class="chip">{{ r.commits.length }} 提交</span>
          </div>
        </div>
      </div>

      <div v-if="store.plan.syncedOnly.length" class="mt-4">
        <NCollapse>
          <NCollapseItem
            :title="`仅同步基版 version.json（${store.plan.syncedOnly.length} 个未变动仓库）`"
            name="sync"
          >
            <div class="text-sm text-text-2 space-y-1">
              <div
                v-for="s in store.plan.syncedOnly"
                :key="s.repoId"
                class="flex items-center gap-2"
              >
                <i aria-hidden="true" class="i-carbon-renew text-text-3" />
                <span>{{ s.name }}</span>
                <span class="code-text text-xs text-text-3"
                  >→ {{ store.plan.projectVersion }}（无标签无记录）</span
                >
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </div>

      <div v-if="store.plan.warnings.length" class="mt-4 space-y-2">
        <NAlert v-for="(w, i) in store.plan.warnings" :key="i" type="warning" :show-icon="true">
          {{ w }}
        </NAlert>
      </div>
    </template>
  </div>
</template>
