// --- 1. 자녀 ID 추출 전략(Strategy) 정의 ---
const idExtractors = [
  // 1순위: 주소창 (URL)
  () => window.location.href.match(/(?:children|child)[\/=?]+(\d+)/)?.[1],
  // 2순위: 네트워크 통신 기록 (Performance API)
  () => performance.getEntriesByType('resource')
          .find(res => res.name.match(/\/(?:children|child)[\/=?]+(\d+)/))?.name.match(/\/(?:children|child)[\/=?]+(\d+)/)?.[1],
  // 3순위: 화면 내부 링크 (a 태그)
  () => Array.from(document.querySelectorAll('a[href]'))
          .find(a => a.href.match(/(?:children|child)[\/=?]+(\d+)/))?.href.match(/(?:children|child)[\/=?]+(\d+)/)?.[1],
  // 4순위: 브라우저 캐시 (Local Storage)
  () => {
    for (let i = 0; i < localStorage.length; i++) {
      const val = localStorage.getItem(localStorage.key(i));
      const match = val && val.match(/"child(?:_id)?"\s*:\s*"?(\d+)"?/);
      if (match) return match[1];
    }
  },
  // 5순위: 인라인 자바스크립트 변수
  () => Array.from(document.querySelectorAll('script:not([src])'))
          .find(s => s.textContent.match(/["']?child(?:_id)?["']?\s*[:=]\s*["']?(\d+)["']?/))?.textContent.match(/["']?child(?:_id)?["']?\s*[:=]\s*["']?(\d+)["']?/)?.[1]
];

// ID 추출 실행 함수
const getChildId = () => {
  for (const extractor of idExtractors) {
    try {
      const id = extractor();
      if (id) return id; // 찾으면 즉시 반환
    } catch (e) {
      continue; // 에러 발생 시 무시하고 다음 전략 실행
    }
  }
  return null;
};

// --- 2. 메시지 리스너 (API 통신 중계) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === "getChildId") {
    sendResponse({ childId: getChildId() });
  } 
  
  else if (request.action === "fetchDataPage") {
    const { childId, pageToken, menuType } = request;
    const apiVersion = menuType === "albums" ? "v1_3" : "v1_2";
    
    let url = pageToken?.startsWith('http') 
      ? pageToken 
      : `https://www.kidsnote.com/api/${apiVersion}/children/${childId}/${menuType}/?page_size=12&tz=Asia%2FSeoul&child=${childId}${pageToken ? `&page=${pageToken}` : ''}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP 에러: ${res.status}`);
        return res.json();
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
  }
  
  return true; // 비동기 응답 유지
});