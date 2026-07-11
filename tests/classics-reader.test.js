const test = require("node:test");
const assert = require("node:assert/strict");
const ClassicsReader = require("../classics-reader.js");

const helpers = ClassicsReader._test;

test("converts numbered Mandarin syllables to Taiwan zhuyin marks", () => {
  assert.equal(helpers.pinyinToZhuyin("xué", 2), "ㄒㄩㄝˊ");
  assert.equal(helpers.pinyinToZhuyin("shuō", 1), "ㄕㄨㄛ");
  assert.equal(helpers.pinyinToZhuyin("yuè", 4), "ㄩㄝˋ");
  assert.equal(helpers.pinyinToZhuyin("zi", 3), "ㄗˇ");
  assert.equal(helpers.pinyinToZhuyin("de", 5), "˙ㄉㄜ");
});

test("keeps the chapter source on ctext.org", () => {
  assert.equal(
    ClassicsReader.sourceForChapter("學而第一"),
    "https://ctext.org/analects/xue-er/zh"
  );
  assert.equal(
    helpers.safeSourceUrl("https://example.com/not-allowed", "學而第一"),
    "https://ctext.org/analects/xue-er/zh"
  );
});

test("escapes reader content before rendering", () => {
  assert.equal(helpers.escapeHtml('<script>"x"</script>'), "&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
});

test("builds the spoken script from contextual pinyin instead of raw Han characters", () => {
  const items = [
    { origin: "學", isZh: true, pinyin: "xué" },
    { origin: "而", isZh: true, pinyin: "ér" },
    { origin: "時", isZh: true, pinyin: "shí" },
    { origin: "習", isZh: true, pinyin: "xí" },
    { origin: "之", isZh: true, pinyin: "zhī" },
    { origin: "，", isZh: false },
    { origin: "不", isZh: true, pinyin: "bú" },
    { origin: "亦", isZh: true, pinyin: "yì" },
    { origin: "說", isZh: true, pinyin: "yuè" },
    { origin: "乎", isZh: true, pinyin: "hū" },
    { origin: "？", isZh: false }
  ];

  assert.equal(
    helpers.buildSpeechTextFromItems(items),
    "xué ér shí xí zhī， bú yì yuè hū？"
  );
});
