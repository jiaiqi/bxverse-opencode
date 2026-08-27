<script setup lang="ts">
import { usePublishStore } from '../../stores/publish'
import { useProjectsStore } from '../../stores/projects'
import VersionExportDropdown from '../VersionExportDropdown.vue'
import ReleaseNoteActions from '../ReleaseNoteActions.vue'
import FailureRecoveryCard from '../FailureRecoveryCard.vue'
import { api } from '../../api'

const props = defineProps<{ projectId: string }>()

const store = usePublishStore()
const projectsStore = useProjectsStore()
const router = useRouter()
const resultReleaseId = computed(() => store.result?.releaseId ?? '')
const project = computed(() => projectsStore.byId(props.projectId))
const externalContent = computed(() => store.logs.external.content || '')
const repos = computed(() => (project.value?.repos ?? []).map(r => ({ id: r.id, name: r.name, remote: r.remote })))

const emit = defineEmits<{ again: [], resume: [], 'retry-bump': [] }>()

/** M11：失败结构化恢复 — 在完成页（有 result 且含 failedReports）显示 FailureRecoveryCard */
const failureReports = computed(() => store.result?.failedReports ?? [])
const taskId = computed(() => store.taskId)
const version = computed(() => store.result?.version ?? '')
</script>

<template>
  <div>
    <template v-if="store.result">
      <div class="text-center py-8">
        <i aria-hidden="true" class="i-carbon-checkmark-filled text-48px text-success" />
        <div class="mt-3 stat-value text-2xl">{{ store.result.version }}</div>
        <div class="text-sm text-text-2 mt-1">
          {{ failureReports.length ? '部分仓库发布失败' : '统一发布完成' }}
        </div>
      </div>
      <!-- M11 失败结构化恢复：失败时有 failedReports 则用 FailureRecoveryCard 替代旧 NAlert -->
      <div v-if="failureReports.length" class="my-5">
        <FailureRecoveryCard
          :project-id="projectId"
          :task-id="taskId"
          :failed-reports="failureReports"
          :version="version"
          @retry-bump="emit('retry-bump')"
          @resume="emit('resume')"
        />
      </div>
      <div v-else-if="store.result.syncFailedRepos?.length" class="mt-3">
        <NAlert type="warning" :show-icon="true" class="text-left">
          以下仓库基版同步失败（version.json 未更新为最新项目版本）：
          {{ store.result.syncFailedRepos.join('、') }}
        </NAlert>
      </div>
    </template>
    <template v-else>
      <NResult status="success" title="发布完成" />
    </template>
    <!-- R27 external 分发闭环：复制 / 导出 .md/.html / 同步 Release -->
    <div v-if="resultReleaseId && store.result" class="mt-6 flex flex-col items-center gap-3">
      <div class="text-xs text-text-3">external 日志分发</div>
      <ReleaseNoteActions
        :release-id="resultReleaseId"
        :content="externalContent"
        :version="store.result.version"
        :repos="repos"
        :project-id="projectId"
        size="small"
      />
    </div>
    <div class="flex justify-center gap-3 mt-6">
      <NButton @click="router.push(`/project/${projectId}`)">返回项目</NButton>
      <NButton
        v-if="resultReleaseId && (store.backupSource || store.backupArtifacts)"
        @click="router.push(`/project/${projectId}/backups`)"
      >
        <template #icon><i class="i-carbon-document-protected" /></template>
        查看本次备份
      </NButton>
      <VersionExportDropdown
        v-if="resultReleaseId"
        :project-id="projectId"
        :filename="`${store.result!.version}-version.json`"
        :load-items="() => api.releaseVersions(resultReleaseId)"
      />
      <NButton type="primary" secondary @click="emit('again')">再次发布</NButton>
    </div>
  </div>
</template>
