/** 线上官网根域名：AI / 累计访问等能力固定走此源，避免本地或镜像域名打到错误上游 */
export const OFFICIAL_ORIGIN = 'https://ittoolplus.cn'

export const siteConfig = {
  name: 'ittool++',
  shortName: 'ittoolplus',
  productName: 'Demo',
  /** 产品页顶栏副文案 */
  tagline: '新工具项目骨架模板',
  /** 页脚品牌区，与官网一致 */
  brandTagline: '实用工具集，开启美好生活',
  description:
    '基于 ittool++ 统一技术栈的项目骨架：首页、分页列表、顶栏与页脚。数据保存在浏览器 IndexedDB。',
  /** 官网 */
  homeUrl: 'https://ittoolplus.cn/',
  docsUrl: 'https://ittoolplus.cn/docs',
  copyright: `© ${new Date().getFullYear()} ittool++`,
  contactName: '张先生',
  contactPhone: '18756922651',
  contactEmail: 'mr_jianlong@163.com',
  icp: {
    number: '赣ICP备2026001696号-1',
    url: 'https://beian.miit.gov.cn/',
  },
  police: {
    number: '粤公网安备44139902100278号',
    url: 'https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=44139902100278',
  },
  quickLinks: [
    { label: '官网', href: 'https://ittoolplus.cn/' },
    { label: '工具集', href: 'https://ittoolplus.cn/tools' },
    { label: 'AI 助手', href: 'https://ittoolplus.cn/chats' },
    { label: '手册', href: 'https://ittoolplus.cn/docs' },
  ] as const,
} as const
