/** 线上官网根域名：AI / 累计访问等能力固定走此源，避免本地或镜像域名打到错误上游 */
export const OFFICIAL_ORIGIN = 'https://ittoolplus.cn'

export const siteConfig = {
  name: 'ittool++',
  shortName: 'ittoolplus',
  productName: '在线浏览器',
  /** 产品页顶栏副文案 */
  tagline: '服务器部署的 Web 浏览器，地址栏 + 页面区即可浏览',
  /** 页脚品牌区，与官网一致 */
  brandTagline: '实用工具集，开启美好生活',
  description:
    '在网页中像真浏览器一样输入网址并打开页面。页面经嵌入代理加载，数据与最近访问保存在本机 IndexedDB。',
  /** 官网 */
  homeUrl: 'https://ittoolplus.cn/',
  docsUrl: 'https://ittoolplus.cn/docs',
  currentToolId: 'mini-browser',
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
