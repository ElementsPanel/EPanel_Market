import type { PluginSide } from '../../shared/types/plugins'

/**
 * 展示用的端文案。两端齐了才叫双端插件；端信息缺失（旧数据或推导不出来）时返回
 * undefined，调用方据此不渲染标识，而不是硬报一个端。
 */
export function pluginSideLabel(sides?: PluginSide[]): string | undefined {
  const hasPanel = sides?.includes('panel') ?? false
  const hasDaemon = sides?.includes('daemon') ?? false
  if (hasPanel && hasDaemon) return '双端插件'
  if (hasPanel) return 'Panel插件'
  if (hasDaemon) return 'Daemon插件'
  return undefined
}
