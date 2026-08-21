// apps/server/src/openapi.ts
// OpenAPI 3.0 契约（P1）：从 shared/types 派生的最小可用 spec，
// 覆盖备份/对比核心端点；后续由脚本从 shared 自动生成并做契约测试。

export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'bxverse API', version: '0.1.0', description: '本地 Web 管理台 API（127.0.0.1）' },
  servers: [{ url: 'http://127.0.0.1:8899' }],
  paths: {
    '/api/backups/usage': {
      get: {
        summary: '备份磁盘占用',
        parameters: [
          { name: 'projectId', in: 'query', schema: { type: 'string' } },
          { name: 'repoId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'BackupUsage' } },
      },
    },
    '/api/backups/cleanup': {
      post: {
        summary: '按保留策略清理',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  projectId: { type: 'string' },
                  repoId: { type: 'string' },
                  retention: { $ref: '#/components/schemas/BackupRetention' },
                  dryRun: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'BackupCleanupResult' } },
      },
    },
    '/api/backups/restore': {
      post: {
        summary: '恢复备份到目标目录',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['releaseId', 'repoId', 'kind', 'targetDir'],
                properties: {
                  releaseId: { type: 'string' },
                  repoId: { type: 'string' },
                  kind: { type: 'string', enum: ['source-bundle', 'source-archive', 'artifact'] },
                  targetDir: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'ok' } },
      },
    },
    '/api/repos/{pid}/{rid}/backups': {
      get: {
        summary: '某仓库备份列表',
        parameters: [
          { name: 'pid', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'rid', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'n', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'items' } },
      },
    },
    '/api/backups/{releaseId}/{repoId}': {
      get: { summary: '备份元数据', responses: { '200': { description: 'RepoBackupRef' } } },
    },
    '/api/backups/download/{releaseId}/{repoId}/{kind}': {
      get: { summary: '下载备份文件', responses: { '200': { description: 'binary' } } },
    },
    '/api/backups/compare': {
      post: {
        summary: '产物对比',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'CompareResult' } },
      },
    },
    '/api/backups/verify': {
      post: {
        summary: '完整性校验',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'CompareResult' } },
      },
    },
    '/api/repos/{pid}/{rid}/diff': {
      get: {
        summary: '源码 diff',
        parameters: [
          { name: 'pid', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'rid', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'CompareResult' } },
      },
    },
    '/api/metrics': { get: { summary: '指标', responses: { '200': { description: 'metrics' } } } },
  },
  components: {
    schemas: {
      BackupRetention: {
        type: 'object',
        properties: {
          keepLast: { type: 'integer', minimum: 1 },
          maxBytes: { type: 'integer', minimum: 0 },
          keepDays: { type: 'integer', minimum: 1 },
        },
      },
      BackupConfig: {
        type: 'object',
        required: ['enabled', 'source', 'onFailure'],
        properties: {
          enabled: { type: 'boolean' },
          dir: { type: 'string' },
          source: { type: 'string', enum: ['both', 'bundle', 'archive'] },
          onFailure: { type: 'string', enum: ['warn', 'fail'] },
          retention: { $ref: '#/components/schemas/BackupRetention' },
        },
      },
      RepoBackupRef: {
        type: 'object',
        required: ['releaseId', 'repoId', 'repoName', 'projectId', 'version', 'commit', 'date', 'items'],
        properties: {
          releaseId: { type: 'string' },
          repoId: { type: 'string' },
          repoName: { type: 'string' },
          projectId: { type: 'string' },
          version: { type: 'string' },
          commit: { type: 'string' },
          tag: { type: 'string' },
          date: { type: 'string', format: 'date-time' },
          items: { type: 'array', items: { $ref: '#/components/schemas/BackupItem' } },
        },
      },
      BackupItem: {
        type: 'object',
        required: ['kind', 'file', 'sha256', 'size'],
        properties: {
          kind: { type: 'string', enum: ['source-bundle', 'source-archive', 'artifact'] },
          file: { type: 'string' },
          sha256: { type: 'string' },
          size: { type: 'integer' },
          files: { type: 'integer' },
        },
      },
    },
  },
} as const
