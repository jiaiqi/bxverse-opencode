<script setup lang="ts">
// NotFound.vue —— 404

const router = useRouter()
const timer = ref<ReturnType<typeof setTimeout> | null>(null)

onMounted(() => {
  timer.value = setTimeout(() => router.push('/'), 5000)
})
onScopeDispose(() => {
  if (timer.value) clearTimeout(timer.value)
})
</script>

<template>
  <NResult status="404" title="页面不存在" description="5 秒后自动返回总览" class="mt-16">
    <template #footer>
      <NButton type="primary" @click="router.push('/')">返回总览</NButton>
    </template>
  </NResult>
</template>
