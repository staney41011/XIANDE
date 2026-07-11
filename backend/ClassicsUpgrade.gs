// Enhanced classics reader and rate-limited Ctext importer.

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

var CLASSICS_SEARCH_INDEX_SHEET_V2 = "ClassicsSearchIndex";

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
    if (!chapterSource && sourceUrl) chapterSource = sourceUrl;
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
  return processClassicsMenuRowsV3(false);
}

// One-time importer for rows that explicitly contain a Ctext URL in column D.
function crawlConfiguredClassicsV3() {
  return processClassicsMenuRowsV3(true);
}

function processClassicsMenuRowsV3(configuredOnly) {
  var spreadsheet = getSpreadsheet();
  var menuSheet = spreadsheet.getSheetByName("ClassicsMenu");
  if (!menuSheet) return { success: false, msg: "找不到 ClassicsMenu" };

  var lastRow = menuSheet.getLastRow();
  if (lastRow < 2) return { success: false, msg: "ClassicsMenu 尚無篇章資料" };

  var data = menuSheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var processedCount = 0;
  var skippedCount = 0;
  var sourceCount = 0;
  var errors = [];

  data.forEach(function(row) {
    var sheetName = row[2] ? String(row[2]).trim() : "";
    var configuredSources = row[3] ? String(row[3]).trim() : "";
    if (!sheetName || (configuredOnly && !configuredSources)) {
      skippedCount++;
      return;
    }

    var sources = splitClassicSourceUrlsV3(
      configuredSources,
      ANALECTS_CTEXT_URLS_V2[sheetName] || ""
    );
    if (!sources.length) {
      skippedCount++;
      errors.push(sheetName + "：找不到 Ctext 網址");
      return;
    }

    if (configuredOnly && isClassicSheetCurrentV3(spreadsheet, sheetName, sources)) {
      skippedCount++;
      return;
    }

    try {
      var combined = { originals: [], translations: [], sources: [] };
      sources.forEach(function(sourceUrl) {
        var result = fetchCtextBilingualV2(sourceUrl);
        if (!result.originals.length) throw new Error(sourceUrl + " 未抓到原文");
        result.originals.forEach(function(original, index) {
          combined.originals.push(original);
          combined.translations.push(result.translations[index] || "");
          combined.sources.push(sourceUrl);
        });
        sourceCount++;
        Utilities.sleep(1600);
      });

      saveClassicBilingualV2(spreadsheet, sheetName, combined);
      processedCount++;
    } catch (error) {
      errors.push(sheetName + "：" + error.message);
    }
  });

  if (processedCount > 0) {
    try {
      rebuildClassicsSearchIndexV2();
    } catch (indexError) {
      errors.push("搜尋索引：" + indexError.message);
    }
  }

  return {
    success: errors.length === 0,
    msg: "新版爬取完成！成功：" + processedCount + "，來源頁：" + sourceCount +
      "，跳過：" + skippedCount + "，失敗：" + errors.length,
    errors: errors
  };
}

function searchClassicsV2(query, requestedLimit) {
  var normalizedQuery = normalizeClassicSearchTextV2(query);
  if (normalizedQuery.length < 2) {
    return { success: false, error: "請至少輸入兩個字" };
  }

  var spreadsheet = getSpreadsheet();
  var indexSheet = spreadsheet.getSheetByName(CLASSICS_SEARCH_INDEX_SHEET_V2);
  if (!indexSheet || indexSheet.getLastRow() < 2) {
    rebuildClassicsSearchIndexV2();
    indexSheet = spreadsheet.getSheetByName(CLASSICS_SEARCH_INDEX_SHEET_V2);
  }

  var limit = Math.max(1, Math.min(parseInt(requestedLimit, 10) || 50, 100));
  var rows = indexSheet.getRange(2, 1, indexSheet.getLastRow() - 1, 7).getValues();
  var matched = matchClassicSearchRowsV2(rows, normalizedQuery, limit);
  return {
    success: true,
    query: String(query || "").trim(),
    list: matched.list,
    total: matched.total,
    truncated: matched.total > matched.list.length
  };
}

function rebuildClassicsSearchIndexV2() {
  var spreadsheet = getSpreadsheet();
  var menuSheet = spreadsheet.getSheetByName("ClassicsMenu");
  if (!menuSheet) throw new Error("找不到 ClassicsMenu");

  var menuLastRow = menuSheet.getLastRow();
  var menuRows = menuLastRow < 2 ? [] :
    menuSheet.getRange(2, 1, menuLastRow - 1, 3).getValues();
  var indexRows = [];
  var seenSheets = {};

  menuRows.forEach(function(menuRow) {
    var subject = menuRow[0] ? String(menuRow[0]).trim() : "";
    var title = menuRow[1] ? String(menuRow[1]).trim() : "";
    var sheetName = menuRow[2] ? String(menuRow[2]).trim() : "";
    if (!subject || !title || !sheetName || seenSheets[sheetName]) return;
    seenSheets[sheetName] = true;

    var contentSheet = spreadsheet.getSheetByName(sheetName);
    if (!contentSheet || contentSheet.getLastRow() < 2) return;
    var contentRows = contentSheet.getRange(2, 2, contentSheet.getLastRow() - 1, 3).getValues();
    contentRows.forEach(function(contentRow, index) {
      var original = contentRow[0] ? String(contentRow[0]).trim() : "";
      if (!original) return;
      indexRows.push([
        subject,
        title,
        sheetName,
        index + 2,
        original,
        contentRow[1] ? String(contentRow[1]).trim() : "",
        contentRow[2] ? String(contentRow[2]).trim() : ""
      ]);
    });
  });

  var indexSheet = spreadsheet.getSheetByName(CLASSICS_SEARCH_INDEX_SHEET_V2);
  if (!indexSheet) indexSheet = spreadsheet.insertSheet(CLASSICS_SEARCH_INDEX_SHEET_V2);
  indexSheet.clear();
  indexSheet.getRange(1, 1, 1, 7).setValues([[
    "大科目", "篇名", "對應分頁", "原始列", "經文內容", "現代漢語", "來源"
  ]]);
  indexSheet.getRange(1, 1, 1, 7).setBackground("#d9ead3").setFontWeight("bold");
  if (indexRows.length) indexSheet.getRange(2, 1, indexRows.length, 7).setValues(indexRows);
  indexSheet.setFrozenRows(1);
  indexSheet.hideSheet();

  return {
    success: true,
    msg: "經典搜尋索引已更新，共 " + indexRows.length + " 筆章句",
    count: indexRows.length,
    sheets: Object.keys(seenSheets).length
  };
}

function matchClassicSearchRowsV2(rows, normalizedQuery, limit) {
  var query = normalizeClassicSearchTextV2(normalizedQuery);
  var results = [];

  rows.forEach(function(row) {
    var original = row[4] ? String(row[4]).trim() : "";
    var translation = row[5] ? String(row[5]).trim() : "";
    var originalMatches = normalizeClassicSearchTextV2(original).indexOf(query) !== -1;
    var translationMatches = normalizeClassicSearchTextV2(translation).indexOf(query) !== -1;
    if (!originalMatches && !translationMatches) return;

    results.push({
      subject: row[0] ? String(row[0]) : "",
      title: row[1] ? String(row[1]) : "",
      sheet: row[2] ? String(row[2]) : "",
      row: Number(row[3]) || 0,
      text: original,
      translation: translation,
      sourceUrl: row[6] ? String(row[6]) : "",
      matchedIn: originalMatches ? "original" : "translation"
    });
  });

  results.sort(function(a, b) {
    if (a.matchedIn !== b.matchedIn) return a.matchedIn === "original" ? -1 : 1;
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject, "zh-Hant");
    if (a.title !== b.title) return a.title.localeCompare(b.title, "zh-Hant");
    return a.row - b.row;
  });

  return { list: results.slice(0, limit), total: results.length };
}

function normalizeClassicSearchTextV2(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s，。！？；：、,.!?;:'"「」『』（）()《》〈〉【】\[\]{}…—\-]/g, "");
}

function isClassicSheetCurrentV3(spreadsheet, sheetName, expectedSources) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;

  var sourceValues = sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).getValues();
  var seen = {};
  var actualSources = [];
  sourceValues.forEach(function(row) {
    var source = row[0] ? String(row[0]).trim() : "";
    if (source && !seen[source]) {
      seen[source] = true;
      actualSources.push(source);
    }
  });

  return actualSources.length === expectedSources.length && expectedSources.every(function(source) {
    return !!seen[source];
  });
}

function splitClassicSourceUrlsV3(value, fallback) {
  var sourceText = String(value || fallback || "");
  var seen = {};
  return sourceText.split(/\r?\n|\s*\|\s*/).map(function(url) {
    return url.trim();
  }).filter(function(url) {
    if (url.indexOf("https://ctext.org/") !== 0 || seen[url]) return false;
    seen[url] = true;
    return true;
  });
}

function fetchCtextBilingualV2(sourceUrl) {
  var hashIndex = sourceUrl.indexOf("#");
  var requestBase = hashIndex === -1 ? sourceUrl : sourceUrl.substring(0, hashIndex);
  var anchor = hashIndex === -1 ? "" : sourceUrl.substring(hashIndex + 1);
  var separator = requestBase.indexOf("?") === -1 ? "?" : "&";
  var requestUrl = requestBase + separator + "xd_translation=zh&ts=" + new Date().getTime();
  var response = UrlFetchApp.fetch(requestUrl, {
    method: "get",
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; XIANDE-Classics/3.0; +https://github.com/staney41011/XIANDE)",
      "Cookie": "translation=zh"
    }
  });

  var responseCode = response.getResponseCode();
  if (responseCode !== 200) throw new Error("Ctext 回應 HTTP " + responseCode);

  var html = scopeCtextHtmlV3(response.getContentText("UTF-8"), anchor);
  var originals = extractCtextCellsV2(html, "ctext");
  var translations = extractCtextCellsV2(html, "mctext");
  if (translations.length !== originals.length) {
    translations = originals.map(function() { return ""; });
  }
  return { originals: originals, translations: translations };
}

function scopeCtextHtmlV3(html, anchor) {
  if (!anchor) return html;
  var decodedAnchor;
  try {
    decodedAnchor = decodeURIComponent(anchor);
  } catch (error) {
    decodedAnchor = anchor;
  }

  var headingPattern = new RegExp(
    '<h[1-6][^>]*id="' + escapeRegExpV3(decodedAnchor) + '"[^>]*>',
    "i"
  );
  var heading = headingPattern.exec(html);
  if (!heading) throw new Error("找不到指定章節：" + decodedAnchor);

  var bodyStart = heading.index + heading[0].length;
  var body = html.substring(bodyStart);
  var nextHeading = body.search(/<h[1-6][^>]*class="wikisubsectiontitle"[^>]*>/i);
  return nextHeading === -1 ? body : body.substring(0, nextHeading);
}

function escapeRegExpV3(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function saveClassicBilingualV2(spreadsheet, sheetName, bilingual) {
  var targetSheet = spreadsheet.getSheetByName(sheetName);
  if (!targetSheet) targetSheet = spreadsheet.insertSheet(sheetName, spreadsheet.getNumSheets());

  var timestamp = Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm:ss");
  var rows = bilingual.originals.map(function(original, index) {
    return [timestamp, original, bilingual.translations[index] || "", bilingual.sources[index] || ""];
  });

  var rowsToClear = Math.max(targetSheet.getLastRow(), rows.length + 1, 1);
  targetSheet.getRange(1, 1, rowsToClear, 4).clearContent();
  targetSheet.getRange(1, 1, 1, 4).setValues([["更新時間", "經文內容", "現代漢語", "翻譯來源"]]);
  targetSheet.getRange(1, 1, 1, 4).setBackground("#fff2cc").setFontWeight("bold");
  if (rows.length) targetSheet.getRange(2, 1, rows.length, 4).setValues(rows);
  targetSheet.setColumnWidth(1, 150);
  targetSheet.setColumnWidth(2, 520);
  targetSheet.setColumnWidth(3, 520);
  targetSheet.setColumnWidth(4, 320);
  if (rows.length) targetSheet.getRange(2, 2, rows.length, 2).setWrap(true);
}

function escapeClassicHtmlV2(value) {
  return String(value || "").replace(/[&<>"']/g, function(character) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
  });
}
