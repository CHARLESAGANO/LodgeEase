export default {
    data() {
        return {
            hotelInfo: {},
            systemSettings: {
                preferLongTerm: false
            },
            notifications: {},
            security: {},
            settingsModified: false
        };
    },
    methods: {
        saveSettings() {
            // Save settings to Firestore and localStorage
        }
    },
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
        // Automatically save when preferLongTerm is toggled
        'systemSettings.preferLongTerm': function(newVal, oldVal) {
            if (newVal !== oldVal) {
                this.saveSettings();
            }
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
    }
};