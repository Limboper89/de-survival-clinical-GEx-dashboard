// ai.js - lightweight AI assistant wiring for the dashboard
(() => {
  const workerBase = 'https://<YOUR-CLOUDFLARE-WORKER-DOMAIN>'; // replace with your Worker domain

  const els = {
    fab: document.getElementById('ai-fab-btn'),
    panel: document.getElementById('ai-panel'),
    chatLog: document.getElementById('ai-chat-log'),
    input: document.getElementById('ai-input'),
    send: document.getElementById('ai-send-btn'),
    clear: document.getElementById('ai-clear-btn'),
    close: document.getElementById('ai-close-btn'),
    typing: document.getElementById('ai-typing')
  };

  const state = {
    open: false
  };

  function openChatPanel() {
    state.open = true;
    if (els.panel) els.panel.classList.add('open');
  }

  function closeChatPanel() {
    state.open = false;
    if (els.panel) els.panel.classList.remove('open');
  }

  function appendUserMessage(text) {
    appendMessage('user', text);
  }

  function appendAssistantMessage(text) {
    appendMessage('assistant', text);
  }

  function showTypingIndicator() {
    if (els.typing) els.typing.style.display = 'block';
  }

  function hideTypingIndicator() {
    if (els.typing) els.typing.style.display = 'none';
  }

  function appendMessage(role, text) {
    if (!els.chatLog) return;
    const div = document.createElement('div');
    div.className = `ai-message ${role} ai-markdown`;
    div.innerHTML = renderMarkdown(safe(text));
    els.chatLog.appendChild(div);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function safe(str) {
    return String(str).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  // Minimal markdown renderer for code + bullets
  function renderMarkdown(str) {
    let html = str;
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    return html;
  }

  // Collect a small snapshot of dashboard state for grounding
  function getDashboardSnapshot() {
    const data = window.dashboardData || {};
    const snap = {
      volcanoYaxis: window.dashboardState?.volcanoYaxis,
      currentKMGroup: window.dashboardState?.currentKMGroup,
      currentGeneSingle: window.dashboardState?.currentGeneSingle,
      currentGenesMulti: window.dashboardState?.currentGenesMulti,
      counts: {
        ageDE: data.agegroup ? data.agegroup.length : 0,
        sexDE: data.sex ? data.sex.length : 0,
        survival: data.survival ? data.survival.length : 0
      }
    };
    if (data.agegroup) snap.topAgeGenes = topGenes(data.agegroup);
    if (data.sex) snap.topSexGenes = topGenes(data.sex);
    return snap;
  }

  function topGenes(arr, n = 5) {
    if (!Array.isArray(arr)) return [];
    return [...arr]
      .filter(r => typeof r.fdr === 'number')
      .sort((a, b) => a.fdr - b.fdr)
      .slice(0, n)
      .map(r => ({
        gene: r.gene,
        fdr: r.fdr,
        log2fc: r.mean_diff
      }));
  }

  async function sendToAI(payload) {
    try {
      const res = await fetch(`${workerBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.reply || json.text || 'No response.';
    } catch (err) {
      console.error('AI request failed', err);
      return 'Sorry, the AI service is unavailable right now.';
    }
  }

  // Core send handler from freeform chat
  async function handleSendMessage() {
    if (!els.input) return;
    const userText = els.input.value.trim();
    if (!userText) return;
    els.input.value = '';
    appendUserMessage(userText);
    openChatPanel();
    showTypingIndicator();

    const context = getDashboardSnapshot();
    const reply = await sendToAI({ user_message: userText, task: 'chat', context });
    hideTypingIndicator();
    appendAssistantMessage(reply);
  }

  // Structured tasks
  async function interpretVolcano() {
    openChatPanel();
    showTypingIndicator();
    const data = window.dashboardData || {};
    const context = {
      de_age: data.agegroup || [],
      de_sex: data.sex || [],
      volcanoYaxis: window.dashboardState?.volcanoYaxis,
      significant_threshold: 0.05,
      top_genes: {
        age: topGenes(data.agegroup),
        sex: topGenes(data.sex)
      }
    };
    appendUserMessage('Explain the current volcano plots.');
    const reply = await sendToAI({
      user_message: 'Explain volcano plot significance and notable genes.',
      task: 'interpret_volcano',
      context
    });
    hideTypingIndicator();
    appendAssistantMessage(reply);
  }

  async function interpretKMPlot() {
    openChatPanel();
    showTypingIndicator();
    const data = window.dashboardData || {};
    const groupBy = window.dashboardState?.currentKMGroup;
    const survival = data.survival || [];
    const summary = {};
    survival.forEach(row => {
      const key = row[groupBy];
      if (!key) return;
      if (!summary[key]) summary[key] = { n: 0, events: 0 };
      summary[key].n += 1;
      summary[key].events += row.Event === 1 ? 1 : 0;
    });
    appendUserMessage('Interpret the KM curves.');
    const reply = await sendToAI({
      user_message: 'Interpret the KM curve by current grouping.',
      task: 'interpret_km',
      context: {
        groupBy,
        summary,
        total: survival.length
      }
    });
    hideTypingIndicator();
    appendAssistantMessage(reply);
  }

  async function explainGeneExpressionPattern() {
    openChatPanel();
    showTypingIndicator();
    const gene = (window.dashboardState?.currentGeneSingle || '').trim();
    if (!gene) {
      appendAssistantMessage('Please enter a gene ID first.');
      hideTypingIndicator();
      return;
    }
    const data = window.dashboardData || {};
    const matches = {
      age: (data.agegroup || []).filter(r => String(r.gene).toLowerCase() === gene.toLowerCase()),
      sex: (data.sex || []).filter(r => String(r.gene).toLowerCase() === gene.toLowerCase())
    };
    appendUserMessage(`Explain gene expression for ${gene}.`);
    const reply = await sendToAI({
      user_message: `Explain expression patterns for ${gene}.`,
      task: 'gene_expression_analysis',
      context: { gene, matches }
    });
    hideTypingIndicator();
    appendAssistantMessage(reply);
  }

  async function analyzeDEGs() {
    openChatPanel();
    showTypingIndicator();
    const data = window.dashboardData || {};
    appendUserMessage('Analyze differentially expressed genes.');
    const reply = await sendToAI({
      user_message: 'Analyze DEGs across age and sex.',
      task: 'deg_overview',
      context: {
        de_age: data.agegroup || [],
        de_sex: data.sex || [],
        top_age: topGenes(data.agegroup),
        top_sex: topGenes(data.sex)
      }
    });
    hideTypingIndicator();
    appendAssistantMessage(reply);
  }

  async function analyzeUploadedDataset() {
    openChatPanel();
    showTypingIndicator();
    const dataset = window.aiUploadedDataset || null;
    if (!dataset) {
      appendAssistantMessage('No uploaded dataset found.');
      hideTypingIndicator();
      return;
    }
    appendUserMessage('Analyze the uploaded dataset preview.');
    const reply = await sendToAI({
      user_message: 'Analyze uploaded dataset.',
      task: 'analyze_uploaded_dataset',
      context: dataset
    });
    hideTypingIndicator();
    appendAssistantMessage(reply);
  }

  // Wire UI events
  if (els.fab) {
    els.fab.addEventListener('click', () => {
      if (state.open) {
        closeChatPanel();
      } else {
        openChatPanel();
      }
    });
  }
  if (els.send) els.send.addEventListener('click', handleSendMessage);
  if (els.input) {
    els.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }
  if (els.clear) {
    els.clear.addEventListener('click', () => {
      if (!els.chatLog) return;
      els.chatLog.innerHTML = '';
      appendAssistantMessage('Chat cleared. How can I help?');
    });
  }
  if (els.close) {
    els.close.addEventListener('click', () => closeChatPanel());
  }

  // Expose API
  window.aiAssistant = {
    openChatPanel,
    closeChatPanel,
    appendUserMessage,
    appendAssistantMessage,
    showTypingIndicator,
    hideTypingIndicator,
    sendToAI,
    interpretVolcano,
    interpretKMPlot,
    explainGeneExpressionPattern,
    analyzeDEGs,
    analyzeUploadedDataset
  };
})();
