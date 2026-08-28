// utils/highlight.ts
// 按需注册 highlight.js 语言包（避免 import 'highlight.js' 拉全量 ~1MB）
// 仓库文件常见语言：bash / json / typescript / javascript / yaml / markdown / diff / ini / toml / text
// 任何未注册的扩展名都会 fallback 到 plain text —— 满足本地仓库浏览需求
//
// 用法：
//   import { hljs } from '../utils/highlight'
//   const html = hljs.highlight(code, { language: 'bash' }).value

import hljs from 'highlight.js/lib/core'

// 一次性按需注册（import 同步触发；gzip 后约 30-50KB vs 全量 365KB）
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import xml from 'highlight.js/lib/languages/xml' // HTML
import css from 'highlight.js/lib/languages/css'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import diff from 'highlight.js/lib/languages/diff'
import ini from 'highlight.js/lib/languages/ini'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import plaintext from 'highlight.js/lib/languages/plaintext'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('zsh', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('jsonc', json)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('mjs', javascript)
hljs.registerLanguage('cjs', javascript)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('svg', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', css)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('patch', diff)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('text', plaintext)
hljs.registerLanguage('txt', plaintext)

export { hljs }
