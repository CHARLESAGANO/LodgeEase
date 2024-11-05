// Initialize Vue instance
new Vue({
    el: '#app',
    data: {
        // Hotel Information
        hotelInfo: {
            name: 'Lodge Ease Hotel',
            address: '123 Main Street, City, Country',
            phone: '+1 234 567 8900',
            email: 'contact@lodgeease.com'
        },
        
        // System Settings
        systemSettings: {
            checkInTime: '14:00',
            checkOutTime: '11:00',
            currency: 'USD',
            dateFormat: 'MM/DD/YYYY',
            language: 'English'
        },

        // Notification Settings
        notifications: {
            emailAlerts: true,
            smsAlerts: false,
            bookingConfirmations: true,
            paymentAlerts: true,
        },

        // Security Settings
        security: {
            passwordExpiry: 90,
            twoFactorAuth: false,
            loginAlerts: true
        },

        // Flag to show success message
        showSuccessMessage: false,

        // Flag to track if settings have been modified
        settingsModified: false
    },

    // Watch for changes in settings
    watch: {
        hotelInfo: {
            handler() {
                this.settingsModified = true;
            },
            deep: true
        },
        systemSettings: {
            handler() {
                this.settingsModified = true;
            },
            deep: true
        },
        notifications: {
            handler() {
                this.settingsModified = true;
            },
            deep: true
        },
        security: {
            handler() {
                this.settingsModified = true;
            },
            deep: true
        }
    },

    // Methods for handling settings actions
    methods: {
        // Load settings from localStorage or API
        loadSettings() {
            // Try to load saved settings from localStorage
            const savedSettings = localStorage.getItem('lodgeEaseSettings');
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                this.hotelInfo = { ...this.hotelInfo, ...settings.hotelInfo };
                this.systemSettings = { ...this.systemSettings, ...settings.systemSettings };
                this.notifications = { ...this.notifications, ...settings.notifications };
                this.security = { ...this.security, ...settings.security };
            }

            // In a real application, you might want to load from an API instead:
            // this.loadSettingsFromAPI();
        },

        // Save settings
        async saveSettings() {
            try {
                // Create settings object
                const settings = {
                    hotelInfo: this.hotelInfo,
                    systemSettings: this.systemSettings,
                    notifications: this.notifications,
                    security: this.security
                };

                // Save to localStorage
                localStorage.setItem('lodgeEaseSettings', JSON.stringify(settings));

                // In a real application, you would save to an API:
                // await this.saveSettingsToAPI(settings);

                // Show success message
                this.showSuccessAlert();
                
                // Reset modified flag
                this.settingsModified = false;

            } catch (error) {
                console.error('Error saving settings:', error);
                this.showErrorAlert();
            }
        },

        // Show success alert
        showSuccessAlert() {
            // Create alert element
            const alert = document.createElement('div');
            alert.className = 'analysis-feedback';
            alert.innerHTML = `
                <h4>Success!</h4>
                <p>Your settings have been saved successfully.</p>
            `;

            // Add to document
            document.querySelector('.main-content').appendChild(alert);

            // Remove after 3 seconds
            setTimeout(() => {
                alert.remove();
            }, 3000);
        },

        // Show error alert
        showErrorAlert() {
            // Create alert element
            const alert = document.createElement('div');
            alert.className = 'analysis-feedback';
            alert.style.borderLeft = '5px solid #f94449';
            alert.innerHTML = `
                <h4>Error</h4>
                <p>There was an error saving your settings. Please try again.</p>
            `;

            // Add to document
            document.querySelector('.main-content').appendChild(alert);

            // Remove after 3 seconds
            setTimeout(() => {
                alert.remove();
            }, 3000);
        },

        // Load settings from API (mock function)
        async loadSettingsFromAPI() {
            try {
                // In a real application, this would be an API call
                const response = await fetch('/api/settings');
                const settings = await response.json();
                
                // Update settings
                this.hotelInfo = settings.hotelInfo;
                this.systemSettings = settings.systemSettings;
                this.notifications = settings.notifications;
                this.security = settings.security;
            } catch (error) {
                console.error('Error loading settings:', error);
                this.showErrorAlert();
            }
        },

        // Save settings to API (mock function)
        async saveSettingsToAPI(settings) {
            // In a real application, this would be an API call
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            if (!response.ok) {
                throw new Error('Failed to save settings');
            }

            return await response.json();
        }
    },

    // Load settings when component is mounted
    mounted() {
        this.loadSettings();

        // Add warning before leaving page with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.settingsModified) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }
});