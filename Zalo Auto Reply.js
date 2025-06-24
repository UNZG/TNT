// ==UserScript==
// @name         Zalo Auto Reply V2.1
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Tự động gửi tin nhắn khi người gửi phù hợp và theo dõi real-time
// @match        https://chat.zalo.me/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const USERS = [
    { name: 'Minh Trâm', message: 'Alo', enabled: true },
    { name: 'Thảo', message: 'Alo', enabled: false },
    { name: 'Quỳnh Anh', message: 'A L O', enabled: false },
  ];

  let observer;
  let msgCount = 0;
  const respondedMessages = new Set();

  function getChatTitle() {
    const el = document.querySelector('#header .header-title');
    return el?.textContent?.trim() || '';
  }

  function insertMessage(text) {
    const inputBox = document.querySelector('#richInput');
    if (!inputBox) return;
    inputBox.innerHTML = `<div id="input_line_0">${text}</div>`;
    inputBox.focus();
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function clickSendButton() {
    const sendBtn = document.querySelector('div.send-msg-btn');
    if (sendBtn) sendBtn.click();
  }

  function updateAutoStatus(statusText) {
    const autoStatus = document.getElementById('auto-status');
    const titleBar = document.getElementById('titleBar');
    autoStatus.textContent = statusText;
    autoStatus.style.color = statusText === 'ON' ? 'green' : 'gray';
    titleBar.style.background = statusText === 'ON' ? '#0e56a1' : '#444';
    logActivity(`⚙️ Trạng thái Auto: ${statusText}`);
  }

  function logActivity(text) {
    const logBox = document.getElementById('logEntries');
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const entry = `[${time}] ${text}`;

    if (logBox) {
      const div = document.createElement('div');
      div.textContent = entry;
      logBox.insertBefore(div, logBox.firstChild); // log mới trên đầu
    }
  }

  function incrementCounter() {
    msgCount++;
    document.getElementById('msgCounter').textContent = msgCount;
  }

  function extractSenderFromItem(item) {
    const nameDiv = item.querySelector('.message-sender-name-content .truncate');
    return nameDiv?.textContent?.trim().replace(/\u00A0/g, ' ') || null;
  }

  function getMessageId(item) {
    const bubble = item.querySelector('[data-qid]');
    return bubble?.getAttribute('data-qid') || null;
  }

  function processMessage(item) {
    const messageId = getMessageId(item);
    if (!messageId || respondedMessages.has(messageId)) return;

    const sender = extractSenderFromItem(item);
    if (!sender) return;

    const userConfig = USERS.find(u => u.name.trim() === sender.trim() && u.enabled);
    logActivity(`📩 Tin nhắn mới từ: ${sender}`);

    if (!userConfig) {
      logActivity(`⚠️ Không có cấu hình trả lời cho "${sender}"`);
      return;
    }

    const auto = document.getElementById('autoToggle').checked;
    const currentTitle = getChatTitle();
    const shownTitle = document.getElementById('chatTitle').textContent;

    if (auto && currentTitle === shownTitle) {
      insertMessage(userConfig.message);
      logActivity(`✏️ Đã nhập tin cho "${sender}": ${userConfig.message}`);
      setTimeout(() => {
        clickSendButton();
        incrementCounter();
        respondedMessages.add(messageId);
        logActivity(`✅ Đã gửi tin cho "${sender}"`);
      }, 500);
    }
  }

  function refreshObserver() {
    const todayBlock = [...document.querySelectorAll('#messageViewContainer .block-date')]
      .find(el => el.textContent.includes('Hôm nay'))?.parentElement;

    if (!todayBlock) {
      logActivity('❌ Không tìm thấy message container');
      return;
    }

    if (observer) observer.disconnect();

    observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.classList.contains('chat-item')) {
            processMessage(node);
          }
        }
      }
    });

    observer.observe(todayBlock, { childList: true, subtree: true });

    document.getElementById('chatTitle').textContent = getChatTitle();
    logActivity('🟢 Đã bắt đầu giám sát tin nhắn');
    USERS.forEach(u => {
      if (u.enabled) {
        logActivity(`👁️ Đang theo dõi: ${u.name} → "${u.message}"`);
      }
    });
  }

  function createUI() {
    const container = document.createElement('div');
    container.id = 'zalo-auto-popup';
    container.style = `
      position: fixed; top: 100px; left: 20px; width: 340px; height: auto;
      background: #fefefe; color: #222; border-radius: 12px; z-index: 99999;
      display: none; flex-direction: column;
      box-shadow: 0 0 15px rgba(0, 0, 0, 0.3); font-family: Arial;
    `;

    const userList = USERS.map((u, idx) => `
      <div style="display:flex;align-items:center;margin-bottom:6px;gap:6px">
        <input type="checkbox" id="user${idx}" ${u.enabled ? 'checked' : ''} />
        <label for="user${idx}" style="flex:1;min-width:100px">${u.name}</label>
        <input type="text" id="msg${idx}" value="${u.message}" style="flex:1;min-width:80px;padding:2px 4px"/>
      </div>
    `).join('');

    container.innerHTML = `
      <div id="titleBar" style="background:#444;color:#fff;padding:8px;text-align:center;cursor:move;border-top-left-radius:10px;border-top-right-radius:10px">
        <span id="chatTitle">---</span>
        <button id="minimizeBtn" style="float:right;background:none;border:none;color:white;font-size:14px;cursor:pointer">🗕</button>
      </div>
      <div style="padding:8px;font-size:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <label><input type="checkbox" id="autoToggle"/>Auto</label>
          <span id="auto-status" style="margin-left:8px;color:gray">OFF</span>
          <button id="refreshButton" style="padding:2px 6px;font-size:13px;cursor:pointer">🔄 Refresh</button>
        </div>
        <div>${userList}</div>
        <div style="margin-top:10px;">
          <strong>Message Counter:</strong> <span id="msgCounter">0</span>
        </div>
        <div style="margin-top:10px;max-height:120px;overflow:auto;font-size:12px;background:#eee;padding:6px;border-radius:6px" id="activityLog">
          <strong>Activity Log:</strong>
          <div id="logEntries"></div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    enableDrag(container);

    const bubble = document.createElement('div');
    bubble.id = 'chat-bubble';
    bubble.textContent = '💬';
    bubble.style = `
      position: fixed; bottom: 80px; right: 30px; width: 50px; height: 50px;
      background: #0a84ff; color: white; font-size: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: move; z-index: 99999;
    `;
    document.body.appendChild(bubble);

    document.getElementById('minimizeBtn').onclick = () => {
      container.style.display = 'none';
      bubble.style.display = 'flex';
    };
    bubble.addEventListener('dblclick', () => {
      container.style.display = 'flex';
      bubble.style.display = 'none';
    });

    document.getElementById('refreshButton').addEventListener('click', () => {
      USERS.forEach((u, i) => {
        u.enabled = document.getElementById(`user${i}`).checked;
        u.message = document.getElementById(`msg${i}`).value;
      });
      refreshObserver();
    });

    document.getElementById('autoToggle').addEventListener('change', e => {
      updateAutoStatus(e.target.checked ? 'ON' : 'OFF');
    });

    enableDrag(bubble);
  }

  function enableDrag(panel) {
    const header = panel.id === 'chat-bubble' ? panel : panel.firstElementChild;
    let isDragging = false, offsetX = 0, offsetY = 0;

    header.addEventListener('mousedown', e => {
      isDragging = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (isDragging) {
        panel.style.left = `${e.clientX - offsetX}px`;
        panel.style.top = `${e.clientY - offsetY}px`;
      }
    });

    document.addEventListener('mouseup', () => isDragging = false);
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      createUI();
    }, 2000);
  });
})();

