<script setup lang="ts">
// AddRepoDialog.vue —— 仓库接入（本地路径 / git 地址克隆）

import type { RepoDef } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { useMessage } from 'naive-ui'

const props = defineProps<{
  show: boolean
  projectId: string
}>()

const emit = defineEmits<{ 'update:show': [v: boolean]; added: [r: RepoDef] }>()
const message = useMessage()
const projectsStore = useProjectsStore()

const tab = ref<'path' | 'url'>('path')
const path = ref('')
const url = ref('')
const name = ref('')
const displayName = ref('')
const shallow = ref(false)
const cloning = ref(false)

watch(
  () => props.show,
  (v) => {
    if (v) {
      path.value = ''
      url.value = ''
      name.value = ''
      displayName.value = ''
      shallow.value = false
      tab.value = 'path'
    }
  },
)

type SubmitPayload = { path: string; name?: string } | { url: string; name?: string; shallow?: boolean }

async function submit(payload: SubmitPayload): Promise<void> {
  const isPath = 'path' in payload
  if (isPath && !payload.path.trim()) return
  if (!isPath && !payload.url.trim()) return
  cloning.value = true
  try {
    const repo = await projectsStore.addRepo(props.projectId, payload)
    if (displayName.value.trim()) {
      await projectsStore.updateRepo(props.projectId, repo.id, { displayName: displayName.value.trim() })
      repo.displayName = displayName.value.trim()
    }
    message.success(isPath ? '仓库已接入' : '仓库已克隆并接入')
    emit('added', repo)
    emit('update:show', false)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    cloning.value = false
  }
}

function buildPayload(): SubmitPayload {
  if (tab.value === 'path') {
    return { path: path.value.trim(), name: name.value.trim() || undefined }
  }
  return { url: url.value.trim(), name: name.value.trim() || undefined, shallow: shallow.value }
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="接入代码仓库"
    class="w-140 max-w-95vw"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NTabs v-model:value="tab" type="segment" animated>
      <NTabPane name="path" tab="本地路径">
        <div class="py-4 space-y-4">
          <NForm label-placement="top">
            <NFormItem label="仓库本地路径（git 仓库，含 .git）" required>
              <NInput
                v-model:value="path"
                placeholder="如：E:\bx-gitee\l-pc-front…"
                :input-props="{ autocomplete: 'off', spellcheck: false }"
                @keydown.enter="submit(buildPayload())"
              />
            </NFormItem>
            <NFormItem label="中文名（可选，版本清单导出用）">
              <NInput v-model:value="displayName" placeholder="如：PC 前端…" :input-props="{ autocomplete: 'off', spellcheck: false }" />
            </NFormItem>
          </NForm>
          <div class="flex items-center gap-2 text-xs text-text-3">
            <i aria-hidden="true" class="i-carbon-information" />
            直接引用本地仓库，零拷贝；发布记录与版本数据仍由管理台统一管理。
          </div>
          <div class="flex items-center gap-2 text-xs text-text-3">
            <i aria-hidden="true" class="i-carbon-locked" />
            受浏览器安全限制，系统目录选择器无法返回文件夹绝对路径，请粘贴路径（资源管理器地址栏可复制）。
          </div>
        </div>
      </NTabPane>
      <NTabPane name="url" tab="Git 地址">
        <div class="py-4 space-y-4">
          <NForm label-placement="top">
            <NFormItem label="仓库地址（https / ssh / git@）" required>
              <NInput
                v-model:value="url"
                placeholder="https://gitee.com/xxx/yyy.git 或 git@gitee.com:xxx/yyy.git…"
                :input-props="{ autocomplete: 'off', spellcheck: false }"
                @keydown.enter="submit(buildPayload())"
              />
              <div class="text-xs text-text-3 mt-1">仅允许 https://、ssh://、git@ 前缀；克隆超时 120s，大仓库建议浅克隆</div>
            </NFormItem>
            <NFormItem label="名称（可选，默认取地址）">
              <NInput v-model:value="name" placeholder="如：l-pc-front…" :input-props="{ autocomplete: 'off', spellcheck: false }" />
            </NFormItem>
            <NFormItem label="中文名（可选，版本清单导出用）">
              <NInput v-model:value="displayName" placeholder="如：PC 前端…" :input-props="{ autocomplete: 'off', spellcheck: false }" />
            </NFormItem>
            <NFormItem label="浅克隆（--depth 1，大仓库建议开启，120s 超时）">
              <NSwitch v-model:value="shallow" />
            </NFormItem>
          </NForm>
          <div class="flex items-center gap-2 text-xs text-text-3">
            <i aria-hidden="true" class="i-carbon-information" />
            将克隆到数据目录的 repos 子目录，克隆进度视仓库大小而定。
          </div>
        </div>
      </NTabPane>
    </NTabs>
    <template #footer>
      <div class="flex justify-end gap-2.5">
        <NButton quaternary @click="emit('update:show', false)">取消</NButton>
        <NButton
          type="primary"
          :loading="cloning"
          :disabled="tab === 'path' ? !path.trim() : !url.trim()"
          @click="submit(buildPayload())"
        >
          {{ cloning ? '处理中…' : '接入' }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
