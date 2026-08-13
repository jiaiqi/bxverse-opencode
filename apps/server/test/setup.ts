// 测试前置：在加载任何 core 模块之前设置 BX_HOME 到临时目录
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.BX_HOME = mkdtempSync(path.join(tmpdir(), 'bxverse-server-home-'))
