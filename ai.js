// ai.js - AI assistant wiring for the dashboard (GitHub Pages frontend)
(() => {
  const API_URL = 'https://paad-groq-proxy.kumarprincebt.workers.dev/api/chat';

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

  const state = { open: false };

  // ---------- UI helpers ----------
  function openChatPanel() {
    state.open = true;
    if (els.panel) els.panel.classList.add('open');
  }

  function closeChatPanel() {
    state.open = false;
    if (els.panel) els.panel.classList.remove('open');
  }

  function appendMessage(role, text) {
    if (!els.chatLog) return;
    const div = document.createElement('div');
    div.className = `ai-message ${role} ai-markdown`;
    div.innerHTML = renderMarkdown(safe(text));
    els.chatLog.appendChild(div);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }
  function appendUserMessage(text) { appendMessage('user', text); }
  function appendAssistantMessage(text) { appendMessage('assistant', text); }

  function showTypingIndicator() {
    if (els.typing) els.typing.style.display = 'block';
  }
  function hideTypingIndicator() {
    if (els.typing) els.typing.style.display = 'none';
  }

  function safe(str) {
    return String(str).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function renderMarkdown(str) {
    let html = str;
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    return html;
  }

  // ---------- Data helpers ----------
  function topGenes(arr, n = 5) {
    if (!Array.isArray(arr)) return [];
    return [...arr]
      .filter(r => typeof r?.fdr === 'number')
      .sort((a, b) => a.fdr - b.fdr)
      .slice(0, n)
      .map(r => ({ gene: r.gene, fdr: r.fdr, log2fc: r.mean_diff }));
  }

  function getDashboardSnapshot() {
    const data = window.dashboardData || {};
    const snap = {
      volcanoYaxis: window.dashboardState?.volcanoYaxis || 'fdr',
      currentKMGroup: window.dashboardState?.currentKMGroup || null,
      currentGeneSingle: window.dashboardState?.currentGeneSingle || '',
      currentGenesMulti: window.dashboardState?.currentGenesMulti || [],
      counts: {
        ageDE: Array.isArray(data.agegroup) ? data.agegroup.length : 0,
        sexDE: Array.isArray(data.sex) ? data.sex.length : 0,
        survival: Array.isArray(data.survival) ? data.survival.length : 0
      }
    };
    if (Array.isArray(data.agegroup)) snap.topAgeGenes = topGenes(data.agegroup);
    if (Array.isArray(data.sex)) snap.topSexGenes = topGenes(data.sex);
    return snap;
  }

  // ---------- Network ----------
  async function sendToAI(payload) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.error('AI ERROR:', `HTTP ${res.status}`);
        return { reply: 'Sorry, the AI service is unavailable right now.', error: true };
      }
      const json = await res.json();
      return { reply: json.reply || json.text || 'No response.' };
    } catch (err) {
      console.error('AI ERROR:', err);
      return { reply: 'Sorry, the AI service is unavailable right now.', error: true };
    }
  }

  // ---------- Chat send ----------
  async function handleSendMessage() {
    if (!els.input) return;
    const userText = els.input.value.trim();
    if (!userText) return;
    els.input.value = '';
    appendUserMessage(userText);
    openChatPanel();
    showTypingIndicator();
    try {
      const context = getDashboardSnapshot();
      const { reply } = await sendToAI({ user_message: userText, task: 'chat', context });
      appendAssistantMessage(reply);
    } finally {
      hideTypingIndicator();
    }
  }

  // ---------- Structured tasks ----------
  async function interpretVolcano() {
    openChatPanel();
    showTypingIndicator();
    try {
      const data = window.dashboardData || {};
      const context = {
        volcanoYaxis: window.dashboardState?.volcanoYaxis || 'fdr',
        significant_threshold: 0.05,
        de_age: Array.isArray(data.agegroup) ? data.agegroup : [],
        de_sex: Array.isArray(data.sex) ? data.sex : [],
        top_genes: { age: topGenes(data.agegroup), sex: topGenes(data.sex) }
      };
      appendUserMessage('Explain the current volcano plots.');
      const { reply } = await sendToAI({
        user_message: 'Explain the volcano plot.',
        task: 'interpret_volcano',
        context
      });
      appendAssistantMessage(reply);
    } finally {
      hideTypingIndicator();
    }
  }

  // alias if other code calls explainVolcano
  const explainVolcano = interpretVolcano;

  async function interpretKMPlot() {
    openChatPanel();
    showTypingIndicator();
    try {
      const data = window.dashboardData || {};
      const groupBy = window.dashboardState?.currentKMGroup || null;
      const survival = Array.isArray(data.survival) ? data.survival : [];
      const summary = {};
      survival.forEach(row => {
        const key = groupBy ? row[groupBy] : null;
        if (!key) return;
        if (!summary[key]) summary[key] = { n: 0, events: 0 };
        summary[key].n += 1;
        summary[key].events += row.Event === 1 ? 1 : 0;
      });
      appendUserMessage('Interpret the KM curves.');
      const { reply } = await sendToAI({
        user_message: 'Interpret the KM curve by current grouping.',
        task: 'interpret_km',
        context: { groupBy, summary, total: survival.length }
      });
      appendAssistantMessage(reply);
    } finally {
      hideTypingIndicator();
    }
  }

  async function explainGeneExpressionPattern() {
    openChatPanel();
    showTypingIndicator();
    try {
      const gene = (window.dashboardState?.currentGeneSingle || '').trim();
      if (!gene) {
        appendAssistantMessage('Please enter a gene ID first.');
        return;
      }
      const data = window.dashboardData || {};
      const matches = {
        age: (Array.isArray(data.agegroup) ? data.agegroup : []).filter(r => String(r.gene).toLowerCase() === gene.toLowerCase()),
        sex: (Array.isArray(data.sex) ? data.sex : []).filter(r => String(r.gene).toLowerCase() === gene.toLowerCase())
      };
      appendUserMessage(`Explain gene expression for ${gene}.`);
      const { reply } = await sendToAI({
        user_message: `Explain expression patterns for ${gene}.`,
        task: 'gene_expression_analysis',
        genes: [gene],
        context: { gene, matches }
      });
      appendAssistantMessage(reply);
    } finally {
      hideTypingIndicator();
    }
  }

  async function analyzeDEGs() {
    openChatPanel();
    showTypingIndicator();
    try {
      const data = window.dashboardData || {};
      appendUserMessage('Analyze differentially expressed genes.');
      const { reply } = await sendToAI({
        user_message: 'Analyze DEGs across age and sex.',
        task: 'deg_overview',
        context: {
          de_age: Array.isArray(data.agegroup) ? data.agegroup : [],
          de_sex: Array.isArray(data.sex) ? data.sex : [],
          top_age: topGenes(data.agegroup),
          top_sex: topGenes(data.sex)
        }
      });
      appendAssistantMessage(reply);
    } finally {
      hideTypingIndicator();
    }
  }

  async function analyzeGeneList(geneArray) {
    openChatPanel();
    showTypingIndicator();
    try {
      const genes = Array.isArray(geneArray) ? geneArray.filter(Boolean) : [];
      if (!genes.length) {
        appendAssistantMessage('Please provide gene IDs to analyze.');
        return;
      }
      const data = window.dashboardData || {};
      appendUserMessage('Analyze this gene list.');
      const { reply } = await sendToAI({
        user_message: 'Analyze the provided gene list.',
        task: 'gene_list_analysis',
        genes,
        context: {
          de_age: Array.isArray(data.agegroup) ? data.agegroup : [],
          de_sex: Array.isArray(data.sex) ? data.sex : []
        }
      });
      appendAssistantMessage(reply);
    } finally {
      hideTypingIndicator();
    }
  }

  async function analyzeUploadedDataset() {
    openChatPanel();
    showTypingIndicator();
    try {
      const dataset = window.aiUploadedDataset || null;
      if (!dataset) {
        appendAssistantMessage('No uploaded dataset found.');
        return;
      }
      appendUserMessage('Analyze the uploaded dataset preview.');
      const { reply } = await sendToAI({
        user_message: 'Analyze uploaded dataset.',
        task: 'analyze_uploaded_dataset',
        context: dataset
      });
      appendAssistantMessage(reply);
    } finally {
      hideTypingIndicator();
    }
  }

  // ---------- Event wiring ----------
  if (els.fab) {
    els.fab.addEventListener('click', () => {
      if (state.open) closeChatPanel();
      else openChatPanel();
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

  // ---------- Expose API ----------
  window.aiAssistant = {
    openChatPanel,
    closeChatPanel,
    appendUserMessage,
    appendAssistantMessage,
    showTypingIndicator,
    hideTypingIndicator,
    sendToAI,
    interpretVolcano,
    explainVolcano,
    interpretKMPlot,
    explainGeneExpressionPattern,
    analyzeGeneList,
    analyzeDEGs,
    analyzeUploadedDataset
  };
})();