// 🔴 請務必填入您的 Web App URL
const API_URL = "https://script.google.com/macros/s/AKfycbxHe88NVoiJkAt2pvBnCYUk_xGul1FhXTAj0kyAXA9GEIddXB1AD8j4gtjhbDEASPSr/exec";

// 🔴 預設經典內容 (初始值)
let CLASSICS_CONTENT = "";

// 🔴 變數：Wake Lock 與 計時
let wakeLock = null;
let classicsStartTime = 0;
let readingObserver = null;
let currentParagraphIndex = 0; // 當前閱讀段落
let totalParagraphs = 0; // 總段落數

// 🔴 經典系統變數
let classicsMenuData = {}; // 存後端回傳的目錄結構
let currentSubject = null;    // 目前選中的科目
let currentChapter = null; // 目前選中的篇章
let classicsSearchActive = false;
let classicsFavoritesActive = false;
let classicsSearchResults = [];
let classicsSearchTotal = 0;
let classicsSearchTruncated = false;
let classicsSearchTimer = null;
let classicsSearchRequestId = 0;
let currentChapterSheet = null;
let classicFavoriteSaveTimer = null;
let crmMemberSearchTimer = null;
let crmCrossHallSelected = new Set();

var gUser=null, gPass=null, gData={}, menuConfig={}, crmData=[];
var allEvents = [], activeFilters = [], shareDataList = [];
var eventCategories = [], eventCanManage = false, eventCanAdd = false, crmMemberOptions = [];
var season32GoalReportData = null;
var cmsUploadFiles = []; 
var timerInt=null, isTimer=false;
var curYear = new Date().getFullYear(), curMonth = new Date().getMonth() + 1;

// ... Init ...
setInterval(function(){
  var setTime = localStorage.getItem("reminder_time");
  if(!setTime) return;
  var now = new Date();
  var nowStr = (now.getHours()<10?'0':'') + now.getHours() + ":" + (now.getMinutes()<10?'0':'') + now.getMinutes();
  var lastRemind = localStorage.getItem("last_remind_date");
  var today = now.toDateString();
  if (nowStr === setTime && lastRemind !== today) {
     localStorage.setItem("last_remind_date", today);
     if(Notification.permission === 'granted') new Notification("賢德志士", { body: "⏰ 時間到了！" });
  }
}, 60000); 

window.onload = function(){
    loading(true);
    var d = new Date();
    document.getElementById('adm-date').valueAsDate = d;
    var mStr = d.getFullYear() + "-" + ((d.getMonth()+1)<10?"0"+(d.getMonth()+1):(d.getMonth()+1));
    document.getElementById('adm-month').value = mStr;

    callApi('getConfig').then(cfg => {
        menuConfig = cfg.menu;
        if(cfg.announcement) document.getElementById('marquee-text').innerText = cfg.announcement;
        initRegDropdowns();
        initAdminDropdowns();
        var u = localStorage.getItem("xd_u"), p = localStorage.getItem("xd_p");
        if(u&&p){ document.getElementById('l-u').value=u; document.getElementById('l-p').value=p; doLogin(); } else { loading(false); }
    }).catch(err => {
        loading(false);
        console.error(err);
        alert("連線初始化失敗: " + err);
    });
    var savedTime = localStorage.getItem("reminder_time");
    if(savedTime) document.getElementById('reminder-time').value = savedTime;
}

// 🔴 核心通訊函式：使用表單參數 'req' 傳送 JSON (最穩定的方式)
function callApi(action, params) {
    if(!params) params = {};
    params.action = action;
    
    var formData = new URLSearchParams();
    formData.append('req', JSON.stringify(params)); 
    
    return fetch(API_URL, { 
        method: 'POST', 
        body: formData 
    })
    .then(res => res.json())
    .then(json => {
        if(json.error) {
           console.error("API Error:", json);
           if(json.error.includes("Backend")) alert("系統錯誤: " + json.error);
        }
        return json;
    });
}

function loading(x){ document.getElementById('loading').style.display = x?'flex':'none'; }

function toText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function escapeHtml(value) {
  return toText(value).replace(/[&<>"']/g, function(ch) {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch];
  });
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function encodePayload(value) {
  return encodeURIComponent(JSON.stringify(value));
}

function decodePayload(value) {
  return JSON.parse(decodeURIComponent(value));
}

// 🔴 螢幕恆亮 API (Wake Lock)
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock active');
      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock released');
      });
    } catch (err) {
      console.error(`${err.name}, ${err.message}`);
    }
  }
}

function releaseWakeLock() {
  if(wakeLock !== null) {
    wakeLock.release().then(() => { wakeLock = null; });
  }
}

// 🔴 1. 開啟經典模式 (載入目錄)
function openClassics() {
    // 強制隱藏主畫面，顯示經典畫面
    document.querySelector('.viewport').style.display = 'none';
    var classicsView = document.getElementById('v-classics');
    classicsView.style.display = 'flex'; // 🔴 強制設定為 flex，覆蓋可能的 style conflict
    classicsView.classList.add('active');
    
    // 重置狀態
    currentSubject = null;
    currentChapter = null;
    resetClassicSearchState();
    showSubjectList(); // 顯示科目列表
    
    // 呼叫後端抓取目錄
    callApi('getClassicsMenu').then(res => {
        if(res.success) {
            classicsMenuData = res.menu;
            showSubjectList();
        } else {
            document.getElementById('classics-menu-list').innerHTML = `<div style="text-align:center; color:red;">${res.error || "載入失敗，請確認 Google Sheet [ClassicsMenu] 是否設定正確"}</div>`;
        }
    });
}

// 🔴 2. 顯示科目列表 (第一層)
function showSubjectList() {
    currentSubject = null;
    classicsSearchActive = false;
    classicsFavoritesActive = false;
    showClassicSearchPanel(true);
    document.getElementById('classics-nav-title').innerText = "📚 經典科目";
    document.getElementById('classics-subtitle').innerText = "請選擇科目";
    document.getElementById('classics-menu-list').style.display = 'block';
    document.getElementById('classics-reader').style.display = 'none';
    document.getElementById('classics-display-tools').style.display = 'none';
    document.getElementById('classics-ctrl-bar').style.display = 'none';
    
    var favorites = Array.isArray(gData.classic_favorites) ? gData.classic_favorites : [];
    var html = `<button type="button" class="classic-favorites-entry" onclick="showFavoritePassages()"><span>★ 自選章句</span><strong>${favorites.length}</strong></button>`;
    var subjects = Object.keys(classicsMenuData);
    if (subjects.length === 0) {
       html = "<div style='text-align:center; color:#ccc; margin-top:20px;'>載入中...</div>";
    } else {
       subjects.forEach(subject => {
           html += `<div class="cms-item" onclick="showChapterList('${subject}')" style="padding:15px; font-size:16px; font-weight:bold; cursor:pointer;">📖 ${subject} <span style="float:right; color:#ccc;">></span></div>`;
       });
    }
    document.getElementById('classics-menu-list').innerHTML = html;
}

function showFavoritePassages() {
    classicsSearchActive = false;
    classicsFavoritesActive = true;
    currentSubject = null;
    showClassicSearchPanel(false);
    document.getElementById('classics-nav-title').innerText = '★ 自選章句';
    document.getElementById('classics-subtitle').innerText = '您收藏的經典章句';
    document.getElementById('classics-reader').style.display = 'none';
    document.getElementById('classics-display-tools').style.display = 'none';
    document.getElementById('classics-ctrl-bar').style.display = 'none';
    document.getElementById('classics-menu-list').style.display = 'block';
    var favorites = Array.isArray(gData.classic_favorites) ? gData.classic_favorites : [];
    document.getElementById('classics-menu-list').innerHTML = favorites.length ? favorites.map(function(item) {
        return `<button type="button" class="classic-search-result" onclick="openClassicFavoriteFromPayload('${escapeAttr(encodePayload(item))}')"><div class="classic-search-path">${escapeHtml(item.subject || '經典')}／${escapeHtml(item.title || '')}</div><div class="classic-search-text">${escapeHtml(item.text || '')}</div></button>`;
    }).join('') : '<div class="classic-search-empty">尚未加入自選章句</div>';
}

function openClassicFavoriteFromPayload(payload) {
    var item = decodePayload(payload);
    currentSubject = item.subject || null;
    loadChapterContent(item.title, item.sheet, item.row);
}

// 🔴 3. 顯示篇章列表 (第二層)
function showChapterList(subjectName) {
    currentSubject = subjectName;
    classicsSearchActive = false;
    classicsFavoritesActive = false;
    showClassicSearchPanel(true);
    document.getElementById('classics-nav-title').innerText = subjectName;
    document.getElementById('classics-subtitle').innerText = "請選擇篇章";
    document.getElementById('classics-menu-list').style.display = 'block';
    document.getElementById('classics-reader').style.display = 'none';
    document.getElementById('classics-display-tools').style.display = 'none';
    document.getElementById('classics-ctrl-bar').style.display = 'none';
    
    var chapters = classicsMenuData[subjectName];
    var html = "";
    chapters.forEach(ch => {
        // ch.title 是篇名, ch.sheet 是對應的 Sheet 名稱
        html += `<div class="cms-item" onclick="loadChapterContent('${ch.title}', '${ch.sheet}')" style="padding:15px; border-bottom:1px solid #eee; cursor:pointer;">${ch.title}</div>`;
    });
    document.getElementById('classics-menu-list').innerHTML = html;
}

function showClassicSearchPanel(show) {
    document.getElementById('classics-search-panel').style.display = show ? 'block' : 'none';
}

function resetClassicSearchState() {
    classicsSearchActive = false;
    classicsSearchResults = [];
    classicsSearchTotal = 0;
    classicsSearchTruncated = false;
    classicsSearchRequestId++;
    if (classicsSearchTimer) clearTimeout(classicsSearchTimer);
    classicsSearchTimer = null;

    var input = document.getElementById('classics-search-input');
    var clearButton = document.getElementById('classics-search-clear');
    var status = document.getElementById('classics-search-status');
    if (input) input.value = '';
    if (clearButton) clearButton.hidden = true;
    if (status) status.innerText = '輸入至少兩個字即可跨經典檢索';
}

function handleClassicSearchInput() {
    var input = document.getElementById('classics-search-input');
    var query = input.value.trim();
    document.getElementById('classics-search-clear').hidden = !query;
    if (classicsSearchTimer) clearTimeout(classicsSearchTimer);

    if (query.length < 2) {
        classicsSearchRequestId++;
        if (classicsSearchActive) {
            classicsSearchActive = false;
            classicsSearchResults = [];
            classicsSearchTotal = 0;
            classicsSearchTruncated = false;
            showSubjectList();
        }
        document.getElementById('classics-search-status').innerText = query ? '請再輸入一個字' : '輸入至少兩個字即可跨經典檢索';
        return;
    }

    classicsSearchTimer = setTimeout(function() {
        runClassicSearch(query);
    }, 350);
}

function submitClassicSearch(event) {
    event.preventDefault();
    if (classicsSearchTimer) clearTimeout(classicsSearchTimer);
    var query = document.getElementById('classics-search-input').value.trim();
    if (query.length < 2) {
        document.getElementById('classics-search-status').innerText = '請至少輸入兩個字';
        return;
    }
    runClassicSearch(query);
}

function runClassicSearch(query) {
    var requestId = ++classicsSearchRequestId;
    classicsSearchActive = true;
    currentChapter = null;
    document.getElementById('classics-nav-title').innerText = '跨經典搜尋';
    document.getElementById('classics-subtitle').innerText = '檢索所有既有經典';
    document.getElementById('classics-reader').style.display = 'none';
    document.getElementById('classics-display-tools').style.display = 'none';
    document.getElementById('classics-ctrl-bar').style.display = 'none';
    document.getElementById('classics-menu-list').style.display = 'block';
    document.getElementById('classics-search-status').innerText = '搜尋中...';
    document.getElementById('classics-menu-list').innerHTML = '<div class="classic-search-empty"><div class="spinner" style="margin:0 auto 12px;"></div>正在檢索全部經典</div>';

    callApi('searchClassics', { q: query, limit: 50 }).then(function(res) {
        if (requestId !== classicsSearchRequestId) return;
        if (!res || !res.success) {
            var message = res && res.error ? res.error : '搜尋失敗，請稍後再試';
            renderClassicSearchError(message);
            return;
        }
        classicsSearchResults = Array.isArray(res.list) ? res.list : [];
        classicsSearchTotal = Number(res.total) || classicsSearchResults.length;
        classicsSearchTruncated = !!res.truncated;
        renderClassicSearchResults(query, classicsSearchTotal, classicsSearchTruncated);
    }).catch(function(error) {
        if (requestId !== classicsSearchRequestId) return;
        renderClassicSearchError(error.message || error);
    });
}

function renderClassicSearchResults(query, total, truncated) {
    classicsSearchActive = true;
    showClassicSearchPanel(true);
    document.getElementById('classics-nav-title').innerText = '跨經典搜尋';
    document.getElementById('classics-subtitle').innerText = '檢索所有既有經典';
    document.getElementById('classics-reader').style.display = 'none';
    document.getElementById('classics-menu-list').style.display = 'block';
    document.getElementById('classics-display-tools').style.display = 'none';
    document.getElementById('classics-ctrl-bar').style.display = 'none';
    document.getElementById('classics-search-status').innerText = total ?
        '找到 ' + total + ' 筆' + (truncated ? '，先顯示前 50 筆' : '') : '沒有找到相符章句';

    if (!classicsSearchResults.length) {
        document.getElementById('classics-menu-list').innerHTML = '<div class="classic-search-empty">找不到「' + escapeHtml(query) + '」相關章句</div>';
        return;
    }

    var html = classicsSearchResults.map(function(item) {
        var payload = escapeAttr(encodePayload({
            subject: item.subject,
            title: item.title,
            sheet: item.sheet,
            row: item.row
        }));
        var translation = item.matchedIn === 'translation' && item.translation ?
            '<div class="classic-search-translation">白話：' + escapeHtml(item.translation) + '</div>' : '';
        return '<button type="button" class="classic-search-result" onclick="openClassicSearchResult(\'' + payload + '\')">' +
            '<div class="classic-search-path">' + escapeHtml(item.subject) + '／' + escapeHtml(item.title) + '</div>' +
            '<div class="classic-search-text">' + escapeHtml(item.text) + '</div>' + translation + '</button>';
    }).join('');
    document.getElementById('classics-menu-list').innerHTML = html;
}

function renderClassicSearchError(message) {
    document.getElementById('classics-search-status').innerText = '搜尋失敗';
    document.getElementById('classics-menu-list').innerHTML = '<div class="classic-search-empty">' + escapeHtml(message) + '</div>';
}

function openClassicSearchResult(encodedItem) {
    var item = decodePayload(encodedItem);
    classicsSearchActive = true;
    currentSubject = item.subject;
    loadChapterContent(item.title, item.sheet, item.row);
}

function clearClassicSearch(renderMenu) {
    classicsSearchRequestId++;
    classicsSearchActive = false;
    classicsSearchResults = [];
    classicsSearchTotal = 0;
    classicsSearchTruncated = false;
    var input = document.getElementById('classics-search-input');
    input.value = '';
    document.getElementById('classics-search-clear').hidden = true;
    document.getElementById('classics-search-status').innerText = '輸入至少兩個字即可跨經典檢索';
    if (renderMenu !== false) showSubjectList();
}

function requestClassicContent(sheetName) {
    return callApi('getClassicContentV2', {targetSheet: sheetName}).then(function(res) {
        if (res && res.error && res.error.indexOf('Unknown action: getClassicContentV2') === 0) {
            return callApi('getClassicContent', {targetSheet: sheetName});
        }
        return res;
    });
}

function normalizeClassicPassages(res) {
    if (res && Array.isArray(res.passages)) {
        return res.passages.map(function(passage) {
            return {
                text: toText(passage.text || passage.original).trim(),
                translation: toText(passage.translation).trim(),
                sourceUrl: toText(passage.sourceUrl).trim()
            };
        }).filter(function(passage) { return passage.text; });
    }

    var parser = document.createElement('div');
    parser.innerHTML = res && res.content ? res.content : '';
    return Array.from(parser.querySelectorAll('p')).map(function(paragraph) {
        return { text: paragraph.textContent.trim(), translation: '', sourceUrl: '' };
    }).filter(function(passage) { return passage.text; });
}

// 🔴 4. 載入並顯示內容 (第三層)
function loadChapterContent(title, sheetName, targetRow) {
    currentChapter = title;
    currentChapterSheet = sheetName;
    showClassicSearchPanel(false);
    document.getElementById('classics-menu-list').style.display = 'none';
    document.getElementById('classics-reader').style.display = 'block';
    document.getElementById('classics-display-tools').style.display = 'grid';
    document.getElementById('classics-ctrl-bar').style.display = 'grid';
    document.getElementById('classics-nav-title').innerText = title;
    document.getElementById('classics-subtitle').innerText = "閱讀計時中... 螢幕恆亮";
    
    document.getElementById('classics-reader').innerHTML = '<div style="text-align:center; margin-top:50px;"><div class="spinner"></div><br>載入經文中...</div>';
    
    // 開始計時 & 恆亮
    classicsStartTime = Date.now();
    requestWakeLock();

    requestClassicContent(sheetName).then(res => {
         if(res.success) {
             var passages = normalizeClassicPassages(res);
             CLASSICS_CONTENT = passages.map(function(passage) { return passage.text; }).join('\n');
             var reader = document.getElementById('classics-reader');
              ClassicsReader.renderChapter(reader, {
                  chapterTitle: title,
                  subjectName: currentSubject || '',
                  sheetName: sheetName,
                  passages: passages,
                  sourceUrl: res.sourceUrl || ClassicsReader.sourceForChapter(title),
                  favorites: Array.isArray(gData.classic_favorites) ? gData.classic_favorites : [],
                  onFavoriteToggle: updateClassicFavorite
              });
             
             // 🔴 啟動智慧書籤偵測
             setupReaderObserver();
             // 🔴 恢復閱讀進度
             if (targetRow) {
                 var targetIndex = Math.max(0, Number(targetRow) - 2);
                 var targetPassage = reader.querySelector('.classic-passage[data-passage-index="' + targetIndex + '"]');
                 if (targetPassage) {
                     setTimeout(function() {
                         targetPassage.scrollIntoView({ behavior: 'smooth', block: 'center' });
                         targetPassage.classList.add('reading-active');
                     }, 250);
                 }
             } else {
                 restoreReadingProgress(title);
             }
         } else {
             document.getElementById('classics-reader').innerHTML = `<div style="color:red; text-align:center;">無法讀取內容：${escapeHtml(res.error)}</div>`;
         }
    }).catch(function(error) {
         document.getElementById('classics-reader').innerHTML = `<div style="color:red; text-align:center;">無法讀取內容：${escapeHtml(error.message || error)}</div>`;
    });
}

function updateClassicFavorite(item, selected) {
    var favorites = Array.isArray(gData.classic_favorites) ? gData.classic_favorites.slice() : [];
    favorites = favorites.filter(function(entry) { return entry.id !== item.id; });
    if (selected) favorites.unshift(item);
    gData.classic_favorites = favorites.slice(0, 200);
    if (classicFavoriteSaveTimer) clearTimeout(classicFavoriteSaveTimer);
    classicFavoriteSaveTimer = setTimeout(function() {
        callApi('saveGameData', {u:gUser, p:gPass, data:gData, log:null}).then(function(res) {
            if (res && res.gameData) gData = res.gameData;
        });
    }, 400);
}

// 🔴 新增：設定段落偵測器 (Intersection Observer)
function setupReaderObserver() {
    if (readingObserver) readingObserver.disconnect();
    
    var paragraphs = document.querySelectorAll('#classics-reader .classic-passage');
    totalParagraphs = paragraphs.length;
    currentParagraphIndex = 0; // 重置
    
    var options = {
        root: document.getElementById('classics-reader'),
        threshold: 0.5 // 50% 可見時觸發
    };
    
    readingObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // 找出這個 p 是第幾個
                var allP = Array.from(document.querySelectorAll('#classics-reader .classic-passage'));
                var index = allP.indexOf(entry.target);
                if (index !== -1) {
                    currentParagraphIndex = index;
                    // 移除舊的高亮，加上新的
                    allP.forEach(p => p.classList.remove('reading-active'));
                    entry.target.classList.add('reading-active');
                }
            }
        });
    }, options);
    
    paragraphs.forEach(p => readingObserver.observe(p));
}

// 🔴 新增：恢復閱讀進度
function restoreReadingProgress(chapterTitle) {
    if (!gData.reading_bookmark) gData.reading_bookmark = {};
    
    // 取得上次進度 (段落 index)
    var lastIndex = gData.reading_bookmark[chapterTitle];
    
    if (lastIndex && lastIndex > 0) {
        var paragraphs = document.querySelectorAll('#classics-reader .classic-passage');
        if (paragraphs[lastIndex]) {
            // 自動捲動到該段落
            setTimeout(() => {
                paragraphs[lastIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
                paragraphs[lastIndex].classList.add('reading-active');
            }, 500); // 稍微延遲確保渲染完成
        }
    }
}

// 🔴 5. 返回按鈕邏輯 (整合智慧書籤存檔)
function backToMenu() {
    if (document.getElementById('classics-reader').style.display === 'block') {
        var returnToSearch = classicsSearchActive;
        // 如果在閱讀內文，先結算時間 + 存檔進度
        closeClassics(true); // true 代表只是返回上一層，不完全關閉
        if (returnToSearch) {
            document.getElementById('classics-reader').style.display = 'none';
            document.getElementById('classics-menu-list').style.display = 'block';
            renderClassicSearchResults(
                document.getElementById('classics-search-input').value.trim(),
                classicsSearchTotal,
                classicsSearchTruncated
            );
        } else if (classicsFavoritesActive) {
            showFavoritePassages();
        } else {
            showChapterList(currentSubject); // 返回篇章列表
        }
    } else if (classicsSearchActive) {
        clearClassicSearch();
    } else if (classicsFavoritesActive) {
        showSubjectList();
    } else if (currentSubject) {
        // 如果在篇章列表，返回科目單
        showSubjectList();
    } else {
        // 如果在科目單，就關閉
        closeClassics(false);
    }
}

// 🔴 6. 結算時間 & 書籤 (獨立出來方便呼叫)
function calculateReadTimeAndBookmark() {
    if(!classicsStartTime) return;
    
    var durationSec = Math.floor((Date.now() - classicsStartTime) / 1000);
    classicsStartTime = 0; // 重置
    
    // --- 處理書籤邏輯 ---
    if (!gData.reading_bookmark) gData.reading_bookmark = {};
    
    // 判斷是否讀完 (如果是最後一段)
    if (currentParagraphIndex >= totalParagraphs - 1) {
        // 已讀完，歸零
        gData.reading_bookmark[currentChapter] = 0;
        // 可以選擇是否要跳出恭喜訊息
    } else {
        // 未讀完，記錄當前段落
        gData.reading_bookmark[currentChapter] = currentParagraphIndex;
    }

    // --- 處理時間邏輯 ---
    if(durationSec > 5) { // 讀超過5秒才紀錄
       gData.task_read_time = (gData.task_read_time || 0) + durationSec;
       var min = Math.floor(durationSec / 60);
       
       // 背景同步
       callApi('saveGameData', {
          u:gUser, p:gPass, data:gData, 
          log: { action: "讀經", detail: `${currentChapter || '經典'} (${min}分${durationSec%60}秒)` }
       }).then(() => {
          renderUI(); // 更新首頁時間顯示
          // 可選：提示書籤已儲存
          // alert("進度已儲存"); 
       });
    }
}

// 修改原本的 closeClassics
function closeClassics(isBack) {
    if (document.getElementById('classics-reader').style.display === 'block') {
         calculateReadTimeAndBookmark();
         if(readingObserver) readingObserver.disconnect();
    }
    
    if(window.ClassicsReader) ClassicsReader.stopSpeech(false);
    else if(window.speechSynthesis) window.speechSynthesis.cancel();
    releaseWakeLock();
    
    if (!isBack) {
        document.getElementById('v-classics').classList.remove('active');
        document.getElementById('v-classics').style.display = 'none'; // 🔴 明確隱藏
        document.querySelector('.viewport').style.display = 'flex'; // 🔴 明確顯示主畫面
    }
}

function toggleTTS() {
    if (window.ClassicsReader) ClassicsReader.speakFull();
}

// 🔴 7. 批次爬蟲 (由 APP 觸發)
function runBatchCrawler() {
   if(!confirm("確定要執行新版爬蟲嗎？\n將更新各章節的原文、現代漢語與來源網址。")) return;
   
   loading(true);
   callApi('batchCrawlV2').then(res => {
      loading(false);
      if (res.error && res.error.indexOf('Unknown action: batchCrawlV2') === 0) {
         alert("Apps Script 尚未加入新版經典爬蟲，請先部署 ClassicsUpgrade.gs。");
         return;
      }
      var details = res.errors && res.errors.length ? "\n\n" + res.errors.join("\n") : "";
      alert((res.msg || res.error || "執行完成") + details);
   });
}

// ... Share Logic ...
function loadShareData() {
   var isAdmin = (gData.teamMajor === "主領班" || String(gUser).toUpperCase() === "ADMIN");
   callApi('getShareData', {isAdmin: isAdmin}).then(res => {
      document.getElementById('share-loading').style.display = 'none';
      shareDataList = res.list || [];
      if(isAdmin) renderCmsList();
      var activeList = shareDataList.filter(item => item.isActive);
      if(activeList.length === 0) {
         document.getElementById('share-loading').innerText = "📭 目前沒有推廣內容";
         document.getElementById('share-loading').style.display = 'block';
         document.getElementById('share-container').innerHTML = "";
         return;
      }
      document.getElementById('share-container').style.display = 'flex';
      var html = "";
      activeList.forEach((item, index) => {
         var originalIndex = shareDataList.indexOf(item);
         var firstImg = (item.images && item.images.length>0) ? item.images[0] : "";
         var imgHtml = firstImg ? `<img src="${escapeAttr(firstImg)}" class="share-img" alt="">` : `<div style="text-align:center; color:#ccc; padding:20px; background:#f5f5f5; border-radius:8px; margin-bottom:10px;">無圖片</div>`;
         html += `<div class="share-card">${imgHtml}<div class="share-title">${escapeHtml(item.title)}</div><div class="share-text">${escapeHtml(item.text)}</div><div style="display:flex; gap:5px;"><button class="btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; font-size:11px;" onclick="copyShareText(${originalIndex})">📋 複製文字</button><button class="btn" style="flex:1; background:#00c300; color:#fff; font-size:11px;" onclick="nativeShare(${originalIndex})">💬 分享</button></div></div>`;
      });
      document.getElementById('share-container').innerHTML = html;
   });
}

function copyShareText(index) {
   var text = shareDataList[index].text;
   navigator.clipboard.writeText(text).then(() => alert("文字已複製！"));
}

function openPublicShareModal(){
   cmsUploadFiles=[];
   document.getElementById('modal-title').innerText='新增方便開口包';
   document.getElementById('modal-content').innerHTML=`<label>標題</label><input id="public-share-title" class="input-field" maxlength="60"><label>分享文字</label><textarea id="public-share-text" class="input-field" rows="5" maxlength="2000"></textarea><label class="btn public-upload-btn">選擇圖片（最多 4 張）<input type="file" multiple accept="image/*" hidden onchange="handleCmsFiles(this)"></label><div id="cms-preview" class="preview-grid"></div><button class="btn btn-success" onclick="submitPublicShare()">發布分享</button>`;
   document.getElementById('modal-overlay').style.display='flex';
}

function submitPublicShare(){
   var data={title:document.getElementById('public-share-title').value.trim(),text:document.getElementById('public-share-text').value.trim(),images:cmsUploadFiles.slice(0,4)};
   if(!data.title||!data.text){alert('請填寫標題與分享文字');return;}
   loading(true);
   callApi('addPublicShare',{u:gUser,p:gPass,data:data}).then(function(res){
      loading(false);
      if(!res.success){alert(res.msg||res.error||'發布失敗');return;}
      closeModal(); loadShareData(); alert('已加入方便開口包');
   });
}

async function nativeShare(index) {
   var item = shareDataList[index];
   try { await navigator.clipboard.writeText(item.text); } catch(e){}
   var filesArray = [];
   if(item.images && item.images.length > 0) {
      loading(true);
      try {
         for(var i=0; i<item.images.length; i++) {
            var url = item.images[i];
            var blob = await fetch(url).then(r => r.blob());
            var file = new File([blob], `share_${i}.jpg`, { type: blob.type });
            filesArray.push(file);
         }
      } catch(e) { alert("圖片下載失敗"); }
      loading(false);
   }
   if (navigator.canShare && navigator.canShare({ files: filesArray })) {
      navigator.share({ text: item.text, files: filesArray }).catch(() => {});
   } else {
      alert("不支援原生分享，文字已複製。");
      window.location.href = "https://line.me/R/msg/text/?" + encodeURIComponent(item.text);
   }
}

// ... CMS Logic ...
function switchAdminView(view) {
   ['promo', 'broadcast', 'report', 'goals', 'roles'].forEach(v => document.getElementById('adm-view-'+v).style.display = 'none');
   document.getElementById('adm-view-'+view).style.display = 'block';
}

function loadSeason32GoalReport() {
   var summary = document.getElementById('goal-report-summary');
   var halls = document.getElementById('goal-report-halls');
   var members = document.getElementById('goal-report-members');
   summary.innerHTML = '<div class="goal-report-empty">統計中...</div>';
   halls.innerHTML = '';
   members.innerHTML = '<div class="goal-report-empty">讀取成員目標...</div>';
   callApi('getSeason32GoalReport', {u:gUser, p:gPass}).then(function(res) {
      if (!res.success) {
         season32GoalReportData = null;
         summary.innerHTML = `<div class="goal-report-empty">${escapeHtml(res.error || '讀取失敗')}</div>`;
         members.innerHTML = '';
         return;
      }
      season32GoalReportData = res;
      renderSeason32GoalSummary();
   }).catch(function(err) {
      season32GoalReportData = null;
      summary.innerHTML = `<div class="goal-report-empty">連線失敗：${escapeHtml(err.message || err)}</div>`;
      halls.innerHTML = '';
      members.innerHTML = '';
   });
}

function renderSeason32GoalSummary() {
   if (!season32GoalReportData) return;
   var report = season32GoalReportData;
   var totals = report.totals || {};
   document.getElementById('goal-report-updated').innerText = report.generatedAt
      ? '更新時間 ' + report.generatedAt
      : '每位成員填寫的目標與公堂合計';
   document.getElementById('goal-report-summary').innerHTML =
      `<div class="goal-total-item"><span>已填寫</span><strong>${Number(totals.filledCount)||0} / ${Number(totals.memberCount)||0}</strong></div>` +
      `<div class="goal-total-item"><span>開口目標</span><strong>${Number(totals.spoke)||0}</strong></div>` +
      `<div class="goal-total-item"><span>渡眾目標</span><strong>${Number(totals.convert)||0}</strong></div>` +
      `<div class="goal-total-item"><span>入班目標</span><strong>${Number(totals.joinClass)||0}</strong></div>`;

   document.getElementById('goal-report-halls').innerHTML = (report.halls || []).map(function(hall) {
      return `<div class="goal-hall-card"><div class="goal-hall-title"><strong>${escapeHtml(hall.hall)}</strong><span>${Number(hall.filledCount)||0}/${Number(hall.memberCount)||0} 人已填</span></div><div class="goal-hall-stats"><span>開口 <b>${Number(hall.spoke)||0}</b></span><span>渡眾 <b>${Number(hall.convert)||0}</b></span><span>入班 <b>${Number(hall.joinClass)||0}</b></span></div></div>`;
   }).join('') || '<div class="goal-report-empty">尚無公堂資料</div>';

   var hallFilter = document.getElementById('goal-report-hall-filter');
   var selectedHall = hallFilter.value;
   hallFilter.innerHTML = '<option value="">全部公堂</option>' + (report.halls || []).map(function(hall) {
      return `<option value="${escapeAttr(hall.hall)}">${escapeHtml(hall.hall)}</option>`;
   }).join('');
   if ((report.halls || []).some(function(hall) { return hall.hall === selectedHall; })) {
      hallFilter.value = selectedHall;
   }
   renderSeason32GoalMembers();
}

function renderSeason32GoalMembers() {
   if (!season32GoalReportData) return;
   var hall = document.getElementById('goal-report-hall-filter').value;
   var query = document.getElementById('goal-report-search').value.trim().toLowerCase();
   var members = (season32GoalReportData.members || []).filter(function(member) {
      if (hall && member.hall !== hall) return false;
      return !query || String(member.name || '').toLowerCase().includes(query);
   });
   document.getElementById('goal-report-member-count').innerText = members.length + ' 人';
   document.getElementById('goal-report-members').innerHTML = members.map(function(member) {
      return `<div class="goal-member-row ${member.hasGoals ? '' : 'is-unfilled'}"><div class="goal-member-main"><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.hall)}${member.hasGoals ? '' : ' · 尚未填寫'}</span></div><div class="goal-member-stat"><span>開口</span><strong>${Number(member.spoke)||0}</strong></div><div class="goal-member-stat"><span>渡眾</span><strong>${Number(member.convert)||0}</strong></div><div class="goal-member-stat"><span>入班</span><strong>${Number(member.joinClass)||0}</strong></div></div>`;
   }).join('') || '<div class="goal-report-empty">找不到符合條件的成員</div>';
}
function renderCmsList() {
   var html = "";
   shareDataList.forEach((item, idx) => {
      var statusIcon = item.isActive ? "👁️" : "🔒";
      var statusClass = item.isActive ? "" : "inactive";
      html += `<div class="cms-item ${statusClass}"><div class="cms-info"><div class="cms-title">${statusIcon} ${escapeHtml(item.title)}</div><div class="cms-desc">${escapeHtml(item.text)}</div></div><div class="cms-actions"><button onclick="manageShare('toggle', {index:${idx}})">${item.isActive?'隱藏':'啟用'}</button><button onclick="manageShare('move', {index:${idx}, direction:-1})">⬆️</button><button onclick="manageShare('move', {index:${idx}, direction:1})">⬇️</button><button onclick="openCmsModal('edit', ${idx})">✏️</button><button onclick="manageShare('delete', {index:${idx}})" style="color:red;">🗑️</button></div></div>`;
   });
   document.getElementById('cms-list').innerHTML = html || "無內容";
}
function openCmsModal(mode, idx) {
   var isAdd = mode === 'add';
   var item = isAdd ? {title:"", text:""} : shareDataList[idx];
   cmsUploadFiles = []; 
   var html = `<input id="cms-title" class="input-field" placeholder="標題" value="${escapeAttr(item.title)}"><textarea id="cms-text" class="input-field" rows="4" placeholder="宣傳文案">${escapeHtml(item.text)}</textarea>${isAdd ? `<div style="margin-top:10px;"><label class="btn" style="background:#eee; color:#555; display:inline-block; width:auto; padding:5px 10px; font-size:12px;">📷 選擇圖片 (可多張) <input type="file" multiple accept="image/*" style="display:none;" onchange="handleCmsFiles(this)"></label><div id="cms-preview" class="preview-grid"></div></div>` : ''}<button class="btn btn-primary" onclick="submitCms('${mode}', ${idx})">${isAdd?'🚀 發布':'💾 更新'}</button>`;
   document.getElementById('modal-title').innerText = isAdd ? "新增宣傳" : "編輯內容";
   document.getElementById('modal-content').innerHTML = html;
   document.getElementById('modal-overlay').style.display = 'flex';
}
async function handleCmsFiles(input) {
   cmsUploadFiles = [];
   document.getElementById('cms-preview').innerHTML = "";
   if(!input.files) return;
   var files=Array.from(input.files).slice(0,4);
   if(input.files.length>4) alert('一次最多選擇 4 張圖片');
   var prepared=await Promise.all(files.map(prepareShareImage));
   prepared.forEach(function(image){cmsUploadFiles.push({base64:image.dataUrl.split(',')[1],name:image.name});document.getElementById('cms-preview').insertAdjacentHTML('beforeend',`<img src="${escapeAttr(image.dataUrl)}" class="preview-img" alt="">`);});
}

function prepareShareImage(file){
   return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onerror=reject;
      reader.onload=function(event){
         var image=new Image();
         image.onerror=reject;
         image.onload=function(){
            var scale=Math.min(1,1600/Math.max(image.width,image.height));
            var canvas=document.createElement('canvas');
            canvas.width=Math.max(1,Math.round(image.width*scale)); canvas.height=Math.max(1,Math.round(image.height*scale));
            canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
            resolve({name:file.name,dataUrl:canvas.toDataURL('image/jpeg',0.82)});
         };
         image.src=event.target.result;
      };
      reader.readAsDataURL(file);
   });
}
function submitCms(mode, idx) {
   var title = document.getElementById('cms-title').value;
   var text = document.getElementById('cms-text').value;
   if(!title || !text) { alert("請填寫完整"); return; }
   var payload = { title: title, text: text, index: idx };
   if(mode === 'add') { payload.images = cmsUploadFiles; }
   loading(true);
   callApi('manageShare', {subAction: mode, data: payload}).then(res => {
      loading(false);
      if(res.success) { alert(res.msg); closeModal(); loadShareData(); } else { alert("失敗: " + res.msg); }
   });
}
function manageShare(action, data) {
   if(action === 'delete' && !confirm("確定刪除？")) return;
   loading(true);
   callApi('manageShare', {subAction: action, data: data}).then(res => {
      loading(false);
      if(res.success) loadShareData();
   });
}

// ... Other Features ...
function loadEvents() {
   document.getElementById('event-list').innerHTML = '<div style="text-align:center; padding:20px; color:#ccc;">載入中...</div>';
   return callApi('getYearlyEvents', {u:gUser, p:gPass}).then(res => {
      if(res.error) { document.getElementById('event-list').innerHTML = `<div style="text-align:center; color:#f44336;">${res.error}</div>`; return; }
      allEvents = res.list || [];
       eventCategories = res.cats || [];
       eventCanManage = !!res.canManage;
       eventCanAdd = !!res.canAdd;
       document.getElementById('event-add-btn').hidden = !eventCanAdd;
      initFilters();
      var filterHtml = `<div class="chip ${activeFilters.length===0?'active':''}" onclick="toggleFilter('all', this)">全部</div>`;
      eventCategories.forEach(c => { var isActive = activeFilters.includes(c) ? 'active' : ''; filterHtml += `<div class="chip ${isActive}" onclick="toggleFilterFromPayload('${escapeAttr(encodePayload(c))}', this)">${escapeHtml(c)}</div>`; });
      document.getElementById('event-filters').innerHTML = filterHtml;
      renderEventList();
   });
}
function initFilters() { if(gData.teamMajor === "主領班" || String(gUser).toUpperCase() === "ADMIN") { activeFilters = []; } else { activeFilters = ["中央", "賢德", "仙佛紀念日"]; if(gData.teamMajor && gData.teamMajor.includes("賢")) activeFilters.push(gData.teamMajor); if(gData.teamMinor) activeFilters.push(gData.teamMinor+"專屬"); } }
function toggleFilterFromPayload(payload, element) { toggleFilter(decodePayload(payload), element); }
function toggleFilter(cat, el) { if(cat === 'all') { activeFilters = []; var chips = document.querySelectorAll('.chip'); chips.forEach(c => c.classList.remove('active')); el.classList.add('active'); } else { document.querySelector('.chip:first-child').classList.remove('active'); if(activeFilters.includes(cat)) { activeFilters = activeFilters.filter(c => c !== cat); el.classList.remove('active'); } else { activeFilters.push(cat); el.classList.add('active'); } } renderEventList(); }
function renderEventList() {
   var today = new Date(); today.setHours(0,0,0,0);
   var html = "", hasScrolled = false, historyAdded = false, hasPastRendered = false;
   var weekDays = ["日", "一", "二", "三", "四", "五", "六"];
   allEvents.forEach(function(eventItem) {
      if(activeFilters.length > 0 && !activeFilters.includes(eventItem.cat)) return;
      var start = new Date(eventItem.date), end = new Date(eventItem.end);
      var isPast = end < today, isTodayOrFuture = end >= today;
      if(!historyAdded && isTodayOrFuture && hasPastRendered) { html += '<div class="history-line">以上是歷史活動</div>'; historyAdded = true; }
      var day = start.getDate(), month = start.getMonth() + 1, week = weekDays[start.getDay()];
      var difference = Math.ceil((start - today) / 86400000), dateText = '';
      if(eventItem.date !== eventItem.end) {
         var endDay = end.getDate(), endMonth = end.getMonth() + 1;
         dateText = `📅 ${month}/${day} ~ ${endMonth}/${endDay}`;
         day = `${day}-${endDay}`;
         if(difference > 0) dateText += ` (還有${difference}天)`;
         else if(end >= today) dateText += ' (進行中)';
      } else if(difference === 0) dateText = '<span style="color:red; font-weight:bold;">今天!</span>';
      else if(difference > 0) dateText = `還有 ${difference} 天`;
      else dateText = '已結束';
      var focusId = '';
      if(!hasScrolled && isTodayOrFuture) { focusId = ' id="today-focus"'; hasScrolled = true; }
      if(isPast) hasPastRendered = true;
       var editButton = eventItem.canEdit ? `<button type="button" class="event-edit-btn" title="編輯活動" aria-label="編輯活動" onclick="editEventFromPayload('${escapeAttr(encodePayload(eventItem))}')">✎</button>` : '';
       var hallBadge = eventItem.scope==='hall' ? `<span class="event-hall-badge">${escapeHtml(eventItem.hall)}專屬</span>` : '';
       html += `<div${focusId} class="event-card ${isPast?'past':''} ${focusId?'focus':''}"><div class="event-date-box" style="border-left:5px solid ${getTagColor(eventItem.cat)}"><div class="event-month">${month}月</div><div class="event-day" style="font-size:${day.toString().length>2?'14px':'18px'}">${day}</div><div style="font-size:10px; margin-top:-2px;">週${week}</div></div><div class="event-info"><div class="event-title">${escapeHtml(eventItem.name)} ${hallBadge}</div>${eventItem.note?`<div class="event-note">${escapeHtml(eventItem.note)}</div>`:''}<div class="event-meta"><span class="tag" style="background:${getTagColor(eventItem.cat)}">${escapeHtml(eventItem.cat)}</span><span>📍 ${escapeHtml(eventItem.loc||'--')}</span><span class="event-date-text">${dateText}</span>${editButton}</div></div></div>`;
   });
   document.getElementById('event-list').innerHTML = html || '<div style="text-align:center; color:#999; padding:20px;">沒有活動</div>';
   setTimeout(function(){ var focus=document.getElementById('today-focus'); if(focus) focus.scrollIntoView({behavior:'smooth',block:'center'}); },300);
}
function getTagColor(cat) { if(!cat) return "#ccc"; if(cat.includes("仙佛")) return "#fbc02d"; if(cat.includes("賢德")) return "#8bc34a"; if(cat.includes("中央")) return "#ff7043"; if(cat.includes("中") || cat.includes("北") || cat.includes("南")) return "#29b6f6"; return "#9e9e9e"; }

function editEventFromPayload(payload) { editEvent(decodePayload(payload)); }
function editEvent(item) {
   if((item&&item.id&&!eventCanManage)||(!item&&!eventCanAdd)) return;
   item = item || {id:0,name:'',date:'',end:'',cat:'北賢',loc:'',note:''};
   if(!eventCanManage&&!item.id) item.cat=(gData.teamMinor||'公堂')+'專屬';
   var categories = eventCategories.slice();
   if(!eventCanManage) categories=[gData.teamMinor+'專屬'];
   if(item.cat && !categories.includes(item.cat)) categories.push(item.cat);
   var options = categories.map(function(category){ return `<option value="${escapeAttr(category)}" ${category===item.cat?'selected':''}>${escapeHtml(category)}</option>`; }).join('');
   document.getElementById('modal-title').innerText = item.id ? '編輯活動' : '新增活動';
   var deleteButton=item.id&&eventCanManage?`<button class="btn event-delete-btn" onclick="deleteEventItem('${escapeAttr(item.id)}')">刪除活動</button>`:'';
   var scopeFields=eventCanManage?`<label>顯示範圍</label><select id="event-scope" class="input-field"><option value="global" ${item.scope!=='hall'?'selected':''}>全部成員</option><option value="hall" ${item.scope==='hall'?'selected':''}>限定公堂</option></select><label>限定公堂</label><input id="event-hall" class="input-field" value="${escapeAttr(item.hall||'')}" placeholder="留空代表全部">`:`<input id="event-scope" type="hidden" value="hall"><input id="event-hall" type="hidden" value="${escapeAttr(gData.teamMinor||'')}"><div class="event-permission-note">此活動僅顯示給 ${escapeHtml(gData.teamMinor||'本公堂')} 成員</div>`;
   document.getElementById('modal-content').innerHTML = `<input id="event-id" type="hidden" value="${escapeAttr(item.id||0)}"><label>活動名稱</label><input id="event-name" class="input-field" value="${escapeAttr(item.name)}"><label>開始日期</label><input id="event-date" type="date" class="input-field" value="${escapeAttr(item.date)}"><label>結束日期</label><input id="event-end" type="date" class="input-field" value="${escapeAttr(item.end||item.date)}"><label>分類</label><select id="event-cat" class="input-field">${options}</select>${scopeFields}<label>地點</label><input id="event-loc" class="input-field" value="${escapeAttr(item.loc)}"><label>備註</label><textarea id="event-note" class="input-field" rows="3">${escapeHtml(item.note)}</textarea><button class="btn btn-primary" onclick="saveEventItem()">儲存活動</button>${deleteButton}`;
   document.getElementById('modal-overlay').style.display = 'flex';
}
function saveEventItem() {
   var item = {id:document.getElementById('event-id').value,name:document.getElementById('event-name').value,date:document.getElementById('event-date').value,end:document.getElementById('event-end').value,cat:document.getElementById('event-cat').value,scope:document.getElementById('event-scope').value,hall:document.getElementById('event-hall').value,loc:document.getElementById('event-loc').value,note:document.getElementById('event-note').value};
   loading(true);
   callApi('saveCalendarEvent',{u:gUser,p:gPass,item:item}).then(function(res){ loading(false); if(!res.success){ alert(res.error||'儲存失敗'); return; } closeModal(); loadEvents(); });
}

function crmStatusClass(status) { if(String(status).includes('開口')) return 's-spoke'; if(String(status).includes('入班')||String(status).includes('求道')) return 's-join'; return 's-plan'; }
function loadCRM(targetUser) {
   var target = targetUser || gUser;
   if(!targetUser) document.getElementById('crm-list').innerHTML = '<div style="text-align:center; color:#999;">載入中...</div>';
   return callApi('getCRM',{u:gUser,p:gPass,target:target}).then(function(res){
      if(res.error){ alert(res.error); return; }
      var list=res.list||[];
      if(targetUser){
         var html=`<h4>👤 ${escapeHtml(targetUser)} 的記事本</h4>`;
         if(!list.length) html+='<p>尚無資料</p>';
         list.forEach(function(item){ var notes=(item.notes||[]).map(function(note){ return `<div class="crm-note-log"><div class="crm-note-meta"><span>${escapeHtml(note.author)} · ${escapeHtml(note.time)}</span></div><div class="crm-note-text">${escapeHtml(note.text)}</div></div>`; }).join(''); html+=`<div class="crm-card" style="cursor:default; background:#f9f9f9;"><div class="crm-header"><div class="crm-name">${escapeHtml(item.name)}</div><div class="crm-status ${crmStatusClass(item.status)}">${escapeHtml(item.status)}</div></div><div class="crm-note">${item.todo?'📝 '+escapeHtml(item.todo):'無待辦'}</div><div class="crm-owner">建立者：${escapeHtml(item.owner)}</div>${notes}</div>`; });
         document.getElementById('modal-content').innerHTML=html;
      } else {
         crmData=list; crmMemberOptions=res.members||[]; renderCRM();
      }
   });
}
function renderCRM() {
   var todoHtml='', listHtml='';
   crmData.forEach(function(item){
      if(item.todo) todoHtml+=`<div class="todo-item"><input type="checkbox" class="todo-check" onclick="completeTodoFromPayload('${escapeAttr(encodePayload(item.recordId))}')"><div class="todo-text"><div style="font-weight:bold;">${escapeHtml(item.name)}</div><div>${escapeHtml(item.todo)}</div></div></div>`;
      var notes=item.notes||[], latest=notes.length?notes[notes.length-1]:null;
      var summary=item.todo?'📝 '+escapeHtml(item.todo):(latest?escapeHtml(latest.text):'尚無備註');
      var sharedCount=(item.sharedWith||[]).length;
      listHtml+=`<div class="crm-card" onclick="editCRMFromPayload('${escapeAttr(encodePayload(item))}')"><div class="crm-header"><div class="crm-name">${escapeHtml(item.name)} ${item.remind?'⏰':''} ${sharedCount?'👥':''}</div><div class="crm-status ${crmStatusClass(item.status)}">${escapeHtml(item.status)}</div></div><div class="crm-note">${summary}</div><div class="crm-owner">建立者：${escapeHtml(item.owner)}${sharedCount?' · 共同成全 '+sharedCount+' 人':''}</div></div>`;
   });
   document.getElementById('crm-todo-list').innerHTML=todoHtml||'<div style="text-align:center; color:#999; font-size:12px;">無待辦事項</div>';
   document.getElementById('crm-list').innerHTML=listHtml||'<div style="text-align:center; color:#999; margin-top:20px;">點擊右下角 + 新增名單</div>';
}
function editCRMFromPayload(payload) { editCRM(decodePayload(payload)); }
function renderCRMShareSection(item,isNew) {
   if(!isNew&&!item.isOwner) return `<div class="crm-share-section"><strong>共同成全</strong><div class="crm-owner">${[item.owner].concat(item.sharedWith||[]).map(escapeHtml).join('、')}</div></div>`;
   var selected=item.sharedWith||[];
   crmCrossHallSelected = new Set(selected);
   var localMap={}; crmMemberOptions.forEach(function(name){ localMap[name]=true; });
   var options=crmMemberOptions.map(function(name){ return `<label class="crm-share-option"><input type="checkbox" data-crm-member data-crm-local value="${escapeAttr(name)}" ${selected.includes(name)?'checked':''} onchange="syncCRMCrossHallSelection()"><span>${escapeHtml(name)}</span></label>`; }).join('');
   var crossSelected=selected.filter(function(name){ return !localMap[name]; }).map(function(name){ return `<label class="crm-share-option crm-cross-selected"><input type="checkbox" data-crm-member value="${escapeAttr(name)}" checked onchange="syncCRMCrossHallSelection()"><span>${escapeHtml(name)}</span></label>`; }).join('');
   return `<div class="crm-share-section"><strong>共同成全</strong><label class="crm-share-option crm-share-all"><input id="crm-share-all" type="checkbox" onchange="toggleAllCRMShareMembers(this.checked)"><span>選擇公堂全部成員</span></label><div class="crm-share-list">${options||'<span class="crm-owner">目前沒有可選成員</span>'}</div><div class="crm-cross-hall"><label for="crm-member-search">搜尋跨公堂成員</label><input id="crm-member-search" type="search" class="input-field" placeholder="輸入姓名或公堂" oninput="searchCRMCrossHallMembers(this.value)"><div id="crm-cross-selected" class="crm-share-list">${crossSelected}</div><div id="crm-member-search-results" class="crm-member-search-results"></div></div></div>`;
}

function searchRoleMembers(){
   var query=document.getElementById('role-search').value.trim();
   var box=document.getElementById('role-member-list');
   box.innerHTML='<div class="crm-owner">搜尋中...</div>';
   callApi('searchUsersForRole',{u:gUser,p:gPass,q:query}).then(function(res){
      if(!res.success){box.innerHTML=`<div class="crm-owner">${escapeHtml(res.error||'搜尋失敗')}</div>`;return;}
      box.innerHTML=(res.list||[]).map(function(user){return `<div class="role-member-row"><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.major)}｜${escapeHtml(user.minor)}</small></div><select aria-label="${escapeAttr(user.name)}身分" onchange="setRoleMemberFromPayload('${escapeAttr(encodePayload(user.name))}',this.value)"><option value="成員" ${user.role!=='學長姐'?'selected':''}>成員</option><option value="學長姐" ${user.role==='學長姐'?'selected':''}>學長姐</option></select></div>`;}).join('')||'<div class="crm-owner">找不到成員</div>';
   });
}

function setRoleMemberFromPayload(payload,role){
   var target=decodePayload(payload);
   callApi('setUserRole',{u:gUser,p:gPass,target:target,role:role}).then(function(res){if(!res.success)alert(res.error||'更新失敗');});
}
function deleteEventItem(id){ if(!eventCanManage||!confirm('確定刪除這個活動？')) return; loading(true); callApi('deleteCalendarEvent',{u:gUser,p:gPass,id:id}).then(function(res){ loading(false); if(!res.success){alert(res.error||'刪除失敗');return;} closeModal(); loadEvents(); }); }
function renderCRMNoteLogs(item) {
   var notes=item.notes||[];
   if(!notes.length) return '<div class="crm-owner">尚無備註</div>';
   return notes.map(function(note){ return `<div class="crm-note-log"><div class="crm-note-meta"><span>${escapeHtml(note.author)} · ${escapeHtml(note.time)}</span><button type="button" class="crm-note-delete" title="刪除備註" aria-label="刪除備註" onclick="deleteCRMNoteFromPayload('${escapeAttr(encodePayload({noteId:note.id,recordId:item.recordId}))}')">×</button></div><div class="crm-note-text">${escapeHtml(note.text)}</div></div>`; }).join('');
}
function editCRM(item) {
   var isNew=!item;
   item=item||{recordId:'',name:'',status:'預計渡眾',todo:'',remind:'',repeat:'none',sharedWith:[],notes:[],isOwner:true,canDelete:true};
   var notesSection=isNew?'<label>第一則備註（選填）</label><textarea id="e-new-note" class="input-field" rows="3"></textarea>':`<div class="crm-share-section"><strong>備註紀錄</strong>${renderCRMNoteLogs(item)}<label style="display:block; margin-top:12px;">新增備註</label><textarea id="e-new-note" class="input-field" rows="3" placeholder="輸入新的跟進紀錄"></textarea><button type="button" class="btn btn-success" onclick="addCRMNoteFromEditor()">新增備註</button></div>`;
   var html=`<input id="e-record-id" type="hidden" value="${escapeAttr(item.recordId)}"><input id="e-is-new" type="hidden" value="${isNew?'1':'0'}"><label>姓名</label><input id="e-name" class="input-field" value="${escapeAttr(item.name)}" placeholder="對象姓名"><label>狀態</label><select id="e-status" class="input-field"><option ${item.status==='預計渡眾'?'selected':''}>預計渡眾</option><option ${item.status==='已開口'?'selected':''}>已開口</option><option ${item.status==='跟進中'?'selected':''}>跟進中</option><option ${item.status==='已求道'?'selected':''}>已求道</option><option ${item.status==='已入班'?'selected':''}>已入班</option></select><label>下一步 / 待辦</label><input id="e-todo" class="input-field" value="${escapeAttr(item.todo)}" placeholder="例如：約吃飯、送書">${renderCRMShareSection(item,isNew)}<div style="margin-bottom:12px; padding:10px; background:#f3f6e3; border-radius:6px;"><label>⏰ 我的提醒</label><input id="e-remind" type="datetime-local" class="input-field" value="${escapeAttr(item.remind)}"><label>重複頻率</label><select id="e-repeat" class="input-field"><option value="none" ${item.repeat==='none'?'selected':''}>單次提醒</option><option value="daily" ${item.repeat==='daily'?'selected':''}>每天</option><option value="weekly" ${item.repeat==='weekly'?'selected':''}>每週</option><option value="monthly" ${item.repeat==='monthly'?'selected':''}>每月</option></select></div>${notesSection}<button class="btn btn-primary" onclick="saveCRMItem()">儲存名單資料</button>${!isNew&&item.canDelete?`<button class="btn" style="background:#eee; color:#c62828; margin-top:10px;" onclick="deleteCRMItemFromPayload('${escapeAttr(encodePayload(item.recordId))}')">刪除整份名單</button>`:''}`;
   document.getElementById('modal-title').innerText=isNew?'新增名單':'共同成全名單';
   document.getElementById('modal-content').innerHTML=html;
   document.getElementById('modal-overlay').style.display='flex';
}
function toggleAllCRMShareMembers(checked){ document.querySelectorAll('[data-crm-local]').forEach(function(input){ input.checked=checked; }); syncCRMCrossHallSelection(); }
function syncCRMCrossHallSelection(){ document.querySelectorAll('[data-crm-member]').forEach(function(input){ if(input.checked) crmCrossHallSelected.add(input.value); else crmCrossHallSelected.delete(input.value); }); }
function selectedCRMShareMembers(){ syncCRMCrossHallSelection(); return Array.from(crmCrossHallSelected); }
function searchCRMCrossHallMembers(query){
   if(crmMemberSearchTimer) clearTimeout(crmMemberSearchTimer);
   var box=document.getElementById('crm-member-search-results');
   if(!box) return;
   query=String(query||'').trim();
   if(!query){ box.innerHTML=''; return; }
   box.innerHTML='<div class="crm-owner">搜尋中...</div>';
   crmMemberSearchTimer=setTimeout(function(){
      callApi('searchCRMShareMembers',{u:gUser,p:gPass,q:query}).then(function(res){
         if(!box || !document.body.contains(box)) return;
         if(!res.success){ box.innerHTML=`<div class="crm-owner">${escapeHtml(res.error||'搜尋失敗')}</div>`; return; }
         var local={}; crmMemberOptions.forEach(function(name){local[name]=true;});
         var list=(res.list||[]).filter(function(user){return !local[user.name]&&!crmCrossHallSelected.has(user.name);});
         box.innerHTML=list.map(function(user){ var checked=crmCrossHallSelected.has(user.name)?'checked':''; return `<label class="crm-member-search-result"><input type="checkbox" data-crm-member value="${escapeAttr(user.name)}" ${checked} onchange="syncCRMCrossHallSelection()"><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.major)}｜${escapeHtml(user.minor)}</small></span></label>`; }).join('')||'<div class="crm-owner">找不到跨公堂成員</div>';
      });
   },300);
}
function saveCRMItem() {
   var isNew=document.getElementById('e-is-new').value==='1';
   var item={recordId:document.getElementById('e-record-id').value,name:document.getElementById('e-name').value,status:document.getElementById('e-status').value,todo:document.getElementById('e-todo').value,remind:document.getElementById('e-remind').value,repeat:document.getElementById('e-repeat').value,sharedWith:selectedCRMShareMembers(),initialNote:isNew?document.getElementById('e-new-note').value:''};
   if(!item.name){ alert('請輸入姓名'); return; }
   loading(true); callApi('saveCRM',{u:gUser,p:gPass,item:item}).then(function(res){ loading(false); if(!res.success){ alert(res.error||'儲存失敗'); return; } closeModal(); loadCRM(); });
}
function addCRMNoteFromEditor(){ var recordId=document.getElementById('e-record-id').value, text=document.getElementById('e-new-note').value.trim(); if(!text){ alert('請輸入備註'); return; } loading(true); callApi('addCRMNote',{u:gUser,p:gPass,recordId:recordId,note:text}).then(function(res){ loading(false); if(!res.success){ alert(res.error||'新增失敗'); return; } refreshCRMEditor(recordId); }); }
function deleteCRMNoteFromPayload(payload){ var data=decodePayload(payload); if(!confirm('確定刪除這則備註？')) return; loading(true); callApi('deleteCRMNote',{u:gUser,p:gPass,noteId:data.noteId}).then(function(res){ loading(false); if(!res.success){ alert(res.error||'刪除失敗'); return; } refreshCRMEditor(data.recordId); }); }
function refreshCRMEditor(recordId){ loadCRM().then(function(){ var item=crmData.find(function(entry){ return entry.recordId===recordId; }); if(item) editCRM(item); }); }
function deleteCRMItemFromPayload(payload){ deleteCRMItem(decodePayload(payload)); }
function deleteCRMItem(recordId){ if(!confirm('只有原始建立者可以刪除。確定刪除整份名單？')) return; loading(true); callApi('deleteCRM',{u:gUser,p:gPass,recordId:recordId}).then(function(res){ loading(false); if(!res.success){ alert(res.error||'刪除失敗'); return; } closeModal(); loadCRM(); }); }
function completeTodoFromPayload(payload){ completeTodo(decodePayload(payload)); }
function completeTodo(recordId){ if(!confirm('完成此待辦事項？')) return; var item=crmData.find(function(entry){ return entry.recordId===recordId; }); if(item){ item.todo=''; loading(true); callApi('saveCRM',{u:gUser,p:gPass,item:item}).then(function(res){ loading(false); if(!res.success){ alert(res.error||'更新失敗'); return; } loadCRM(); }); } }
function openAdminCRMFromPayload(payload) { openAdminCRM(decodePayload(payload)); }
function openAdminCRM(userName) { document.getElementById('modal-overlay').style.display = 'flex'; document.getElementById('modal-title').innerText = "載入中..."; document.getElementById('modal-content').innerHTML = "請稍候..."; loadCRM(userName); }

function initRegDropdowns(){ 
    var s=document.getElementById('r-maj'), opts="<option disabled selected>選擇團隊</option>"; 
    for(var k in menuConfig){ opts += `<option value="${k}">${k}</option>`; } 
    s.innerHTML = opts; 
}

function initAdminDropdowns(){ 
    var s=document.getElementById('adm-maj'), opts="<option value='全部'>全部團隊</option>"; 
    for(var k in menuConfig){ opts += `<option value="${k}">${k}</option>`; } 
    s.innerHTML = opts; 
    admUpdMin(); 
}

// 🔴 核心修復：把 admUpdMin 展開，避免被吃掉
function admUpdMin(){ 
    var m=document.getElementById('adm-maj').value, s=document.getElementById('adm-min'); 
    s.innerHTML="<option value='全部'>全部公堂</option>"; 
    if(m !== '全部' && menuConfig[m]) { 
        menuConfig[m].forEach(x => { 
            var o=document.createElement('option'); o.value=x; o.innerText=x; s.appendChild(o); 
        }); 
    } 
}

function loadAdminFilters() { 
    if(Object.keys(menuConfig).length > 0) { 
        initAdminDropdowns(); 
    } else { 
        callApi('getConfig').then(cfg => { 
            menuConfig = cfg.menu; 
            initAdminDropdowns(); 
        }); 
    } 
}

function updMinor(){ var m=document.getElementById('r-maj').value, s=document.getElementById('r-min'); s.innerHTML=""; if(menuConfig[m]) menuConfig[m].forEach(x => { var o=document.createElement('option'); o.value=x; o.innerText=x; s.appendChild(o); }); }
function toggleAuth(t){ document.getElementById('f-login').style.display=t=='login'?'block':'none'; document.getElementById('f-reg').style.display=t=='register'?'block':'none'; }
function nav(t){ ['home','orchard','profile','admin','crm','events'].forEach(x=>{ document.getElementById('v-'+x).classList.remove('active'); document.getElementById('n-'+x).classList.remove('active'); }); document.getElementById('v-'+t).classList.add('active'); document.getElementById('n-'+t).classList.add('active'); }
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }
function toggleAdmDateInput() { var mode = document.getElementById('adm-mode').value; document.getElementById('adm-date-box').style.display = mode==='date' ? 'block' : 'none'; document.getElementById('adm-month-box').style.display = mode==='month' ? 'block' : 'none'; }
function doReg(){ var u=document.getElementById('r-u').value, p=document.getElementById('r-p').value, maj=document.getElementById('r-maj').value, min=document.getElementById('r-min').value; if(!u||!p||!maj||!min){ alert("請填寫完整"); return; } loading(true); callApi('register', {u:u, p:p, maj:maj, min:min}).then(r => { loading(false); alert(r.msg); if(r.success) toggleAuth('login'); }); }
function doLogin(){ 
   var u=document.getElementById('l-u').value, p=document.getElementById('l-p').value; 
   loading(true); 
   callApi('login', {u:u, p:p}).then(r => { 
      loading(false); 
      if(r.success){ 
         gUser=u; gPass=p; gData=r.gameData; 
         localStorage.setItem("xd_u",u); localStorage.setItem("xd_p",p); 
         if(window.OneSignal) OneSignal.User.addTag("user", u);
         loadShareData();
         lastLogTime = new Date().getTime(); 
         if(gData.teamMajor === "主領班" || String(gUser).toUpperCase() === "ADMIN") { document.getElementById('n-admin').style.display = 'block'; }
         enterGame(); 
      } else { alert(r.msg); } 
   }); 
}
function enterGame(){ document.getElementById('auth-screen').style.display='none'; document.getElementById('game-screen').style.display='flex'; renderUI(); }
function logout(){ if(confirm("登出?")){ localStorage.removeItem("xd_p"); location.reload(); } }
function renderUI(){ document.getElementById('ui-team').innerText = gData.teamFull; document.getElementById('p-job').innerText = gData.memberRole==='學長姐' ? (gData.job+'｜學長姐') : gData.job; updateDashboard(); renderSeason32Goals(true); var ck = document.getElementById('ck-sport'); if(gData.task_sport_done){ ck.style.background='var(--primary)'; ck.style.borderColor='var(--primary)'; } else { ck.style.background='transparent'; ck.style.borderColor='#ddd'; } updTimer(gData.task_read_time||0); }
function addCount(id) { var el = document.getElementById(id); el.value = parseInt(el.value || 0) + 1; updateDashboard(); }
function minusCount(id) { var el = document.getElementById(id); var val = parseInt(el.value || 0); if (val > 0) { el.value = val - 1; updateDashboard(); } }
function updateDashboard() { var addS = parseInt(document.getElementById('inp-spoke').value||0); var addC = parseInt(document.getElementById('inp-conv').value||0); var addCl = parseInt(document.getElementById('inp-class').value||0); var totalS = (gData.spoke_count||0) + addS; var totalC = (gData.convert_count||0) + addC; var totalCl = (gData.class_count||0) + addCl; document.getElementById('today-dash').innerText = `📊 今日已累積：開口 ${totalS} | 渡眾 ${totalC} | 入班 ${totalCl}`; }
function toggleTimer(){ 
   var b = document.getElementById('btn-timer'); 
   if(isTimer){ 
      clearInterval(timerInt); isTimer=false; b.innerText="繼續計時"; b.className="btn btn-primary"; 
      // 🔴 停止時釋放
      releaseWakeLock(); 
      saveData({action:"讀書", detail:"累計 "+Math.floor(gData.task_read_time/60)+" 分鐘"}); 
   } else { 
      timerInt = setInterval(function(){ gData.task_read_time=(gData.task_read_time||0)+1; updTimer(gData.task_read_time); }, 1000); 
      isTimer=true; b.innerText="暫停計時"; b.className="btn btn-warn"; 
      // 🔴 開始時鎖定
      requestWakeLock(); 
   } 
}
function updTimer(s){ var m=Math.floor(s/60), sec=s%60; document.getElementById('timer-display').innerText = (m<10?"0"+m:m)+":"+(sec<10?"0"+sec:sec); }
function toggleSport(){ if(gData.task_sport_done) return; gData.task_sport_done = true; renderUI(); saveData({action:"運動", detail:"完成今日30分鐘運動！"}); }
function saveAchievements(){ var addS = parseInt(document.getElementById('inp-spoke').value||0); var addC = parseInt(document.getElementById('inp-conv').value||0); var addCl = parseInt(document.getElementById('inp-class').value||0); if(addS==0 && addC==0 && addCl==0) { alert("請輸入數量"); return; } gData.spoke_count = (gData.spoke_count||0) + addS; gData.convert_count = (gData.convert_count||0) + addC; gData.class_count = (gData.class_count||0) + addCl; loading(true); var msg = `開口${addS}, 渡眾${addC}, 入班${addCl}`; callApi('saveGameData', {u:gUser, p:gPass, data:gData, log:{action:"回報成果", detail: msg}}).then(r => { loading(false); if(r.gameData) gData = r.gameData; document.getElementById('inp-spoke').value=0; document.getElementById('inp-conv').value=0; document.getElementById('inp-class').value=0; renderUI(); alert("📜 紀錄已同步！"); }); }
function season32GoalValue(value) { var number = parseInt(value, 10); return Number.isFinite(number) && number > 0 ? number : 0; }
function season32Metrics() { return { spoke:(Number(gData.total_spoke)||0)+(Number(gData.spoke_count)||0), convert:(Number(gData.total_convert)||0)+(Number(gData.convert_count)||0), joinClass:(Number(gData.total_class)||0)+(Number(gData.class_count)||0) }; }
function renderSeason32Goal(name, achieved, target) { var percent = target > 0 ? Math.min(100, Math.round(achieved / target * 100)) : 0; document.getElementById('goal-'+name+'-label').innerText = achieved + ' / ' + target; document.getElementById('goal-'+name+'-progress').style.width = percent + '%'; }
function renderSeason32Goals(syncInputs) { var goals = gData.season32_goals || {}; if(syncInputs) { document.getElementById('goal-spoke').value = season32GoalValue(goals.spoke); document.getElementById('goal-convert').value = season32GoalValue(goals.convert); document.getElementById('goal-class').value = season32GoalValue(goals.joinClass); } var metrics = season32Metrics(); renderSeason32Goal('spoke', metrics.spoke, season32GoalValue(document.getElementById('goal-spoke').value)); renderSeason32Goal('convert', metrics.convert, season32GoalValue(document.getElementById('goal-convert').value)); renderSeason32Goal('class', metrics.joinClass, season32GoalValue(document.getElementById('goal-class').value)); }
function saveSeason32Goals() { gData.season32_goals = { spoke:season32GoalValue(document.getElementById('goal-spoke').value), convert:season32GoalValue(document.getElementById('goal-convert').value), joinClass:season32GoalValue(document.getElementById('goal-class').value) }; loading(true); callApi('saveGameData', {u:gUser,p:gPass,data:gData,log:null}).then(function(res){ loading(false); if(!res.success){ alert(res.error||res.msg||'儲存失敗'); return; } if(res.gameData) gData=res.gameData; renderSeason32Goals(true); alert('立愿目標已儲存'); }); }
function saveData(logObj){ return callApi('saveGameData', {u:gUser, p:gPass, data:gData, log:logObj}).then(function(r){ if(r.gameData) gData = r.gameData; return r; }); }
function setLocalReminder() { var t = document.getElementById('reminder-time').value; localStorage.setItem("reminder_time", t); if('Notification' in window) Notification.requestPermission(); alert("提醒時間已設定為 " + t); }

// 🔴 缺少的函式補完了
function changeMonth(delta) { 
    curMonth += delta; 
    if(curMonth > 12) { curMonth = 1; curYear++; } 
    if(curMonth < 1) { curMonth = 12; curYear--; } 
    loadCalendar(); 
}

function loadCalendar() { 
    var mStr = curYear + "-" + (curMonth<10?"0"+curMonth:curMonth); 
    document.getElementById('cal-title').innerText = mStr; 
    document.getElementById('calendar-area').innerHTML = "Loading..."; 
    document.getElementById('profile-stats').innerHTML = ""; 
    document.getElementById('profile-log-list').innerHTML = ""; 
    
    callApi('getCalendarData', {u:gUser, year:curYear, month:curMonth}).then(res => { 
        var daysInMonth = new Date(curYear, curMonth, 0).getDate(); 
        var html = ""; 
        for(var d=1; d<=daysInMonth; d++) { 
            var dStr = mStr + "-" + (d<10?"0"+d:d); 
            var dayData = res.cal[dStr]; 
            var cls = "cal-day"; 
            if(dayData) { 
                var count = 0; 
                if(dayData.read) count++; 
                if(dayData.sport) count++; 
                if(dayData.achieve) count++; 
                if(count > 0) cls += " cal-fill-" + count; 
            } 
            html += `<div class="${cls}">${d}</div>`; 
        } 
        document.getElementById('calendar-area').innerHTML = html; 
        var s = res.stats; 
        document.getElementById('profile-stats').innerHTML = `<b>📊 ${mStr} 月報表</b><br>運動: ${s.sportDays}天 | 讀書: ${s.readDays}天 | 開口: ${s.totalSpoke}`; 
        var logHtml = res.logs.map(l => `<div class="log-item"><div class="log-time" style="width:80px;">${l.time}</div><div class="log-content"><b>${escapeHtml(l.action)}</b> ${escapeHtml(l.detail)}</div></div>`).join(''); 
        document.getElementById('profile-log-list').innerHTML = logHtml || "無紀錄"; 
    }); 
}

// 🔴 這裡我幫您加上了「儀表板數字加總邏輯」，請放心複製
function loadOrchard(){
  document.getElementById('orchard-container').innerHTML = 'Loading...';
  Promise.all([
    callApi('getOrchardData', {u:gUser, p:gPass}),
    callApi('getOrchardSeasonStatus')
  ]).then(function(results) {
    var data = results[0] || {};
    var season = results[1] || {};
    var html = "";
    var totalS = 0, totalC = 0, totalCl = 0;

    if(data.error) {
      document.getElementById('orchard-container').innerText = data.error;
      return;
    }

    for(var key in data){
      if(!Object.prototype.hasOwnProperty.call(data, key)) continue;
      var h = data[key];
      if(!h || typeof h !== 'object' || !h.name) continue;
      var s = Number(h.spoke)||0;
      var c = Number(h.convert)||0;
      var cl = Number(h.joinClass)||0;
      totalS += s; totalC += c; totalCl += cl;

      var fruits = "";
      var redFruits = Math.floor(s / 10);
      var totalPoints = redFruits + c + cl;
      var treeClass = "tree-scale-s";
      if(totalPoints > 20) treeClass = "tree-scale-l"; else if(totalPoints > 5) treeClass = "tree-scale-m";
      for(var i=0; i<redFruits && i<10; i++) fruits += '<div class="fruit red"></div>';
      for(var j=0; j<c && j<10; j++) fruits += '<div class="fruit gold"></div>';
      for(var k=0; k<cl && k<10; k++) fruits += '<div class="fruit blue"></div>';
      if(totalPoints === 0) fruits = '<span style="font-size:10px; color:#fff;">種子</span>';

      var info = `開口:${s} 渡眾:${c} 入班:${cl}`;
      var payload = encodePayload({name:h.name, info:info});
      var canView = h.canViewDetails === true;
      var interaction = canView
        ? ` role="button" tabindex="0" onclick="openHallModalFromPayload('${payload}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openHallModalFromPayload('${payload}');}"`
        : ' aria-disabled="true"';
      html += `<div class="tree-container ${treeClass}${canView?'':' is-locked'}"${interaction}><div class="tree-canopy">${fruits}</div><div class="tree-trunk"></div><div class="tree-label">${escapeHtml(h.name)}<br><span style="font-size:10px;">${Number(h.members)||0}人</span></div></div>`;
    }

    document.getElementById('orchard-container').innerHTML = html || "無資料";
    document.getElementById('orchard-season').innerText = season.currentName || "賢德班第31期";
    document.getElementById('dash-spoke').innerText = totalS;
    document.getElementById('dash-conv').innerText = totalC;
    document.getElementById('dash-class').innerText = totalCl;
    loadGlobalLogs();
  }).catch(function(error) {
    document.getElementById('orchard-container').innerText = "果園載入失敗";
    console.error(error);
  });
}

function openHallModalFromPayload(payload) {
  var value = decodePayload(payload);
  openHallModal(value.name, value.info);
}

function openHallModal(name, info) {
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-title').innerText = name;
  document.getElementById('modal-content').innerHTML = `<div style="background:#f1f8e9; padding:10px; border-radius:8px; margin-bottom:10px;"><b>📊 公堂總成績</b><br>${escapeHtml(info)}</div><div id="hall-members">成員載入中...</div>`;
  callApi('getHallDetails', {hall:name, u:gUser, p:gPass}).then(function(res) {
    if(res.error || res.success === false) {
      document.getElementById('hall-members').innerText = res.error || "無法讀取名單";
      return;
    }
    var members = (res.list || []).map(function(member) {
      return `<div class="member-row"><span>${escapeHtml(member.name)}</span><span>開${Number(member.s)||0}/渡${Number(member.c)||0}/班${Number(member.cl)||0}</span></div>`;
    }).join('');
    document.getElementById('hall-members').innerHTML = members || "無成員資料";
  });
}
function updateMarquee() { var msg = document.getElementById('adm-marquee').value; if(!msg) return; callApi('updateMarquee', {msg:msg}).then(r => { alert(r.msg); document.getElementById('marquee-text').innerText = msg; }); }
function runAdminQuery() { try { if(Object.keys(menuConfig).length === 0) { alert("系統資料載入中，請稍後再試..."); return; } var filters = { major: document.getElementById('adm-maj').value, minor: document.getElementById('adm-min').value, hasSport: document.getElementById('f-sport').checked, hasRead: document.getElementById('f-read').checked, hasSpoke: document.getElementById('f-spoke').checked, hasConv: document.getElementById('f-conv').checked, hasClass: document.getElementById('f-class').checked }; var mode = document.getElementById('adm-mode').value; var dateVal = ""; if(mode === 'date') dateVal = document.getElementById('adm-date').value; if(mode === 'month') dateVal = document.getElementById('adm-month').value; loading(true); callApi('getAdminReport', {filters:filters, mode:mode, dateVal:dateVal}).then(res => { loading(false); if(res.error) { alert("系統錯誤: " + res.error); return; } if(!res.list || res.list.length === 0) { document.getElementById('admin-report').style.display = 'block'; document.getElementById('admin-report').innerHTML = "<div style='text-align:center; color:#666; padding:10px;'>⚠️ 查無符合條件的資料</div>"; document.getElementById('admin-list').innerHTML = ""; return; } var st = res.stats; var repHtml = `<div><b>[${mode === 'all' ? '全部歷史' : dateVal}]</b></div><div>篩選人數: <b>${st.count}</b></div><div>累計開口: ${st.totalSpoke} | 渡眾: ${st.totalConv} | 入班: ${st.totalClass}</div><div>運動人次: ${st.totalSport}</div>`; document.getElementById('admin-report').innerHTML = repHtml; document.getElementById('admin-report').style.display = 'block'; var listHtml = res.list.map(u => { var badges = ""; if(u.sportCount > 0) badges += `<span style='background:#8bc34a'>運${u.sportCount}</span>`; if(u.readCount > 0) badges += `<span style='background:#81d4fa'>讀${u.readCount}</span>`; if(u.spoke > 0) badges += `<span style='background:#ff8a80'>開${u.spoke}</span>`; if(u.conv > 0) badges += `<span style='background:#ffd54f'>渡${u.conv}</span>`; return `<div class="admin-row"><div style="flex:1"><div style="font-weight:bold;">${escapeHtml(u.name)} <span onclick="openAdminCRMFromPayload('${encodePayload(u.name)}')" style="cursor:pointer; margin-left:5px;">📒</span></div><div style="font-size:10px; color:#999;">${escapeHtml(u.minor)}</div></div><div class="admin-stat-badges" style="text-align:right;">${badges}</div></div>`; }).join(''); document.getElementById('admin-list').innerHTML = listHtml; }).catch(err => { loading(false); alert("連線失敗: " + err); }); } catch(e) { loading(false); alert("前端錯誤: " + e.message); } }
function sendBroadcast() { var msg = document.getElementById('broadcast-msg').value; if (!msg) { alert("請輸入訊息內容"); return; } var time = document.getElementById('broadcast-time').value; if(confirm("確定要發送這則通知給所有人嗎？")) { loading(true); callApi('broadcast', {msg: msg, time: time}).then(res => { loading(false); if (res.success) { alert("發送成功"); document.getElementById('broadcast-msg').value = ""; } else { alert("發送失敗: " + res.msg); } }); } }
function loadGlobalLogs(){ var c = document.getElementById('log-container'); c.innerHTML = '<div style="padding:20px; text-align:center;">讀取中...</div>'; callApi('getGlobalLogs').then(res => { var h = ""; if(res.list.length==0) h='<div style="padding:20px; text-align:center;">尚無紀錄</div>'; res.list.forEach(function(l){ var color = "#eee"; if(l.action.includes("運動")) color="#e8f5e9"; if(l.action.includes("讀書")) color="#e3f2fd"; if(l.action.includes("回報")) color="#fff3e0"; h += `<div class="log-item"><div class="log-time">${l.time}</div><div class="log-content"><span style="font-weight:bold; color:#555;">${escapeHtml(l.user)}</span> <span class="log-tag" style="background:${color}">${escapeHtml(l.action)}</span><span>${escapeHtml(l.detail)}</span><div style="font-size:9px; color:#bbb;">(${escapeHtml(l.hall)})</div></div></div>`; }); c.innerHTML = h; }); }

// 🔴 檢查通知狀態函式 (診斷按鈕用)
function checkPushStatus() {
    if (!window.OneSignal) { alert("通知系統尚未載入，請稍候..."); return; }
    
    // 1. 檢查瀏覽器權限
    var perm = Notification.permission;
    if (perm !== "granted") {
        alert("⚠️ 您的裝置尚未允許通知 (目前狀態: " + perm + ")\n請到手機設定 -> 瀏覽器 -> 開啟通知權限。");
        return;
    }

    // 2. 檢查 OneSignal 訂閱狀態 (v16 API)
    var isSubscribed = OneSignal.User.PushSubscription.optedIn;
    if (isSubscribed) {
        alert("✅ 恭喜！您的裝置已成功訂閱通知。\n(如果還是收不到，請確認是否為 iPhone 且已『加入主畫面』)");
    } else {
        alert("⚠️ 權限已開，但尚未訂閱。\n請點擊畫面右下角的紅色鈴鐺圖示來訂閱！");
    }
}
