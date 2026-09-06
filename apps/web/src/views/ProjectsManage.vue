<script setup lang="ts">
// ProjectsManage.vue —— R33 阶段 1（0 契约）：项目管理卡片网格 + 仓库挂载管理
// 多对多语义为客户端聚合（按 path 归并），挂载调整复用既有 addRepoByPath / deleteRepo

import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { NCheckbox, NInput, NModal } from 'naive-ui'
import type { RepoDef } from '@bxverse/shared'
import { api } from '../api'
import { useProjectsStore } from '../stores/projects'
import LoadingState from '../components/LoadingState.vue'
import EmptyState from '../components/EmptyState.vue'

const store = useProjectsStore()
const router = useRouter()
const message = useMessage()

void store.load()
void store.loadOverview()

/** 全局仓库注册表（客户端聚合）：按 path 归并所有项目内的仓库 */
interface RegistryRepo {
  key: string
  name: string
  displayName?: string
  path: string
  remote?: string
  members: { pid: string; pname: string; rid: string }[]
}
const registry = computed<RegistryRepo[]>(() => {
  const map = new Map<string, RegistryRepo>()
  for (const p of store.items) {
    for (const r of p.repos) {
      const key = (r.path || r.remote || r.name).replaceAll('\\', '/')
      const member = { pid: p.id, pname: p.name, rid: r.id }
      const hit = map.get(key)
      if (hit) hit.members.push(member)
      else
        map.set(key, {
          key,
          name: r.name,
          displayName: r.displayName,
          path: r.path,
          remote: r.remote,
          members: [member],
        })
    }
  }
  return [...map.values()]
})

const boardById = computed(() => new Map(store.boardItems.map((b) => [b.id, b])))
/** 共享仓库数：该项目的仓库中被 ≥2 个项目挂载的数量 */
function sharedCount(pid: string): number {
  return registry.value.filter((r) => r.members.length > 1 && r.members.some((m) => m.pid === pid))
    .length
}
function readyCount(pid: string): number {
  return boardById.value.get(pid)?.changedRepoCount ?? 0
}

// ---- 新建项目 ----
const showCreate = ref(false)
const npName = ref('')
const npDesc = ref('')
const npBusy = ref(false)
async function createProject(): Promise<void> {
  const name = npName.value.trim()
  if (!name) {
    message.warning('请填写项目名称')
    return
  }
  npBusy.value = true
  try {
    await api.createProject({ name, description: npDesc.value.trim() || undefined })
    await store.load()
    showCreate.value = false
    npName.value = ''
    npDesc.value = ''
    message.success(`项目「${name}」已创建，可在项目详情里接入仓库`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    npBusy.value = false
  }
}

// ---- 管理仓库（挂载 / 摘除） ----
const managePid = ref('')
const showManage = ref(false)
const mBusy = ref(false)
const manageProject = computed(() => store.byId(managePid.value))
function isMember(rr: RegistryRepo): boolean {
  return rr.members.some((m) => m.pid === managePid.value)
}
/** 勾选状态：registry key 集合 */
const pending = ref<Set<string>>(new Set())
watch(showManage, (v) => {
  if (v) pending.value = new Set(registry.value.filter((r) => isMember(r)).map((r) => r.key))
})
function togglePending(key: string, on: boolean): void {
  const next = new Set(pending.value)
  if (on) next.add(key)
  else next.delete(key)
  pending.value = next
}
function findRepoDef(pid: string, rid: string): RepoDef | undefined {
  return store.byId(pid)?.repos.find((r) => r.id === rid)
}
async function saveManage(): Promise<void> {
  const p = manageProject.value
  if (!p) return
  mBusy.value = true
  try {
    let changed = 0
    for (const rr of registry.value) {
      const want = pending.value.has(rr.key)
      const have = rr.members.some((m) => m.pid === p.id)
      if (want && !have) {
        const src = findRepoDef(rr.members[0].pid, rr.members[0].rid)
        if (!src) continue
        await api.addRepoByPath(p.id, src.path, src.displayName || undefined)
        changed++
      } else if (!want && have) {
        const m = rr.members.find((x) => x.pid === p.id)
        if (m) {
          await api.deleteRepo(p.id, m.rid, false)
          changed++
        }
      }
    }
    await store.load()
    showManage.value = false
    message.success(changed > 0 ? `挂载关系已更新（${changed} 处变更）` : '挂载关系未变化')
  } catch (e) {
    message.error((e as Error).message)
    await store.load()
  } finally {
    mBusy.value = false
  }
}
function openProject(pid: string): void {
  void router.push(`/project/${pid}`)
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-xl font-bold text-text-1">项目管理</h1>
      <p class="text-sm text-text-3 mt-1">
        项目与仓库是多对多关系：一个项目挂多个仓库，一个仓库也可以同时服务多个项目（按路径归并展示）。仓库本体在
        <RouterLink to="/registry" class="text-brand-500 font-semibold hover:underline"
          >仓库注册表</RouterLink
        >
        查看与对比。
      </p>
    </div>

    <div v-if="store.loading"><LoadingState /></div>
    <EmptyState
      v-else-if="store.items.length === 0"
      title="还没有项目"
      description="创建第一个项目，把若干仓库挂载进来统一管理版本与更新日志"
    />

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-item">
      <div
        v-for="p in store.items"
        :key="p.id"
        class="card card-pad flex flex-col gap-3 hover:-translate-y-0.5 transition-transform duration-fast"
      >
        <div class="flex items-start gap-3">
          <span
            class="w-10 h-10 rounded-xl bg-brand-soft text-brand-600 font-bold font-mono flex items-center justify-center shrink-0"
            >{{ p.name.slice(0, 1) }}</span
          >
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-text-1 truncate">{{ p.name }}</div>
            <div class="text-xs text-text-3 truncate">{{ p.description || '暂无描述' }}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-sm font-mono font-semibold text-brand-600">{{ p.version }}</div>
            <div class="text-[10px] text-text-3">项目版本</div>
          </div>
        </div>
        <div class="grid grid-cols-3 divide-x divide-border border-y border-border py-2.5">
          <div class="text-center">
            <div class="text-base font-bold text-text-1">{{ p.repos.length }}</div>
            <div class="text-[10px] text-text-3">挂载仓库</div>
          </div>
          <div class="text-center">
            <div
              class="text-base font-bold"
              :class="readyCount(p.id) > 0 ? 'text-brand-600' : 'text-text-1'"
            >
              {{ readyCount(p.id) }}
            </div>
            <div class="text-[10px] text-text-3">待发布</div>
          </div>
          <div class="text-center">
            <div class="text-base font-bold text-text-1">{{ sharedCount(p.id) }}</div>
            <div class="text-[10px] text-text-3">共享仓库</div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap min-h-6">
          <span
            v-for="r in p.repos.slice(0, 4)"
            :key="r.id"
            class="px-1.5 py-0.5 rounded bg-surface-alt text-[10px] font-mono text-text-2"
            >{{ r.name }}</span
          >
          <span v-if="p.repos.length > 4" class="text-[10px] text-text-3"
            >+{{ p.repos.length - 4 }}</span
          >
          <span
            v-if="sharedCount(p.id) > 0"
            class="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600"
            ><i aria-hidden="true" class="i-carbon-share-knowledge text-12px" />含共享仓库</span
          >
        </div>
        <div class="flex items-center gap-2 pt-1">
          <span class="text-[11px] text-text-3 flex-1 truncate">{{
            boardById.get(p.id)?.lastRelease?.date
              ? `最近发布 ${boardById.get(p.id)!.lastRelease!.date.slice(0, 10)}`
              : '尚未发布'
          }}</span>
          <button
            class="btn-ghost h-7.5 px-2.5 text-xs font-semibold focus-ring cursor-pointer"
            @click="
              () => {
                managePid = p.id
                showManage = true
              }
            "
          >
            <i aria-hidden="true" class="i-carbon-list mr-0.5" />管理仓库
          </button>
          <button
            class="btn-primary h-7.5 px-3 text-xs font-bold focus-ring"
            @click="openProject(p.id)"
          >
            进入
          </button>
        </div>
      </div>

      <!-- 新建项目卡 -->
      <button
        class="min-h-52 rounded-2xl border-1.5 border-dashed border-border-strong hover:border-brand-500 hover:bg-brand-soft/40 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer focus-ring"
        @click="showCreate = true"
      >
        <i aria-hidden="true" class="i-carbon-add text-24px text-text-3" />
        <span class="text-sm font-semibold text-text-2">新建项目</span>
        <span class="text-[11px] text-text-3">挂载若干仓库，起一个版本基线</span>
      </button>
    </div>

    <!-- 新建项目对话框 -->
    <NModal v-model:show="showCreate" preset="card" title="新建项目" class="w-[460px] max-w-[92vw]">
      <div class="space-y-4">
        <div>
          <div class="text-xs font-semibold text-text-2 mb-1.5">项目名称</div>
          <NInput
            v-model:value="npName"
            placeholder="如：海外版产品线"
            :input-props="{ autocomplete: 'off' }"
          />
        </div>
        <div>
          <div class="text-xs font-semibold text-text-2 mb-1.5">描述（可选）</div>
          <NInput v-model:value="npDesc" type="textarea" placeholder="这条产品线管什么" :rows="2" />
        </div>
        <div class="text-xs text-text-3">
          创建后进入项目详情接入仓库；仓库可同时挂到多个项目（按路径识别同一仓库）。
        </div>
        <div class="flex justify-end gap-2">
          <button
            class="btn-ghost h-8 px-3.5 text-xs font-semibold focus-ring"
            @click="showCreate = false"
          >
            取消
          </button>
          <button
            class="btn-primary h-8 px-3.5 text-xs font-bold focus-ring disabled:opacity-50"
            :disabled="npBusy"
            @click="createProject"
          >
            创建项目
          </button>
        </div>
      </div>
    </NModal>

    <!-- 管理仓库（挂载）对话框 -->
    <NModal
      v-model:show="showManage"
      preset="card"
      :title="`管理仓库 · ${manageProject?.name ?? ''}`"
      class="w-[620px] max-w-[94vw]"
    >
      <div class="text-xs text-text-3 mb-3">
        勾选即挂载到「{{ manageProject?.name }}」，取消勾选即移出；同一仓库可同时属于多个项目。
      </div>
      <div class="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
        <label
          v-for="rr in registry"
          :key="rr.key"
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors duration-fast"
          :class="isMember(rr) ? 'border-brand-500/40 bg-brand-soft/60' : 'border-border'"
        >
          <NCheckbox
            :checked="pending.has(rr.key)"
            @update:checked="(v: boolean) => togglePending(rr.key, v)"
          />
          <span class="mono text-xs font-semibold text-text-1">{{ rr.name }}</span>
          <span class="text-[11px] text-text-3 truncate flex-1">{{
            rr.displayName || rr.path
          }}</span>
          <span
            v-if="rr.members.length > 1"
            class="text-[10px] font-semibold text-brand-600 shrink-0"
            >同时在 {{ rr.members.length }} 个项目</span
          >
        </label>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button
          class="btn-ghost h-8 px-3.5 text-xs font-semibold focus-ring"
          @click="showManage = false"
        >
          取消
        </button>
        <button
          class="btn-primary h-8 px-3.5 text-xs font-bold focus-ring disabled:opacity-50"
          :disabled="mBusy"
          @click="saveManage"
        >
          保存挂载关系
        </button>
      </div>
    </NModal>
  </div>
</template>
