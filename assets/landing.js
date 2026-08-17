/**
 * MEI Proxy - Landing Page Logic
 * Features: Smart Browser Detection, Download Card Recommendations & Guide Tabs
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
  const btnNavDownload = document.getElementById('btnNavDownload');

  const cardChrome = document.getElementById('cardChrome');
  const cardFirefox = document.getElementById('cardFirefox');
  const btnDownloadChromeCard = document.getElementById('btnDownloadChromeCard');
  const btnDownloadFirefoxCard = document.getElementById('btnDownloadFirefoxCard');
  const btnTextChromeCard = document.getElementById('btnTextChromeCard');
  const btnTextFirefoxCard = document.getElementById('btnTextFirefoxCard');

  const tabGuideChrome = document.getElementById('tabGuideChrome');
  const tabGuideFirefox = document.getElementById('tabGuideFirefox');
  const guideChromeSteps = document.getElementById('guideChromeSteps');
  const guideFirefoxSteps = document.getElementById('guideFirefoxSteps');

  const badgeHtml = `<span class="card-recommend-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> 当前浏览器推荐</span>`;

  if (isFirefox) {
    // 顶部 Hero 提示与按钮
    if (browserDetectText) {
      browserDetectText.textContent = '已检测到当前为 Firefox 浏览器，已为您推荐对应安装包';
    }
    if (heroDownloadFirefox) {
      heroDownloadFirefox.className = 'btn btn-primary btn-lg btn-recommend';
    }
    if (heroDownloadChrome) {
      heroDownloadChrome.className = 'btn btn-secondary btn-lg';
    }
    if (btnNavDownload) {
      btnNavDownload.href = 'dist/MEI-Proxy-Firefox.xpi';
    }

    // 下载卡片区 - 动态高亮与排序
    if (cardFirefox && cardChrome) {
      cardFirefox.classList.add('highlight');
      cardFirefox.style.order = '-1';
      cardFirefox.insertAdjacentHTML('afterbegin', badgeHtml);

      if (btnDownloadFirefoxCard) {
        btnDownloadFirefoxCard.className = 'btn btn-primary btn-lg';
      }
      if (btnTextFirefoxCard) {
        btnTextFirefoxCard.textContent = '下载 Firefox 推荐安装包 (.xpi)';
      }

      cardChrome.classList.remove('highlight');
      cardChrome.style.order = '1';
      if (btnDownloadChromeCard) {
        btnDownloadChromeCard.className = 'btn btn-secondary btn-lg';
      }
      if (btnTextChromeCard) {
        btnTextChromeCard.textContent = '下载 Chrome / Edge 扩展包 (.zip)';
      }
    }

    // 默认展示 Firefox 教程
    if (tabGuideFirefox && tabGuideChrome && guideFirefoxSteps && guideChromeSteps) {
      tabGuideFirefox.classList.add('active');
      tabGuideChrome.classList.remove('active');
      guideFirefoxSteps.style.display = 'block';
      guideChromeSteps.style.display = 'none';
    }
  } else {
    const browserName = isEdge ? 'Edge' : (isChrome ? 'Chrome' : 'Chromium');

    // 顶部 Hero 提示与按钮
    if (browserDetectText) {
      browserDetectText.textContent = `已检测到当前为 ${browserName} 浏览器，已为您推荐对应扩展包`;
    }
    if (heroDownloadChrome) {
      heroDownloadChrome.className = 'btn btn-primary btn-lg btn-recommend';
    }
    if (heroDownloadFirefox) {
      heroDownloadFirefox.className = 'btn btn-secondary btn-lg';
    }
    if (btnNavDownload) {
      btnNavDownload.href = 'dist/MEI-Proxy-Chrome.zip';
    }

    // 下载卡片区 - 动态高亮与排序
    if (cardChrome && cardFirefox) {
      cardChrome.classList.add('highlight');
      cardChrome.style.order = '-1';
      cardChrome.insertAdjacentHTML('afterbegin', badgeHtml);

      if (btnDownloadChromeCard) {
        btnDownloadChromeCard.className = 'btn btn-primary btn-lg';
      }
      if (btnTextChromeCard) {
        btnTextChromeCard.textContent = `下载 ${browserName} 推荐扩展包 (.zip)`;
      }

      cardFirefox.classList.remove('highlight');
      cardFirefox.style.order = '1';
      if (btnDownloadFirefoxCard) {
        btnDownloadFirefoxCard.className = 'btn btn-secondary btn-lg';
      }
      if (btnTextFirefoxCard) {
        btnTextFirefoxCard.textContent = '下载 Firefox 安装包 (.xpi)';
      }
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
