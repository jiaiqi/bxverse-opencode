<script setup lang="ts">
// AddProjectDialog.vue —— 新建/编辑项目

import type { ProjectDef } from '@bxverse/shared'
import { COMMIT_TYPES, COMMIT_TYPE_LABELS, DEFAULT_EXTERNAL_EXCLUDE } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { useMessage } from 'naive-ui'

const props = withDefaults(defineProps<{
  show: boolean
  editing?: ProjectDef | null
}>(), {
  editing: null,
})

const emit = defineEmits<{ 'update:show': [v: boolean]; saved: [p: ProjectDef] }>()
const message = useMessage()
const projectsStore = useProjectsStore()

const form = reactive({
  name: '',
  description: '',
  bump: 'auto' as 'auto' | 'manual',
  repoVersionScheme: 'hybrid' as 'hybrid' | 'timestamp',
  repoVersionFormat: 'X.Y.Z' as 'X.Y.Z' | 'VYYMMDDHHmm',
  externalExclude: [...DEFAULT_EXTERNAL_EXCLUDE] as string[],
})
const saving = ref(false)

watch(
  () => props.show,
  (v) => {
    if (v) {
      form.name = props.editing?.name ?? ''
      form.description = props.editing?.description ?? ''
      form.bump = props.editing?.bump ?? 'auto'
      form.repoVersionScheme = props.editing?.repoVersionScheme ?? 'hybrid'
      form.repoVersionFormat = (props.editing?.repoVersionFormat ?? 'X.Y.Z') as 'X.Y.Z' | 'VYYMMDDHHmm'
      form.externalExclude = props.editing ? [...props.editing.externalExclude] : [...DEFAULT_EXTERNAL_EXCLUDE]
    }
  },
)

const commitTypeOptions = COMMIT_TYPES.map(t => ({ label: COMMIT_TYPE_LABELS[t], value: t }))

async function submit() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    if (props.editing) {
      const updated = await projectsStore.update(props.editing.id, {
        name: form.name.trim(),
        description: form.description,
        bump: form.bump,
        repoVersionScheme: form.repoVersionScheme,
        repoVersionFormat: form.repoVersionFormat as ProjectDef['repoVersionFormat'],
        externalExclude: form.externalExclude as ProjectDef['externalExclude'],
      })
      message.success('项目已更新')
      emit('saved', props.editing)
      void updated
    } else {
      const created = await projectsStore.create({
        name: form.name.trim(),
        description: form.description || undefined,
      })
      if (form.bump !== 'auto' || form.repoVersionScheme !== 'timestamp' || form.repoVersionFormat !== 'X.Y.Z' || form.externalExclude.length !== DEFAULT_EXTERNAL_EXCLUDE.length) {
        await projectsStore.update(created.id, {
          bump: form.bump,
          repoVersionScheme: form.repoVersionScheme,
          repoVersionFormat: form.repoVersionFormat as ProjectDef['repoVersionFormat'],
          externalExclude: form.externalExclude as ProjectDef['externalExclude'],
        })
      }
      message.success('项目已创建')
      emit('saved', created)
    }
    emit('update:show', false)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="editing ? '编辑项目' : '新建项目'"
    class="w-130 max-w-95vw"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NForm label-placement="top">
      <NFormItem label="项目名称" required>
        <NInput v-model:value="form.name" placeholder="如：主产品线…" :maxlength="40" :input-props="{ autocomplete: 'off', spellcheck: false }" @keydown.enter="submit" />
      </NFormItem>
      <NFormItem label="描述（可选）">
        <NInput v-model:value="form.description" type="textarea" :rows="2" placeholder="一句话说明该项目…" />
      </NFormItem>
      <div class="grid grid-cols-2 gap-4">
        <NFormItem label="版本递增策略">
          <NSelect v-model:value="form.bump" :options="[
            { label: '自动（按提交语义推断）', value: 'auto' },
            { label: '手动（默认补丁 patch）', value: 'manual' },
          ]" />
        </NFormItem>
        <NFormItem label="仓库版本方案">
          <NSelect v-model:value="form.repoVersionScheme" :options="[
            { label: '混合 vX.Y.Z.YYMMDDHH', value: 'hybrid' },
            { label: '时间戳 vYYMMDDHH', value: 'timestamp' },
          ]" />
        </NFormItem>
      </div>
      <NFormItem label="仓库版本格式（R26）">
        <NSelect v-model:value="form.repoVersionFormat" :options="[
          { label: 'X.Y.Z（标准语义版本）', value: 'X.Y.Z' },
          { label: 'VYYMMDDHHmm（纯时间戳）', value: 'VYYMMDDHHmm' },
        ]" />
      </NFormItem>
      <NFormItem label="对外日志排除的提交类型">
        <NSelect v-model:value="form.externalExclude" multiple :options="commitTypeOptions" placeholder="这些类型的提交不出现在对外日志…" />
      </NFormItem>
    </NForm>
    <template #footer>
      <div class="flex justify-end gap-2.5">
        <NButton quaternary @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" :loading="saving" :disabled="!form.name.trim()" @click="submit">
          {{ editing ? '保存' : '创建' }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
