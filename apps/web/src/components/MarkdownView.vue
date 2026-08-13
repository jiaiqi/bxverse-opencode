<script setup lang="ts">
// MarkdownView.vue —— markdown-it 渲染（html 关闭）+ highlight.js 代码高亮

import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const props = withDefaults(defineProps<{
  content: string
}>(), {
  content: '',
})

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (code: string, lang: string): string => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    } catch {
      return md.utils.escapeHtml(code)
    }
  },
})

const html = computed(() => md.render(props.content || ''))
</script>

<template>
  <div v-if="content" class="md-body" v-html="html" />
  <slot v-else />
</template>
