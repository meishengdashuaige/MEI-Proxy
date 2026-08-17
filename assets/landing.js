/**
 * MEI Proxy - Landing Page Interactive Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Preset Sandbox Simulation Rules
  const SIMULATED_RULES = [
    { pattern: '*.google.com', target: 'Clash 7890', type: 'wildcard', comment: 'Google 核心服务' },
    { pattern: '*.gstatic.com', target: 'Clash 7890', type: 'wildcard', comment: 'Google 静态资源' },
    { pattern: '*.youtube.com', target: 'Clash 7890', type: 'wildcard', comment: 'YouTube 视频流媒体' },
    { pattern: '*.github.com', target: 'Clash 7890', type: 'wildcard', comment: 'GitHub 开发者平台' },
    { pattern: '*.openai.com', target: 'Clash 7890', type: 'wildcard', comment: 'OpenAI ChatGPT' },
    { pattern: '*.anthropic.com', target: 'Clash 7890', type: 'wildcard', comment: 'Claude 官方服务' },
    { pattern: '192.168.*', target: '直接连接 (Direct)', type: 'wildcard', comment: '局域网直连' },
    { pattern: '<local>', target: '直接连接 (Direct)', type: 'bypass', comment: '本地主机' }
  ];

  const sandboxInput = document.getElementById('demoSandboxInput');
  const btnRunSandbox = document.getElementById('btnRunDemoSandbox');
  const sandboxResult = document.getElementById('demoSandboxResult');

  function matchRule(url) {
    let hostname = url.trim().toLowerCase();
    try {
      if (hostname.includes('://')) {
        hostname = new URL(hostname).hostname;
      }
    } catch {
      // use raw text
    }

    // Bypass check
    if (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname.includes('.')) {
      return {
        matched: true,
        type: 'Bypass 绕过名单',
        pattern: '<local>',
        target: '直接连接 (Direct)',
        comment: '本地/局域网免代理'
      };
    }

    for (const r of SIMULATED_RULES) {
      if (r.pattern.startsWith('*.')) {
        const domain = r.pattern.slice(2);
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return {
            matched: true,
            type: '域名通配符 (Wildcard)',
            pattern: r.pattern,
            target: r.target,
            comment: r.comment
          };
        }
      } else if (hostname.includes(r.pattern)) {
        return {
          matched: true,
          type: '匹配命中',
          pattern: r.pattern,
          target: r.target,
          comment: r.comment
        };
      }
    }

    return {
      matched: false,
      type: '未匹配规则 (Default Fallback)',
      pattern: '全部未匹配流量',
      target: '直接连接 (Direct)',
      comment: '回退至默认动作'
    };
  }

  function runDemo() {
    const val = (sandboxInput.value || '').trim();
    if (!val) return;

    const res = matchRule(val);
    sandboxResult.innerHTML = `
      <div class="sandbox-result-left">
        <div style="font-size: 15px; font-weight: 700; color: #fff;">
          🎯 模拟结果: <code>${val}</code>
        </div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
          命中机制: <strong style="color: var(--accent-cyan);">${res.type}</strong> (${res.pattern}) · <em>${res.comment}</em>
        </div>
      </div>
      <div class="sandbox-badge">
        <span>🚀 出口出口: ${res.target}</span>
      </div>
    `;
    sandboxResult.style.display = 'flex';
  }

  if (btnRunSandbox && sandboxInput) {
    btnRunSandbox.addEventListener('click', runDemo);
    sandboxInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') runDemo();
    });
  }

  // Guide Tabs Switching (Chrome vs Firefox)
  const tabGuideChrome = document.getElementById('tabGuideChrome');
  const tabGuideFirefox = document.getElementById('tabGuideFirefox');
  const guideChromeSteps = document.getElementById('guideChromeSteps');
  const guideFirefoxSteps = document.getElementById('guideFirefoxSteps');

  if (tabGuideChrome && tabGuideFirefox) {
    tabGuideChrome.addEventListener('click', () => {
      tabGuideChrome.classList.add('active');
      tabGuideFirefox.classList.remove('active');
      guideChromeSteps.style.display = 'grid';
      guideFirefoxSteps.style.display = 'none';
    });

    tabGuideFirefox.addEventListener('click', () => {
      tabGuideFirefox.classList.add('active');
      tabGuideChrome.classList.remove('active');
      guideChromeSteps.style.display = 'none';
      guideFirefoxSteps.style.display = 'grid';
    });
  }
});
