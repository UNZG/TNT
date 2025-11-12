// ==UserScript==
// @name         Zalo Auto Reply v3.5
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  Auto-reply + Monitor with persistent Setup tab (STT|Name|Text). Double-click bubble to open. Uses GM_setValue/GM_getValue.
// @match        https://chat.zalo.me/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULT_USERS = [
    { name: 'Thái Hoàng', message: '1', enabled: true },
    { name: 'Đinh Trình', message: '1', enabled: true },
    { name: 'Minh Trang', message: '1', enabled: false },
    { name: 'Khuất Duy Hoàng', message: '1', enabled: false },
  ];

  let USERS = loadUsersFromStorage();
  let observer = null;
  let respondedMessages = new Set();
  let currentChatTitle = '';

  const CONFIG = {
      WEBAPP_URL: "https://script.google.com/macros/s/AKfycbyARsCH96wUBzT0aTiGl0QIQsT_X45ODHg5V3GoFpUUF1IXjHGrjpqABGFANvdMNnY/exec"
  };

  function sendToSheet(event, data = {}, sheetName = "log") {
      const payload = {
          event,
          sheet: sheetName,
          payload: data
      };
      return fetch(CONFIG.WEBAPP_URL, {
          method: "POST",
          mode: "no-cors",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(payload)
      });
  }



  // --- Styles ---
  GM_addStyle(`
    #zar-popup { position: fixed; top: 80px; left: 30px; width: 520px; height: 420px; background: #fff; color:#111;
                 border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,0.25); z-index:999999; display:none; flex-direction:column; overflow:hidden; font-family:Arial,Helvetica,sans-serif; }
    #zar-header { background:#2c3e50; color:white; padding:8px 12px; display:flex; align-items:center; gap:8px; cursor:move; }
    #zar-tabs { display:flex; gap:6px; margin-left:10px; }
    .zar-tab { padding:6px 10px; border-radius:6px; background:rgba(255,255,255,0.06); cursor:pointer; font-weight:600; color: #eaeaea; }
    .zar-tab.active { background: white; color:#2c3e50; box-shadow: 0 2px 6px rgba(0,0,0,0.12); }
    #zar-body { display:flex; flex-direction:column; flex:1; padding:10px; box-sizing:border-box; overflow:hidden; }
    .zar-panel { display:none; height:100%; overflow:hidden; }
    .zar-panel.active { display:flex; flex-direction:column; }
    .zar-scroll { overflow:auto; flex:1; padding:6px; box-sizing:border-box; }
    table.zar-table { width:100%; border-collapse:collapse; font-size:13px; }
    table.zar-table th, table.zar-table td { border:1px solid #ddd; padding:6px; text-align:left; vertical-align:middle; }
    table.zar-table th { background:#f4f6f8; font-weight:700; }
    td[contenteditable="true"] { outline:none; min-width:60px; }
    .zar-actions { display:flex; gap:6px; align-items:center; margin-top:8px; }
    button.zar-btn { padding:6px 8px; border-radius:6px; border:1px solid #bbb; cursor:pointer; background:white; }
    #zar-bubble { position: fixed; bottom: 80px; right: 30px; width: 52px; height: 52px; background:#1e88e5; color:white; border-radius:50%;
                   display:flex; align-items:center; justify-content:center; font-size:22px; z-index:999999; box-shadow:0 8px 22px rgba(0,0,0,0.3); cursor: pointer; user-select:none; }
    #zar-log { font-size:12px; background:#fafafa; padding:6px; border-radius:6px; border:1px solid #eee; max-height:370px; overflow:auto; }
    .zar-row-ops { display:flex; gap:6px; }
    .zar-small { font-size:12px; padding:4px 6px; }
    #zar-header .right { margin-left:auto; display:flex; gap:8px; align-items:center; }
    .zar-mini { font-size:12px; color:#ddd; }
  `);

  function loadUsersFromStorage() {
    try {
      const raw = GM_getValue('userList', null);
      if (raw && Array.isArray(raw)) return raw;
      if (raw) return raw;
    } catch (e) {}
    return DEFAULT_USERS.slice();
  }
  function saveUsersToStorage(list) { GM_setValue('userList', list); }

  function getChatTitle() { const el = document.querySelector('#header .header-title'); return el?.textContent?.trim()||''; }
  function insertMessage(text) { const inputBox=document.querySelector('#richInput'); if(!inputBox)return; inputBox.innerHTML=`<div id="input_line_0">${text}</div>`; inputBox.focus(); inputBox.dispatchEvent(new Event('input',{bubbles:true})); }
  function clickSendButton() { const btn=document.querySelector('div.send-msg-btn'); if(btn)btn.click(); }

  function uiLog(text, color = 'gray'){ const el=document.getElementById('zar-log'); if(!el)return; const div=document.createElement('div'); div.style.color = color; div.textContent=`[${new Date().toLocaleTimeString('vi-VN',{hour12:false})}] ${text}`; el.insertBefore(div,el.firstChild); }
  function incrementCounterUI(){ const counterEl=document.getElementById('zar-msg-counter'); if(!counterEl)return; const v=Number(GM_getValue('msg_counter',0))+1; GM_setValue('msg_counter',v); counterEl.textContent=String(v); }

  function extractSenderFromItem(item){ const nameDiv=item.querySelector('.message-sender-name-content .truncate'); return nameDiv?.textContent?.trim().replace(/\u00A0/g,' ')||null; }
  function getMessageId(item){ const bubble=item.querySelector('[data-qid]'); return bubble?.getAttribute('data-qid')||null; }

  function parseMessage(el) {
    const name = el.querySelector('.truncate')?.innerText.trim() || '';
    const time = el.querySelector('.card-send-time__sendTime')?.innerText.trim() || '';
    const id = el.querySelector('[id^="message-frame_"]')?.id || '';

    let content = '';
    const textContainer = el.querySelector('.text-message__container');
    const cardContainer = el.querySelector('.contact-card__description-wrapper > div');

    if (textContainer) {
      content = [...textContainer.querySelectorAll('.text, .text-is-phone-number')]
        .map(n => n.innerText.trim())
        .join(' ');
    } else if (cardContainer) {
      content = cardContainer.innerText.trim();
    }

    return { id, name, time, content };
  }

  function messageTimeNowAsiaBangkok() {
    try {
      return new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
    } catch (e) {
      const now = new Date();
      return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    }
  }

  function containsPhonePattern(content) {
    if (!content) return false;
    const digitSeqs = content.match(/\d+/g) || [];
    return digitSeqs.some(seq => /^0\d{9}$/.test(seq));
  }

  function processMessageNode(node) {
    const items = node.classList && node.classList.contains('chat-item') ? [node] : Array.from(node.querySelectorAll ? node.querySelectorAll('.chat-item') : []);
    if (!items.length) return;
    items.forEach(item => {
      // skip if it's "me"
      const cls = Array.from(item.classList || []);
      if (cls.includes('me')) {
        uiLog(`(SKIP) Own message`, 'darkgray');
        return;
      }

      const msg = parseMessage(item);
      if (!msg || !msg.id) {
        //uiLog(`(SKIP) No id parsed for this chat-item. raw parse: ${JSON.stringify(msg)}`, 'orange');
        return;
      }
      if (respondedMessages.has(msg.id)) {
        //uiLog(`(SKIP) Already processed id:${msg.id}`, 'darkgray');
        return;
      }

      // Mark as seen early to avoid duplicates while debugging (can move later)
      respondedMessages.add(msg.id);

      // Basic parsed info log (very detailed)
      //uiLog(`(PARSE) id:${msg.id} | name:"${msg.name}" | time:"${msg.time}" | content:"${msg.content}"`, 'lightgray');

      // Field existence checks
      const hasName = !!msg.name;
      const hasTime = !!msg.time;
      const hasContent = !!msg.content;
      if (!hasName || !hasTime || !hasContent) {
        //uiLog(`(IGNORED) Missing fields -> name:${hasName} time:${hasTime} content:${hasContent}`, 'darkgray');
        return;
      }

      // Time comparison (Asia/Bangkok)
      const nowTime = messageTimeNowAsiaBangkok();
      const timeMatches = (msg.time === nowTime);
      //uiLog(`(TIME) messageTime:${msg.time} | nowTime:${nowTime} | matches:${timeMatches}`, 'lightgray');

      // Phone detection diagnostics
      const digitSeqs = (msg.content.match(/\d+/g) || []).join(', ');
      const phoneDetected = containsPhonePattern(msg.content);
      //uiLog(`(PHONE CHECK) digit sequences found: [${digitSeqs}] | phoneDetected:${phoneDetected}`, 'lightgray');

      // Prepare normalized name for lookup
      const normalizedMsgName = msg.name.trim().normalize().replace(/\s+/g,' ').toLowerCase();
      USERS = loadUsersFromStorage(); // reload current config in case user edited
      // build an index of config names normalized -> original object for diagnostic
      const configIndex = USERS.reduce((acc,u)=> {
        if(!u || !u.name) return acc;
        const key = u.name.trim().normalize().replace(/\s+/g,' ').toLowerCase();
        acc[key] = u;
        return acc;
      }, {});
      const configKeys = Object.keys(configIndex);

      //uiLog(`(CONFIG) available config names (normalized): [${configKeys.join(' | ')}]`, 'lightgray');
      //uiLog(`(COMPARE) msg name normalized: "${normalizedMsgName}"`, 'lightgray');

      // Try to find userConfig by normalized match; also attempt startsWith or includes as fallback
      let userConfig = configIndex[normalizedMsgName] || null;
      if(!userConfig) {
        // fallback: case-insensitive substring / startsWith
        const fallbackKey = configKeys.find(k => k === normalizedMsgName) || configKeys.find(k => k.includes(normalizedMsgName)) || configKeys.find(k => normalizedMsgName.includes(k)) || null;
        if (fallbackKey) userConfig = configIndex[fallbackKey];
        //uiLog(`(FALLBACK) matched by fallbackKey: ${fallbackKey || 'none'}`, 'lightgray');
      }

      //uiLog(`(USER CONFIG) found:${!!userConfig} -> ${userConfig ? JSON.stringify(userConfig) : 'null'}`, 'lightgray');

      // Check enabled flag robustly
      //const isEnabledInConfig = !!(userConfig && (userConfig.enabled === true || userConfig.enabled === '1' && timeMatches));
      const isEnabledInConfig = !!(userConfig && (userConfig.enabled === true || userConfig.enabled === '1') && timeMatches);
      //uiLog(`(ENABLED CHECK) userConfigExists:${!!userConfig} enabledFlag:${isEnabledInConfig}`, 'lightgray');

      // Global auto status
      const autoEnabledGlobally = (GM_getValue('auto_enabled','0') === '1');
      const autoToggleChecked = document.getElementById('zar-auto-toggle')?.checked === true;
      //uiLog(`(AUTO FLAGS) GM_auto:${autoEnabledGlobally} | UI_toggle:${autoToggleChecked}`, 'lightgray');

      // Decision tree
      if (!phoneDetected) {
        uiLog(`(NO PHONE) ${msg.name}: ${msg.content}_${msg.time}`, 'darkgray');
        return;
      }

      // Phone detected -> default red log
      uiLog(`(PHONE) ${msg.name}: ${msg.content}_${msg.time}`, 'red');

      // If config found and enabled and auto fully active, attempt send
      if (userConfig && isEnabledInConfig && autoEnabledGlobally && autoToggleChecked) {
        const activeTitle = getChatTitle();
        if (activeTitle === currentChatTitle) {
          uiLog(`(AUTO ACTION) Typing...`, 'green');
          try {
            insertMessage(userConfig.message);
            setTimeout(() => {
              clickSendButton();
              incrementCounterUI();
              uiLog(`✅ (SENT) Reply "${userConfig.message}"`, 'green');
            }, 400);
          } catch (e) {
            uiLog(`❌ (ERROR) Sending failed: ${e.message}`, 'orange');
          }
        } else {
          uiLog(`(AUTO READY) Auto conditions met but active chat mismatch: currentChat="${currentChatTitle}" vs active="${activeTitle}"`, 'orange');
        }
      } else {
        // Log why not auto-sent
        const reasons = [];
        if (!userConfig) reasons.push('Tên người gửi không có trong danh sách');
        if (userConfig && !isEnabledInConfig) reasons.push('Người dùng chưa bật hoặc tin nhắn cũ');
        if (!autoEnabledGlobally) reasons.push('Chưa bật chế độ AUTO');
        if (!autoToggleChecked) reasons.push('UI toggle off');
        uiLog(`(AUTO SKIP) Reasons: ${reasons.join(' | ')}`, 'darkgray');
      }
    });
  }

  // --- Replace refreshObserver with observer that uses parseMessage and processes only new nodes ---
  function refreshObserver(){
    // find the block-date that contains 'Hôm nay' (try multiple container selectors)
    const blockDates = Array.from(document.querySelectorAll('#messageView .block-date, #messageViewContainer .block-date'));
    let todayBlock = blockDates.find(el => el.textContent.includes('Hôm nay'));
    let observeTarget = null;

    if (todayBlock) {
      // some layouts put the block-date inside a wrapper; choose its parent that contains chat-items
      observeTarget = todayBlock.parentElement || todayBlock;
    } else {
      // fallback to whole message view
      observeTarget = document.querySelector('#messageView') || document.querySelector('#messageViewContainer');
    }

    if (!observeTarget) {
      uiLog('❌ Cannot find message container to observe. Will retry on next refresh.', 'orange');
      return;
    }

    if (observer) observer.disconnect();

    currentChatTitle = getChatTitle();
    const shortTitle = currentChatTitle ? currentChatTitle.slice(0,15) : '____^_-_^____';
    const headerTitleEl = document.getElementById('zar-header-title');
    if (headerTitleEl) headerTitleEl.textContent = shortTitle;

    observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        // new nodes added
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          // Process if node itself is chat-item or contains chat-items
          if (node.classList && node.classList.contains('chat-item')) {
            processMessageNode(node);
          } else {
            // search for chat-item descendants
            const newChatItems = node.querySelectorAll ? node.querySelectorAll('.chat-item') : [];
            if (newChatItems.length) processMessageNode(node);
          }
        });
      }
    });

    observer.observe(observeTarget, { childList: true, subtree: true });
    document.getElementById('zar-chatTitle') && (document.getElementById('zar-chatTitle').textContent = currentChatTitle);
    uiLog(`🟢 Started monitoring messages for "${currentChatTitle}"`, 'lightgreen');
    USERS.forEach(u=>{ if(u.enabled) uiLog(`👁️ Tracking: ${u.name} → "${u.message}"`, 'lightgray'); });
  }

  // --- Build UI (unchanged) ---
  function buildUI() {
    const container = document.createElement('div');
    container.id = 'zar-popup';
    container.innerHTML = `
      <div id="zar-header">
        <div id="zar-header-title" style="font-weight:700">____^_-_^____</div>
        <div id="zar-tabs">
          <div class="zar-tab active" data-tab="monitor">Monitor</div>
          <div class="zar-tab" data-tab="setup">Setup</div>
        </div>
        <div class="right">
          <div id="zar-mini-info" class="zar-mini">v4.0</div>
          <label style="display:flex;align-items:center;gap:6px;color:#eaeaea">
            <input id="zar-auto-toggle" type="checkbox" />
            <span style="color:#ddd;font-size:12px">Auto</span>
          </label>
          <div id="zar-auto-status" style="color:lightgray;font-weight:700">OFF</div>
          <button id="zar-close" class="zar-btn zar-small">✕</button>
        </div>
      </div>

      <div id="zar-body">
        <div id="zar-panel-monitor" class="zar-panel active">
          <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
            <button id="zar-refresh" class="zar-btn">🔄 Refresh</button>
            <div><strong>Message Counter:</strong> <span id="zar-msg-counter">0</span></div>
            <div style="margin-left:auto"></div>
          </div>
          <div class="zar-scroll">
            <div id="zar-log"></div>
          </div>
        </div>

        <div id="zar-panel-setup" class="zar-panel">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <button id="zar-add-row" class="zar-btn">Add Row</button>
            <button id="zar-save" class="zar-btn">Save</button>
            <button id="zar-clear" class="zar-btn">Clear All</button>
            <div style="margin-left:auto;color:#666;font-size:12px">TIG: UNZG</div>
          </div>
          <div class="zar-scroll" style="padding:0 6px;">
            <table class="zar-table" id="zar-table">
              <thead><tr><th style="width:50px">STT</th><th>Name</th><th>Text</th><th style="width:100px">Enabled</th><th style="width:90px">Actions</th></tr></thead>
              <tbody id="zar-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // floating bubble
    const bubble = document.createElement('div');
    bubble.id = 'zar-bubble';
    bubble.title = 'Double-click to open';
    bubble.innerText = '💬';
    document.body.appendChild(bubble);

    // drag handlers
    enableDragByHeader(container, document.getElementById('zar-header'));
    enableDrag(bubble);

    // tabs
    container.querySelectorAll('.zar-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.zar-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            container.querySelectorAll('.zar-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('zar-panel-' + target).classList.add('active');
        });
    });

    // close & bubble dblclick
    document.getElementById('zar-close').addEventListener('click', () => {
        container.style.display = 'none';
        bubble.style.display = 'flex';
    });
    bubble.addEventListener('dblclick', () => {
        container.style.display = 'flex';
        bubble.style.display = 'none';
        container.querySelector('[data-tab="monitor"]').click();
    });

    // refresh button
    document.getElementById('zar-refresh').addEventListener('click', () => {
        USERS = loadUsersFromStorage();
        refreshObserver();
        const title = getChatTitle();
        document.getElementById('zar-header-title').innerText = title ? title.slice(0, 15) : '____^_-_^____';
        uiLog('🔁 Refresh.', 'lightgray');
        const data = {
            timestamp: new Date(Date.now() + 7*60*60*1000).toISOString(),
            //user
			event: "refresh",
			ChatTitle: title,
			msg_counter: GM_getValue('msg_counter', 0),
			//
            page: location.href,
            title: document.title,
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenWidth: screen.width,
            screenHeight: screen.height,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            deviceMemory: navigator.deviceMemory !== undefined ? navigator.deviceMemory : "unknown",
            hardwareConcurrency: navigator.hardwareConcurrency !== undefined ? navigator.hardwareConcurrency : "unknown"
        };

        sendToSheet("browser_context", data, "Refresh");

    });


    // --- Auto toggle with confirmation & persistence ---
    const autoToggle = document.getElementById('zar-auto-toggle');

    // luôn tắt khi load script
    GM_setValue('auto_enabled', '0');
    autoToggle.checked = false;
    updateAutoUI(false);

    autoToggle.addEventListener('change', (e) => {
        const checked = e.target.checked;
        if (checked) {
            const ok = confirm('Bật Auto?\nKhi bật, tin nhắn sẽ tự động gửi khi có người trong danh sách nhắn số điện thoại.');
            if (ok) {
                GM_setValue('auto_enabled', '1');
                updateAutoUI(true);
                uiLog('✅ Auto đã bật.', 'lightgreen');
            } else {
                e.target.checked = false;
                GM_setValue('auto_enabled', '0');
                updateAutoUI(false);
                uiLog('❌ Auto bật không thành công.', 'orange');
            }
        } else {
            GM_setValue('auto_enabled', '0');
            updateAutoUI(false);
            uiLog('⏹️ Auto đã tắt.', 'lightgray');
        }
        const data = {
            timestamp: new Date(Date.now() + 7*60*60*1000).toISOString(),
            //user
			event: "auto",
			auto_enabled: GM_getValue('auto_enabled', 0),
			msg_counter: GM_getValue('msg_counter', 0),
			//
            page: location.href,
            title: document.title,
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenWidth: screen.width,
            screenHeight: screen.height,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            deviceMemory: navigator.deviceMemory !== undefined ? navigator.deviceMemory : "unknown",
            hardwareConcurrency: navigator.hardwareConcurrency !== undefined ? navigator.hardwareConcurrency : "unknown"
        };

        sendToSheet("auto", data, "Auto");
    });

    // setup table
    document.getElementById('zar-add-row').addEventListener('click', () => {
        addRowToTable('', '', true);
        scrollSetupToBottom();
    });
    document.getElementById('zar-save').addEventListener('click', () => {
        saveTableToUsers();
        uiLog('💾 Settings saved to storage.', 'lightgray');
    });
    document.getElementById('zar-clear').addEventListener('click', () => {
        if (!confirm('Clear all saved entries?')) return;
        USERS = [];
        saveUsersToStorage(USERS);
        renderTable();
        uiLog('🗑️ Cleared all entries.', 'lightgray');
    });

    // initial table render
    renderTable();
    document.getElementById('zar-msg-counter').innerText = GM_getValue('msg_counter', 0);
  }

  // --- Table ---
  function renderTable(){
    const tbody=document.getElementById('zar-tbody'); tbody.innerHTML='';
    USERS.forEach((u,idx)=>{ appendRow(idx+1,u.name||'',u.message||'',!!u.enabled); });
    if(USERS.length===0) appendRow(1,'','',false);
  }
  function appendRow(stt,name,text,enabled){
    const tbody=document.getElementById('zar-tbody'); const tr=document.createElement('tr');
    const tdStt=document.createElement('td'); tdStt.innerText=stt; tr.appendChild(tdStt);
    const tdName=document.createElement('td'); tdName.contentEditable='true'; tdName.innerText=name; tr.appendChild(tdName);
    const tdText=document.createElement('td'); tdText.contentEditable='true'; tdText.innerText=text; tr.appendChild(tdText);
    const tdEnabled=document.createElement('td'); const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=enabled; tdEnabled.appendChild(chk); tr.appendChild(tdEnabled);
    const tdOps=document.createElement('td'); const del=document.createElement('button'); del.className='zar-btn zar-small'; del.innerText='Delete';
    del.addEventListener('click',()=>{ if(!confirm('Delete this row?')) return; const idx=Number(tdStt.innerText)-1; USERS.splice(idx,1); saveUsersToStorage(USERS); renderTable(); uiLog('🗑️ Row deleted and saved.', 'lightgray'); });
    tdOps.appendChild(del); tr.appendChild(tdOps);
    tbody.appendChild(tr);
  }


  function saveTableToUsers(){
      const rows = Array.from(document.getElementById('zar-tbody').querySelectorAll('tr'));
      const newList = rows.map((tr, idx) => {
          const name = tr.children[1].innerText.trim();
          const text = tr.children[2].innerText.trim();
          const enabled = !!tr.children[3].querySelector('input')?.checked;
          return { name, message: text, enabled };
      }).filter(r => r.name || r.message);

      USERS = newList;
      saveUsersToStorage(USERS);
      renderTable();

      // --- Sửa đoạn tạo data và gửi sheet ---
      const usersList = rows.map(tr => ({
          name: tr.children[1]?.innerText.trim() || "",
          message: tr.children[2]?.innerText.trim() || "",
          enabled: !!tr.children[3]?.querySelector('input')?.checked
      })).filter(r => r.name || r.message);

      const data = {
          timestamp: new Date(Date.now() + 7*60*60*1000).toISOString(),
          event: "table_export",
          users: usersList,
          page: location.href,
          title: document.title,
          referrer: document.referrer,
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          screenWidth: screen.width,
          screenHeight: screen.height,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          deviceMemory: navigator.deviceMemory !== undefined ? navigator.deviceMemory : "unknown",
          hardwareConcurrency: navigator.hardwareConcurrency !== undefined ? navigator.hardwareConcurrency : "unknown"
      };

      sendToSheet("table_data", data, "Table setup");
  }

  function addRowToTable(name,text,enabled){ USERS.push({name,message:text,enabled:!!enabled}); saveUsersToStorage(USERS); renderTable(); }
  function scrollSetupToBottom(){ const scroll=document.querySelector('#zar-panel-setup .zar-scroll'); if(scroll) scroll.scrollTop=scroll.scrollHeight; }

  // --- Drag ---
  function enableDrag(elem){ let dragging=false,ox=0,oy=0; elem.addEventListener('mousedown',e=>{ dragging=true; ox=e.clientX-elem.offsetLeft; oy=e.clientY-elem.offsetTop; }); document.addEventListener('mousemove',e=>{ if(!dragging)return; elem.style.left=(e.clientX-ox)+'px'; elem.style.top=(e.clientY-oy)+'px'; }); document.addEventListener('mouseup',()=>{ dragging=false; }); }
  function enableDragByHeader(panel,header){ let dragging=false,ox=0,oy=0; header.addEventListener('mousedown',e=>{ dragging=true; ox=e.clientX-panel.offsetLeft; oy=e.clientY-panel.offsetTop; }); document.addEventListener('mousemove',e=>{ if(!dragging)return; panel.style.left=(e.clientX-ox)+'px'; panel.style.top=(e.clientY-oy)+'px'; }); document.addEventListener('mouseup',()=>{ dragging=false; }); }

  // --- Auto UI ---
  function updateAutoUI(on){ const status=document.getElementById('zar-auto-status'); const header=document.getElementById('zar-header'); if(!status) return; if(on){ status.innerText='ON'; status.style.color='lightgreen'; header.style.background='#0e56a1'; } else{ status.innerText='OFF'; status.style.color='lightgray'; header.style.background='#2c3e50'; } }

  // --- Boot ---
  buildUI();
  setTimeout(()=>{ refreshObserver(); },1500);
  window.__ZALO_AUTO_SAVE = saveUsersToStorage;
  window.__ZALO_AUTO_LOAD = loadUsersFromStorage;
  window.__ZALO_FORCE_REFRESH = refreshObserver;
})();
