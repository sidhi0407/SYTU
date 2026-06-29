/* ==========================================================================
   SYTU Application Logic - Glassmorphic SPA Dashboard Interface
   ========================================================================== */

// Global Application State
const state = {
    user: null,
    accessToken: null,
    activeView: "discovery",
    notifications: [],
    connections: [],
    pendingRequests: [],
    conversations: [],
    activeChat: null, // active conversation object
    chatMessages: [],
    socket: null,
    portfolio: null,
    projects: [],
    collabPosts: [],
    adminUsers: [],
    adminReports: [],
    adminAnalytics: null
};

// Host detection for API endpoint base
const API_BASE = "https://sytu.onrender.com/api";

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    setupAuthListeners();
    checkExistingSession();
});

// Toast notification banner trigger
function showToast(message, isError = false) {
    const toast = document.getElementById("toastBanner");
    const text = document.getElementById("toastMessage");
    text.innerText = message;
    
    if (isError) {
        toast.style.borderColor = "var(--danger-red)";
        toast.querySelector("i").className = "fa-solid fa-circle-exclamation";
        toast.querySelector("i").style.color = "var(--danger-red)";
    } else {
        toast.style.borderColor = "var(--accent-purple)";
        toast.querySelector("i").className = "fa-solid fa-circle-info";
        toast.querySelector("i").style.color = "var(--accent-purple)";
    }

    toast.classList.remove("hidden");
    setTimeout(() => {
        toast.classList.add("hidden");
    }, 4000);
}

// Global API Request Helper
async function request(endpoint, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    if (state.accessToken) {
        headers["Authorization"] = `Bearer ${state.accessToken}`;
    }
    const config = { method, headers };
    if (body) {
        config.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || "Something went wrong");
        }
        return data;
    } catch (err) {
        console.error(`[API Error] ${method} ${endpoint}:`, err.message);
        throw err;
    }
}

// Check existing login tokens
function checkExistingSession() {
    const token = localStorage.getItem("accessToken");
    const storedUser = localStorage.getItem("user");
    if (token && storedUser) {
        state.accessToken = token;
        state.user = JSON.parse(storedUser);
        enterApplication();
    }
}

// ----------------- AUTHENTICATION FLOWS -----------------
function setupAuthListeners() {
    const showRegister = document.getElementById("showRegister");
    const showLogin = document.getElementById("showLogin");
    const loginCard = document.getElementById("loginCard");
    const registerCard = document.getElementById("registerCard");

    showRegister.addEventListener("click", () => {
        loginCard.classList.add("hidden");
        registerCard.classList.remove("hidden");
    });

    showLogin.addEventListener("click", () => {
        registerCard.classList.add("hidden");
        loginCard.classList.remove("hidden");
    });

    // Login action
    document.getElementById("loginBtn").addEventListener("click", handleLogin);
    // Register action
    document.getElementById("registerBtn").addEventListener("click", handleRegister);
    // Logout action
    document.getElementById("logoutBtn").addEventListener("click", handleLogout);
}

async function handleLogin() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        return showToast("Please fill all fields", true);
    }

    try {
        const res = await request("/auth/login", "POST", { email, password });
        state.accessToken = res.accessToken;
        state.user = res.user;
        
        localStorage.setItem("accessToken", res.accessToken);
        localStorage.setItem("user", JSON.stringify(res.user));

        showToast("Login Successful!");
        enterApplication();
    } catch (err) {
        showToast(err.message, true);
    }
}

async function handleRegister() {
    const name = document.getElementById("regName").value;
    const username = document.getElementById("regUsername").value;
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;

    if (!name || !username || !email || !password) {
        return showToast("Please fill all registration fields", true);
    }

    try {
        const res = await request("/auth/register", "POST", { name, username, email, password });
        showToast("Registration successful! Please login.");
        
        // Toggle view back to login card
        document.getElementById("registerCard").classList.add("hidden");
        document.getElementById("loginCard").classList.remove("hidden");
    } catch (err) {
        showToast(err.message, true);
    }
}

async function handleLogout() {
    try {
        await request("/auth/logout", "POST");
    } catch (e) {
        // ignore logout backend failure
    }
    
    if (state.socket) {
        state.socket.disconnect();
    }

    state.accessToken = null;
    state.user = null;
    state.socket = null;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");

    document.getElementById("appContainer").classList.add("hidden");
    document.getElementById("authContainer").classList.remove("hidden");
    showToast("Logged out successfully");
}

// ----------------- APP INITIALIZATION & NAVIGATION -----------------
function enterApplication() {
    document.getElementById("authContainer").classList.add("hidden");
    document.getElementById("appContainer").classList.remove("hidden");

    // Set User details in sidebar
    document.getElementById("userChipName").innerText = state.user.name;
    document.getElementById("userChipRole").innerText = state.user.role === "admin" ? "Platform Administrator" : (state.user.isPremium ? "Premium Networker" : "SYTU Member");
    
    // Toggle Admin navigation item
    const adminLink = document.querySelector(".menu-item[data-view='admin']");
    if (state.user.role === "admin") {
        adminLink.classList.remove("hidden");
    } else {
        adminLink.classList.add("hidden");
    }

    // Connect Socket.IO
    connectSocketServer();

    // Set up View switching listeners
    const menuItems = document.querySelectorAll(".menu-item");
    menuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            menuItems.forEach(mi => mi.classList.remove("active"));
            item.classList.add("active");
            
            const view = item.getAttribute("data-view");
            switchView(view);
        });
    });

    // Top search bar listening
    document.getElementById("globalSearchInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const query = e.target.value;
            triggerGlobalSearch(query);
        }
    });

    // Setup Notification Bell drop trigger
    const notifBell = document.getElementById("notifBell");
    const notifDropdown = document.getElementById("notifDropdown");
    notifBell.addEventListener("click", (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle("hidden");
        if (!notifDropdown.classList.contains("hidden")) {
            loadNotificationsList();
        }
    });
    
    document.addEventListener("click", () => {
        notifDropdown.classList.add("hidden");
    });

    document.getElementById("markAllReadBtn").addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
            await request("/notifications/read-all", "PATCH");
            state.notifications.forEach(n => n.isRead = true);
            updateNotificationCountBadge();
            loadNotificationsList();
            showToast("Notifications cleared");
        } catch (err) {
            showToast(err.message, true);
        }
    });

    // Start background poller for counts
    startBackgroundPollers();

    // Default view
    switchView("discovery");
}

// Socket.IO event mapping
function connectSocketServer() {
    // Connect socket bound to host
    const socketUrl = "https://sytu.onrender.com";
    state.socket = io(socketUrl, {
        auth: { token: state.accessToken }
    });

    state.socket.on("connect", () => {
        console.log("[Socket] Connected to server successfully");
    });

    state.socket.on("chat:receive", (message) => {
        showToast("New chat message received!");
        // Play notification or update thread list/chat view
        if (state.activeChat && message.conversationId === state.activeChat.id) {
            state.chatMessages.push(message);
            renderChatMessages();
            // notify read acknowledgment back
            state.socket.emit("chat:read", { conversationId: state.activeChat.id });
        }
        loadChatThreads();
    });

    state.socket.on("notification:new", (notification) => {
        showToast(`Alert: ${notification.title}`);
        state.notifications.unshift(notification);
        updateNotificationCountBadge();
    });

    state.socket.on("presence:online", (data) => {
        const statusEl = document.getElementById(`status-${data.userId}`);
        if (statusEl) {
            statusEl.className = "presence-status online";
            statusEl.innerText = "Online";
        }
    });

    state.socket.on("presence:offline", (data) => {
        const statusEl = document.getElementById(`status-${data.userId}`);
        if (statusEl) {
            statusEl.className = "presence-status";
            statusEl.innerText = "Offline";
        }
    });

    state.socket.on("chat:typing", (data) => {
        const typingEl = document.getElementById("chatTypingIndicator");
        if (typingEl && state.activeChat && data.conversationId === state.activeChat.id) {
            typingEl.innerText = "Typing...";
            typingEl.classList.remove("hidden");
        }
    });

    state.socket.on("chat:typing_stop", (data) => {
        const typingEl = document.getElementById("chatTypingIndicator");
        if (typingEl && state.activeChat && data.conversationId === state.activeChat.id) {
            typingEl.classList.add("hidden");
        }
    });

    state.socket.on("connect_error", (err) => {
        console.warn("Socket connection failed:", err.message);
    });
}

function startBackgroundPollers() {
    // Initial fetch
    fetchCountsAndAlerts();

    // Poll counts every 15 seconds
    setInterval(fetchCountsAndAlerts, 15000);
}

async function fetchCountsAndAlerts() {
    if (!state.accessToken) return;
    try {
        const reqs = await request("/connections/pending");
        state.pendingRequests = reqs.requests;
        const pendBadge = document.getElementById("pendingBadge");
        if (state.pendingRequests.length > 0) {
            pendBadge.innerText = state.pendingRequests.length;
            pendBadge.classList.remove("hidden");
        } else {
            pendBadge.classList.add("hidden");
        }

        const notifs = await request("/notifications?unreadOnly=true");
        state.notifications = notifs.notifications;
        updateNotificationCountBadge();
    } catch (err) {
        console.error("Failed to sync metrics", err);
    }
}

function updateNotificationCountBadge() {
    const notifCount = document.getElementById("notifCount");
    const unread = state.notifications.filter(n => !n.isRead).length;
    if (unread > 0) {
        notifCount.innerText = unread;
        notifCount.classList.remove("hidden");
    } else {
        notifCount.classList.add("hidden");
    }
}

async function loadNotificationsList() {
    const listEl = document.getElementById("notifList");
    listEl.innerHTML = "";

    try {
        const res = await request("/notifications");
        const allNotifs = res.notifications;
        
        if (allNotifs.length === 0) {
            listEl.innerHTML = `<p class="empty-list">No new notifications</p>`;
            return;
        }

        allNotifs.forEach(notif => {
            const notifItem = document.createElement("div");
            notifItem.className = `notif-item ${notif.isRead ? '' : 'unread'}`;
            notifItem.innerHTML = `
                <h4>${notif.title}</h4>
                <p>${notif.body}</p>
            `;
            
            notifItem.addEventListener("click", async () => {
                try {
                    await request(`/notifications/${notif._id}/read`, "PATCH");
                    notif.isRead = true;
                    updateNotificationCountBadge();
                    loadNotificationsList();
                    if (notif.actionUrl) {
                        const view = notif.actionUrl.replace("/", "");
                        switchView(view);
                    }
                } catch (e) {
                    console.error(e);
                }
            });

            listEl.appendChild(notifItem);
        });
    } catch (err) {
        listEl.innerHTML = `<p class="empty-list">Failed to load alerts</p>`;
    }
}

// Trigger view switching
function switchView(view) {
    state.activeView = view;
    
    // Highlight sidebar
    const menuItems = document.querySelectorAll(".menu-item");
    menuItems.forEach(mi => {
        if (mi.getAttribute("data-view") === view) {
            mi.classList.add("active");
        } else {
            mi.classList.remove("active");
        }
    });

    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `<div style="padding: 50px; text-align: center;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--accent-purple)"></i></div>`;

    switch (view) {
        case "discovery":
            loadDiscoveryFeed();
            break;
        case "connections":
            loadConnectionsView();
            break;
        case "chat":
            loadChatPanel();
            break;
        case "portfolio":
            loadPortfolioEditor();
            break;
        case "projects":
            loadProjectsShowcase();
            break;
        case "collaboration":
            loadCollaborationHub();
            break;
        case "subscription":
            loadSubscriptions();
            break;
        case "admin":
            loadAdminConsole();
            break;
        default:
            loadDiscoveryFeed();
    }
}

// ----------------- 1. DISCOVERY FEED -----------------
async function loadDiscoveryFeed() {
    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `
        <div class="view-header">
            <h2>Discovery Feed</h2>
            <div id="premiumBadgeHeader"></div>
        </div>
        <div id="discoveryList" class="grid-layout"></div>
    `;

    const badgeHeader = document.getElementById("premiumBadgeHeader");
    if (state.user.isPremium) {
        badgeHeader.innerHTML = `<span class="badge badge-premium"><i class="fa-solid fa-crown"></i> Premium Match Activated</span>`;
    } else {
        badgeHeader.innerHTML = `<button class="action-btn primary" onclick="switchView('subscription')"><i class="fa-solid fa-arrow-up-right-from-square"></i> Upgrade for Overlap Matching</button>`;
    }

    const listEl = document.getElementById("discoveryList");

    try {
        if (!state.user.isPremium) {
            // Free feed: fetching random users
            listEl.innerHTML = `<p style="grid-column: span 3; text-align: center; color: var(--text-secondary);">Loading discovery options...</p>`;
            
            const res = await request("/discovery/random");
            listEl.innerHTML = "";

            if (!res.user) {
                listEl.innerHTML = `
                    <div class="premium-upsell-banner">
                        <h3>No new candidates</h3>
                        <p>Upgrade to premium to view all members list sorted by matching skills overlap scores!</p>
                        <button class="primary-btn" onclick="switchView('subscription')">Upgrade to Premium (₹49/mo)</button>
                    </div>
                `;
                return;
            }

            renderProfileCard(res.user, null, listEl);

            // Upsell banner at the bottom
            const upsell = document.createElement("div");
            upsell.className = "premium-upsell-banner";
            upsell.style.gridColumn = "span 3";
            upsell.innerHTML = `
                <h3>Want to discover more innovators?</h3>
                <p>Unlock our smart skills + interests overlap matching feed and unlimited scrolling by upgrading to Premium.</p>
                <button class="primary-btn" style="width: auto; padding: 12px 30px; margin: 0 auto;" onclick="switchView('subscription')"><i class="fa-solid fa-crown"></i> Unlock Smart Feed</button>
            `;
            listEl.appendChild(upsell);
        } else {
            // Premium feed: fetching computed matching scoring array
            const res = await request("/discovery/feed");
            listEl.innerHTML = "";

            if (res.feed.length === 0) {
                listEl.innerHTML = `<p style="grid-column: span 3; text-align: center; color: var(--text-secondary);">You've connected with everyone in the directory!</p>`;
                return;
            }

            res.feed.forEach(item => {
                renderProfileCard(item.user, item.score, listEl);
            });
        }
    } catch (err) {
        listEl.innerHTML = `<p style="grid-column: span 3; text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}

function renderProfileCard(user, score, container) {
    const card = document.createElement("div");
    card.className = "glass-card";
    
    const scoreBadge = score !== null ? `<span class="match-score-badge">${score}% Overlap</span>` : "";
    const premiumCrown = user.isPremium ? ` <i class="fa-solid fa-crown" style="color: var(--accent-purple); font-size: 13px;"></i>` : "";
    
    // Skills list formatting
    let skillsHTML = "";
    if (user.skills && user.skills.length > 0) {
        user.skills.forEach(s => {
            skillsHTML += `<span>${s.name} (${s.proficiency})</span>`;
        });
    } else {
        skillsHTML = `<span>No skills listed</span>`;
    }

    card.innerHTML = `
        ${scoreBadge}
        <div class="card-header">
            <img src="${user.profileImageUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80'}" alt="Avatar">
            <div class="card-title">
                <h3>${user.name}${premiumCrown}</h3>
                <p>@${user.username}</p>
            </div>
        </div>
        <div class="card-body">
            <p class="bio">${user.headline || 'Member of the SYTU network.'}</p>
            <div style="margin-bottom: 10px; font-size: 12px; color: var(--text-secondary);">${user.bio || ''}</div>
            <div class="tag-list">
                ${skillsHTML}
            </div>
        </div>
        <div class="card-actions">
            <button class="action-btn primary" id="connect-${user.id}"><i class="fa-solid fa-user-plus"></i> Connect</button>
            <button class="action-btn" onclick="window.open('/api/portfolio/${user.username}', '_blank')"><i class="fa-solid fa-globe"></i> Portfolio</button>
        </div>
    `;

    container.appendChild(card);

    // Bind Connect trigger
    document.getElementById(`connect-${user.id}`).addEventListener("click", async (e) => {
        e.target.disabled = true;
        e.target.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;
        try {
            await request("/connections/request", "POST", { receiverId: user.id });
            showToast("Connection request sent successfully!");
            e.target.innerHTML = `<i class="fa-solid fa-clock"></i> Pending`;
            e.target.className = "action-btn";
        } catch (err) {
            showToast(err.message, true);
            e.target.disabled = false;
            e.target.innerHTML = `<i class="fa-solid fa-user-plus"></i> Connect`;
        }
    });
}

// ----------------- 2. CONNECTIONS VIEW -----------------
async function loadConnectionsView() {
    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `
        <div class="view-header">
            <h2>Connections Hub</h2>
        </div>
        <div class="portfolio-editor-layout">
            <div class="section-box" style="flex: 1.2;">
                <h3 style="margin-bottom: 20px;"><i class="fa-solid fa-user-group"></i> My Connections</h3>
                <div class="list-items-display" id="connectionsList" style="gap: 15px;">
                    <p style="text-align: center; color: var(--text-secondary);">Loading connections...</p>
                </div>
            </div>
            
            <div class="section-box" style="flex: 0.8;">
                <h3 style="margin-bottom: 20px;"><i class="fa-solid fa-user-clock"></i> Incoming Requests</h3>
                <div class="list-items-display" id="pendingRequestsList" style="gap: 15px;">
                    <p style="text-align: center; color: var(--text-secondary);">Loading pending requests...</p>
                </div>
            </div>
        </div>
    `;

    loadMyConnections();
    loadMyPendingRequests();
}

async function loadMyConnections() {
    const listEl = document.getElementById("connectionsList");
    try {
        const res = await request("/connections");
        state.connections = res.connections;
        listEl.innerHTML = "";

        if (state.connections.length === 0) {
            listEl.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 30px;">You haven't connected with anyone yet. Head to the Discover tab to connect!</p>`;
            return;
        }

        state.connections.forEach(conn => {
            const peer = conn.peer;
            const item = document.createElement("div");
            item.className = "list-item-pill";
            item.style.padding = "15px";
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="${peer.profileImageUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80'}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <h4 style="font-weight: 600;">${peer.name}</h4>
                        <p style="font-size: 12px; color: var(--text-secondary);">${peer.headline || 'SYTU Member'}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="action-btn primary" id="chat-peer-${peer._id}" style="padding: 8px 15px;"><i class="fa-solid fa-message"></i> Message</button>
                    <button class="action-btn" id="remove-conn-${conn.connectionId}" style="padding: 8px 12px; color: var(--danger-red);"><i class="fa-solid fa-user-minus"></i> Remove</button>
                </div>
            `;
            listEl.appendChild(item);

            // Bind Chat trigger
            document.getElementById(`chat-peer-${peer._id}`).addEventListener("click", () => {
                startChatWithPeer(peer._id);
            });

            // Bind Remove trigger
            document.getElementById(`remove-conn-${conn.connectionId}`).addEventListener("click", async () => {
                if (confirm(`Are you sure you want to remove connection with ${peer.name}?`)) {
                    try {
                        await request(`/connections/${conn.connectionId}`, "DELETE");
                        showToast("Connection removed");
                        loadConnectionsView();
                    } catch (e) {
                        showToast(e.message, true);
                    }
                }
            });
        });
    } catch (err) {
        listEl.innerHTML = `<p style="text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}

async function loadMyPendingRequests() {
    const listEl = document.getElementById("pendingRequestsList");
    try {
        const res = await request("/connections/pending");
        state.pendingRequests = res.requests;
        listEl.innerHTML = "";

        if (state.pendingRequests.length === 0) {
            listEl.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 30px;">No pending connection requests</p>`;
            return;
        }

        state.pendingRequests.forEach(reqObj => {
            const sender = reqObj.senderId;
            const item = document.createElement("div");
            item.className = "list-item-pill";
            item.style.flexDirection = "column";
            item.style.alignItems = "stretch";
            item.style.gap = "12px";
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${sender.profileImageUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80'}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <h4 style="font-weight: 600; font-size: 14px;">${sender.name}</h4>
                        <p style="font-size: 11px; color: var(--text-secondary);">@${sender.username}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn primary" id="accept-req-${reqObj._id}" style="padding: 6px;"><i class="fa-solid fa-check"></i> Accept</button>
                    <button class="action-btn" id="reject-req-${reqObj._id}" style="padding: 6px; color: var(--danger-red);"><i class="fa-solid fa-xmark"></i> Decline</button>
                </div>
            `;
            listEl.appendChild(item);

            document.getElementById(`accept-req-${reqObj._id}`).addEventListener("click", async () => {
                try {
                    await request(`/connections/${reqObj._id}/accept`, "POST");
                    showToast("Connection accepted!");
                    loadConnectionsView();
                    fetchCountsAndAlerts();
                } catch (e) {
                    showToast(e.message, true);
                }
            });

            document.getElementById(`reject-req-${reqObj._id}`).addEventListener("click", async () => {
                try {
                    await request(`/connections/${reqObj._id}/reject`, "POST");
                    showToast("Request declined");
                    loadConnectionsView();
                    fetchCountsAndAlerts();
                } catch (e) {
                    showToast(e.message, true);
                }
            });
        });
    } catch (err) {
        listEl.innerHTML = `<p style="text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}

// Initiates/opens a chat room with a peer
async function startChatWithPeer(peerId) {
    try {
        // Fetch conversations list to see if one already exists
        const res = await request("/conversations");
        let activeConvo = res.conversations.find(c => c.peer._id === peerId);
        
        if (!activeConvo) {
            // If doesn't exist, we force-accept or connections creates it,
            // let's fetch all accepted connections to find the connection ID
            const connsRes = await request("/connections");
            const conn = connsRes.connections.find(c => c.peer._id === peerId);
            if (conn) {
                // Connection exists but no messages yet, hit accept to auto-create conversation
                const acceptRes = await request(`/connections/${conn.connectionId}/accept`, "POST");
                // Refresh list
                const refreshed = await request("/conversations");
                activeConvo = refreshed.conversations.find(c => c.peer._id === peerId);
            }
        }
        
        if (activeConvo) {
            state.activeChat = activeConvo;
            switchView("chat");
        } else {
            showToast("Failed to initiate chat. Try sending a message.", true);
        }
    } catch (e) {
        showToast(e.message, true);
    }
}

// ----------------- 3. REAL-TIME CHAT PANEL -----------------
async function loadChatPanel() {
    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `
        <div class="chat-panel">
            <div class="chat-list">
                <div class="chat-list-header"><i class="fa-solid fa-message"></i> Messages</div>
                <div class="chat-threads" id="chatThreadsContainer">
                    <p style="padding: 20px; text-align: center; color: var(--text-secondary);">Loading chat logs...</p>
                </div>
            </div>
            
            <div class="chat-view" id="activeChatView">
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; color: var(--text-secondary);">
                    <i class="fa-regular fa-comments" style="font-size: 64px; margin-bottom: 15px; color: rgba(255,255,255,0.06);"></i>
                    <p>Select a conversation to start chatting in real-time</p>
                </div>
            </div>
        </div>
    `;

    loadChatThreads();
}

async function loadChatThreads() {
    const container = document.getElementById("chatThreadsContainer");
    if (!container) return;

    try {
        const res = await request("/conversations");
        state.conversations = res.conversations;
        container.innerHTML = "";

        if (state.conversations.length === 0) {
            container.innerHTML = `<p style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px;">No active chats. Start a connection first!</p>`;
            return;
        }

        state.conversations.forEach(convo => {
            const thread = document.createElement("div");
            thread.className = `chat-thread-item ${state.activeChat && state.activeChat.id === convo.id ? 'active' : ''}`;
            
            const badgeHTML = convo.unreadCount > 0 ? `<span class="badge-count" style="margin-left: 10px;">${convo.unreadCount}</span>` : "";
            
            thread.innerHTML = `
                <img src="${convo.peer.profileImageUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80'}">
                <div class="thread-details">
                    <div class="thread-header">
                        <h4>${convo.peer.name}</h4>
                        <span>${new Date(convo.lastMessage.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p>${convo.lastMessage.content || 'File attachment'}</p>
                </div>
                ${badgeHTML}
            `;

            thread.addEventListener("click", () => {
                openChatThread(convo);
            });

            container.appendChild(thread);
        });

        // Auto-open if activeChat is set
        if (state.activeChat) {
            // Find updated convo state
            const currentConvo = state.conversations.find(c => c.id === state.activeChat.id);
            if (currentConvo) {
                openChatThread(currentConvo);
            }
        }
    } catch (err) {
        container.innerHTML = `<p style="padding: 20px; color: var(--danger-red);">${err.message}</p>`;
    }
}

async function openChatThread(convo) {
    state.activeChat = convo;
    
    // Highlight active thread
    const items = document.querySelectorAll(".chat-thread-item");
    items.forEach((item, index) => {
        if (state.conversations[index] && state.conversations[index].id === convo.id) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    const activeChatView = document.getElementById("activeChatView");
    activeChatView.innerHTML = `
        <div class="chat-view-header">
            <div class="chat-view-user">
                <img src="${convo.peer.profileImageUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80'}">
                <div>
                    <h4>${convo.peer.name}</h4>
                    <span id="status-${convo.peer._id}" class="presence-status">Presence checking...</span>
                </div>
            </div>
            <div>
                <button class="action-btn" onclick="window.open('/api/portfolio/${convo.peer.username}', '_blank')"><i class="fa-solid fa-id-badge"></i> View CV</button>
            </div>
        </div>
        
        <div class="chat-messages-container" id="chatMsgContainer">
            <!-- Messages load here -->
        </div>

        <div id="chatTypingIndicator" class="chat-typing-indicator hidden">Typing...</div>

        <div class="chat-input-bar">
            <!-- Mock Attach file trigger -->
            <button class="action-btn" style="flex: 0; padding: 10px 14px;" id="attachBtn" title="Upload files"><i class="fa-solid fa-paperclip"></i></button>
            <input type="file" id="fileAttachInput" class="hidden">
            
            <input type="text" id="chatInputField" placeholder="Write a real-time message...">
            <button class="send-msg-btn" id="sendMsgBtn"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
    `;

    // Query active messages
    loadChatMessages(convo.id);

    // Socket read acknowledgment
    state.socket.emit("chat:read", { conversationId: convo.id });

    // Handle inputs
    const inputField = document.getElementById("chatInputField");
    const sendBtn = document.getElementById("sendMsgBtn");
    
    // Typing emitters
    let typingTimer;
    inputField.addEventListener("input", () => {
        state.socket.emit("chat:typing", { conversationId: convo.id });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            state.socket.emit("chat:typing_stop", { conversationId: convo.id });
        }, 1500);
    });

    sendBtn.addEventListener("click", () => {
        sendSocketMessage();
    });

    inputField.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendSocketMessage();
        }
    });

    // File attachments uploads trigger
    const attachBtn = document.getElementById("attachBtn");
    const fileInput = document.getElementById("fileAttachInput");
    attachBtn.addEventListener("click", () => {
        fileInput.click();
    });

    fileInput.addEventListener("change", async (e) => {
        if (e.target.files.length === 0) return;
        const file = e.target.files[0];
        
        const formData = new FormData();
        formData.append("file", file);

        attachBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
        try {
            const response = await fetch(`/api/conversations/${convo.id}/files`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${state.accessToken}`
                },
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                showToast("File uploaded and message sent!");
                loadChatMessages(convo.id);
                loadChatThreads();
            } else {
                showToast(data.message, true);
            }
        } catch (err) {
            showToast(err.message, true);
        } finally {
            attachBtn.innerHTML = `<i class="fa-solid fa-paperclip"></i>`;
        }
    });
}

async function loadChatMessages(convoId) {
    const container = document.getElementById("chatMsgContainer");
    try {
        const res = await request(`/conversations/${convoId}/messages`);
        state.chatMessages = res.messages;
        renderChatMessages();
    } catch (err) {
        container.innerHTML = `<p style="text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}

function renderChatMessages() {
    const container = document.getElementById("chatMsgContainer");
    if (!container) return;

    container.innerHTML = "";

    if (state.chatMessages.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 30px;">Conversation initialized. Say hello!</p>`;
        return;
    }

    state.chatMessages.forEach(msg => {
        const bubble = document.createElement("div");
        const isSent = msg.senderId.toString() === state.user.id.toString();
        bubble.className = `msg-bubble ${isSent ? 'sent' : 'received'}`;
        
        let contentHTML = "";
        if (msg.content) {
            contentHTML = `<p>${msg.content}</p>`;
        } else if (msg.fileUrl) {
            if (msg.fileType === "image") {
                contentHTML = `<img src="${msg.fileUrl}" style="max-width: 100%; border-radius: 8px; cursor: pointer; margin-bottom: 5px;" onclick="window.open('${msg.fileUrl}', '_blank')">`;
            } else {
                contentHTML = `<a href="${msg.fileUrl}" target="_blank" style="color: white; font-weight: 500; text-decoration: underline;"><i class="fa-solid fa-file-arrow-down"></i> Download Attachment (${msg.fileType})</a>`;
            }
        }

        const readTick = isSent ? `<i class="fa-solid ${msg.isRead ? 'fa-check-double text-accent' : 'fa-check'}" style="margin-left: 5px;"></i>` : "";

        bubble.innerHTML = `
            ${contentHTML}
            <div class="msg-meta">
                <span>${new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                ${readTick}
            </div>
        `;
        container.appendChild(bubble);
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function sendSocketMessage() {
    const inputField = document.getElementById("chatInputField");
    const content = inputField.value.trim();
    if (!content || !state.activeChat) return;

    // Emit chat:send event via socket connection
    state.socket.emit("chat:send", {
        conversationId: state.activeChat.id,
        content
    });

    inputField.value = "";
    // Stop typing emitter
    state.socket.emit("chat:typing_stop", { conversationId: state.activeChat.id });
}

// ----------------- 4. PORTFOLIO BUILDER -----------------
async function loadPortfolioEditor() {
    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `
        <div class="view-header">
            <h2>Portfolio CV Builder</h2>
            <div>
                <button class="action-btn" id="downloadPdfBtn" style="margin-right: 10px;"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
                <button class="action-btn primary" id="publishPortfolioBtn"></button>
            </div>
        </div>
        
        <div class="portfolio-editor-layout">
            <div class="editor-form">
                <!-- About section -->
                <div class="section-box">
                    <h3><i class="fa-solid fa-user-tie"></i> Biography & Headline</h3>
                    <div class="input-group" style="margin-bottom: 15px;">
                        <i class="fa-solid fa-heading"></i>
                        <input type="text" id="portHeadline" placeholder="Headline (e.g. Full-Stack Developer)">
                    </div>
                    <div class="input-group" style="margin-bottom: 0;">
                        <i class="fa-solid fa-align-left" style="top: 20px;"></i>
                        <textarea id="portAbout" placeholder="About Me / Summary Bio" rows="4"></textarea>
                    </div>
                </div>

                <!-- Theme section -->
                <div class="section-box">
                    <h3><i class="fa-solid fa-palette"></i> Portfolio Theme</h3>
                    <div class="input-group" style="margin-bottom: 0;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        <select id="portTheme" style="padding-left: 45px;">
                            <option value="default">Default Blue Gloss</option>
                            <option value="minimal">Minimal Light</option>
                            <option value="dark">Dark Charcoal</option>
                        </select>
                    </div>
                </div>

                <!-- Experience section -->
                <div class="section-box">
                    <h3><i class="fa-solid fa-briefcase"></i> Work Experience</h3>
                    <div class="form-grid">
                        <div class="input-group">
                            <i class="fa-solid fa-building"></i>
                            <input type="text" id="expCompany" placeholder="Company Name">
                        </div>
                        <div class="input-group">
                            <i class="fa-solid fa-id-badge"></i>
                            <input type="text" id="expRole" placeholder="Job Title / Role">
                        </div>
                        <div class="input-group">
                            <i class="fa-solid fa-calendar"></i>
                            <input type="date" id="expFrom">
                        </div>
                        <div class="input-group">
                            <i class="fa-solid fa-calendar-check"></i>
                            <input type="date" id="expTo" placeholder="To Date (leave blank for Current)">
                        </div>
                        <div class="input-group form-grid-full" style="margin-bottom: 0;">
                            <i class="fa-solid fa-align-left" style="top: 20px;"></i>
                            <textarea id="expDesc" placeholder="Description of responsibilities and impact..." rows="2"></textarea>
                        </div>
                    </div>
                    <button class="action-btn primary" id="addExpBtn" style="margin-top: 15px;"><i class="fa-solid fa-plus"></i> Add Experience</button>
                    <div class="list-items-display" id="experienceListDisplay"></div>
                </div>

                <!-- Education section -->
                <div class="section-box">
                    <h3><i class="fa-solid fa-graduation-cap"></i> Education History</h3>
                    <div class="form-grid">
                        <div class="input-group">
                            <i class="fa-solid fa-school"></i>
                            <input type="text" id="eduInst" placeholder="Institution Name">
                        </div>
                        <div class="input-group">
                            <i class="fa-solid fa-user-graduate"></i>
                            <input type="text" id="eduDegree" placeholder="Degree / Certification">
                        </div>
                        <div class="input-group">
                            <i class="fa-solid fa-calendar"></i>
                            <input type="date" id="eduFrom">
                        </div>
                        <div class="input-group">
                            <i class="fa-solid fa-calendar-check"></i>
                            <input type="date" id="eduTo">
                        </div>
                    </div>
                    <button class="action-btn primary" id="addEduBtn" style="margin-top: 15px;"><i class="fa-solid fa-plus"></i> Add Education</button>
                    <div class="list-items-display" id="educationListDisplay"></div>
                </div>
            </div>

            <!-- Preview pane -->
            <div class="preview-pane">
                <div style="text-align: center; border-bottom: 1px solid var(--border-glass); padding-bottom: 20px; margin-bottom: 20px;">
                    <span class="badge" id="previewThemeBadge">Theme: Default</span>
                    <h3 style="margin-top: 10px;" id="previewName">Your Full Name</h3>
                    <p style="color: var(--accent-purple); font-size: 13px;" id="previewHeadline">Professional Headline</p>
                </div>
                <div style="margin-bottom: 25px;">
                    <h4 style="font-size: 14px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">About</h4>
                    <p id="previewAbout" style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">A brief summary bio details will render here.</p>
                </div>
                <div style="margin-bottom: 25px;">
                    <h4 style="font-size: 14px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">Experience</h4>
                    <div id="previewExpList" style="display: flex; flex-direction: column; gap: 15px;"></div>
                </div>
                <div style="margin-bottom: 25px;">
                    <h4 style="font-size: 14px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">Education</h4>
                    <div id="previewEduList" style="display: flex; flex-direction: column; gap: 15px;"></div>
                </div>
            </div>
        </div>
    `;

    // Fetch and populate portfolio
    try {
        const res = await request("/portfolio/me");
        state.portfolio = res.portfolio;
        
        // Populate inputs
        document.getElementById("portHeadline").value = state.portfolio.headline || "";
        document.getElementById("portAbout").value = state.portfolio.about || "";
        document.getElementById("portTheme").value = state.portfolio.theme || "default";

        // Bind update triggers to auto-save and update preview
        const inputs = ["portHeadline", "portAbout", "portTheme"];
        inputs.forEach(id => {
            document.getElementById(id).addEventListener("input", savePortfolioChanges);
        });

        // Add item actions
        document.getElementById("addExpBtn").addEventListener("click", addExperienceItem);
        document.getElementById("addEduBtn").addEventListener("click", addEducationItem);

        // Bind publish triggers
        setupPublishButtons();
        
        // Render lists & preview
        renderPortfolioLists();
        updatePortfolioPreview();

        // Bind PDF download
        document.getElementById("downloadPdfBtn").addEventListener("click", triggerPdfDownload);
    } catch (err) {
        showToast(err.message, true);
    }
}

function setupPublishButtons() {
    const pubBtn = document.getElementById("publishPortfolioBtn");
    if (state.portfolio.isPublished) {
        pubBtn.className = "action-btn";
        pubBtn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Unpublish`;
        pubBtn.onclick = async () => {
            try {
                await request("/portfolio/me/unpublish", "POST");
                state.portfolio.isPublished = false;
                showToast("Portfolio unpublished");
                setupPublishButtons();
            } catch (err) { showToast(err.message, true); }
        };
    } else {
        pubBtn.className = "action-btn primary";
        pubBtn.innerHTML = `<i class="fa-solid fa-eye"></i> Go Live`;
        pubBtn.onclick = async () => {
            try {
                await request("/portfolio/me/publish", "POST");
                state.portfolio.isPublished = true;
                showToast("Portfolio is now live!");
                setupPublishButtons();
            } catch (err) { showToast(err.message, true); }
        };
    }
}

async function savePortfolioChanges() {
    const headline = document.getElementById("portHeadline").value;
    const about = document.getElementById("portAbout").value;
    const theme = document.getElementById("portTheme").value;

    try {
        const res = await request("/portfolio/me", "PATCH", { headline, about, theme });
        state.portfolio = res.portfolio;
        updatePortfolioPreview();
    } catch (e) {
        console.error("Auto-save failed", e);
    }
}

async function addExperienceItem() {
    const company = document.getElementById("expCompany").value;
    const role = document.getElementById("expRole").value;
    const from = document.getElementById("expFrom").value;
    const to = document.getElementById("expTo").value || null;
    const description = document.getElementById("expDesc").value;

    if (!company || !role || !from) {
        return showToast("Please fill company, role and start date", true);
    }

    const newItem = { company, role, from, to, description };
    state.portfolio.experience.push(newItem);

    // Save to server
    try {
        await request("/portfolio/me", "PATCH", { experience: state.portfolio.experience });
        showToast("Experience item added");
        
        // Clear fields
        document.getElementById("expCompany").value = "";
        document.getElementById("expRole").value = "";
        document.getElementById("expFrom").value = "";
        document.getElementById("expTo").value = "";
        document.getElementById("expDesc").value = "";

        renderPortfolioLists();
        updatePortfolioPreview();
    } catch (err) { showToast(err.message, true); }
}

async function addEducationItem() {
    const institution = document.getElementById("eduInst").value;
    const degree = document.getElementById("eduDegree").value;
    const from = document.getElementById("eduFrom").value;
    const to = document.getElementById("eduTo").value;

    if (!institution || !degree || !from) {
        return showToast("Please fill school name, degree and start date", true);
    }

    const newItem = { institution, degree, from, to };
    state.portfolio.education.push(newItem);

    try {
        await request("/portfolio/me", "PATCH", { education: state.portfolio.education });
        showToast("Education item added");
        
        document.getElementById("eduInst").value = "";
        document.getElementById("eduDegree").value = "";
        document.getElementById("eduFrom").value = "";
        document.getElementById("eduTo").value = "";

        renderPortfolioLists();
        updatePortfolioPreview();
    } catch (err) { showToast(err.message, true); }
}

function renderPortfolioLists() {
    const expContainer = document.getElementById("experienceListDisplay");
    const eduContainer = document.getElementById("educationListDisplay");
    
    expContainer.innerHTML = "";
    eduContainer.innerHTML = "";

    // Render Experience List
    state.portfolio.experience.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "list-item-pill";
        div.innerHTML = `
            <div>
                <strong>${item.role}</strong> at ${item.company}
                <p style="font-size: 11px; color: var(--text-secondary);">${new Date(item.from).toLocaleDateString()} - ${item.to ? new Date(item.to).toLocaleDateString() : 'Current'}</p>
            </div>
            <button id="del-exp-${index}"><i class="fa-solid fa-trash"></i></button>
        `;
        expContainer.appendChild(div);

        document.getElementById(`del-exp-${index}`).addEventListener("click", async () => {
            state.portfolio.experience.splice(index, 1);
            await request("/portfolio/me", "PATCH", { experience: state.portfolio.experience });
            renderPortfolioLists();
            updatePortfolioPreview();
            showToast("Item deleted");
        });
    });

    // Render Education List
    state.portfolio.education.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "list-item-pill";
        div.innerHTML = `
            <div>
                <strong>${item.degree}</strong>
                <p style="font-size: 11px; color: var(--text-secondary);">${item.institution}</p>
            </div>
            <button id="del-edu-${index}"><i class="fa-solid fa-trash"></i></button>
        `;
        eduContainer.appendChild(div);

        document.getElementById(`del-edu-${index}`).addEventListener("click", async () => {
            state.portfolio.education.splice(index, 1);
            await request("/portfolio/me", "PATCH", { education: state.portfolio.education });
            renderPortfolioLists();
            updatePortfolioPreview();
            showToast("Item deleted");
        });
    });
}

function updatePortfolioPreview() {
    document.getElementById("previewName").innerText = state.user.name;
    document.getElementById("previewHeadline").innerText = state.portfolio.headline || "Professional Headline";
    document.getElementById("previewAbout").innerText = state.portfolio.about || "A brief summary bio details will render here.";
    document.getElementById("previewThemeBadge").innerText = `Theme: ${state.portfolio.theme}`;

    const expPrev = document.getElementById("previewExpList");
    expPrev.innerHTML = "";
    if (state.portfolio.experience.length === 0) {
        expPrev.innerHTML = `<p style="font-size: 12px; color: var(--text-secondary);">No experience added yet</p>`;
    } else {
        state.portfolio.experience.forEach(item => {
            const el = document.createElement("div");
            el.innerHTML = `
                <h5 style="font-weight:600; font-size: 14px;">${item.role} — ${item.company}</h5>
                <span style="font-size: 11px; color: var(--accent-purple);">${new Date(item.from).getFullYear()} - ${item.to ? new Date(item.to).getFullYear() : 'Present'}</span>
                <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px; line-height:1.5;">${item.description || ''}</p>
            `;
            expPrev.appendChild(el);
        });
    }

    const eduPrev = document.getElementById("previewEduList");
    eduPrev.innerHTML = "";
    if (state.portfolio.education.length === 0) {
        eduPrev.innerHTML = `<p style="font-size: 12px; color: var(--text-secondary);">No education added yet</p>`;
    } else {
        state.portfolio.education.forEach(item => {
            const el = document.createElement("div");
            el.innerHTML = `
                <h5 style="font-weight:600; font-size: 14px;">${item.degree}</h5>
                <p style="font-size: 12px; color: var(--text-secondary);">${item.institution} (${new Date(item.from).getFullYear()})</p>
            `;
            eduPrev.appendChild(el);
        });
    }
}

async function triggerPdfDownload() {
    showToast("Starting PDF resume compile...");
    try {
        const res = await request("/portfolio/me/pdf");
        const jobId = res.jobId;
        
        // Trigger download directly (mock server sends PDF payload)
        window.open(`/api/portfolio/me/pdf/download/${jobId}`, "_blank");
        showToast("PDF downloaded successfully!");
    } catch (err) {
        showToast(err.message, true);
    }
}

// ----------------- 5. PROJECTS HUB -----------------
async function loadProjectsShowcase() {
    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `
        <div class="view-header">
            <h2>Projects Showcase</h2>
            <button class="action-btn primary" id="showAddProjectBox"><i class="fa-solid fa-plus"></i> Upload Project</button>
        </div>

        <div class="portfolio-editor-layout">
            <div style="flex: 1.2;">
                <div class="grid-layout" id="projectsGrid"></div>
            </div>
            
            <div class="section-box hidden" id="addProjectBox" style="flex: 0.8; height: fit-content; position: sticky; top: 0;">
                <h3 style="margin-bottom: 20px;"><i class="fa-solid fa-circle-plus"></i> Add New Project</h3>
                <div class="input-group">
                    <i class="fa-solid fa-folder"></i>
                    <input type="text" id="projTitle" placeholder="Project Title" required>
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-tags"></i>
                    <select id="projCategory" style="padding-left: 45px;">
                        <option value="Web">Web Application</option>
                        <option value="Mobile">Mobile App</option>
                        <option value="ML">Machine Learning</option>
                        <option value="Design">UI/UX Design</option>
                        <option value="Other">Other Category</option>
                    </select>
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-code"></i>
                    <input type="text" id="projTech" placeholder="Tech Stack (comma separated)">
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-link"></i>
                    <input type="text" id="projGit" placeholder="GitHub Repository URL">
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-align-left" style="top: 20px;"></i>
                    <textarea id="projDesc" placeholder="Brief project summary..." rows="4"></textarea>
                </div>
                <button class="primary-btn" id="saveProjBtn">Submit Project</button>
            </div>
        </div>
    `;

    document.getElementById("showAddProjectBox").addEventListener("click", () => {
        document.getElementById("addProjectBox").classList.toggle("hidden");
    });

    document.getElementById("saveProjBtn").addEventListener("click", saveNewProject);

    loadUserProjects();
}

async function loadUserProjects() {
    const grid = document.getElementById("projectsGrid");
    grid.innerHTML = `<p style="grid-column: span 2; text-align: center; color: var(--text-secondary);">Loading your portfolio projects...</p>`;

    try {
        const res = await request(`/projects?userId=${state.user.id}`);
        state.projects = res.projects;
        grid.innerHTML = "";

        if (state.projects.length === 0) {
            grid.innerHTML = `<p style="grid-column: span 2; text-align: center; color: var(--text-secondary); padding: 30px;">You haven't uploaded any projects yet. Click Upload Project to feature your work!</p>`;
            return;
        }

        state.projects.forEach(proj => {
            const card = document.createElement("div");
            card.className = "glass-card";
            
            const starredHTML = proj.isFeatured ? `<span class="match-score-badge" style="background: rgba(139,92,246,0.15); color: var(--accent-purple); border-color: rgba(139,92,246,0.3)"><i class="fa-solid fa-star"></i> Pinned</span>` : "";

            let techHTML = "";
            proj.techStack.forEach(t => {
                techHTML += `<span>${t}</span>`;
            });

            card.innerHTML = `
                ${starredHTML}
                <div class="card-header" style="margin-bottom: 10px;">
                    <div class="card-title">
                        <h3 style="font-size: 18px;">${proj.title}</h3>
                        <span style="font-size: 11px; color: var(--text-secondary);">${proj.category}</span>
                    </div>
                </div>
                <div class="card-body" style="margin-bottom: 15px;">
                    <p class="bio">${proj.description || 'No description provided.'}</p>
                    <div class="tag-list">${techHTML}</div>
                </div>
                <div class="card-actions">
                    <button class="action-btn primary" id="pin-${proj._id}"><i class="fa-solid fa-thumbtack"></i> ${proj.isFeatured ? 'Unpin' : 'Pin'}</button>
                    <button class="action-btn" style="color: var(--danger-red);" id="del-proj-${proj._id}"><i class="fa-solid fa-trash"></i> Delete</button>
                </div>
            `;
            grid.appendChild(card);

            document.getElementById(`pin-${proj._id}`).addEventListener("click", async () => {
                try {
                    await request(`/projects/${proj._id}/feature`, "PATCH");
                    showToast("Featured project toggled");
                    loadProjectsShowcase();
                } catch (e) { showToast(e.message, true); }
            });

            document.getElementById(`del-proj-${proj._id}`).addEventListener("click", async () => {
                if (confirm("Delete this project from your showcase?")) {
                    try {
                        await request(`/projects/${proj._id}`, "DELETE");
                        showToast("Project deleted");
                        loadProjectsShowcase();
                    } catch (e) { showToast(e.message, true); }
                }
            });
        });
    } catch (err) {
        grid.innerHTML = `<p style="grid-column: span 2; text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}

async function saveNewProject() {
    const title = document.getElementById("projTitle").value;
    const category = document.getElementById("projCategory").value;
    const tech = document.getElementById("projTech").value;
    const git = document.getElementById("projGit").value;
    const desc = document.getElementById("projDesc").value;

    if (!title) {
        return showToast("Project title is required", true);
    }

    const techStack = tech.split(",").map(t => t.trim()).filter(Boolean);

    try {
        await request("/projects", "POST", {
            title,
            category,
            techStack,
            githubUrl: git,
            description: desc
        });

        showToast("Showcase project created successfully!");
        document.getElementById("addProjectBox").classList.add("hidden");
        loadProjectsShowcase();
    } catch (err) {
        showToast(err.message, true);
    }
}

// ----------------- 6. COLLABORATION BOARD -----------------
async function loadCollaborationHub() {
    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `
        <div class="view-header">
            <h2>Collaboration Recruitment Hub</h2>
            <button class="action-btn primary" id="showCollabBoxBtn"><i class="fa-solid fa-bullhorn"></i> Post Opening</button>
        </div>

        <div class="portfolio-editor-layout">
            <div style="flex: 1.2;">
                <div class="list-items-display" id="collabHubList" style="gap: 20px;">
                    <p style="text-align: center; color: var(--text-secondary);">Loading opportunities board...</p>
                </div>
            </div>

            <!-- Create Board Post Panel -->
            <div class="section-box hidden" id="collabPostBox" style="flex: 0.8; height: fit-content; position: sticky; top: 0;">
                <h3 style="margin-bottom: 20px;"><i class="fa-solid fa-bullhorn"></i> Post Recruitment Listing</h3>
                <div class="input-group">
                    <i class="fa-solid fa-circle-question"></i>
                    <select id="collabType" style="padding-left: 45px;">
                        <option value="developer">Looking for Developer</option>
                        <option value="designer">Looking for Designer</option>
                        <option value="startup">Co-Founder/Startup Match</option>
                        <option value="freelance">Freelance Contract</option>
                        <option value="hackathon">Hackathon Partner</option>
                    </select>
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-heading"></i>
                    <input type="text" id="collabTitle" placeholder="Listing Title (e.g. Need Next.js expert)">
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-tags"></i>
                    <input type="text" id="collabSkills" placeholder="Skills Needed (comma separated)">
                </div>
                <div class="input-group" style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding-left: 10px;">
                    <input type="checkbox" id="collabRemote" style="width: auto; margin-bottom: 0;">
                    <label for="collabRemote" style="font-size: 14px; color: var(--text-secondary); cursor: pointer;">This role is Remote</label>
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-align-left" style="top: 20px;"></i>
                    <textarea id="collabDesc" placeholder="Describe the project, team fit and scope details..." rows="4"></textarea>
                </div>
                <button class="primary-btn" id="saveCollabBtn">Post Listing</button>
            </div>
        </div>
    `;

    document.getElementById("showCollabBoxBtn").addEventListener("click", () => {
        // Enforce premium check client-side
        if (!state.user.isPremium) {
            showToast("Posting board recruitments requires a Premium subscription", true);
            switchView("subscription");
            return;
        }
        document.getElementById("collabPostBox").classList.toggle("hidden");
    });

    document.getElementById("saveCollabBtn").addEventListener("click", saveCollaborationPost);

    loadCollaborationPosts();
}

async function loadCollaborationPosts() {
    const list = document.getElementById("collabHubList");
    try {
        const res = await request("/collaboration");
        state.collabPosts = res.posts;
        list.innerHTML = "";

        if (state.collabPosts.length === 0) {
            list.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 30px;">Opportunities board is currently empty. Post one!</p>`;
            return;
        }

        state.collabPosts.forEach(post => {
            const item = document.createElement("div");
            item.className = "glass-card";
            item.style.flexDirection = "column";
            item.style.alignItems = "stretch";
            item.style.gap = "10px";

            let tags = "";
            post.skillsNeeded.forEach(s => {
                tags += `<span style="background: rgba(139,92,246,0.1); color: var(--accent-purple); border: 1px solid rgba(139,92,246,0.2); padding: 3px 8px; border-radius: 6px; font-size:11px;">${s}</span>`;
            });

            const isOwnPost = post.userId._id.toString() === state.user.id.toString();
            const actionBtn = isOwnPost 
                ? `<button class="action-btn" style="color: var(--danger-red);" id="close-post-${post._id}"><i class="fa-solid fa-circle-xmark"></i> Close Listing</button>`
                : `<button class="action-btn primary" id="apply-post-${post._id}"><i class="fa-solid fa-paper-plane"></i> Apply</button>`;

            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <span class="badge" style="background: var(--bg-glass); border: 1px solid var(--border-glass); font-size: 10px;">${post.type.toUpperCase()}</span>
                        ${post.isRemote ? '<span class="badge" style="background: var(--accent-emerald); font-size: 10px; margin-left: 5px;">REMOTE</span>' : ''}
                        <h3 style="font-size: 18px; margin-top: 8px;">${post.title}</h3>
                    </div>
                    <div style="text-align: right; font-size: 12px; color: var(--text-secondary);">
                        Posted by ${post.userId.name}
                    </div>
                </div>
                <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.6;">${post.description}</p>
                <div class="tag-list" style="margin-top: 5px;">${tags}</div>
                <div style="display: flex; gap: 10px; margin-top: 15px; border-top: 1px solid var(--border-glass); padding-top: 15px;">
                    ${actionBtn}
                    <button class="action-btn" id="save-post-${post._id}"><i class="fa-solid fa-bookmark"></i> Save</button>
                </div>
            `;
            list.appendChild(item);

            if (isOwnPost) {
                document.getElementById(`close-post-${post._id}`).addEventListener("click", async () => {
                    try {
                        await request(`/collaboration/${post._id}/close`, "PATCH");
                        showToast("Listing closed");
                        loadCollaborationHub();
                    } catch (e) { showToast(e.message, true); }
                });
            } else {
                document.getElementById(`apply-post-${post._id}`).addEventListener("click", async (e) => {
                    e.target.disabled = true;
                    e.target.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Applying...`;
                    try {
                        await request(`/collaboration/${post._id}/apply`, "POST");
                        showToast("Applied successfully!");
                        e.target.innerHTML = `<i class="fa-solid fa-check"></i> Applied`;
                    } catch (err) {
                        showToast(err.message, true);
                        e.target.disabled = false;
                        e.target.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Apply`;
                    }
                });
            }

            document.getElementById(`save-post-${post._id}`).addEventListener("click", async () => {
                try {
                    const savedRes = await request(`/collaboration/${post._id}/save`, "POST");
                    showToast(savedRes.message);
                } catch (e) { showToast(e.message, true); }
            });
        });
    } catch (err) {
        list.innerHTML = `<p style="text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}

async function saveCollaborationPost() {
    const type = document.getElementById("collabType").value;
    const title = document.getElementById("collabTitle").value;
    const skills = document.getElementById("collabSkills").value;
    const isRemote = document.getElementById("collabRemote").checked;
    const description = document.getElementById("collabDesc").value;

    if (!title || !description) {
        return showToast("Title and Description are required", true);
    }

    const skillsNeeded = skills.split(",").map(s => s.trim()).filter(Boolean);

    try {
        await request("/collaboration", "POST", {
            type,
            title,
            skillsNeeded,
            isRemote,
            description
        });

        showToast("Opportunity listing posted successfully!");
        document.getElementById("collabPostBox").classList.add("hidden");
        loadCollaborationHub();
    } catch (err) {
        showToast(err.message, true);
    }
}

// ----------------- 7. SUBSCRIPTIONS & BILLING -----------------
async function loadSubscriptions() {
    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `
        <div class="view-header">
            <h2>Billing & Subscriptions</h2>
        </div>
        
        <div class="portfolio-editor-layout">
            <!-- Pricing Cards -->
            <div class="section-box" style="flex: 1.2; text-align: center; padding: 40px 20px;">
                <div class="brand-badge" style="align-self: center; margin-bottom: 15px;"><i class="fa-solid fa-crown"></i> Go Premium</div>
                <h3 style="font-size: 32px; font-weight: 700; margin-bottom: 5px;">₹49/month</h3>
                <p style="color: var(--text-secondary); margin-bottom: 35px;">Accelerate your networking speed with premium matching tools.</p>
                
                <div style="display: flex; flex-direction: column; gap: 15px; max-width: 420px; margin: 0 auto 35px auto; text-align: left;">
                    <div style="display: flex; gap: 12px; font-size: 14px;"><i class="fa-solid fa-circle-check" style="color: var(--accent-emerald); margin-top: 3px;"></i> <span>Advanced search filters (skills + interests query filters)</span></div>
                    <div style="display: flex; gap: 12px; font-size: 14px;"><i class="fa-solid fa-circle-check" style="color: var(--accent-emerald); margin-top: 3px;"></i> <span>Premium match discovery algorithm (overlap scoring index)</span></div>
                    <div style="display: flex; gap: 12px; font-size: 14px;"><i class="fa-solid fa-circle-check" style="color: var(--accent-emerald); margin-top: 3px;"></i> <span>Unlimited postings on collaboration board recruitment list</span></div>
                    <div style="display: flex; gap: 12px; font-size: 14px;"><i class="fa-solid fa-circle-check" style="color: var(--accent-emerald); margin-top: 3px;"></i> <span>Access detailed portfolio visitor analytics log</span></div>
                </div>

                <button class="primary-btn" style="max-width: 320px; margin: 0 auto;" id="checkoutBtn"><i class="fa-solid fa-bolt"></i> Subscribe Now</button>
            </div>

            <!-- Active Status panel -->
            <div class="section-box" style="flex: 0.8;">
                <h3 style="margin-bottom: 20px;"><i class="fa-solid fa-receipt"></i> Active Membership</h3>
                <div id="subStatusInfo" style="display: flex; flex-direction: column; gap: 20px;">
                    <p style="color: var(--text-secondary);">Syncing subscription data...</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById("checkoutBtn").addEventListener("click", triggerRazorpayMockPayment);

    loadSubscriptionDetails();
}

async function loadSubscriptionDetails() {
    const container = document.getElementById("subStatusInfo");
    try {
        const res = await request("/subscription/status");
        container.innerHTML = "";

        if (res.status === "inactive") {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; background: rgba(255,255,255,0.02); border-radius:12px; border: 1px dashed var(--border-glass);">
                    <i class="fa-regular fa-star" style="font-size: 32px; margin-bottom: 10px; color: var(--text-secondary);"></i>
                    <h4>Standard Plan Active</h4>
                    <p style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">You are currently using the free tier limits. Upgrading unlocks high match ratios.</p>
                </div>
            `;
            return;
        }

        const dateStr = new Date(res.expiryDate).toLocaleDateString();
        const cancelBtnHTML = res.status === "active" 
            ? `<button class="action-btn" style="color: var(--danger-red); width: 100%;" id="cancelSubBtn"><i class="fa-solid fa-ban"></i> Cancel Renewal</button>`
            : `<p style="font-size:12px; color: var(--danger-red); text-align: center;">Renewal is cancelled. Plan expires on: ${dateStr}</p>`;

        container.innerHTML = `
            <div style="background: var(--bg-glass); border: 1px solid var(--border-glass); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="badge badge-premium">Premium</span>
                    <strong style="color: var(--accent-emerald); font-size:13px; text-transform:uppercase;">${res.status}</strong>
                </div>
                <h4 style="font-size: 16px;">SYTU Premium Membership</h4>
                <p style="font-size: 12px; color: var(--text-secondary);">Billed monthly. Auto renews: <strong>${res.autoRenew ? 'Yes' : 'No'}</strong></p>
                <div style="border-top: 1px solid var(--border-glass); margin-top: 5px; padding-top: 10px; font-size: 13px;">
                    Expiry Date: <strong>${dateStr}</strong>
                </div>
            </div>
            ${cancelBtnHTML}
        `;

        if (res.status === "active") {
            document.getElementById("cancelSubBtn").addEventListener("click", async () => {
                if (confirm("Are you sure you want to cancel auto-renewal? Benefits will remain active until billing cycle expires.")) {
                    try {
                        await request("/subscription/cancel", "POST");
                        showToast("Subscription renewal cancelled");
                        loadSubscriptionDetails();
                    } catch (e) { showToast(e.message, true); }
                }
            });
        }
    } catch (err) {
        container.innerHTML = `<p style="color: var(--danger-red);">${err.message}</p>`;
    }
}

async function triggerRazorpayMockPayment() {
    showToast("Opening Razorpay checkout...");
    try {
        const orderRes = await request("/subscription/create", "POST");
        const orderId = orderRes.orderId;
        
        // Simulating 2 seconds of Razorpay overlay checkout
        setTimeout(async () => {
            showToast("Mock payment checkout completed!");
            try {
                // Verify with mock signature
                await request("/subscription/verify", "POST", {
                    orderId,
                    paymentId: "pay_" + Math.random().toString(36).substring(7),
                    signature: "mock_signature_validation_key_xyz"
                });
                
                // Update local state
                state.user.isPremium = true;
                localStorage.setItem("user", JSON.stringify(state.user));

                showToast("Premium membership activated! Thank you!");
                switchView("subscription");
            } catch (err) {
                showToast(err.message, true);
            }
        }, 1500);
    } catch (err) {
        showToast(err.message, true);
    }
}

// ----------------- 8. ADMIN CONSOLE -----------------
async function loadAdminConsole() {
    const activeViewContent = document.getElementById("activeViewContent");
    activeViewContent.innerHTML = `
        <div class="view-header">
            <h2>Admin Operations Panel</h2>
        </div>

        <div class="portfolio-editor-layout">
            <!-- Analytics Widget -->
            <div class="section-box" style="flex: 1.2;">
                <h3><i class="fa-solid fa-chart-line"></i> Dashboard Growth Metrics</h3>
                <div id="analyticsStats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                    <p style="grid-column: span 2;">Syncing data...</p>
                </div>
            </div>
            
            <!-- Reports Queue -->
            <div class="section-box" style="flex: 0.8;">
                <h3><i class="fa-solid fa-flag"></i> Moderation Flag Reports</h3>
                <div class="list-items-display" id="adminReportsQueue" style="gap: 15px; margin-top: 15px;">
                    <p style="text-align: center; color: var(--text-secondary);">Loading reports...</p>
                </div>
            </div>
        </div>

        <!-- Users Admin list -->
        <div class="section-box" style="margin-top: 30px;">
            <h3><i class="fa-solid fa-users-gear"></i> Platform Accounts Directory</h3>
            <div class="list-items-display" id="adminUsersList" style="gap: 15px; margin-top: 20px;">
                <p style="text-align: center; color: var(--text-secondary);">Loading user directory...</p>
            </div>
        </div>
    `;

    loadAdminAnalytics();
    loadAdminReports();
    loadAdminUsersList();
}

async function loadAdminAnalytics() {
    const container = document.getElementById("analyticsStats");
    try {
        const res = await request("/admin/analytics");
        const stats = res.analytics;
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); padding: 15px; border-radius: 10px;">
                <span style="font-size: 12px; color: var(--text-secondary);">TOTAL USERS</span>
                <h4 style="font-size: 24px; font-weight: 700; margin-top: 5px;">${stats.totalUsers}</h4>
            </div>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); padding: 15px; border-radius: 10px;">
                <span style="font-size: 12px; color: var(--text-secondary);">PREMIUM MEMBERS</span>
                <h4 style="font-size: 24px; font-weight: 700; margin-top: 5px; color: var(--accent-purple);">${stats.premiumUsers}</h4>
            </div>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); padding: 15px; border-radius: 10px;">
                <span style="font-size: 12px; color: var(--text-secondary);">MONTHLY RECURRING REVENUE</span>
                <h4 style="font-size: 24px; font-weight: 700; margin-top: 5px; color: var(--accent-emerald);">₹${stats.mrr}</h4>
            </div>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); padding: 15px; border-radius: 10px;">
                <span style="font-size: 12px; color: var(--text-secondary);">MONTHLY RETENTION</span>
                <h4 style="font-size: 24px; font-weight: 700; margin-top: 5px;">${stats.retentionRate}</h4>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<p style="grid-column: span 2; color: var(--danger-red);">${err.message}</p>`;
    }
}

async function loadAdminReports() {
    const listEl = document.getElementById("adminReportsQueue");
    try {
        const res = await request("/admin/reports");
        state.adminReports = res.reports;
        listEl.innerHTML = "";

        if (state.adminReports.length === 0) {
            listEl.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 15px;">No unresolved reports</p>`;
            return;
        }

        state.adminReports.forEach(report => {
            const item = document.createElement("div");
            item.className = "list-item-pill";
            item.style.flexDirection = "column";
            item.style.alignItems = "stretch";
            item.style.gap = "8px";
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:12px;">
                    <span style="color: var(--danger-red); font-weight:600;">Reason: ${report.reason.toUpperCase()}</span>
                    <span>Target: <strong>@${report.targetUserId.username}</strong></span>
                </div>
                <p style="font-size:13px; color: var(--text-secondary);">${report.description || 'No description provided'}</p>
                <div style="display: flex; gap: 8px; margin-top: 5px;">
                    <button class="action-btn primary" id="resolve-rep-${report._id}" style="padding: 6px;"><i class="fa-solid fa-check"></i> Dismiss</button>
                    <button class="action-btn" id="suspend-rep-${report._id}" style="padding: 6px; color: var(--danger-red);"><i class="fa-solid fa-user-slash"></i> Suspend Target</button>
                </div>
            `;
            listEl.appendChild(item);

            document.getElementById(`resolve-rep-${report._id}`).addEventListener("click", async () => {
                try {
                    await request(`/admin/reports/${report._id}`, "PATCH", { status: "dismissed", adminNote: "Dismissed by admin" });
                    showToast("Report dismissed");
                    loadAdminConsole();
                } catch (e) { showToast(e.message, true); }
            });

            document.getElementById(`suspend-rep-${report._id}`).addEventListener("click", async () => {
                try {
                    await request(`/admin/users/${report.targetUserId._id}/suspend`, "PATCH");
                    await request(`/admin/reports/${report._id}`, "PATCH", { status: "resolved", adminNote: "User suspended" });
                    showToast("User suspended, report resolved");
                    loadAdminConsole();
                } catch (e) { showToast(e.message, true); }
            });
        });
    } catch (err) {
        listEl.innerHTML = `<p style="text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}

async function loadAdminUsersList() {
    const listEl = document.getElementById("adminUsersList");
    try {
        const res = await request("/admin/users");
        state.adminUsers = res.users;
        listEl.innerHTML = "";

        if (state.adminUsers.length === 0) {
            listEl.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 15px;">No accounts found</p>`;
            return;
        }

        state.adminUsers.forEach(user => {
            const statusBadge = user.isSuspended 
                ? `<span class="badge" style="background: var(--danger-red);">SUSPENDED</span>` 
                : `<span class="badge" style="background: var(--accent-emerald);">ACTIVE</span>`;

            const premiumBadge = user.isPremium ? `<span class="badge badge-premium">Premium</span>` : "";

            const actionBtnHTML = user.isSuspended
                ? `<button class="action-btn" id="suspend-user-${user._id}" style="padding: 6px 12px; color: var(--accent-emerald);"><i class="fa-solid fa-user-check"></i> Unsuspend</button>`
                : `<button class="action-btn" id="suspend-user-${user._id}" style="padding: 6px 12px; color: var(--danger-red);"><i class="fa-solid fa-user-slash"></i> Suspend</button>`;

            const item = document.createElement("div");
            item.className = "list-item-pill";
            item.innerHTML = `
                <div style="display:flex; align-items:center; gap: 15px;">
                    <div style="display:flex; flex-direction:column; gap: 4px;">
                        <strong>${user.name}</strong>
                        <span style="font-size:12px; color: var(--text-secondary);">@${user.username} (${user.email})</span>
                    </div>
                    <div style="display:flex; gap: 5px;">
                        ${statusBadge}
                        ${premiumBadge}
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    ${actionBtnHTML}
                    <button class="action-btn" id="del-user-${user._id}" style="padding: 6px 12px; color: var(--danger-red);"><i class="fa-solid fa-trash-can"></i> Delete</button>
                </div>
            `;
            listEl.appendChild(item);

            document.getElementById(`suspend-user-${user._id}`).addEventListener("click", async () => {
                const endpoint = user.isSuspended ? `/admin/users/${user._id}/unsuspend` : `/admin/users/${user._id}/suspend`;
                try {
                    await request(endpoint, "PATCH");
                    showToast(user.isSuspended ? "User unsuspended" : "User suspended");
                    loadAdminConsole();
                } catch (e) { showToast(e.message, true); }
            });

            document.getElementById(`del-user-${user._id}`).addEventListener("click", async () => {
                if (confirm(`Are you absolutely sure you want to permanently delete user @${user.username}? This cannot be undone.`)) {
                    try {
                        await request(`/admin/users/${user._id}`, "DELETE");
                        showToast("Account deleted");
                        loadAdminConsole();
                    } catch (e) { showToast(e.message, true); }
                }
            });
        });
    } catch (err) {
        listEl.innerHTML = `<p style="text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}

// ----------------- SEARCH EVENT TRIGGER -----------------
async function triggerGlobalSearch(query) {
    if (!query) {
        switchView("discovery");
        return;
    }
    
    // Check if user is premium for query searches
    if (!state.user.isPremium) {
        showToast("Filtering search queries requires a Premium membership.", true);
        switchView("subscription");
        return;
    }

    switchView("discovery"); // Switch to discovery feed structure
    const feedHeader = document.querySelector(".view-header h2");
    if (feedHeader) {
        feedHeader.innerText = `Search Results for: "${query}"`;
    }

    const listEl = document.getElementById("discoveryList");
    listEl.innerHTML = `<p style="grid-column: span 3; text-align: center; color: var(--text-secondary);">Searching...</p>`;

    try {
        const res = await request(`/users/search?q=${encodeURIComponent(query)}`);
        listEl.innerHTML = "";
        
        if (res.users.length === 0) {
            listEl.innerHTML = `<p style="grid-column: span 3; text-align: center; color: var(--text-secondary); padding: 30px;">No users match your query</p>`;
            return;
        }

        res.users.forEach(user => {
            renderProfileCard(user, null, listEl);
        });
    } catch (err) {
        listEl.innerHTML = `<p style="grid-column: span 3; text-align: center; color: var(--danger-red);">${err.message}</p>`;
    }
}