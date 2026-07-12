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

test("reads the original Chinese text instead of a pinyin script", () => {
  assert.equal(helpers.buildSpeechText("學而時習之，不亦說乎？"), "學而時習之，不亦說乎？");
});
