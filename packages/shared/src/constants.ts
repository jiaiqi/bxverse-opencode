// packages/shared/src/constants.ts
// 全局共享常量

import type { CommitType, AiProviderPreset } from './types'

/** 语义版本匹配：v1.0.6 / 1.0.6 / v1.0.6.26081315 */
export const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d{6,10}))?$/

/** 混合版本：vX.Y.Z.YYMMDDHH */
export const HYBRID_VERSION_RE = /^v\d+\.\d+\.\d+\.\d{8,10}$/

/** build 标签：build/vX.Y.Z.YYMMDDHH */
export const BUILD_TAG_PREFIX = 'build'

export const COMMIT_TYPES: CommitType[] = [
  'feat', 'fix', 'perf', 'refactor', 'style',
  'chore', 'docs', 'test', 'build', 'ci', 'revert', 'other',
]

export const COMMIT_TYPE_LABELS: Record<CommitType, string> = {
  feat: '新增',
  fix: '修复',
  perf: '优化',
  refactor: '重构',
  style: '样式',
  chore: '杂项',
  docs: '文档',
  test: '测试',
  build: '构建',
  ci: '持续集成',
  revert: '回滚',
  other: '其他',
}

/** 对外日志默认排除的提交类型（仅收录用户可感知的变更） */
export const DEFAULT_EXTERNAL_EXCLUDE: CommitType[] = [
  'chore', 'docs', 'test', 'style', 'ci', 'build', 'revert',
]

/** 对外日志分节与提交类型映射 */
export const EXTERNAL_SECTIONS: { title: string; types: CommitType[] }[] = [
  { title: '新增', types: ['feat'] },
  { title: '优化', types: ['perf', 'refactor'] },
  { title: '修复', types: ['fix'] },
  { title: '其他', types: ['style', 'chore', 'docs', 'test', 'build', 'ci', 'revert', 'other'] },
]

/** 文件树默认忽略目录（gitignore 之外的兜底） */
export const DEFAULT_IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'out', 'coverage', '.idea', '.vscode',
  '.cache', '.nuxt', '.next', '.output', 'target', '__pycache__', '.DS_Store',
])

/** 应用常量 */
export const APP_NAME = 'BX 版本管理台'
export const APP_DEFAULT_PORT = 8899
export const APP_DATA_DIR_NAME = '.bxverse'

/** 扩展：R21 AI 供应商主流预设（支持国内大厂、国际主流、聚合平台与本地部署，带一键获取 Key 与推荐模型） */
export const AI_PRESET_PROVIDERS: AiProviderPreset[] = [
  // ---------- 国内主流 ----------
  {
    key: 'deepseek',
    name: 'DeepSeek 官方',
    category: 'domestic',
    baseUrl: 'https://api.deepseek.com/v1',
    docUrl: 'https://platform.deepseek.com/api_keys',
    placeholderModel: 'deepseek-chat',
    color: '#0066FF',
    recommendedModels: [
      { id: 'deepseek-chat', label: 'deepseek-chat', description: 'DeepSeek-V3 通用旗舰（推荐）', isDefault: true },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner', description: 'DeepSeek-R1 深度思考推理' },
    ],
    hint: '性价比极高，支持 V3 通用对话与 R1 深度推理',
  },
  {
    key: 'kimi',
    name: 'Kimi (Moonshot)',
    category: 'domestic',
    baseUrl: 'https://api.moonshot.cn/v1',
    docUrl: 'https://platform.moonshot.cn/console/api-keys',
    placeholderModel: 'kimi-k2.6',
    color: '#1A56DB',
    recommendedModels: [
      { id: 'kimi-k2.6', label: 'kimi-k2.6', description: 'Kimi Coding / 通用最新推荐', isDefault: true },
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k', description: 'Moonshot 8K 上下文' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k', description: 'Moonshot 32K 上下文' },
      { id: 'moonshot-v1-128k', label: 'moonshot-v1-128k', description: 'Moonshot 128K 超长上下文' },
    ],
    hint: '长文本与代码理解能力出众',
  },
  {
    key: 'qwen',
    name: '阿里通义千问 (DashScope)',
    category: 'domestic',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docUrl: 'https://dashscope.console.aliyun.com/apiKey',
    placeholderModel: 'qwen-plus',
    color: '#FF6A00',
    recommendedModels: [
      { id: 'qwen-plus', label: 'qwen-plus', description: '能力与速度均衡（推荐）', isDefault: true },
      { id: 'qwen-turbo', label: 'qwen-turbo', description: '极速响应、极低成本' },
      { id: 'qwen-max', label: 'qwen-max', description: '通义千问超大规模旗舰' },
      { id: 'qwen2.5-72b-instruct', label: 'qwen2.5-72b-instruct', description: 'Qwen 2.5 开源旗舰' },
      { id: 'qwen2.5-coder-32b-instruct', label: 'qwen2.5-coder-32b-instruct', description: '代码专项大模型' },
    ],
    hint: '阿里云百炼平台兼容 OpenAI 接口',
  },
  {
    key: 'zhipu',
    name: '智谱 GLM',
    category: 'domestic',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    docUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    placeholderModel: 'glm-4-flash',
    color: '#3858F6',
    recommendedModels: [
      { id: 'glm-4-flash', label: 'glm-4-flash', description: '高速且免费调用（强烈推荐）', isDefault: true },
      { id: 'glm-4-plus', label: 'glm-4-plus', description: 'GLM-4 旗舰综合大模型' },
      { id: 'glm-4-air', label: 'glm-4-air', description: '高性价比高并发模型' },
      { id: 'codegeex-4', label: 'codegeex-4', description: '代码生成与理解专精' },
    ],
    hint: '提供 glm-4-flash 永久免费高速调用',
  },
  {
    key: 'minimax',
    name: 'MiniMax (海螺)',
    category: 'domestic',
    baseUrl: 'https://api.minimaxi.com/v1',
    docUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    placeholderModel: 'MiniMax-M3',
    color: '#FF2A6D',
    recommendedModels: [
      { id: 'MiniMax-M3', label: 'MiniMax-M3', description: 'Coding Plan 推荐模型', isDefault: true },
      { id: 'abab6.5s-chat', label: 'abab6.5s-chat', description: '高响应速度通用模型' },
      { id: 'abab6.5t-chat', label: 'abab6.5t-chat', description: '万亿 MoE 大模型' },
    ],
    hint: '国内站 API；国际站地址为 https://api.minimax.io/v1',
  },
  {
    key: 'doubao',
    name: '字节豆包 (Volcengine)',
    category: 'domestic',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    docUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    placeholderModel: 'doubao-pro-32k',
    color: '#0052D9',
    recommendedModels: [
      { id: 'doubao-pro-32k', label: 'doubao-pro-32k', description: '火山方舟主力模型', isDefault: true },
      { id: 'doubao-lite-32k', label: 'doubao-lite-32k', description: '轻量高效模型' },
    ],
    hint: '火山引擎大模型服务平台，支持高并发低延迟',
  },
  {
    key: 'mimo',
    name: '小米 MiMo API',
    category: 'domestic',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    docUrl: 'https://mimo.xiaomi.com/',
    placeholderModel: 'mimo-v1',
    color: '#FF6900',
    recommendedModels: [
      { id: 'mimo-v1', label: 'mimo-v1', description: '小米大模型通用端点', isDefault: true },
    ],
    hint: '按量付费地址；Token Plan 用户在控制台获取独立地址',
  },
  {
    key: 'stepfun',
    name: '阶跃星辰 (StepFun)',
    category: 'domestic',
    baseUrl: 'https://api.stepfun.com/v1',
    docUrl: 'https://platform.stepfun.com/interface-key',
    placeholderModel: 'step-1-8k',
    color: '#4361EE',
    recommendedModels: [
      { id: 'step-1-8k', label: 'step-1-8k', description: 'Step-1 8K 上下文（推荐）', isDefault: true },
      { id: 'step-1-32k', label: 'step-1-32k', description: 'Step-1 32K 上下文' },
      { id: 'step-2-16k', label: 'step-2-16k', description: 'Step-2 万亿参数大模型' },
    ],
    hint: '阶跃星辰自研 Step 系列大模型',
  },
  {
    key: 'baichuan',
    name: '百川智能',
    category: 'domestic',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    docUrl: 'https://platform.baichuan-ai.com/console/apikey',
    placeholderModel: 'Baichuan4',
    color: '#E63946',
    recommendedModels: [
      { id: 'Baichuan4', label: 'Baichuan4', description: '百川 4 代旗舰大模型', isDefault: true },
      { id: 'Baichuan3-Turbo', label: 'Baichuan3-Turbo', description: '百川 3 Turbo 高速版本' },
    ],
    hint: '百川智能自研知识增强大模型',
  },

  // ---------- 聚合分发 ----------
  {
    key: 'siliconflow',
    name: '硅基流动 (SiliconFlow)',
    category: 'aggregator',
    baseUrl: 'https://api.siliconflow.cn/v1',
    docUrl: 'https://cloud.siliconflow.cn/account/ak',
    placeholderModel: 'deepseek-ai/DeepSeek-V3',
    color: '#7C3AED',
    recommendedModels: [
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3', description: '满血版 DeepSeek-V3', isDefault: true },
      { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1', description: '满血版 DeepSeek-R1 推理' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B', description: '通义千问 72B 满血' },
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', label: 'Qwen2.5-Coder-32B', description: '开源顶尖代码模型' },
      { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B (免费)', description: '免费调用' },
    ],
    hint: '一站式开源模型云服务，支持 DeepSeek-V3/R1 满血版高速推理',
  },
  {
    key: 'openrouter',
    name: 'OpenRouter',
    category: 'aggregator',
    baseUrl: 'https://openrouter.ai/api/v1',
    docUrl: 'https://openrouter.ai/keys',
    placeholderModel: 'deepseek/deepseek-chat',
    color: '#10B981',
    recommendedModels: [
      { id: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat', description: 'DeepSeek V3 官方路由', isDefault: true },
      { id: 'deepseek/deepseek-r1', label: 'deepseek/deepseek-r1', description: 'DeepSeek R1 深度思考' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'claude-3.5-sonnet', description: 'Claude 3.5 Sonnet' },
      { id: 'openai/gpt-4o-mini', label: 'gpt-4o-mini', description: 'GPT-4o Mini' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'llama-3.3-70b', description: 'Llama 3.3 70B' },
    ],
    hint: '全球顶级模型路由聚合，支持一次配置访问全球数百种模型',
  },
  {
    key: 'aihubmix',
    name: 'AiHubMix',
    category: 'aggregator',
    baseUrl: 'https://aihubmix.com/v1',
    docUrl: 'https://aihubmix.com/token',
    placeholderModel: 'deepseek-chat',
    color: '#6366F1',
    recommendedModels: [
      { id: 'deepseek-chat', label: 'deepseek-chat', description: 'DeepSeek V3', isDefault: true },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner', description: 'DeepSeek R1' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini', description: 'OpenAI 4o-mini' },
      { id: 'claude-3-5-sonnet-20241022', label: 'claude-3-5-sonnet', description: 'Claude 3.5 Sonnet 新版' },
    ],
    hint: '全模型聚合中转服务商',
  },

  // ---------- 国际主流 ----------
  {
    key: 'openai',
    name: 'OpenAI 官方',
    category: 'global',
    baseUrl: 'https://api.openai.com/v1',
    docUrl: 'https://platform.openai.com/api-keys',
    placeholderModel: 'gpt-4o-mini',
    color: '#10A37F',
    recommendedModels: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini', description: '高性价比旗舰轻量版（推荐）', isDefault: true },
      { id: 'gpt-4o', label: 'gpt-4o', description: 'GPT-4o 多模态旗舰' },
      { id: 'o1-mini', label: 'o1-mini', description: 'OpenAI 深度推理轻量版' },
      { id: 'o3-mini', label: 'o3-mini', description: '最新极速科学推理模型' },
    ],
    hint: '官方 OpenAI 接口（需境外网络环境）',
  },
  {
    key: 'groq',
    name: 'Groq (极速 LPU 推理)',
    category: 'global',
    baseUrl: 'https://api.groq.com/openai/v1',
    docUrl: 'https://console.groq.com/keys',
    placeholderModel: 'llama-3.3-70b-versatile',
    color: '#F55036',
    recommendedModels: [
      { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile', description: 'Llama 3.3 70B 极速输出', isDefault: true },
      { id: 'deepseek-r1-distill-llama-70b', label: 'deepseek-r1-distill-llama-70b', description: 'DeepSeek R1 蒸馏版 70B' },
      { id: 'mixtral-8x7b-32768', label: 'mixtral-8x7b-32768', description: 'Mixtral 8x7B 混合专家' },
    ],
    hint: 'LPU 硬件加速，每秒数百 token 极致响应速度',
  },
  {
    key: 'mistral',
    name: 'Mistral AI',
    category: 'global',
    baseUrl: 'https://api.mistral.ai/v1',
    docUrl: 'https://console.mistral.ai/api-keys',
    placeholderModel: 'codestral-latest',
    color: '#FF7000',
    recommendedModels: [
      { id: 'codestral-latest', label: 'codestral-latest', description: 'Mistral 编程专用大模型', isDefault: true },
      { id: 'mistral-small-latest', label: 'mistral-small-latest', description: '轻量快速模型' },
      { id: 'mistral-large-latest', label: 'mistral-large-latest', description: 'Mistral 顶级旗舰' },
    ],
    hint: '欧洲知名 AI 独角兽企业',
  },
  {
    key: 'gemini',
    name: 'Google Gemini (兼容端点)',
    category: 'global',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    docUrl: 'https://aistudio.google.com/app/apikey',
    placeholderModel: 'gemini-2.0-flash',
    color: '#1A73E8',
    recommendedModels: [
      { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash', description: 'Google 最新 2.0 超快模型', isDefault: true },
      { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash', description: 'Gemini 1.5 极速版' },
      { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro', description: '百万上下文顶级模型' },
    ],
    hint: 'Google AI Studio 官方提供的 OpenAI 协议兼容端点',
  },

  // ---------- 本地私有 ----------
  {
    key: 'ollama',
    name: 'Ollama 本地部署',
    category: 'local',
    baseUrl: 'http://127.0.0.1:11434/v1',
    docUrl: 'https://ollama.com',
    placeholderModel: 'qwen2.5:7b',
    color: '#000000',
    recommendedModels: [
      { id: 'qwen2.5:7b', label: 'qwen2.5:7b', description: '通义千问 2.5 本地 7B（推荐）', isDefault: true },
      { id: 'deepseek-r1:7b', label: 'deepseek-r1:7b', description: 'DeepSeek R1 本地蒸馏版' },
      { id: 'deepseek-r1:14b', label: 'deepseek-r1:14b', description: 'DeepSeek R1 14B 中规模' },
      { id: 'llama3.3:latest', label: 'llama3.3:latest', description: 'Meta Llama 3.3 本地版' },
      { id: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b', description: 'Qwen 代码专用 7B' },
    ],
    hint: '本地无需 API Key，需先在终端运行 ollama serve',
  },
  {
    key: 'lmstudio',
    name: 'LM Studio 本地',
    category: 'local',
    baseUrl: 'http://127.0.0.1:1234/v1',
    docUrl: 'https://lmstudio.ai',
    placeholderModel: 'local-model',
    color: '#5C24FF',
    recommendedModels: [
      { id: 'local-model', label: 'local-model', description: 'LM Studio 当前加载的模型', isDefault: true },
    ],
    hint: '在 LM Studio 的 Local Server 页面点击 Start Server',
  },
  {
    key: 'vllm',
    name: 'vLLM / LocalAI',
    category: 'local',
    baseUrl: 'http://127.0.0.1:8000/v1',
    placeholderModel: 'default',
    color: '#2563EB',
    recommendedModels: [
      { id: 'default', label: 'default', description: '自建服务默认模型', isDefault: true },
    ],
    hint: 'GPU 显卡服务器自建 vLLM / SGLang / LocalAI 推理集群',
  },
]
