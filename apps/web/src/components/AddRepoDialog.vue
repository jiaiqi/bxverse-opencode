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
const shallow = ref(false)
const cloning = ref(false)

watch(
  () => props.show,
  (v) => {
    if (v) {
      path.value = ''
      url.value = ''
      name.value = ''
      shallow.value = false
      tab.value = 'path'
    }
  },
)

async function submitPath() {
  if (!path.value.trim()) return
  cloning.value = true
  try {
    const repo = await projectsStore.addRepo(props.projectId, { path: path.value.trim() })
    message.success('仓库已接入')
    emit('added', repo)
    emit('update:show', false)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    cloning.value = false
  }
}

async function submitUrl() {
  if (!url.value.trim()) return
  cloning.value = true
  try {
    const repo = await projectsStore.addRepo(props.projectId, {
      url: url.value.trim(),
      name: name.value.trim() || undefined,
      shallow: shallow.value,
    })
    message.success('仓库已克隆并接入')
    emit('added', repo)
    emit('update:show', false)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    cloning.value = false
  }
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="接入代码仓库"
    class="w-140 max-w-95vw"
    @update:show="v => emit('update:show', v)"
  >
    <NTabs v-model:value="tab" type="segment" animated>
      <NTabPane name="path" tab="本地路径">
        <div class="py-4 space-y-4">
          <NForm label-placement="top">
            <NFormItem label="仓库本地路径（git 仓库，含 .git）" required>
              <NInput
                v-model:value="path"
                placeholder="如：E:\bx-gitee\l-pc-front"
                @keydown.enter="submitPath"
              />
            </NFormItem>
          </NForm>
          <div class="flex items-center gap-2 text-xs text-text-3">
            <i class="i-carbon-information" />
            直接引用本地仓库，零拷贝；发布记录与版本数据仍由管理台统一管理。
          </div>
        </div>
      </NTabPane>
      <NTabPane name="url" tab="Git 地址">
        <div class="py-4 space-y-4">
          <NForm label-placement="top">
            <NFormItem label="仓库地址（https / ssh / git@）" required>
              <NInput
                v-model:value="url"
                placeholder="https://gitee.com/xxx/yyy.git 或 git@gitee.com:xxx/yyy.git"
                @keydown.enter="submitUrl"
              />
            </NFormItem>
            <NFormItem label="名称（可选，默认取地址）">
              <NInput v-model:value="name" placeholder="如：l-pc-front" />
            </NFormItem>
            <NFormItem label="浅克隆（--depth 1，大仓库建议开启）">
              <NSwitch v-model:value="shallow" />
            </NFormItem>
          </NForm>
          <div class="flex items-center gap-2 text-xs text-text-3">
            <i class="i-carbon-information" />
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
          @click="tab === 'path' ? submitPath() : submitUrl()"
        >
          {{ cloning ? '处理中…' : '接入' }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
