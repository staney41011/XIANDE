(function(root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ClassicsReader = api;
})(typeof window !== "undefined" ? window : globalThis, function(root) {
  "use strict";

  var CHAPTER_SOURCES = Object.freeze({
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
  });

  var state = {
    chapterTitle: "",
    passages: [],
    phoneticMode: readSetting("classics_phonetic_mode", "original"),
    allTranslationsOpen: false,
    voices: [],
    voicesReady: false,
    voiceListenerAttached: false,
    pinyinConfigured: false,
    speechToken: 0,
    speechQueue: [],
    speechPosition: 0,
    speechLoop: false,
    speechMode: "",
    currentSpeechIndex: -1
  };

  var TONELESS_PINYIN = {
    "ā": "a", "á": "a", "ǎ": "a", "à": "a",
    "ē": "e", "é": "e", "ě": "e", "è": "e",
    "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
    "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
    "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
    "ǖ": "ü", "ǘ": "ü", "ǚ": "ü", "ǜ": "ü",
    "ń": "n", "ň": "n", "ǹ": "n", "ḿ": "m"
  };

  var INITIALS = {
    "b": "ㄅ", "p": "ㄆ", "m": "ㄇ", "f": "ㄈ",
    "d": "ㄉ", "t": "ㄊ", "n": "ㄋ", "l": "ㄌ",
    "g": "ㄍ", "k": "ㄎ", "h": "ㄏ",
    "j": "ㄐ", "q": "ㄑ", "x": "ㄒ",
    "zh": "ㄓ", "ch": "ㄔ", "sh": "ㄕ", "r": "ㄖ",
    "z": "ㄗ", "c": "ㄘ", "s": "ㄙ"
  };

  var FINALS = {
    "a": "ㄚ", "o": "ㄛ", "e": "ㄜ", "ê": "ㄝ",
    "ai": "ㄞ", "ei": "ㄟ", "ao": "ㄠ", "ou": "ㄡ",
    "an": "ㄢ", "en": "ㄣ", "ang": "ㄤ", "eng": "ㄥ", "ong": "ㄨㄥ",
    "i": "ㄧ", "ia": "ㄧㄚ", "ie": "ㄧㄝ", "iao": "ㄧㄠ",
    "iu": "ㄧㄡ", "iou": "ㄧㄡ", "ian": "ㄧㄢ", "in": "ㄧㄣ",
    "iang": "ㄧㄤ", "ing": "ㄧㄥ", "iong": "ㄩㄥ",
    "u": "ㄨ", "ua": "ㄨㄚ", "uo": "ㄨㄛ", "uai": "ㄨㄞ",
    "ui": "ㄨㄟ", "uei": "ㄨㄟ", "uan": "ㄨㄢ", "un": "ㄨㄣ",
    "uen": "ㄨㄣ", "uang": "ㄨㄤ", "ueng": "ㄨㄥ",
    "ü": "ㄩ", "üe": "ㄩㄝ", "üan": "ㄩㄢ", "ün": "ㄩㄣ"
  };

  var ZERO_INITIALS = {
    "yi": "i", "ya": "ia", "yo": "io", "ye": "ie", "yao": "iao",
    "you": "iou", "yan": "ian", "yin": "in", "yang": "iang",
    "ying": "ing", "yong": "iong", "yu": "ü", "yue": "üe",
    "yuan": "üan", "yun": "ün",
    "wu": "u", "wa": "ua", "wo": "uo", "wai": "uai", "wei": "uei",
    "wan": "uan", "wen": "uen", "wang": "uang", "weng": "ueng"
  };

  function readSetting(key, fallback) {
    try {
      return root && root.localStorage ? root.localStorage.getItem(key) || fallback : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveSetting(key, value) {
    try {
      if (root && root.localStorage) root.localStorage.setItem(key, value);
    } catch (error) {}
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function(character) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
    });
  }

  function sourceForChapter(title) {
    return CHAPTER_SOURCES[title] || "https://ctext.org/analects/zh";
  }

  function safeSourceUrl(value, chapterTitle) {
    var fallback = sourceForChapter(chapterTitle);
    if (!value) return fallback;
    try {
      var parsed = new URL(value, fallback);
      return parsed.protocol === "https:" && parsed.hostname === "ctext.org" ? parsed.href : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function configurePinyin() {
    if (state.pinyinConfigured) return true;
    if (!root || !root.pinyinPro || typeof root.pinyinPro.pinyin !== "function") return false;

    if (typeof root.pinyinPro.customPinyin === "function") {
      root.pinyinPro.customPinyin({
        "學而時習之": "xué ér shí xí zhī",
        "不亦說乎": "bù yì yuè hū",
        "不亦樂乎": "bù yì lè hū",
        "其為人也": "qí wéi rén yě",
        "孝弟": "xiào tì",
        "好犯上": "hào fàn shàng",
        "鮮矣": "xiǎn yǐ",
        "三省吾身": "sān xǐng wú shēn",
        "傳不習乎": "chuán bù xí hū",
        "千乘之國": "qiān shèng zhī guó",
        "賢賢易色": "xián xián yì sè",
        "好學": "hào xué",
        "知之為知之": "zhī zhī wéi zhī zhī",
        "不知為不知": "bù zhī wéi bù zhī",
        "是知也": "shì zhì yě",
        "女知之乎": "rǔ zhī zhī hū",
        "吾與點也": "wú yǔ diǎn yě",
        "知者": "zhì zhě",
        "樂水": "yào shuǐ",
        "樂山": "yào shān"
      });
    }

    state.pinyinConfigured = true;
    return true;
  }

  function stripPinyinTone(value) {
    return String(value || "").replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]/g, function(character) {
      return TONELESS_PINYIN[character] || character;
    }).replace(/u:/g, "ü").replace(/v/g, "ü").toLowerCase();
  }

  function applyZhuyinTone(zhuyin, tone) {
    var numericTone = Number(tone);
    if (numericTone === 2) return zhuyin + "ˊ";
    if (numericTone === 3) return zhuyin + "ˇ";
    if (numericTone === 4) return zhuyin + "ˋ";
    if (numericTone === 5 || numericTone === 0) return "˙" + zhuyin;
    return zhuyin;
  }

  function pinyinToZhuyin(syllable, tone) {
    var normalized = stripPinyinTone(syllable);
    if (!normalized) return "";

    var special = {
      "zhi": "ㄓ", "chi": "ㄔ", "shi": "ㄕ", "ri": "ㄖ",
      "zi": "ㄗ", "ci": "ㄘ", "si": "ㄙ", "er": "ㄦ"
    };
    if (special[normalized]) return applyZhuyinTone(special[normalized], tone);

    if (ZERO_INITIALS[normalized]) normalized = ZERO_INITIALS[normalized];

    var initial = "";
    var finalPart = normalized;
    ["zh", "ch", "sh"].some(function(candidate) {
      if (normalized.indexOf(candidate) === 0) {
        initial = candidate;
        finalPart = normalized.slice(candidate.length);
        return true;
      }
      return false;
    });

    if (!initial && INITIALS[normalized.charAt(0)]) {
      initial = normalized.charAt(0);
      finalPart = normalized.slice(1);
    }

    if ((initial === "j" || initial === "q" || initial === "x") && finalPart.charAt(0) === "u") {
      finalPart = "ü" + finalPart.slice(1);
    }

    var zhuyin = (INITIALS[initial] || "") + (FINALS[finalPart] || "");
    return applyZhuyinTone(zhuyin || normalized, tone);
  }

  function renderPhoneticText(text, mode) {
    if (mode === "original" || !configurePinyin()) return escapeHtml(text);

    var items = root.pinyinPro.pinyin(text, {
      type: "all",
      toneType: "symbol",
      traditional: true,
      toneSandhi: false,
      segmentit: 2
    });

    return items.map(function(item) {
      var original = item.origin || item.result || "";
      if (!item.isZh) return escapeHtml(original);
      var annotation = mode === "zhuyin" ? pinyinToZhuyin(item.pinyin, item.num) : item.pinyin;
      return "<ruby><span>" + escapeHtml(original) + "</span><rt>" + escapeHtml(annotation) + "</rt></ruby>";
    }).join("");
  }

  function buildSpeechTextFromItems(items) {
    return (Array.isArray(items) ? items : []).map(function(item) {
      var original = String(item && (item.origin || item.result) || "");
      if (!item || !item.isZh) return original;
      return String(item.pinyin || original);
    }).join(" ")
      .replace(/\s+([，。！？；：、）》」』])/g, "$1")
      .replace(/([（《「『])\s+/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildSpeechText(text) {
    if (!configurePinyin()) return String(text || "");
    var items = root.pinyinPro.pinyin(text, {
      type: "all",
      toneType: "symbol",
      traditional: true,
      toneSandhi: true,
      segmentit: 2
    });
    return buildSpeechTextFromItems(items) || String(text || "");
  }

  function normalizePassages(passages) {
    return (Array.isArray(passages) ? passages : []).map(function(passage) {
      return {
        text: String(passage && (passage.text || passage.original) || "").trim(),
        translation: String(passage && passage.translation || "").trim(),
        sourceUrl: String(passage && passage.sourceUrl || "").trim()
      };
    }).filter(function(passage) {
      return passage.text;
    });
  }

  function renderChapter(reader, payload) {
    stopSpeech(false);
    state.chapterTitle = String(payload && payload.chapterTitle || "");
    state.passages = normalizePassages(payload && payload.passages);
    state.allTranslationsOpen = false;

    var chapterSource = safeSourceUrl(payload && payload.sourceUrl, state.chapterTitle);
    var passagesHtml = state.passages.map(function(passage, index) {
      var sourceUrl = safeSourceUrl(passage.sourceUrl || chapterSource, state.chapterTitle);
      var translationHtml = passage.translation
        ? "<p>" + escapeHtml(passage.translation) + "</p>"
        : "<a href=\"" + escapeHtml(sourceUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">查看現代漢語來源</a>";

      return [
        "<article class=\"classic-passage\" data-passage-index=\"", index, "\">",
        "<div class=\"classic-passage-tools\">",
        "<span class=\"classic-passage-number\">", index + 1, "</span>",
        "<button type=\"button\" class=\"classic-icon-btn\" title=\"朗讀本句\" aria-label=\"朗讀第 ", index + 1, " 句\" onclick=\"ClassicsReader.speakSentence(", index, ")\">🔊</button>",
        "<button type=\"button\" class=\"classic-translation-toggle\" aria-expanded=\"false\" onclick=\"ClassicsReader.toggleSentenceTranslation(", index, ")\">白話</button>",
        "</div>",
        "<p class=\"classic-original\">", escapeHtml(passage.text), "</p>",
        "<div class=\"classic-translation\" hidden>", translationHtml, "</div>",
        "</article>"
      ].join("");
    }).join("");

    reader.innerHTML = passagesHtml + [
      "<div class=\"classic-source\">現代漢語來源：",
      "<a href=\"", escapeHtml(chapterSource), "\" target=\"_blank\" rel=\"noopener noreferrer\">中國哲學書電子化計劃</a>",
      "</div>"
    ].join("");

    setPhoneticMode(state.phoneticMode);
    updateAllTranslationsButton();
    prepareVoices();
    setSpeechStatus("");
  }

  function setPhoneticMode(mode) {
    if (["original", "zhuyin", "pinyin"].indexOf(mode) === -1) mode = "original";
    state.phoneticMode = mode;
    saveSetting("classics_phonetic_mode", mode);

    if (typeof document === "undefined") return;
    document.querySelectorAll("#classics-reader .classic-original").forEach(function(element, index) {
      var passage = state.passages[index];
      if (passage) element.innerHTML = renderPhoneticText(passage.text, mode);
    });

    document.querySelectorAll("[data-phonetic-mode]").forEach(function(button) {
      var active = button.getAttribute("data-phonetic-mode") === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function getPassageElement(index) {
    if (typeof document === "undefined") return null;
    return document.querySelector("#classics-reader .classic-passage[data-passage-index=\"" + index + "\"]");
  }

  function toggleSentenceTranslation(index) {
    var passageElement = getPassageElement(index);
    if (!passageElement) return;
    var panel = passageElement.querySelector(".classic-translation");
    var button = passageElement.querySelector(".classic-translation-toggle");
    var willOpen = panel.hidden;
    panel.hidden = !willOpen;
    button.setAttribute("aria-expanded", willOpen ? "true" : "false");
    button.classList.toggle("active", willOpen);
    syncAllTranslationsState();
  }

  function toggleAllTranslations() {
    state.allTranslationsOpen = !state.allTranslationsOpen;
    if (typeof document === "undefined") return;

    document.querySelectorAll("#classics-reader .classic-passage").forEach(function(passageElement) {
      var panel = passageElement.querySelector(".classic-translation");
      var button = passageElement.querySelector(".classic-translation-toggle");
      panel.hidden = !state.allTranslationsOpen;
      button.setAttribute("aria-expanded", state.allTranslationsOpen ? "true" : "false");
      button.classList.toggle("active", state.allTranslationsOpen);
    });
    updateAllTranslationsButton();
  }

  function syncAllTranslationsState() {
    if (typeof document === "undefined") return;
    var panels = Array.from(document.querySelectorAll("#classics-reader .classic-translation"));
    state.allTranslationsOpen = panels.length > 0 && panels.every(function(panel) { return !panel.hidden; });
    updateAllTranslationsButton();
  }

  function updateAllTranslationsButton() {
    if (typeof document === "undefined") return;
    var button = document.getElementById("btn-translation-all");
    if (!button) return;
    button.disabled = state.passages.length === 0;
    button.textContent = state.allTranslationsOpen ? "收合白話" : "展開白話";
    button.setAttribute("aria-pressed", state.allTranslationsOpen ? "true" : "false");
  }

  function supportsSpeech() {
    return !!(root && root.speechSynthesis && root.SpeechSynthesisUtterance);
  }

  function voiceScore(voice) {
    var score = 0;
    var language = String(voice.lang || "").toLowerCase();
    var name = String(voice.name || "");
    if (language === "zh-tw") score += 120;
    else if (language.indexOf("zh") === 0) score += 70;
    if (/natural|neural|premium|online/i.test(name)) score += 80;
    if (/hsiaochen|hsiaoyu|yating|mei-jia|ting-ting|google|microsoft|apple/i.test(name)) score += 35;
    return score;
  }

  function prepareVoices() {
    if (!supportsSpeech() || typeof document === "undefined") return;
    populateVoices();
    if (!state.voiceListenerAttached) {
      if (typeof root.speechSynthesis.addEventListener === "function") {
        root.speechSynthesis.addEventListener("voiceschanged", populateVoices);
      } else {
        root.speechSynthesis.onvoiceschanged = populateVoices;
      }
      state.voiceListenerAttached = true;
    }
  }

  function populateVoices() {
    if (!supportsSpeech() || typeof document === "undefined") return;
    var select = document.getElementById("tts-voice");
    if (!select) return;

    state.voices = root.speechSynthesis.getVoices().filter(function(voice) {
      return String(voice.lang || "").toLowerCase().indexOf("zh") === 0;
    }).sort(function(a, b) {
      return voiceScore(b) - voiceScore(a) || String(a.name).localeCompare(String(b.name), "zh-Hant");
    });

    var savedVoice = readSetting("classics_voice_uri", "");
    select.innerHTML = "";

    if (state.voices.length === 0) {
      var fallbackOption = document.createElement("option");
      fallbackOption.value = "";
      fallbackOption.textContent = "系統中文語音";
      select.appendChild(fallbackOption);
      return;
    }

    state.voices.forEach(function(voice, index) {
      var option = document.createElement("option");
      option.value = voice.voiceURI || voice.name;
      option.textContent = voice.name + " · " + voice.lang;
      if ((savedVoice && option.value === savedVoice) || (!savedVoice && index === 0)) option.selected = true;
      select.appendChild(option);
    });
    state.voicesReady = true;
  }

  function handleVoiceChange() {
    if (typeof document === "undefined") return;
    var select = document.getElementById("tts-voice");
    if (select) saveSetting("classics_voice_uri", select.value);
  }

  function selectedVoice() {
    if (typeof document === "undefined") return state.voices[0] || null;
    var select = document.getElementById("tts-voice");
    var selectedUri = select ? select.value : "";
    return state.voices.find(function(voice) {
      return (voice.voiceURI || voice.name) === selectedUri;
    }) || state.voices[0] || null;
  }

  function setSpeechStatus(text) {
    if (typeof document === "undefined") return;
    var status = document.getElementById("tts-status");
    if (status) status.textContent = text || "";
  }

  function clearSpeechHighlight() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("#classics-reader .speech-active").forEach(function(element) {
      element.classList.remove("speech-active");
    });
  }

  function highlightSpeechPassage(index) {
    clearSpeechHighlight();
    var passageElement = getPassageElement(index);
    if (!passageElement) return;
    passageElement.classList.add("speech-active");

    var reader = typeof document !== "undefined" ? document.getElementById("classics-reader") : null;
    if (reader) {
      var passageBounds = passageElement.getBoundingClientRect();
      var readerBounds = reader.getBoundingClientRect();
      if (passageBounds.top < readerBounds.top || passageBounds.bottom > readerBounds.bottom) {
        passageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  function updateSpeechButtons() {
    if (typeof document === "undefined") return;
    var pauseButton = document.getElementById("tts-pause");
    var loopButton = document.getElementById("tts-loop");
    if (pauseButton) {
      var paused = supportsSpeech() && root.speechSynthesis.paused;
      pauseButton.textContent = paused ? "▶" : "⏸";
      pauseButton.title = paused ? "繼續朗讀" : "暫停朗讀";
      pauseButton.setAttribute("aria-label", paused ? "繼續朗讀" : "暫停朗讀");
    }
    if (loopButton) loopButton.classList.toggle("active", state.speechLoop && !!state.speechMode);
  }

  function stopSpeech(showStatus) {
    state.speechToken += 1;
    state.speechQueue = [];
    state.speechPosition = 0;
    state.speechLoop = false;
    state.speechMode = "";
    state.currentSpeechIndex = -1;
    if (supportsSpeech()) root.speechSynthesis.cancel();
    clearSpeechHighlight();
    setSpeechStatus(showStatus === false ? "" : "已停止");
    updateSpeechButtons();
  }

  function startSpeech(indexes, loop, mode) {
    if (!supportsSpeech()) {
      if (root && root.alert) root.alert("您的裝置不支援語音朗讀");
      return;
    }
    var queue = indexes.filter(function(index) {
      return state.passages[index] && state.passages[index].text;
    });
    if (queue.length === 0) return;

    stopSpeech(false);
    state.speechToken += 1;
    state.speechQueue = queue;
    state.speechPosition = 0;
    state.speechLoop = !!loop;
    state.speechMode = mode;
    var token = state.speechToken;
    updateSpeechButtons();
    setTimeout(function() { speakNext(token); }, 80);
  }

  function speakNext(token) {
    if (!supportsSpeech() || token !== state.speechToken) return;
    if (state.speechPosition >= state.speechQueue.length) {
      if (state.speechLoop) state.speechPosition = 0;
      else {
        state.speechMode = "";
        state.currentSpeechIndex = -1;
        clearSpeechHighlight();
        setSpeechStatus("朗讀完成");
        updateSpeechButtons();
        return;
      }
    }

    var passageIndex = state.speechQueue[state.speechPosition];
    var passage = state.passages[passageIndex];
    var speechText = buildSpeechText(passage.text);
    var utterance = new root.SpeechSynthesisUtterance(speechText);
    var voice = selectedVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice && voice.lang ? voice.lang : "zh-TW";
    utterance.rate = speechText === passage.text ? 0.9 : 0.82;
    utterance.pitch = 1;

    utterance.onstart = function() {
      if (token !== state.speechToken) return;
      state.currentSpeechIndex = passageIndex;
      highlightSpeechPassage(passageIndex);
      setSpeechStatus("第 " + (passageIndex + 1) + " / " + state.passages.length + " 句 · 拼音導讀");
      updateSpeechButtons();
    };

    utterance.onend = function() {
      if (token !== state.speechToken) return;
      state.speechPosition += 1;
      setTimeout(function() { speakNext(token); }, 120);
    };

    utterance.onerror = function(event) {
      if (token !== state.speechToken || event.error === "canceled" || event.error === "interrupted") return;
      state.speechPosition += 1;
      setTimeout(function() { speakNext(token); }, 120);
    };

    root.speechSynthesis.speak(utterance);
  }

  function speakSentence(index) {
    startSpeech([Number(index)], false, "sentence");
  }

  function speakFull() {
    startSpeech(state.passages.map(function(_, index) { return index; }), false, "full");
  }

  function speakLoop() {
    startSpeech(state.passages.map(function(_, index) { return index; }), true, "loop");
  }

  function togglePause() {
    if (!supportsSpeech() || !root.speechSynthesis.speaking) return;
    if (root.speechSynthesis.paused) root.speechSynthesis.resume();
    else root.speechSynthesis.pause();
    updateSpeechButtons();
  }

  return {
    renderChapter: renderChapter,
    setPhoneticMode: setPhoneticMode,
    toggleSentenceTranslation: toggleSentenceTranslation,
    toggleAllTranslations: toggleAllTranslations,
    prepareVoices: prepareVoices,
    handleVoiceChange: handleVoiceChange,
    speakSentence: speakSentence,
    speakFull: speakFull,
    speakLoop: speakLoop,
    togglePause: togglePause,
    stopSpeech: stopSpeech,
    sourceForChapter: sourceForChapter,
    _test: {
      escapeHtml: escapeHtml,
      stripPinyinTone: stripPinyinTone,
      pinyinToZhuyin: pinyinToZhuyin,
      safeSourceUrl: safeSourceUrl,
      buildSpeechTextFromItems: buildSpeechTextFromItems
    }
  };
});
