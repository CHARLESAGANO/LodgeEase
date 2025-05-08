// messagePopup.js - Utility for displaying popup messages
class MessagePopup {
  constructor() {
    this.popupContainer = null;
    // Don't initialize immediately, wait for DOM or initialize on demand
    this.initialized = false;
  }

  initializePopup() {
    // Only initialize if not already initialized
    if (this.initialized) return;
    
    // Check if document.body exists before trying to append
    if (!document.body) {
      console.warn('MessagePopup: document.body not available yet, will initialize on first usage');
      return;
    }
    
    // Create the popup container if it doesn't exist
    if (!this.popupContainer) {
      this.popupContainer = document.createElement('div');
      this.popupContainer.id = 'message-popup-container';
      this.popupContainer.style.position = 'fixed';
      this.popupContainer.style.top = '20px';
      this.popupContainer.style.right = '20px';
      this.popupContainer.style.zIndex = '9999';
      document.body.appendChild(this.popupContainer);
      this.initialized = true;
    }
  }

  show(message, type = 'info', duration = 3000) {
    // Initialize on first usage if not already initialized
    if (!this.initialized) {
      this.initializePopup();
      
      // If still not initialized (no document.body), queue the message for later
      if (!this.initialized) {
        this.queueMessageForLater(message, type, duration);
        return null;
      }
    }
    
    // Create popup element
    const popup = document.createElement('div');
    popup.className = `message-popup message-${type}`;
    popup.style.padding = '12px 20px';
    popup.style.marginBottom = '10px';
    popup.style.borderRadius = '4px';
    popup.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    popup.style.animation = 'fadeIn 0.3s ease-out forwards';
    popup.style.maxWidth = '300px';
    popup.style.wordWrap = 'break-word';
    
    // Set background color based on type
    switch (type) {
      case 'success':
        popup.style.backgroundColor = '#10B981';
        popup.style.color = 'white';
        break;
      case 'error':
        popup.style.backgroundColor = '#EF4444';
        popup.style.color = 'white';
        break;
      case 'warning':
        popup.style.backgroundColor = '#F59E0B';
        popup.style.color = 'white';
        break;
      default:
        popup.style.backgroundColor = '#3B82F6';
        popup.style.color = 'white';
    }
    
    // Add message content
    popup.textContent = message;
    
    // Add to container
    this.popupContainer.appendChild(popup);
    
    // Add CSS animation if not already added
    if (!document.getElementById('message-popup-style')) {
      const style = document.createElement('style');
      style.id = 'message-popup-style';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-20px); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Auto-remove after duration
    setTimeout(() => {
      popup.style.animation = 'fadeOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (popup.parentNode === this.popupContainer) {
          this.popupContainer.removeChild(popup);
        }
      }, 300);
    }, duration);
    
    return popup;
  }

  // Queue messages when DOM isn't ready
  queueMessageForLater(message, type, duration) {
    // If we don't have a message queue yet, create one
    if (!this.messageQueue) {
      this.messageQueue = [];
      
      // Set up event listener to process queue when DOM is ready
      document.addEventListener('DOMContentLoaded', () => {
        this.initializePopup();
        this.processMessageQueue();
      });
      
      // Backup: If DOMContentLoaded already fired, try with a small delay
      setTimeout(() => {
        if (!this.initialized && document.body) {
          this.initializePopup();
          this.processMessageQueue();
        }
      }, 100);
    }
    
    // Add message to queue
    this.messageQueue.push({ message, type, duration });
  }
  
  // Process queued messages
  processMessageQueue() {
    if (!this.messageQueue || !this.initialized) return;
    
    // Process all queued messages
    for (const item of this.messageQueue) {
      this.show(item.message, item.type, item.duration);
    }
    
    // Clear the queue
    this.messageQueue = [];
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Wait for DOM to be ready before creating the instance
function createMessagePopup() {
  const messagePopup = new MessagePopup();
  
  // Initialize if document.body is available
  if (document.body) {
    messagePopup.initializePopup();
  } else {
    // Otherwise wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      messagePopup.initializePopup();
    });
  }
  
  // Make it available globally
  window.messagePopup = messagePopup;
  return messagePopup;
}

// Create global instance
const messagePopup = createMessagePopup(); 