// apps/web/src/composables/useFsAccess.ts
// File System Access API 封装：原生另存为 / 原生目录选择 / 句柄写入
// 兼容降级：不支持或调用失败时回退 anchor 下载

export interface FsAccess {
  /** 当前浏览器是否支持 File System Access API */
  supported: boolean
  /**
   * 原生「另存为」保存文本文件。
   * 返回 'native'（原生保存）/ 'fallback'（回退浏览器下载）/ 'cancelled'（用户取消）
   */
  saveTextFile: (suggestedName: string, content: string, mime?: string) => Promise<'native' | 'fallback' | 'cancelled'>
  /** 原生目录选择器（用户取消/不支持返回 null） */
  pickDirectory: () => Promise<FileSystemDirectoryHandle | null>
  /** 通过目录句柄写入文件（无路径依赖，纯前端写入） */
  writeToDirectory: (dir: FileSystemDirectoryHandle, fileName: string, content: string) => Promise<void>
}

function downloadBlob(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function useFsAccess(): FsAccess {
  const supported = typeof window !== 'undefined' && 'showSaveFilePicker' in window

  async function saveTextFile(suggestedName: string, content: string, mime = 'application/json'): Promise<'native' | 'fallback' | 'cancelled'> {
    if (!supported) {
      downloadBlob(suggestedName, content, mime)
      return 'fallback'
    }
    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName,
        types: [{ description: '文件', accept: { [mime]: [`.${suggestedName.split('.').pop() ?? 'txt'}`] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return 'native'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
      // 其他失败（如无头环境/权限异常）→ 回退下载
      downloadBlob(suggestedName, content, mime)
      return 'fallback'
    }
  }

  async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
    if (!('showDirectoryPicker' in window)) return null
    try {
      return await window.showDirectoryPicker!({ mode: 'readwrite' })
    } catch {
      return null
    }
  }

  async function writeToDirectory(dir: FileSystemDirectoryHandle, fileName: string, content: string): Promise<void> {
    const fileHandle = await dir.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  return { supported, saveTextFile, pickDirectory, writeToDirectory }
}
