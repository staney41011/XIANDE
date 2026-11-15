/* 崇正道學群島 · 道之旅 2.0：可探索的劇情冒險，與既有 39 關存檔相容 */
(() => {
  'use strict';
  const core = window.DaoCore;
  const data = window.DAO_DATA;
  if (!core || !data) return;
  const I = data.ISLANDS, C = data.CHAPTERS, assets = window.DAO_ASSETS || {};
  const $ = (sel, root=document) => root.querySelector(sel);
  const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const themes = {
    morning:{sky:'#e6ab6e',ground:'#799966',roof:'#955d52',word:'初心之境',guide:'晨鐘守望者',face:'🧙🏻',desc:'在黎明之森，重新聽見自己的初心。'},
    xingli:{sky:'#72b6ba',ground:'#648b78',roof:'#517e83',word:'問道學宮',guide:'學宮智者',face:'👩🏻‍🏫',desc:'尋找答案之前，先學會問對問題。'},
    huangmu:{sky:'#f2a9bd',ground:'#91a17f',roof:'#b97991',word:'慈訓花境',guide:'蓮花引路人',face:'🧝🏻‍♀️',desc:'十次抉擇，十次用慈悲照見自己。'},
    fogui:{sky:'#91abd4',ground:'#738e85',roof:'#666f9b',word:'禮門聖域',guide:'禮門護法',face:'👨🏻‍🦳',desc:'從內心的恭敬，走向生活的禮節。'}
  };
  const root=document.createElement('div');root.id='rpg-next';root.setAttribute('aria-label','道學冒險沉浸式遊戲');
  root.innerHTML=`<div class="rn-world-map" id="rnMap"><div class="rn-stars"></div><div class="rn-map-top"><div><div class="rn-eyebrow">CHONG ZHENG · INTERACTIVE WORLD</div><strong>崇正道學冒險</strong></div><button class="rn-link" id="rnOldVersion">經典圖鑑與舊版</button></div><div class="rn-map-head"><div class="rn-eyebrow">THE JOURNEY OF AWAKENING / 第一章 · 四境修心</div><h1>道<span>之</span>旅</h1><p>一場真正走得進去的道學冒險。走進四座經典島，與島民對話、尋回散落的智慧之光，作出自己的抉擇，最終面對心中的迷霧。</p><div class="rn-progress" id="rnHomeProgress"></div></div><div class="rn-islands" id="rnIslands"></div><div class="rn-map-hint">✦ 四座島嶼可以自由探索 · 先為 admin 開放試玩 · 劇情為教學改編，非經文原文</div></div>
  <section class="rn-stage" id="rnStage" hidden><canvas id="rnCanvas" class="rn-canvas" aria-label="可移動的道學島嶼冒險場景"></canvas><div class="rn-hud"><button class="rn-hud-back" id="rnBack">← 群島</button><div class="rn-hud-title"><small id="rnZoneTag">FIRST ISLAND</small><strong id="rnZoneTitle">晨鐘</strong></div><div class="rn-hud-stats" id="rnStats"></div></div><div class="rn-objective"><span>CHAPTER QUEST</span><strong id="rnObjective">探索中</strong><p id="rnObjectiveSub">靠近島民，按下互動鍵</p></div><button class="rn-skip" id="rnNext">✦ 前往下一個任務</button><div class="rn-hint" id="rnHint">使用方向鍵移動 · 靠近島民互動</div><div class="rn-bottom"><div class="rn-joystick"><button data-move="left" aria-label="向左走">◀</button><button data-move="right" aria-label="向右走">▶</button></div><button id="rnInteract" class="rn-interact"><span>✦</span>互動</button></div><div id="rnDialogueMount"></div><div class="rn-fade" id="rnFade"></div></section>`;
  document.body.appendChild(root);
  const map=$('#rnMap',root),stage=$('#rnStage',root),canvas=$('#rnCanvas',root),ctx=canvas.getContext('2d',{alpha:false});
  const pics={};for(const island of I){const im=new Image();im.src=assets[island.id]||'';pics[island.id]=im;}
  let island='morning',state='map',chapter=-1,dialogue='',bossStep=0,focusPhase=0,focusSpeed=1.75,fireflies=[],sceneWidth=1150,sceneHeight=670,worldWidth=2700,cam=0,hero={x:105,facing:1,stride:0},last=performance.now(),press=new Set(),walkTo=null,toastText='',toastUntil=0,lightCount=0,collectibles=[];
  let currentTime=0;
  const active=()=>core.getState();
  const record=(id)=>C[id].filter((_,idx)=>!!active().cards[`${id}:${idx}`]).length;
  function firstUndone(){const a=C[island];const p=active();const i=a.findIndex((_,idx)=>!p.cards[`${island}:${idx}`]);return i<0?a.length-1:i;}
  const stationX=i=>340+i*405;
  const lastX=()=>stationX(C[island].length-1);
  const bossX=()=>lastX()+440;
  function syncHome(){
    const p=active(),completed=I.reduce((n,x)=>n+record(x.id),0),bosses=I.filter(x=>p.bosses[x.id]).length;
    $('#rnHomeProgress',root).innerHTML=`<span>✦ ${completed} / 39 智慧之光</span><span>🏆 ${bosses} / 4 島主試煉</span><span>修為 Lv. ${1+Math.floor(p.xp/85)}</span>`;
    $('#rnIslands',root).innerHTML=I.map((x,i)=>{let n=record(x.id),m=C[x.id].length;return `<button class="rn-island" data-enter="${x.id}" aria-label="探索 ${escapeHtml(x.name)}"><div class="rn-island-pic" style="background-image:url('${assets[x.id]}')"><span class="rn-island-num">0${i+1} / 四境</span></div><div class="rn-island-body"><small>${escapeHtml(x.tag)}</small><h2>${escapeHtml(x.name)}</h2><p>${escapeHtml(themes[x.id].desc)}</p><div class="rn-track"><span style="width:${n/m*100}%"></span></div><div class="rn-island-foot"><span>${n} / ${m} 章解鎖</span><strong>${p.bosses[x.id]?'重遊此境 ↗':'進入世界 ↗'}</strong></div></div></button>`}).join('');
  }
  function showMap(){state='map';dialogue='';chapter=-1;walkTo=null;press.clear();stage.hidden=true;map.hidden=false;syncHome();}
  function resize(){const rect=canvas.getBoundingClientRect(),mobile=window.innerWidth<620;sceneWidth=mobile?720:1150;sceneHeight=mobile?1040:670;canvas.width=sceneWidth;canvas.height=sceneHeight;worldWidth=bossX()+370;cam=Math.max(0,Math.min(worldWidth-sceneWidth,hero.x-sceneWidth*.32));fireflies=Array.from({length:35},(_,i)=>({x:(i*131+39)%sceneWidth,y:(i*197+31)%sceneHeight,a:i*.31}));}
  function enter(id){if(!I.some(x=>x.id===id))return;island=id;lightCount=0;collectibles=Array.from({length:Math.floor((C[id].length+2)*1.9)},(_,i)=>({x:250+i*230,taken:false}));hero.x=155;hero.facing=1;hero.stride=0;cam=0;press.clear();walkTo=null;state='stage';map.hidden=true;stage.hidden=false;$('#rnZoneTag',root).textContent=themes[id].word;$('#rnZoneTitle',root).textContent=I.find(x=>x.id===id).name;resize();syncHud();startIntro();}
  function syncHud(){const p=active(),count=record(island),total=C[island].length;$('#rnStats',root).innerHTML=`<span>❤️ <b>${p.hp}</b></span><span>✧ 修為 <b>${p.xp}</b></span><span>🃏 <b>${count}/${total}</b></span>`;const idx=firstUndone();const done=count===total;$('#rnObjective',root).textContent=done?(p.bosses[island]?'重遊島主試煉':'前往終章 · 心魔之影'):`${idx+1}. ${C[island][idx][0]}`;$('#rnObjectiveSub',root).textContent=done?'走向最深處的光門，完成最後試煉':'和發光的島民對話，認識修行之道';}
  function closeDialog(){dialogue='';chapter=-1;$('#rnDialogueMount',root).innerHTML='';}
  function writeDialog({name,face,title,text,choices=[],note='',actions=[]}){dialogue=title||'dialogue';$('#rnDialogueMount',root).innerHTML=`<div class="rn-scene-overlay"><div class="rn-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="rn-portrait"><div class="rn-face">${face||'🧙🏻'}</div><span>${escapeHtml(name||'引路人')}</span></div><div class="rn-dialog-main"><div class="rn-dialog-head"><div><small>✦ ${escapeHtml(I.find(x=>x.id===island).name)} · ${escapeHtml(name||'心靈試煉')}</small><h3>${escapeHtml(title||'旅途中的相遇')}</h3></div><button class="rn-x" data-rn="close" aria-label="關閉">×</button></div><div class="rn-talk">${escapeHtml(text||'')}</div>${note?`<div class="rn-action-text">${escapeHtml(note)}</div>`:''}${choices.length?`<div class="rn-choices">${choices.map((c,i)=>`<button class="rn-choice" data-answer="${c.id}"><b>${'ABC'[i]}</b><span>${escapeHtml(c.text)}</span></button>`).join('')}</div>`:''}${actions.length?`<div class="rn-dialog-actions">${actions.map(a=>`<button class="${a.primary?'rn-primary':'rn-secondary'}" data-rn="${a.key}">${escapeHtml(a.label)}</button>`).join('')}</div>`:''}<p class="rn-footnotes">本關為經典主題的原創生活故事，並非經文逐字內容。</p></div></div></div>`;}
  function startIntro(){const th=themes[island];writeDialog({name:th.guide,face:th.face,title:'第一幕 · 啟程',text:`海霧散開，你踏上了「${I.find(x=>x.id===island).name}」。\n\n遠處的鐘聲與風聲交織，旅人們各自帶著疑惑。這裡的智慧，不藏在考卷裡，而藏在與人的每一次相遇裡。`,note:'移動：← → / A D，靠近島民按 E 或互動。手機可用畫面下方方向鍵。',actions:[{key:'begin',label:'踏上修行之路 ✦',primary:true}]});}
  function npcFace(i){const faces=['🧙🏻','👩🏻‍🦳','🧑🏻‍🌾','👨🏻‍🏫','👧🏻','🧝🏻‍♀️','👨🏻‍🦳','🧑🏻‍🎨'];return faces[(i+I.findIndex(x=>x.id===island)*2)%faces.length]}
  function chapterDialog(i){chapter=i;let d=C[island][i],p=active(),already=!!p.cards[`${island}:${i}`];if(already){writeDialog({name:`第 ${i+1} 位引路人`,face:npcFace(i),title:`智慧回憶 · ${d[0]}`,text:d[7],note:`「${d[8]}」\n🌱 今日行動：${d[9]}`,actions:[{key:'close',label:'繼續探索',primary:true}]});return}
    writeDialog({name:`第 ${i+1} 位引路人`,face:npcFace(i),title:d[0],text:d[2],note:`修行課題：${d[1]}\n${d[3]}`,choices:[{id:0,text:d[4]},{id:1,text:d[5]},{id:2,text:d[6]}]});}
  function answer(c){if(chapter<0)return;const d=C[island][chapter];const result=core.answer(island,chapter,c);syncHud();if(!result.ok){writeDialog({name:'旅途中的提醒',face:'🌧️',title:'這個選擇，還值得再想想',text:d[7],note:'真正的修行不怕重新嘗試。再想一想，你會選擇怎麼做？',choices:[{id:0,text:d[4]},{id:1,text:d[5]},{id:2,text:d[6]}]});return}
    writeDialog({name:'智慧之光',face:'✨',title:`領悟獲得 · ${d[0]}`,text:d[7],note:`「${d[8]}」\n\n🌱 今日的實踐：${d[9]}`,actions:[{key:'next',label:'收下智慧卡，繼續冒險',primary:true},{key:'close',label:'留在這裡'}]});lightCount+=1;burst=true;}
  let burst=false;
  function interact(){if(dialogue)return;const nearest=Math.min(C[island].length-1,Math.max(0,Math.round((hero.x-340)/405))),dist=Math.abs(hero.x-stationX(nearest)),bd=Math.abs(hero.x-bossX());if(bd<145&&record(island)===C[island].length){startBoss();return}if(dist<150){chapterDialog(nearest);return}flashHint('走近發光的島民，再進行互動');}
  function flashHint(t){toastText=t;toastUntil=performance.now()+2500;}
  function nextTarget(){const idx=firstUndone(),isFull=record(island)===C[island].length;walkTo=isFull?bossX():stationX(idx);closeDialog();flashHint(isFull?'前往終章光門':'正在前往下一段故事');}
  function startBoss(){if(record(island)!==C[island].length){writeDialog({name:'古老守門人',face:'🔒',title:'終章尚未解鎖',text:'先收集這座島上所有的智慧之光。當你真正走過每一次抉擇，光門自然會打開。',actions:[{key:'close',label:'回到島上'}]});return}if(active().bosses[island]){writeDialog({name:'光門守護者',face:'🌟',title:'你已點亮這座島',text:`你的願行：「${active().pledges[island]||'將所學帶回生活'}」。\n\n每次再回到這裡，都可以看看自己有沒有把願望變成生活。`,actions:[{key:'close',label:'繼續冒險',primary:true}]});return}bossStep=0;focusPhase=0;bossDialog();}
  function bossDialog(){if(bossStep===0){writeDialog({name:'迷霧之影',face:'👁️',title:'終章一 · 定心之鐘',text:'迷霧在你面前盤旋。當指針進入鐘聲中心的金色區域時，敲響心鐘，讓紛亂停下來。',actions:[{key:'focus-screen',label:'開始定心挑戰',primary:true}]});return}if(bossStep===1){const d=C[island][Math.floor(C[island].length*.62)];writeDialog({name:'迷霧之影',face:'🌫️',title:'終章二 · 明辨之問',text:d[2],note:d[3],choices:[{id:10,text:d[4]},{id:11,text:d[5]},{id:12,text:d[6]}]});return}writeDialog({name:'光門守護者',face:'🪷',title:'終章三 · 立下願行',text:'把學到的道理帶回生活，才是冒險最重要的勝利。請寫下一件你願意實際完成的事。',actions:[{key:'pledge-screen',label:'寫下我的願行',primary:true}]});}
  function focusScreen(){dialogue='focus';$('#rnDialogueMount',root).innerHTML=`<div class="rn-scene-overlay"><div class="rn-dialog" role="dialog" aria-modal="true"><div class="rn-portrait"><div class="rn-face">🔔</div><span>專注試煉</span></div><div class="rn-dialog-main"><div class="rn-dialog-head"><div><small>FINAL CHALLENGE · 1/3</small><h3>在金色區域敲響心鐘</h3></div><button class="rn-x" data-rn="close">×</button></div><p class="rn-talk">先觀察指針的節奏，再按「敲鐘」。越靠近中心，心念越容易安定。</p><div class="rn-bell"><div class="rn-bell-target"></div><div class="rn-bell-indicator" id="rnIndicator"></div></div><div id="rnFocusMessage" class="rn-footnotes"></div><div class="rn-dialog-actions"><button class="rn-primary" data-rn="strike">🔔 敲響心鐘</button></div></div></div></div>`;}
  function strike(){let delta=Math.abs(focusPhase-.5);if(delta<.08){bossStep=1;bossDialog()}else{$('#rnFocusMessage',root).textContent='還差一點。觀察指針再次靠近中央金色區域。';flashHint('掌握節奏，再試一次');}}
  function bossAnswer(c){if(c!==11){writeDialog({name:'迷霧之影',face:'🌫️',title:'迷惑仍在',text:'先想想，怎樣做才真正把道理落實在生活？',actions:[{key:'boss-again',label:'重新思考',primary:true}]});return}bossStep=2;bossDialog();}
  function pledgeScreen(){dialogue='pledge';$('#rnDialogueMount',root).innerHTML=`<div class="rn-scene-overlay"><div class="rn-dialog" role="dialog" aria-modal="true"><div class="rn-portrait"><div class="rn-face">🪷</div><span>願行試煉</span></div><div class="rn-dialog-main"><div class="rn-dialog-head"><div><small>FINAL CHALLENGE · 3/3</small><h3>把道理帶進生活</h3></div><button class="rn-x" data-rn="close">×</button></div><p class="rn-talk">寫下一個具體、可以在這一週完成的行動，讓旅途裡的智慧成為生活的一部分。</p><textarea class="rn-vow" id="rnVow" maxlength="220" placeholder="例如：這星期主動陪伴家人，耐心聽他們說話……"></textarea><div id="rnVowMessage" class="rn-footnotes"></div><div class="rn-dialog-actions"><button class="rn-primary" data-rn="finish">✦ 點亮島嶼</button></div></div></div></div>`;}
  function finish(){const val=$('#rnVow',root)?.value.trim()||'';if(val.length<4){$('#rnVowMessage',root).textContent='請留下至少四個字，寫下具體的願行。';return}core.finish(island,val);syncHud();const all=I.every(x=>active().bosses[x.id]);writeDialog({name:'光門守護者',face:'🏆',title:all?'四島通明 · 旅程完成':'這座島，已被你的智慧點亮',text:`當迷霧散去，島上的光重新亮起。\n\n你留下的願行：「${val}」\n\n真正的修行，不是打敗了什麼，而是願意在生活中改變自己。`,actions:[{key:'home',label:'返回四境地圖',primary:true},{key:'close',label:'留在島上'}]});}
  function onAction(action){if(action==='close'){closeDialog();return}if(action==='begin'){closeDialog();flashHint('尋找第一位引路人，與他對話');return}if(action==='next'){nextTarget();return}if(action==='home'){closeDialog();showMap();return}if(action==='boss-again'){bossStep=1;bossDialog();return}if(action==='focus-screen'){focusScreen();return}if(action==='strike'){strike();return}if(action==='pledge-screen'){pledgeScreen();return}if(action==='finish'){finish();return}}
  function drawBuilding(x,base,color,scale=1){ctx.save();ctx.translate(x,base);ctx.scale(scale,scale);ctx.fillStyle='#0004';ctx.beginPath();ctx.ellipse(0,3,112,17,0,0,7);ctx.fill();ctx.fillStyle='#d9be89';ctx.fillRect(-84,-133,168,123);ctx.fillStyle='#534132';for(let z=-72;z<78;z+=32)ctx.fillRect(z,-123,6,115);ctx.fillStyle='#f9e2b1';for(let z=-65;z<75;z+=32)ctx.fillRect(z,-110,22,62);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-114,-146);ctx.quadraticCurveTo(-57,-157,0,-173);ctx.quadraticCurveTo(60,-160,114,-146);ctx.lineTo(103,-131);ctx.lineTo(-105,-131);ctx.fill();ctx.strokeStyle='#edce90';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-114,-143);ctx.quadraticCurveTo(0,-167,114,-143);ctx.stroke();ctx.fillStyle='#765644';ctx.fillRect(-94,-25,188,25);ctx.restore()}
  function drawTree(x,ground,phase=0){ctx.save();ctx.translate(x,ground);ctx.fillStyle='#3f483c';ctx.beginPath();ctx.ellipse(0,2,42,12,0,0,7);ctx.fill();ctx.fillStyle='#6a493e';ctx.fillRect(-9,-132,18,133);const green=themes[island].ground;for(let j=0;j<3;j++){ctx.fillStyle=j%2?'#355a54':green;ctx.beginPath();ctx.ellipse((j-1)*17+Math.sin(currentTime*.0006+phase)*3,-153-j*20,65-j*9,39-j*3,0,0,7);ctx.fill();ctx.fillStyle='#ffffff20';ctx.beginPath();ctx.ellipse(-11+(j-1)*17,-173-j*20,34,12,-.1,0,7);ctx.fill()}ctx.restore()}
  function drawLamp(x,ground,t){ctx.save();ctx.translate(x,ground);ctx.fillStyle='#5a4c42';ctx.fillRect(-7,-82,14,82);ctx.fillRect(-20,-92,40,12);ctx.fillStyle='#fbe9bb';ctx.shadowColor='#fff0ae';ctx.shadowBlur=23+5*Math.sin(t/350+x);ctx.fillRect(-12,-117,24,26);ctx.shadowBlur=0;ctx.fillStyle='#72513c';ctx.beginPath();ctx.moveTo(-23,-117);ctx.lineTo(0,-131);ctx.lineTo(23,-117);ctx.fill();ctx.restore()}
  // Chibi 旅人與島民，使用細節分層的 Canvas 角色，不依賴外部人物素材
  function drawNPC(x,ground,idx,t){
    const done=!!active().cards[`${island}:${idx}`],tone=idx%4;
    const robes=['#658d90','#b68d6c','#a17c9f','#68927f'];
    const trim=['#e4cd97','#f6e1a8','#e7d4ef','#d3e5bd'];
    ctx.save();ctx.translate(x,ground+Math.sin(t/700+idx)*2);
    ctx.fillStyle='#172c3060';ctx.beginPath();ctx.ellipse(0,10,42,10,0,0,7);ctx.fill();
    // Lantern glow and small interactive mark
    const glow=done?'#b6f8d5':'#ffe9a7';
    ctx.save();ctx.shadowColor=glow;ctx.shadowBlur=27;ctx.fillStyle=glow;
    ctx.beginPath();ctx.arc(0,-151+Math.sin(t/550+idx)*5,6,0,7);ctx.fill();ctx.restore();
    ctx.font='bold 25px serif';ctx.textAlign='center';ctx.fillStyle=done?'#b5f5cd':'#fff1bc';ctx.fillText(done?'✦':'❖',0,-164+Math.sin(t/550+idx)*5);
    // Hair trailing behind shoulders
    ctx.fillStyle='#292e34';ctx.beginPath();ctx.ellipse(0,-95,26,32,0,0,7);ctx.fill();
    // Lower trousers and shoes
    ctx.fillStyle='#30464b';ctx.fillRect(-23,-20,17,27);ctx.fillRect(6,-20,17,27);
    ctx.fillStyle='#342c29';ctx.beginPath();ctx.ellipse(-15,7,15,6,-.1,0,7);ctx.ellipse(17,7,15,6,.1,0,7);ctx.fill();
    // Layered robe body
    const robe=ctx.createLinearGradient(-35,-90,43,3);robe.addColorStop(0,'#e2cba9');robe.addColorStop(.12,robes[tone]);robe.addColorStop(.7,robes[tone]);robe.addColorStop(1,'#2f5357');
    ctx.fillStyle=robe;ctx.beginPath();ctx.moveTo(-22,-83);ctx.lineTo(24,-83);ctx.lineTo(38,-1);ctx.quadraticCurveTo(0,9,-38,-1);ctx.closePath();ctx.fill();
    ctx.lineWidth=2.2;ctx.strokeStyle=trim[tone];ctx.stroke();
    // Shoulder cape, sleeves and embroidered collar
    ctx.fillStyle=robes[tone];ctx.beginPath();ctx.moveTo(-22,-80);ctx.lineTo(-42,-72);ctx.lineTo(-44,-35);ctx.quadraticCurveTo(-31,-29,-26,-40);ctx.lineTo(-16,-69);ctx.fill();ctx.beginPath();ctx.moveTo(22,-80);ctx.lineTo(41,-70);ctx.lineTo(42,-33);ctx.quadraticCurveTo(30,-31,24,-45);ctx.lineTo(13,-69);ctx.fill();
    ctx.fillStyle='#f4cfa9';ctx.beginPath();ctx.arc(-38,-36,8,0,7);ctx.arc(37,-36,8,0,7);ctx.fill();
    ctx.strokeStyle=trim[tone];ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-13,-84);ctx.lineTo(0,-63);ctx.lineTo(13,-84);ctx.stroke();
    ctx.strokeStyle='#e6c787';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-31,-35);ctx.lineTo(0,-25);ctx.lineTo(32,-35);ctx.stroke();
    ctx.fillStyle='#fae5bd';ctx.beginPath();ctx.arc(0,-49,7,0,7);ctx.fill();ctx.strokeStyle='#bd8e4f';ctx.stroke();
    // Face, cheeks and detailed hair / hood
    ctx.fillStyle='#f6cfaa';ctx.beginPath();ctx.ellipse(0,-107,26,28,0,0,7);ctx.fill();
    ctx.fillStyle='#da9f82';ctx.beginPath();ctx.ellipse(-16,-99,5,3,0,0,7);ctx.ellipse(16,-99,5,3,0,0,7);ctx.fill();
    ctx.fillStyle=idx%3===1?'#685044':'#2f3540';ctx.beginPath();ctx.moveTo(-27,-112);ctx.quadraticCurveTo(-28,-146,-3,-141);ctx.quadraticCurveTo(30,-146,27,-113);ctx.lineTo(19,-123);ctx.lineTo(9,-119);ctx.lineTo(1,-128);ctx.lineTo(-12,-118);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#ffffff42';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-16,-130);ctx.quadraticCurveTo(0,-141,14,-130);ctx.stroke();
    ctx.fillStyle='#292d31';ctx.beginPath();ctx.arc(-10,-105,2.6,0,7);ctx.arc(10,-105,2.6,0,7);ctx.fill();
    ctx.strokeStyle='#aa645a';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,-95,6,.1,Math.PI-.1);ctx.stroke();
    // Character-specific accessory
    if(idx%3===1){ctx.fillStyle='#e4c78e';ctx.save();ctx.translate(34,-64);ctx.rotate(.25);ctx.fillRect(-7,-10,14,38);ctx.fillStyle='#c6a56c';ctx.fillRect(-9,-12,18,7);ctx.fillRect(-9,23,18,7);ctx.restore()}
    if(idx%3===2){ctx.fillStyle='#ead7a7';ctx.beginPath();ctx.arc(-30,-46,10,0,7);ctx.fill();ctx.fillStyle='#886e4a';ctx.beginPath();ctx.arc(-30,-46,6,0,7);ctx.fill()}
    // Focal label as a diegetic inked stone sign
    const title=C[island][idx][0];ctx.font='bold 16px "Noto Sans TC",sans-serif';const width=Math.min(228,Math.max(125,ctx.measureText(title).width+32));
    ctx.fillStyle='#102b38e9';ctx.strokeStyle=done?'#91e9c4aa':'#f5dbaec7';ctx.lineWidth=1.8;ctx.beginPath();ctx.roundRect(-width/2,23,width,39,16);ctx.fill();ctx.stroke();ctx.fillStyle='#fdf2df';ctx.textAlign='center';ctx.fillText(title,0,48);
    ctx.restore();
  }
  function drawHero(x,ground,t){
    const moving=press.size||walkTo!==null,step=moving?Math.sin(hero.stride)*7:0;
    ctx.save();ctx.translate(x,ground+step*.11);ctx.scale(hero.facing,1);
    ctx.fillStyle='#0b22265c';ctx.beginPath();ctx.ellipse(0,10,40,12,0,0,7);ctx.fill();
    ctx.fillStyle='#304e56';ctx.fillRect(-23,-30+step,16,34-step);ctx.fillRect(6,-30-step,16,34+step);
    ctx.fillStyle='#402e2e';ctx.beginPath();ctx.ellipse(-17,6,16,7,-.1,0,7);ctx.ellipse(16,6,16,7,.1,0,7);ctx.fill();
    // Silk scarf / cape catches the wind
    ctx.fillStyle='#edd5ab';ctx.beginPath();ctx.moveTo(-19,-87);ctx.quadraticCurveTo(-54,-75,-46+Math.sin(t/330)*5,-24);ctx.quadraticCurveTo(-30,-14,-19,-41);ctx.closePath();ctx.fill();
    let coat=ctx.createLinearGradient(-31,-95,39,-20);coat.addColorStop(0,'#97bac5');coat.addColorStop(.43,'#3c788d');coat.addColorStop(1,'#284b60');ctx.fillStyle=coat;
    ctx.beginPath();ctx.moveTo(-21,-89);ctx.lineTo(24,-90);ctx.lineTo(40,-19);ctx.quadraticCurveTo(-2,-7,-40,-19);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f8deaf';ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#3a7184';ctx.beginPath();ctx.moveTo(-19,-88);ctx.lineTo(-35,-82);ctx.lineTo(-48,-42);ctx.lineTo(-33,-37);ctx.lineTo(-16,-69);ctx.fill();ctx.beginPath();ctx.moveTo(20,-88);ctx.lineTo(36,-81);ctx.lineTo(45,-39);ctx.lineTo(31,-34);ctx.lineTo(17,-72);ctx.fill();
    ctx.fillStyle='#efc89d';ctx.beginPath();ctx.arc(-40,-42,8,0,7);ctx.arc(39,-40,8,0,7);ctx.fill();
    ctx.strokeStyle='#e1c288';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-23,-49);ctx.lineTo(22,-53);ctx.stroke();
    ctx.fillStyle='#f1d28e';ctx.beginPath();ctx.arc(0,-51,10,0,7);ctx.fill();ctx.strokeStyle='#b58d52';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='#e9c79e';ctx.beginPath();ctx.ellipse(0,-109,29,30,0,0,7);ctx.fill();
    // Hair with distinctive traveler's bun
    ctx.fillStyle='#25323f';ctx.beginPath();ctx.ellipse(1,-134,22,15,0,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(-29,-114);ctx.quadraticCurveTo(-34,-144,-10,-142);ctx.quadraticCurveTo(19,-145,30,-122);ctx.lineTo(22,-118);ctx.lineTo(10,-127);ctx.lineTo(-1,-120);ctx.lineTo(-16,-124);ctx.lineTo(-26,-114);ctx.fill();
    ctx.fillStyle='#ffe1ac';ctx.beginPath();ctx.arc(0,-143,5,0,7);ctx.fill();
    ctx.fillStyle='#2f3337';ctx.beginPath();ctx.arc(-10,-106,3,0,7);ctx.arc(10,-106,3,0,7);ctx.fill();
    ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(-9,-108,1,0,7);ctx.arc(11,-108,1,0,7);ctx.fill();
    ctx.strokeStyle='#b87669';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(0,-97,6,.15,Math.PI-.15);ctx.stroke();
    ctx.restore();
  }
  function background(t){const W=sceneWidth,H=sceneHeight,th=themes[island],im=pics[island];ctx.fillStyle=th.sky;ctx.fillRect(0,0,W,H);if(im.complete&&im.naturalWidth){ctx.save();ctx.globalAlpha=.72;ctx.filter='blur(2px)';const ratio=Math.max(W/im.naturalWidth,H*.83/im.naturalHeight),dw=im.naturalWidth*ratio,dh=im.naturalHeight*ratio;ctx.drawImage(im,-(dw-W)/2+(cam*.04%50),-(dh-H*.83)/2-30,dw,dh);ctx.filter='none';ctx.restore()}
    let sh=ctx.createLinearGradient(0,0,0,H);sh.addColorStop(0,'#0c25302c');sh.addColorStop(.6,'#173944a0');sh.addColorStop(1,'#12242de8');ctx.fillStyle=sh;ctx.fillRect(0,0,W,H);
    const floor=H*.78;ctx.fillStyle='#446e77b2';ctx.beginPath();ctx.moveTo(0,floor-60);for(let x=0;x<=W+30;x+=30){const y=floor-120+Math.sin((x+cam*.17)*.005)*19+Math.cos((x+cam*.2)*.012)*7;ctx.lineTo(x,y)}ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();ctx.fillStyle=th.ground;ctx.fillRect(0,floor-1,W,H-floor);ctx.fillStyle='#d5bf92';ctx.fillRect(0,floor,W,19);ctx.fillStyle='#a99170';ctx.fillRect(0,floor+18,W,12);ctx.fillStyle='#284744';ctx.fillRect(0,floor+30,W,H-floor);for(let x=(-cam%100)-100;x<W+100;x+=100){ctx.fillStyle='#a9aa84';ctx.beginPath();ctx.ellipse(x,floor+10,43,5,0,0,7);ctx.fill()}
    for(let x=(-cam*.55%165)-165;x<W+165;x+=165){ctx.fillStyle='#274e4966';ctx.beginPath();ctx.ellipse(x,floor+70,35,10,0,0,7);ctx.fill();ctx.fillStyle='#b99e6288';ctx.beginPath();ctx.arc(x+42,floor+45,4,0,7);ctx.fill()}
  }
  function draw(t){if(state!=='stage')return;const W=sceneWidth,H=sceneHeight,floor=H*.78;ctx.clearRect(0,0,W,H);background(t);
    const left=cam-220,right=cam+W+220;
    for(let j=Math.floor(left/260);j<Math.ceil(right/260);j++){let x=j*260+145-cam;if(j%3===1)drawTree(x,floor,1+j);else if(j%3===0)drawLamp(x,floor,t);if(j%4===1){ctx.save();ctx.translate(x+68,floor);ctx.fillStyle='#eab6ba';for(let q=0;q<6;q++){const fx=Math.sin(j*15+q*8)*27,fy=Math.cos(j*6+q*5)*20;ctx.beginPath();ctx.arc(fx,fy,3+(q%3),0,7);ctx.fill()}ctx.restore()}}
    for(let k=1;k<=C[island].length;k+=3){const bx=stationX(k)-160-cam;if(bx>-210&&bx<W+210)drawBuilding(bx,floor-3,themes[island].roof,.61)}
    for(let j=0;j<C[island].length;j++){const x=stationX(j)-cam;if(x<left-cam||x>right-cam)continue;drawNPC(x,floor,j,t)}
    const bx=bossX()-cam;if(bx>-180&&bx<W+180){drawBuilding(bx,floor,themes[island].roof,.88);ctx.save();ctx.translate(bx,floor-170);ctx.shadowColor='#f2ca81';ctx.shadowBlur=35;ctx.fillStyle=record(island)===C[island].length?'#f8db9b':'#8b98a2';ctx.font='64px serif';ctx.textAlign='center';ctx.fillText(record(island)===C[island].length?'✦':'🔒',0,-7);ctx.restore();ctx.font='bold 21px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff0ce';ctx.fillText('終章 · 光門',bx,floor+63)}
    for(const c of collectibles){if(c.taken)continue;let x=c.x-cam;if(x<-20||x>W+20)continue;let y=floor-180+Math.sin(t*.002+c.x)*13;ctx.save();ctx.shadowBlur=23;ctx.shadowColor='#ffeebb';ctx.fillStyle='#fff2a7';ctx.font='29px serif';ctx.textAlign='center';ctx.fillText('✧',x,y);ctx.restore()}
    for(const f of fireflies){const x=(f.x+t*.012+Math.sin(f.a+t*.0007)*21)%W,y=(f.y+Math.sin(t*.0012+f.a)*35)%H;ctx.fillStyle='rgba(255,233,182,.55)';ctx.beginPath();ctx.arc(x,y,1.5+Math.sin(f.a+t*.003),0,7);ctx.fill()}
    drawHero(hero.x-cam,floor,t);
    // 進度航線置於下方，比全畫面的編號節點更安靜
    const progress=record(island)/C[island].length;ctx.fillStyle='#122e3c9c';ctx.beginPath();ctx.roundRect(W*.29,H-32,W*.42,7,4);ctx.fill();ctx.fillStyle='#f0ca85';ctx.beginPath();ctx.roundRect(W*.29,H-32,W*.42*progress,7,4);ctx.fill();
    if(burst){ctx.fillStyle='#ffe4a7aa';ctx.beginPath();ctx.arc(hero.x-cam,floor-110,65+Math.sin(t*.01)*7,0,Math.PI*2);ctx.fill();burst=false;}
  }
  function tick(t){const dt=Math.min(.05,(t-last)/1000||.016);last=t;currentTime=t;if(state==='stage'){const busy=!!dialogue;if(!busy){let dx=0;if(press.has('left'))dx=-1;if(press.has('right'))dx=1;if(walkTo!==null){const remain=walkTo-hero.x;if(Math.abs(remain)<95){let target=walkTo;walkTo=null;if(Math.abs(target-bossX())<90)startBoss();else{let i=Math.round((target-340)/405);chapterDialog(Math.max(0,Math.min(C[island].length-1,i)))} }else dx=Math.sign(remain)}if(dx){hero.x=Math.max(70,Math.min(worldWidth-105,hero.x+dx*dt*300));hero.facing=dx;hero.stride+=dt*12}}
      cam+=(Math.max(0,Math.min(worldWidth-sceneWidth,hero.x-sceneWidth*.32))-cam)*Math.min(1,dt*5.5);for(const c of collectibles)if(!c.taken&&Math.abs(c.x-hero.x)<38){c.taken=true;lightCount++;flashHint(`✧ 發現一點智慧之光！共 ${lightCount} 顆`)}
      if(dialogue==='focus'){focusPhase=(focusPhase+dt*.55)%1;const marker=$('#rnIndicator',root);if(marker)marker.style.left=(focusPhase*100)+'%'}
      draw(t);if(t%550<35){const el=$('#rnHint',root);if(el)el.textContent=t<toastUntil?toastText:(window.innerWidth<620?'按住方向鍵移動 · 靠近島民按「互動」':'按 A / D 或 ← → 移動，E 與島民互動 · 點選角色也可自動前往')}}requestAnimationFrame(tick)}
  root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.enter){enter(b.dataset.enter);return}if(b.dataset.answer!==undefined){const n=Number(b.dataset.answer);if(n>=10)bossAnswer(n);else answer(n);return}if(b.dataset.rn){onAction(b.dataset.rn);return}});
  $('#rnOldVersion',root).addEventListener('click',()=>{root.hidden=true;document.querySelector('#homeView')?.scrollIntoView()});
  $('#rnBack',root).addEventListener('click',showMap);
  $('#rnInteract',root).addEventListener('click',interact);
  $('#rnNext',root).addEventListener('click',nextTarget);
  const padBtns=root.querySelectorAll('[data-move]');for(const b of padBtns){const dir=b.dataset.move;const down=e=>{e.preventDefault();press.add(dir);walkTo=null;b.classList.add('pressed');b.setPointerCapture?.(e.pointerId)};const up=()=>{press.delete(dir);b.classList.remove('pressed')};b.addEventListener('pointerdown',down);for(const evt of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(evt,up)}
  window.addEventListener('keydown',e=>{if(root.hidden||state!=='stage')return;if(e.target?.matches('textarea,input'))return;const key=e.key.toLowerCase();if(['arrowleft','a','arrowright','d','e','enter',' '].includes(key)){e.preventDefault();e.stopImmediatePropagation()}if(dialogue){if(key==='escape')closeDialog();return}if(key==='arrowleft'||key==='a'){press.add('left');walkTo=null}if(key==='arrowright'||key==='d'){press.add('right');walkTo=null}if(key==='e'||key==='enter'||key===' ')interact()},true);
  window.addEventListener('keyup',e=>{const key=e.key.toLowerCase();if(key==='arrowleft'||key==='a')press.delete('left');if(key==='arrowright'||key==='d')press.delete('right')},true);
  window.addEventListener('blur',()=>press.clear());
  canvas.addEventListener('click',e=>{if(dialogue)return;const bounds=canvas.getBoundingClientRect(),x=(e.clientX-bounds.left)/bounds.width*sceneWidth+cam;let nearest=-1,dist=190;for(let j=0;j<C[island].length;j++){const d=Math.abs(x-stationX(j));if(d<dist){dist=d;nearest=j}}if(nearest>=0){walkTo=stationX(nearest);flashHint(`正前往「${C[island][nearest][0]}」`)}else if(Math.abs(x-bossX())<200){walkTo=bossX()}else {walkTo=Math.max(70,Math.min(worldWidth-105,x))}});
  window.addEventListener('resize',()=>{if(state==='stage')resize()});
  window.addEventListener('dao:progress',()=>{if(state==='map')syncHome();else if(state==='stage')syncHud()});
  syncHome();requestAnimationFrame(tick);
})();