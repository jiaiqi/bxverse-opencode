<script setup lang="ts">
// MarkdownView.vue —— markdown-it 渲染（html 关闭）+ highlight.js 代码高亮
// 性能护栏：maxLines>0 时只渲染前 N 行（超长日志草稿避免整段 markdown-it 同步渲染卡死主线程）

import MarkdownIt from 'markdown-it'
import { hljs } from '../utils/highlight'

const props = withDefaults(
  defineProps<{
    content: string
    /** >0 时仅渲染前 N 行，超长追加截断提示（0 = 不限） */
    maxLines?: number
  }>(),
  {
    content: '',
    maxLines: 0,
  },
)

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

const html = computed(() => {
  const src = props.content || ''
  if (props.maxLines <= 0) return md.render(src)
  // 前 maxLines 行（截断在渲染前，避免 markdown-it 处理全部内容）
  let cut = -1
  let count = 0
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === 10) {
      count++
      if (count >= props.maxLines) {
        cut = i
        break
      }
    }
  }
  if (cut === -1) return md.render(src)
  const head = src.slice(0, cut)
  return (
    md.render(head) +
    `<blockquote><p>内容较长，仅预览前 ${props.maxLines.toLocaleString('zh-CN')} 行（完整内容可点击「编辑」查看）。</p></blockquote>`
  )
})
</script>

<template>
  <div v-if="content" class="md-body" v-html="html" />
  <slot v-else />
</template>
