/**
 * MEI Proxy - Landing Page Logic
 * Features: Smart Browser Detection, Dynamic Highlight & Guide Tabs
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 智能判断用户浏览器类型
  const userAgent = navigator.userAgent || '';
  const isFirefox = userAgent.includes('Firefox');
  const isEdge = userAgent.includes('Edg');
  const isChrome = userAgent.includes('Chrome') && !isEdge;

  const browserDetectText = document.getElementById('browserDetectText');
  const heroDownloadChrome = document.getElementById('heroDownloadChrome');
  const heroDownloadFirefox = document.getElementById('heroDownloadFirefox');
  const cardChrome = document.getElementById('cardChrome');
  const cardFirefox = document.getElementById('cardFirefox');

  const tabGuideChrome = document.getElementById('tabGuideChrome');
  const tabGuideFirefox = document.getElementById('tabGuideFirefox');
  const guideChromeSteps = document.getElementById('guideChromeSteps');
  const guideFirefoxSteps = document.getElementById('guideFirefoxSteps');

  if (isFirefox) {
    if (browserDetectText) {
      browserDetectText.textContent = '已检测到当前为 Firefox 浏览器，推荐下载 .xpi 安装包';
    }
    if (heroDownloadFirefox) {
      heroDownloadFirefox.className = 'btn btn-primary btn-lg btn-recommend';
    }
    if (heroDownloadChrome) {
      heroDownloadChrome.className = 'btn btn-secondary btn-lg';
    }
    if (cardFirefox && cardChrome) {
      cardFirefox.classList.add('highlight');
      cardChrome.classList.remove('highlight');
    }
    // 默认展示 Firefox 教程
    if (tabGuideFirefox && tabGuideChrome && guideFirefoxSteps && guideChromeSteps) {
      tabGuideFirefox.classList.add('active');
      tabGuideChrome.classList.remove('active');
      guideFirefoxSteps.style.display = 'block';
      guideChromeSteps.style.display = 'none';
    }
  } else {
    const browserName = isEdge ? 'Edge' : (isChrome ? 'Chrome' : 'Chromium 内核');
    if (browserDetectText) {
      browserDetectText.textContent = `已检测到当前为 ${browserName} 浏览器，推荐下载 .zip 扩展包`;
    }
    if (heroDownloadChrome) {
      heroDownloadChrome.className = 'btn btn-primary btn-lg btn-recommend';
    }
    if (heroDownloadFirefox) {
      heroDownloadFirefox.className = 'btn btn-secondary btn-lg';
    }
    if (cardChrome && cardFirefox) {
      cardChrome.classList.add('highlight');
      cardFirefox.classList.remove('highlight');
    }
    // 默认展示 Chrome 教程
    if (tabGuideChrome && tabGuideFirefox && guideChromeSteps && guideFirefoxSteps) {
      tabGuideChrome.classList.add('active');
      tabGuideFirefox.classList.remove('active');
      guideChromeSteps.style.display = 'block';
      guideFirefoxSteps.style.display = 'none';
    }
  }

  // 2. 安装指南选项卡切换
  if (tabGuideChrome && tabGuideFirefox) {
    tabGuideChrome.addEventListener('click', () => {
      tabGuideChrome.classList.add('active');
      tabGuideFirefox.classList.remove('active');
      guideChromeSteps.style.display = 'block';
      guideFirefoxSteps.style.display = 'none';
    });

    tabGuideFirefox.addEventListener('click', () => {
      tabGuideFirefox.classList.add('active');
      tabGuideChrome.classList.remove('active');
      guideChromeSteps.style.display = 'none';
      guideFirefoxSteps.style.display = 'block';
    });
  }
});
