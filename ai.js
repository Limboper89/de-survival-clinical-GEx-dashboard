// ===============================
// AI Assistant Frontend Handler
// ===============================

// The URL of your Cloudflare Worker
const API_URL = "https://paad-groq-proxy.kumarprincebt.workers.dev/api/chat";

// DOM Elements
const aiOpenBtn = document.getElementById("ai-open-btn");
const aiPanel = document.getElementById("ai-panel");
const aiCloseBtn = document.getElementById("ai-close-btn");
const aiInput = document.getElementById("ai-input");
const aiSendBtn = document.getElementById("ai-send-btn");
const aiMessages = document.getElementById("ai-messages");

// ------------------------------
// Panel Controls
// ------------------------------

if (aiOpenBtn) {
    aiOpenBtn.onclick = () => aiPanel.classList.add("open");
}
if (aiCloseBtn) {
    aiCloseBtn.onclick = () => aiPanel.classList.remove("open");
}

// ------------------------------
// UI Helpers
// ------------------------------

function appendUserMessage(text) {
    const div = document.createElement("div");
    div.className = "ai-msg user-msg";
    div.textContent = text;
    aiMessages.appendChild(div);
    aiMessages.scrollTop = aiMessages.scrollHeight;
}

function appendAssistantMessage(text) {
    const div = document.createElement("div");
    div.className = "ai-msg assistant-msg";
    div.textContent = text;
    aiMessages.appendChild(div);
    aiMessages.scrollTop = aiMessages.scrollHeight;
}

function showTyping() {
    const div = document.createElement("div");
    div.id = "ai-typing";
    div.className = "ai-msg assistant-msg typing";
    div.textContent = "Thinking...";
    aiMessages.appendChild(div);
    aiMessages.scrollTop = aiMessages.scrollHeight;
}

function hideTyping() {
    const typing = document.getElementById("ai-typing");
    if (typing) typing.remove();
}

// ------------------------------
// Send Message to Worker (Core)
// ------------------------------

async function sendToAI(payload) {
    showTyping();

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        hideTyping();

        if (!response.ok) {
            appendAssistantMessage("AI service error.");
            return;
        }

        const data = await response.json();

        appendAssistantMessage(data.reply || "No response.");

    } catch (err) {
        hideTyping();
        appendAssistantMessage("AI service unavailable.");
        console.error("AI ERROR:", err);
    }
}

// ------------------------------
// Capture user free text
// ------------------------------

if (aiSendBtn) {
    aiSendBtn.onclick = () => {
        const text = aiInput.value.trim();
        if (!text) return;
        aiInput.value = "";
        appendUserMessage(text);
        sendToAI({
            user_message: text,
            task: "chat",
            context: window.dashboardState || {}
        });
    };
}

// Enter key
if (aiInput) {
    aiInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") aiSendBtn.click();
    });
}

// ------------------------------
// Optional Buttons For Analysis
// ------------------------------

window.explainVolcano = function () {
    appendUserMessage("Explain the current volcano plot.");
    const ctx = window.dashboardState || {};
    sendToAI({
        user_message: "Explain the current volcano plot.",
        task: "volcano_analysis",
        context: ctx,
        genes: ctx.selectedGenes || []
    });
};

window.explainKM = function () {
    appendUserMessage("Interpret the Kaplan–Meier survival curve.");
    const ctx = window.dashboardState || {};
    sendToAI({
        user_message: "Interpret the Kaplan–Meier survival curve.",
        task: "km_analysis",
        context: ctx
    });
};

window.explainGene = function (gene) {
    appendUserMessage(`Explain expression pattern for ${gene}.`);
    const ctx = window.dashboardState || {};
    sendToAI({
        user_message: `Explain gene expression pattern for ${gene}`,
        task: "gene_analysis",
        context: ctx,
        genes: [gene]
    });
};
