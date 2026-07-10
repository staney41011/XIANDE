// Deploy this file beside Code.gs, then add the two V2 actions documented below.
// The original crawler remains available as a rollback path.

var ANALECTS_CTEXT_URLS_V2 = {
  "學而第一": "https://ctext.org/analects/xue-er/zh",
  "為政第二": "https://ctext.org/analects/wei-zheng/zh",
  "八佾第三": "https://ctext.org/analects/ba-yi/zh",
  "里仁第四": "https://ctext.org/analects/li-ren/zh",
  "公冶長第五": "https://ctext.org/analects/gong-ye-chang/zh",
  "雍也第六": "https://ctext.org/analects/yong-ye/zh",
  "述而第七": "https://ctext.org/analects/shu-er/zh",
  "泰伯第八": "https://ctext.org/analects/tai-bo/zh",
  "子罕第九": "https://ctext.org/analects/zi-han/zh",
  "鄉黨第十": "https://ctext.org/analects/xiang-dang/zh",
  "先進第十一": "https://ctext.org/analects/xian-jin/zh",
  "顏淵第十二": "https://ctext.org/analects/yan-yuan/zh",
  "子路第十三": "https://ctext.org/analects/zi-lu/zh",
  "憲問第十四": "https://ctext.org/analects/xian-wen/zh",
  "衛靈公第十五": "https://ctext.org/analects/wei-ling-gong/zh",
  "季氏第十六": "https://ctext.org/analects/ji-shi/zh",
  "陽貨第十七": "https://ctext.org/analects/yang-huo/zh",
  "微子第十八": "https://ctext.org/analects/wei-zi/zh",
  "子張第十九": "https://ctext.org/analects/zi-zhang/zh",
  "堯曰第二十": "https://ctext.org/analects/yao-yue/zh"
};

function getClassicContentV2(sheetName) {
  if (!sheetName) return { success: false, error: "未指定分頁名稱" };

  var sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { success: false, error: "找不到分頁：" + sheetName };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {
      success: true,
      content: "<p>尚無內容，請先至後台執行新版經典爬蟲</p>",
      passages: [],
      sourceUrl: ANALECTS_CTEXT_URLS_V2[sheetName] || ""
    };
  }

  var values = sheet.getRange(2, 2, lastRow - 1, 3).getValues();
  var passages = [];
  var legacyHtml = "";
  var chapterSource = ANALECTS_CTEXT_URLS_V2[sheetName] || "";

  values.forEach(function(row) {
    var original = row[0] ? String(row[0]).trim() : "";
    if (!original) return;
    var translation = row[1] ? String(row[1]).trim() : "";
    var sourceUrl = row[2] ? String(row[2]).trim() : chapterSource;
    passages.push({ text: original, translation: translation, sourceUrl: sourceUrl });
    legacyHtml += "<p>" + escapeClassicHtmlV2(original) + "</p>";
  });

  return {
    success: true,
    content: legacyHtml,
    passages: passages,
    sourceUrl: chapterSource
  };
}

function batchProcessClassicsV2() {
  var spreadsheet = getSpreadsheet();
  var menuSheet = spreadsheet.getSheetByName("ClassicsMenu");
  if (!menuSheet) return { success: false, msg: "找不到 ClassicsMenu" };

  var lastRow = menuSheet.getLastRow();
  if (lastRow < 2) return { success: false, msg: "ClassicsMenu 尚無篇章資料" };

  var data = menuSheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var processedCount = 0;
  var skippedCount = 0;
  var errors = [];

  data.forEach(function(row) {
    var sheetName = row[2] ? String(row[2]).trim() : "";
    if (!sheetName) {
      skippedCount++;
      return;
    }

    var configuredUrl = row[3] ? String(row[3]).trim() : "";
    var sourceUrl = configuredUrl.indexOf("https://ctext.org/") === 0
      ? configuredUrl
      : ANALECTS_CTEXT_URLS_V2[sheetName];

    if (!sourceUrl) {
      skippedCount++;
      errors.push(sheetName + "：找不到 Ctext 網址");
      return;
    }

    try {
      var bilingual = fetchCtextBilingualV2(sourceUrl);
      if (!bilingual.originals.length) throw new Error("未抓到原文");
      if (bilingual.originals.length !== bilingual.translations.length) {
        throw new Error("原文 " + bilingual.originals.length + " 段、翻譯 " + bilingual.translations.length + " 段，筆數不一致");
      }

      saveClassicBilingualV2(spreadsheet, sheetName, bilingual, sourceUrl);
      processedCount++;
      Utilities.sleep(1200);
    } catch (error) {
      errors.push(sheetName + "：" + error.message);
    }
  });

  return {
    success: errors.length === 0,
    msg: "新版爬取完成！成功：" + processedCount + "，跳過：" + skippedCount + "，失敗：" + errors.length,
    errors: errors
  };
}

function fetchCtextBilingualV2(sourceUrl) {
  var separator = sourceUrl.indexOf("?") === -1 ? "?" : "&";
  var requestUrl = sourceUrl + separator + "xd_translation=zh&ts=" + new Date().getTime();
  var response = UrlFetchApp.fetch(requestUrl, {
    method: "get",
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; XIANDE-Classics/2.0; +https://github.com/staney41011/XIANDE)",
      "Cookie": "translation=zh"
    }
  });

  var responseCode = response.getResponseCode();
  if (responseCode !== 200) throw new Error("Ctext 回應 HTTP " + responseCode);

  var html = response.getContentText("UTF-8");
  var originals = extractCtextCellsV2(html, "ctext");
  var translations = extractCtextCellsV2(html, "mctext");
  return { originals: originals, translations: translations };
}

function extractCtextCellsV2(html, className) {
  var result = [];
  var regex = new RegExp('<td\\s+class="' + className + '">([\\s\\S]*?)<\\/td>', "gi");
  var match;
  while ((match = regex.exec(html)) !== null) {
    var cleaned = cleanCtextCellV2(match[1]);
    if (cleaned) result.push(cleaned);
  }
  return result;
}

function cleanCtextCellV2(fragment) {
  var cleaned = String(fragment || "")
    .replace(/<div\s+id="comm\d+"><\/div>/gi, "")
    .replace(/<p\s+class="refs">[\s\S]*?<\/p>/gi, "")
    .replace(/<p\s+class="ctext">[\s\S]*?<\/p>/gi, "")
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeClassicEntitiesV2(cleaned)
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeClassicEntitiesV2(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, function(_, hex) {
      return String.fromCodePoint(parseInt(hex, 16));
    })
    .replace(/&#(\d+);/g, function(_, number) {
      return String.fromCodePoint(parseInt(number, 10));
    });
}

function saveClassicBilingualV2(spreadsheet, sheetName, bilingual, sourceUrl) {
  var targetSheet = spreadsheet.getSheetByName(sheetName);
  if (!targetSheet) targetSheet = spreadsheet.insertSheet(sheetName, spreadsheet.getNumSheets());

  var timestamp = Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm:ss");
  var rows = bilingual.originals.map(function(original, index) {
    return [timestamp, original, bilingual.translations[index], sourceUrl];
  });

  var rowsToClear = Math.max(targetSheet.getLastRow(), rows.length + 1, 1);
  targetSheet.getRange(1, 1, rowsToClear, 4).clearContent();
  targetSheet.getRange(1, 1, 1, 4).setValues([["更新時間", "經文內容", "現代漢語", "翻譯來源"]]);
  targetSheet.getRange(1, 1, 1, 4).setBackground("#fff2cc").setFontWeight("bold");
  targetSheet.getRange(2, 1, rows.length, 4).setValues(rows);
  targetSheet.setColumnWidth(1, 150);
  targetSheet.setColumnWidth(2, 520);
  targetSheet.setColumnWidth(3, 520);
  targetSheet.setColumnWidth(4, 320);
  targetSheet.getRange(2, 2, rows.length, 2).setWrap(true);
}

function escapeClassicHtmlV2(value) {
  return String(value || "").replace(/[&<>"']/g, function(character) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
  });
}

/*
Add these two branches in handleRequest(e), beside the existing classics actions:

else if (action === "getClassicContentV2") result = getClassicContentV2(params.targetSheet);
else if (action === "batchCrawlV2") result = batchProcessClassicsV2();
*/
