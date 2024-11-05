        // Initialize chat with welcome message
        document.addEventListener('DOMContentLoaded', () => {
            addMessage('Welcome to Lodge Ease AI Assistant! I can help you with:\n- Occupancy predictions\n- Revenue forecasts\n- Seasonal trends\n- Booking patterns\n\nWhat would you like to know?', 'bot');
        });

        function addMessage(content, type) {
            const chatContainer = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}`;
            
            messageDiv.innerHTML = `
                <div class="message-avatar ${type}">
                    <i class="fas fa-${type === 'bot' ? 'robot' : 'user'}"></i>
                </div>
                <div class="message-content">${content.replace(/\n/g, '<br>')}</div>
            `;
            
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function sendMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            
            if (message) {
                addMessage(message, 'user');
                input.value = '';
                
                // Simulate bot response (replace with actual API call in production)
                setTimeout(() => {
                    const responses = [
                        "Based on our data, I predict an 85% occupancy rate for the next month. Would you like more specific details?",
                        "Looking at historical trends, we expect a 20% increase in revenue compared to the same period last year.",
                        "The peak booking periods are typically during summer months (June-August) and holiday seasons.",
                        "I can help you analyze those trends. Which specific aspects would you like to explore?"
                    ];
                    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                    addMessage(randomResponse, 'bot');
                }, 1000);
            }
        }

        function submitSuggestion(suggestion) {
            document.getElementById('chatInput').value = suggestion;
            sendMessage();
        }

        function startNewChat() {
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.innerHTML = '';
            addMessage('Welcome to Lodge Ease AI Assistant! How can I help you today?', 'bot');
        }

        // Handle enter key in input
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });