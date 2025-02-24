document.addEventListener("DOMContentLoaded", () => {
    const welcomeScreen = document.getElementById("welcome-screen");
    const sidebar = document.querySelector(".sidebar");
    const chatBox = document.getElementById("chat-box");
    const inputArea = document.querySelector(".input-area");
    const startChatButton = document.getElementById("start-chat-btn");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-btn");
    const loadingIndicator = document.getElementById("loading");
    const chatList = document.getElementById("chat-list");
    const newChatButton = document.getElementById("new-chat-btn");

    let chatId = null; // Don't get from localStorage initially
    let isProcessing = false; // Flag to prevent multiple simultaneous requests

    // Event listeners
    startChatButton.addEventListener("click", startNewChat);
    sendButton.addEventListener("click", handleSendMessage);
    userInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
    });
    newChatButton.addEventListener("click", startNewChat);

    // Always show the welcome screen on page load
    welcomeScreen.style.display = 'flex';
    sidebar.classList.add("hidden");
    chatBox.style.display = 'none';
    inputArea.style.display = 'none';

    // Start new chat
    function startNewChat() {
        if (isProcessing) return;
        isProcessing = true;

        fetch("/new_chat", { method: "POST" })
            .then(response => response.json())
            .then(data => {
                if (data.chat_id) {
                    chatId = data.chat_id;
                    localStorage.setItem("chat_id", chatId);

                    // Fade out welcome screen
                    welcomeScreen.style.opacity = '0';
                    setTimeout(() => {
                        welcomeScreen.style.display = 'none';
                        
                        // Show sidebar with animation
                        sidebar.classList.remove("hidden");
                        requestAnimationFrame(() => {
                            sidebar.classList.add("visible");
                        });

                        // Show chat box with animation
                        chatBox.style.display = 'flex';
                        requestAnimationFrame(() => {
                            chatBox.classList.add("visible");
                        });

                        // Show input area with animation
                        inputArea.style.display = 'flex';
                        requestAnimationFrame(() => {
                            inputArea.classList.add("visible");
                        });

                        // Clear existing messages
                        chatBox.innerHTML = '';

                        // Initialize with welcome message
                        appendMessage("assistant", "Hello! How can I help you today?");
                    }, 500);

                    // Load chat history
                    loadChatHistory();
                }
            })
            .catch(error => console.error("Error starting new chat:", error))
            .finally(() => {
                isProcessing = false;
            });
    }

    // Handle send message
    function handleSendMessage() {
        if (isProcessing) return;
        const message = userInput.value.trim();
        if (!message) return;

        if (!chatId) {
            startNewChat();
            return;
        }

        sendMessage(message);
    }

    // Send message
    function sendMessage(message) {
        if (isProcessing) return;
        isProcessing = true;

        appendMessage("user", message);
        userInput.value = "";
        loadingIndicator.classList.add("visible");

        fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, chat_id: chatId })
        })
            .then(response => response.json())
            .then(data => {
                if (data.response) {
                    appendMessage("assistant", data.response);
                    loadChatHistory(); // Refresh chat list to show updated titles
                } else {
                    console.error("Error receiving response:", data.error);
                }
            })
            .catch(error => {
                console.error("Error sending message:", error);
                appendMessage("assistant", "Sorry, there was an error processing your message. Please try again.");
            })
            .finally(() => {
                loadingIndicator.classList.remove("visible");
                isProcessing = false;
                chatBox.scrollTop = chatBox.scrollHeight;
            });
    }

    // Append message to chat box
    function appendMessage(role, message) {
        const messageElement = document.createElement("div");
        messageElement.classList.add("message", role);

        const profileIcon = document.createElement("div");
        profileIcon.classList.add("profile-icon");
        profileIcon.innerHTML = role === "user" ? "👤" : "🤖";

        const messageContent = document.createElement("div");
        messageContent.classList.add("message-content");

        // Handle code blocks and markdown
        if (message.includes("```")) {
            const parts = message.split(/(```[\s\S]*?```)/g);
            messageContent.innerHTML = parts.map(part => {
                if (part.startsWith("```") && part.endsWith("```")) {
                    const code = part.slice(3, -3);
                    return `<pre><code>${escapeHtml(code)}</code></pre>`;
                }
                return escapeHtml(part);
            }).join('');
        } else {
            messageContent.textContent = message;
        }

        if (role === "user") {
            messageElement.appendChild(messageContent);
            messageElement.appendChild(profileIcon);
        } else {
            messageElement.appendChild(profileIcon);
            messageElement.appendChild(messageContent);
        }

        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Helper function to escape HTML
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Load chat history
    function loadChatHistory() {
        fetch("/history")
            .then(response => response.json())
            .then(chats => {
                if (!Array.isArray(chats)) {
                    console.error("Invalid chat history format");
                    return;
                }
                chatList.innerHTML = "";
                chats.forEach(chat => {
                    const chatItem = document.createElement("li");
                    chatItem.textContent = chat.title || `Chat ${chat.chat_id}`;
                    chatItem.classList.add("d-flex", "justify-content-between", "align-items-center");
                    chatItem.setAttribute("data-chat-id", chat.chat_id);

                    const buttonGroup = document.createElement("div");
                    buttonGroup.classList.add("btn-group");

                    const editButton = document.createElement("button");
                    editButton.textContent = "✏️";
                    editButton.classList.add("edit-icon");
                    editButton.addEventListener("click", (e) => {
                        e.stopPropagation();
                        openEditChatBar(chat.chat_id, chat.title);
                    });

                    const deleteButton = document.createElement("button");
                    deleteButton.textContent = "🗑️";
                    deleteButton.classList.add("delete-icon");
                    deleteButton.addEventListener("click", (e) => {
                        e.stopPropagation();
                        deleteChat(chat.chat_id);
                    });

                    buttonGroup.appendChild(editButton);
                    buttonGroup.appendChild(deleteButton);
                    chatItem.appendChild(buttonGroup);
                    
                    // Highlight active chat
                    if (chat.chat_id === parseInt(chatId)) {
                        chatItem.classList.add("active");
                    }
                    
                    // Add click event listener to load chat messages
                    chatItem.addEventListener("click", () => loadChatMessages(chat.chat_id));
                    chatList.appendChild(chatItem);
                });
            })
            .catch(error => console.error("Error loading chat history:", error));
    }

    // Load chat messages
    function loadChatMessages(chat_id) {
        if (isProcessing) return;
        isProcessing = true;
        loadingIndicator.classList.add("visible");

        fetch(`/history/${chat_id}`)
            .then(response => response.json())
            .then(messages => {
                if (!Array.isArray(messages)) {
                    console.error("Invalid messages format");
                    return;
                }

                // Clear existing messages
                chatBox.innerHTML = '';

                // Append each message to the chat box
                messages.forEach(msg => appendMessage(msg.role, msg.message));

                // Update the active chat ID
                chatId = chat_id;
                localStorage.setItem("chat_id", chat_id);

                // Highlight the active chat in the sidebar
                document.querySelectorAll("#chat-list li").forEach(li => li.classList.remove("active"));
                const activeChatItem = document.querySelector(`#chat-list li[data-chat-id="${chat_id}"]`);
                if (activeChatItem) {
                    activeChatItem.classList.add("active");
                }
            })
            .catch(error => console.error("Error loading chat messages:", error))
            .finally(() => {
                loadingIndicator.classList.remove("visible");
                isProcessing = false;
                chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the bottom of the chat
            });
    }

    // Delete chat
    function deleteChat(chatId) {
        if (!confirm("Are you sure you want to delete this chat?")) return;
        if (isProcessing) return;
        isProcessing = true;

        fetch(`/delete_chat/${chatId}`, {
            method: "DELETE"
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok.');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    loadChatHistory();
                    if (chatId === parseInt(localStorage.getItem("chat_id"))) {
                        localStorage.removeItem("chat_id");
                        chatBox.innerHTML = "";
                        startNewChat();
                    }
                } else {
                    throw new Error(data.message);
                }
            })
            .catch(error => {
                console.error("Error deleting chat:", error);
                alert("Failed to delete chat. Please try again.");
            })
            .finally(() => {
                isProcessing = false;
            });
    }

    // Open edit chat bar
    function openEditChatBar(chatId, currentTitle) {
        const chatItem = document.querySelector(`#chat-list li[data-chat-id="${chatId}"]`);
        if (!chatItem) return;

        // Remove any existing edit bar
        const existingEditBar = chatItem.querySelector(".edit-chat-bar");
        if (existingEditBar) existingEditBar.remove();

        // Create edit bar
        const editBar = document.createElement("div");
        editBar.classList.add("edit-chat-bar");

        const input = document.createElement("input");
        input.type = "text";
        input.value = currentTitle || "";
        input.classList.add("edit-input");

        const saveButton = document.createElement("button");
        saveButton.textContent = "Save";
        saveButton.classList.add("save-btn");
        saveButton.addEventListener("click", () => {
            const newTitle = input.value.trim();
            if (newTitle) {
                updateChatTitle(chatId, newTitle);
                editBar.remove();
            }
        });

        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.classList.add("cancel-btn");
        cancelButton.addEventListener("click", () => editBar.remove());

        editBar.appendChild(input);
        editBar.appendChild(saveButton);
        editBar.appendChild(cancelButton);
        chatItem.appendChild(editBar);
        input.focus();
        input.select();
    }

    // Update chat title
    function updateChatTitle(chatId, newTitle) {
        if (isProcessing) return;
        isProcessing = true;

        fetch("/update_chat_title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, title: newTitle })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadChatHistory();
            } else {
                console.error("Error updating chat title:", data.error);
            }
        })
        .catch(error => console.error("Error updating chat title:", error))
        .finally(() => {
            isProcessing = false;
        });
    }
});
