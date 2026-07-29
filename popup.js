// --- 1. UI 컨트롤러 ---
const UI = {
  elements: {
    btnReports: document.getElementById('btn-reports'),
    btnAlbums: document.getElementById('btn-albums'),
    startDate: document.getElementById('start-date'),
    endDate: document.getElementById('end-date'),
    status: document.getElementById('status')
  },
  
  setStatus(message, type = "default") {
    this.elements.status.textContent = message;
    this.elements.status.className = type;
  },

  setButtonsDisabled(disabled) {
    this.elements.btnReports.disabled = disabled;
    this.elements.btnAlbums.disabled = disabled;
  },

  getDates() {
    return {
      start: this.elements.startDate.value,
      end: this.elements.endDate.value
    };
  }
};

// --- 2. Chrome 확장 프로그램 API 래퍼 ---
const ExtAPI = {
  async getActiveTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) throw new Error("활성화된 탭을 찾을 수 없습니다.");
    return tabs[0].id;
  },

  async sendMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      throw new Error("페이지 통신 에러: 키즈노트 화면에서 [F5 새로고침] 후 다시 실행해 주세요!");
    }
  },

  downloadFile(url, filename) {
    chrome.downloads.download({ url, filename });
  }
};

// --- 3. 핵심 다운로드 비즈니스 로직 ---
const Downloader = {
  async start(menuType) {
    const menuName = menuType === 'reports' ? '알림장' : '앨범';
    const { start, end } = UI.getDates();

    if (!start || !end) return UI.setStatus("시작일과 종료일을 모두 입력해주세요.", "error");
    if (start > end) return UI.setStatus("시작일이 종료일보다 늦습니다.", "error");

    UI.setButtonsDisabled(true);
    UI.setStatus("키즈노트 자녀 정보 스캔 중...");

    try {
      const tabId = await ExtAPI.getActiveTabId();
      
      const idResponse = await ExtAPI.sendMessage(tabId, { action: "getChildId" });
      if (!idResponse?.childId) throw new Error("자녀 ID를 찾지 못했습니다. 페이지 새로고침 후 시도해주세요.");
      
      const childId = idResponse.childId;
      await this.processPages(tabId, childId, menuType, menuName, start, end);

    } catch (error) {
      console.error(error);
      UI.setStatus(error.message, "error");
    } finally {
      UI.setButtonsDisabled(false);
    }
  },

  async processPages(tabId, childId, menuType, menuName, start, end) {
    let pageToken = null;
    let totalItems = 0;
    let totalFiles = 0;

    while (true) {
      UI.setStatus(`[${menuName}] 데이터 동기화 중... (현재 ${totalItems}개 분석 완료)`);
      
      const pageResponse = await ExtAPI.sendMessage(tabId, { action: "fetchDataPage", childId, pageToken, menuType });
      if (!pageResponse?.success) throw new Error(pageResponse?.error || "API 데이터 수집 에러");

      const { results, next } = pageResponse.data;
      if (!results || results.length === 0) break;

      let oldestDateInPage = "9999-12-31";

      for (const item of results) {
        const rawDate = item.date_written || item.created;
        if (!rawDate) continue;

        const reportDate = rawDate.split('T')[0]; // "YYYY-MM-DD" 추출
        if (reportDate < oldestDateInPage) oldestDateInPage = reportDate;

        if (reportDate >= start && reportDate <= end) {
          totalItems++;
          totalFiles += this.downloadMedia(item, menuName, reportDate);
        }
      }

      // 조기 종료 (과거 데이터 도달 시)
      if (oldestDateInPage < start || !next) break;

      pageToken = next;
      await new Promise(r => setTimeout(r, 200)); // API 과부하 방지
    }

    UI.setStatus(`🎉 완료! ${menuName} ${totalItems}개에서 미디어 ${totalFiles}개를 다운로드했습니다.`, "success");
  },

  downloadMedia(item, menuName, dateStr) {
    let downloadedCount = 0;

    // 사진 다운로드
    const images = item.attached_images || [];
    images.forEach((img, idx) => {
      if (img.original) {
        const num = String(idx + 1).padStart(2, '0');
        ExtAPI.downloadFile(img.original, `kidsnote_${menuName}/${dateStr}_${menuName}_사진_${num}.jpg`);
        downloadedCount++;
      }
    });

    // 비디오 다운로드
    const video = item.attached_video || item.video;
    if (video?.high) {
      const num = String(downloadedCount + 1).padStart(2, '0');
      ExtAPI.downloadFile(video.high, `kidsnote_${menuName}/${dateStr}_${menuName}_영상_${num}.mp4`);
      downloadedCount++;
    }

    return downloadedCount;
  }
};

// --- 4. 이벤트 리스너 등록 ---
UI.elements.btnReports.addEventListener('click', () => Downloader.start('reports'));
UI.elements.btnAlbums.addEventListener('click', () => Downloader.start('albums'));