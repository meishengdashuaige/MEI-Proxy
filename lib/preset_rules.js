/**
 * MEIProxy - Curated Preset Routing Rule Sets
 * Provides modular, one-click importable rule sets for development, AI services, streaming, and domestic direct access.
 */

export const PRESET_RULE_SETS = [
  {
    id: 'ruleset_ai_dev',
    name: 'AI 智能与全球开发生态',
    description: '包含 OpenAI / ChatGPT、Claude / Anthropic、GitHub、HuggingFace、Vercel、Docker 等主流 AI 与开发者服务域名。',
    tag: '开发 & AI',
    defaultTargetType: 'proxy', // 'proxy' | 'direct'
    rules: [
      { pattern: '*.openai.com', type: 'wildcard', comment: 'OpenAI 官网与 API' },
      { pattern: '*.chatgpt.com', type: 'wildcard', comment: 'ChatGPT 网页客户端' },
      { pattern: '*.anthropic.com', type: 'wildcard', comment: 'Anthropic AI 服务' },
      { pattern: '*.claude.ai', type: 'wildcard', comment: 'Claude 官方网页' },
      { pattern: '*.github.com', type: 'wildcard', comment: 'GitHub 代码托管平台' },
      { pattern: '*.githubusercontent.com', type: 'wildcard', comment: 'GitHub 静态资源与头像' },
      { pattern: '*.huggingface.co', type: 'wildcard', comment: 'HuggingFace 模型社区' },
      { pattern: '*.hf.space', type: 'wildcard', comment: 'HuggingFace Spaces 应用' },
      { pattern: '*.vercel.app', type: 'wildcard', comment: 'Vercel 托管服务' },
      { pattern: '*.docker.com', type: 'wildcard', comment: 'Docker 镜像与文档' },
      { pattern: '*.npmjs.com', type: 'wildcard', comment: 'NPM 包管理平台' },
      { pattern: '*.stackoverflow.com', type: 'wildcard', comment: 'StackOverflow 开发者问答' },
      { pattern: '*.cursor.sh', type: 'wildcard', comment: 'Cursor AI 编辑器服务' },
      { pattern: '*.cohere.ai', type: 'wildcard', comment: 'Cohere AI 平台' },
      { pattern: '*.perplexity.ai', type: 'wildcard', comment: 'Perplexity 智能搜索' },
      { pattern: '*.midjourney.com', type: 'wildcard', comment: 'Midjourney 绘图社区' }
    ]
  },
  {
    id: 'ruleset_streaming_social',
    name: '全球流媒体与社交平台',
    description: '包含 YouTube、Netflix、Spotify、Twitter/X、Telegram、Discord、Twitch、Disney+ 等主流海外视听与社交网络。',
    tag: '流媒体 & 社交',
    defaultTargetType: 'proxy',
    rules: [
      { pattern: '*.youtube.com', type: 'wildcard', comment: 'YouTube 视频主站' },
      { pattern: '*.googlevideo.com', type: 'wildcard', comment: 'YouTube 视频流媒体分发' },
      { pattern: '*.ytimg.com', type: 'wildcard', comment: 'YouTube 封面与静态资源' },
      { pattern: '*.netflix.com', type: 'wildcard', comment: 'Netflix 网飞流媒体' },
      { pattern: '*.nflxvideo.net', type: 'wildcard', comment: 'Netflix 视频 CDN' },
      { pattern: '*.spotify.com', type: 'wildcard', comment: 'Spotify 音乐流媒体' },
      { pattern: '*.twitter.com', type: 'wildcard', comment: 'Twitter 社交平台' },
      { pattern: '*.x.com', type: 'wildcard', comment: 'X (原 Twitter) 主域名' },
      { pattern: '*.t.me', type: 'wildcard', comment: 'Telegram 快捷链接' },
      { pattern: '*.telegram.org', type: 'wildcard', comment: 'Telegram 官方通讯服务' },
      { pattern: '*.discord.com', type: 'wildcard', comment: 'Discord 社区与语音聊天' },
      { pattern: '*.twitch.tv', type: 'wildcard', comment: 'Twitch 游戏直播平台' },
      { pattern: '*.disneyplus.com', type: 'wildcard', comment: 'Disney+ 迪士尼流媒体' },
      { pattern: '*.reddit.com', type: 'wildcard', comment: 'Reddit 社区论坛' }
    ]
  },
  {
    id: 'ruleset_china_direct',
    name: '中国大陆常用站点直连白名单',
    description: '包含 百度、淘宝、京东、腾讯、网易、Bilibili、知乎、微信等常见国内服务，强制走直接连接 (Direct) 降低延迟并节省流量。',
    tag: '国内直连',
    defaultTargetType: 'direct',
    rules: [
      { pattern: '*.baidu.com', type: 'wildcard', comment: '百度搜索与云盘' },
      { pattern: '*.taobao.com', type: 'wildcard', comment: '淘宝网电商平台' },
      { pattern: '*.tmall.com', type: 'wildcard', comment: '天猫商城' },
      { pattern: '*.jd.com', type: 'wildcard', comment: '京东商城' },
      { pattern: '*.qq.com', type: 'wildcard', comment: '腾讯网与 QQ 相关服务' },
      { pattern: '*.weixin.qq.com', type: 'wildcard', comment: '微信网页服务' },
      { pattern: '*.bilibili.com', type: 'wildcard', comment: '哔哩哔哩视频主站' },
      { pattern: '*.bilivideo.com', type: 'wildcard', comment: 'Bilibili 视频流 CDN' },
      { pattern: '*.zhihu.com', type: 'wildcard', comment: '知乎问答社区' },
      { pattern: '*.163.com', type: 'wildcard', comment: '网易门户与云音乐' },
      { pattern: '*.sina.com.cn', type: 'wildcard', comment: '新浪网与微博' },
      { pattern: '*.alipay.com', type: 'wildcard', comment: '支付宝安全支付服务' },
      { pattern: '*.csdn.net', type: 'wildcard', comment: 'CSDN 技术社区' },
      { pattern: '*.aliyun.com', type: 'wildcard', comment: '阿里云计算平台' }
    ]
  },
  {
    id: 'ruleset_privacy_telemetry',
    name: '常见追踪与遥测过滤 (Direct/Block)',
    description: '匹配常见广告与数据统计追踪域名，可分配给直连或独立阻断节点。',
    tag: '隐私保护',
    defaultTargetType: 'direct',
    rules: [
      { pattern: '*.google-analytics.com', type: 'wildcard', comment: '谷歌分析数据收集' },
      { pattern: '*.googletagmanager.com', type: 'wildcard', comment: '谷歌代码管理器' },
      { pattern: '*.doubleclick.net', type: 'wildcard', comment: 'DoubleClick 广告网络' },
      { pattern: '*.pos.baidu.com', type: 'wildcard', comment: '百度联盟展示广告' },
      { pattern: '*.scorecardresearch.com', type: 'wildcard', comment: '受众分析追踪' }
    ]
  }
];

/**
 * 获取所有预置规则集简要清单
 */
export function getPresetRuleSetsSummary() {
  return PRESET_RULE_SETS.map(set => ({
    id: set.id,
    name: set.name,
    description: set.description,
    tag: set.tag,
    ruleCount: set.rules.length,
    defaultTargetType: set.defaultTargetType
  }));
}

/**
 * 根据 ID 获取特定规则集
 * @param {string} id 
 * @returns {Object|null}
 */
export function getPresetRuleSetById(id) {
  return PRESET_RULE_SETS.find(set => set.id === id) || null;
}
