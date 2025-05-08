// messagePopup.js - Utility for displaying popup messages
class MessagePopup {
  constructor() {
    this.popupContainer = null;
    this.initializePopup();
  }

  initializePopup() {
    // Create the popup container if it doesn't exist
    if (!this.popupContainer) {
      this.popupContainer = document.createElement('div');
      this.popupContainer.id = 'message-popup-container';
      this.popupContainer.style.position = 'fixed';
      this.popupContainer.style.top = '20px';
      this.popupContainer.style.right = '20px';
      this.popupContainer.style.zIndex = '9999';
      document.body.appendChild(this.popupContainer);
    }
  }

  show(message, type = 'info', duration = 3000) {
    this.initializePopup();
    
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
    
    // Add CSS animation
    const style = document.createElement('style');
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

// Create global instance
const messagePopup = new MessagePopup();

// Make it available globally
window.messagePopup = messagePopup; 