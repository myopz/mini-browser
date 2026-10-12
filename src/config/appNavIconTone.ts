/** 按功能语义的导航图标线条色（顶栏灵动岛 / 程序坞共用） */
const ICON_COLOR_BY_LABEL: Record<
  string,
  { side: string; active: string; indicator: string }
> = {
  首页: {
    side: 'text-sky-500/75',
    active: 'text-sky-600',
    indicator: 'bg-sky-500',
  },
  工具集: {
    side: 'text-amber-500/80',
    active: 'text-amber-600',
    indicator: 'bg-amber-500',
  },
  手册: {
    side: 'text-emerald-500/80',
    active: 'text-emerald-600',
    indicator: 'bg-emerald-500',
  },
  'AI 助手': {
    side: 'text-violet-500/75',
    active: 'text-violet-600',
    indicator: 'bg-violet-500',
  },
  智能客服: {
    side: 'text-teal-500/80',
    active: 'text-teal-600',
    indicator: 'bg-teal-500',
  },
  // board-ittoolplus
  看板列表: {
    side: 'text-indigo-500/75',
    active: 'text-indigo-600',
    indicator: 'bg-indigo-500',
  },
  数据源列表: {
    side: 'text-cyan-500/80',
    active: 'text-cyan-600',
    indicator: 'bg-cyan-500',
  },
  数据列表: {
    side: 'text-rose-500/75',
    active: 'text-rose-600',
    indicator: 'bg-rose-500',
  },
}

/** 未知 label 稳定循环色板 */
const PALETTE: { side: string; active: string; indicator: string }[] = [
  {
    side: 'text-sky-500/75',
    active: 'text-sky-600',
    indicator: 'bg-sky-500',
  },
  {
    side: 'text-amber-500/80',
    active: 'text-amber-600',
    indicator: 'bg-amber-500',
  },
  {
    side: 'text-emerald-500/80',
    active: 'text-emerald-600',
    indicator: 'bg-emerald-500',
  },
  {
    side: 'text-violet-500/75',
    active: 'text-violet-600',
    indicator: 'bg-violet-500',
  },
  {
    side: 'text-teal-500/80',
    active: 'text-teal-600',
    indicator: 'bg-teal-500',
  },
  {
    side: 'text-orange-500/80',
    active: 'text-orange-600',
    indicator: 'bg-orange-500',
  },
  {
    side: 'text-fuchsia-500/75',
    active: 'text-fuchsia-600',
    indicator: 'bg-fuchsia-500',
  },
  {
    side: 'text-lime-600/80',
    active: 'text-lime-700',
    indicator: 'bg-lime-600',
  },
]

function hashLabel(label: string) {
  let h = 0
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function resolveTone(label: string) {
  return ICON_COLOR_BY_LABEL[label] ?? PALETTE[hashLabel(label) % PALETTE.length]
}

export function appNavIconTone(label: string, active = false) {
  const tone = resolveTone(label)
  return active ? tone.active : tone.side
}

/** 选中指示点用的实色（与线条色对应） */
export function appNavIndicatorClass(label: string) {
  return resolveTone(label).indicator
}
