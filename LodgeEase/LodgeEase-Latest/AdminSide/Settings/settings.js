import { auth, db } from '../firebase.js';
import { doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Configure Vue for production
Vue.config.productionTip = false;

new Vue({
    el: '#app',
    data: {
        hotelInfo: {
            name: 'Lodge Ease Hotel',
            address: '123 Main Street, City, Country',
            phone: '+1 234 567 8900',
            email: 'contact@lodgeease.com',
            website: 'www.lodgeease.com'
        },
        systemSettings: {
            checkInTime: '14:00',
            checkOutTime: '11:00',
            currency: 'USD',
            dateFormat: 'MM/DD/YYYY',
            language: 'English',
            preferLongTerm: false,
            enableNotifications: true,
            autoAssignRooms: false
        },
        notifications: {
            emailAlerts: true,
            smsAlerts: false,
            bookingConfirmations: true,
            paymentAlerts: true,
            lowInventoryAlerts: false,
            systemUpdates: true
        },
        security: {
            passwordExpiry: 90,
            twoFactorAuth: false,
            loginAlerts: true,
            sessionTimeout: 30,
            ipRestriction: false
        },
        userProfile: {
            fullname: '',
            email: '',
            username: '',
            role: '',
            photoURL: null,
            phoneNumber: '',
            lastLogin: null
        },
        passwords: {
            current: '',
            new: '',
            confirm: ''
        },
        showPassword: {
            current: false,
            new: false,
            confirm: false
        },
        loading: false,
        showSuccessMessage: false,
        settingsModified: false,
        isAuthenticated: false,
        activeTab: 'system', // Default active tab
        fileInput: null,
        passwordError: '',
        saveSuccess: false,
        saveError: '',
        successMessage: '',
        errorMessage: '',
        sessionTimeoutTimer: null,
        lastActivityTimestamp: Date.now(),
        pending2FACode: null,
        is2FAVerified: false,
        show2FAModal: false,
        input2FACode: ''
    },

    computed: {
        isPasswordValid() {
            return this.passwords.current && 
                   this.passwords.new && 
                   this.passwords.confirm && 
                   this.passwords.new === this.passwords.confirm &&
                   this.passwords.new.length >= 8;
        },
        passwordStrength() {
            const password = this.passwords.new;
            if (!password) return '';
            if (password.length < 8) return 'weak';
            if (/[A-Z]/.test(password) && 
                /[a-z]/.test(password) && 
                /[0-9]/.test(password) && 
                /[^A-Za-z0-9]/.test(password)) {
                return 'strong';
            }
            return 'medium';
        },
        passwordStrengthText() {
            switch (this.passwordStrength) {
                case 'strong': return 'Strong';
                case 'medium': return 'Medium';
                case 'weak': return 'Weak';
                default: return '';
            }
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
        notifications: {
            handler(newVal, oldVal) {
                this.settingsModified = true;
                // Check which notification was toggled and send a test email
                if (oldVal) {
                    if (newVal.emailAlerts !== oldVal.emailAlerts) {
                        this.sendNotificationEmail('emailAlerts');
                    }
                    if (newVal.bookingConfirmations !== oldVal.bookingConfirmations) {
                        this.sendNotificationEmail('bookingConfirmations');
                    }
                    if (newVal.paymentAlerts !== oldVal.paymentAlerts) {
                        this.sendNotificationEmail('paymentAlerts');
                    }
                }
            },
            deep: true
        },
        security: {
            handler(newVal, oldVal) {
                this.settingsModified = true;
                // If 2FA is toggled, simulate setup or removal
                if (oldVal && newVal.twoFactorAuth !== oldVal.twoFactorAuth) {
                    if (newVal.twoFactorAuth) {
                        this.setupTwoFactorAuth();
                    } else {
                        this.disableTwoFactorAuth();
                    }
                }
                // If session timeout changed, reset timer
                if (oldVal && newVal.sessionTimeout !== oldVal.sessionTimeout) {
                    this.resetSessionTimeout();
                }
            },
            deep: true
        }
    },
    methods: {
        setActiveTab(tab) {
            this.activeTab = tab;
        },
        togglePasswordVisibility(field) {
            this.showPassword[field] = !this.showPassword[field];
        },
        async saveSettings() {
            console.log('Attempting to save settings...');
            this.loading = true; 
            console.log('Save Settings Started: loading=', this.loading);
            try {
                const user = auth.currentUser;

                if (!user) {
                    this.showErrorAlert('You must be logged in to save settings');
                    // Return early, finally will still execute
                    return; 
                }

                const settingsData = {
                    hotelInfo: this.hotelInfo,
                    systemSettings: this.systemSettings,
                    notifications: this.notifications,
                    security: this.security,
                    updatedAt: new Date(),
                    updatedBy: user.uid
                };

                const settingsRef = doc(db, 'settings', 'global');
                await setDoc(settingsRef, settingsData, { merge: true });
                console.log('Firestore save complete.');

                localStorage.setItem('lodgeEaseSettings', JSON.stringify(settingsData));
                console.log('LocalStorage save complete.');

                // Update sidebar visibility (keep this logic)
                const sidebarLinks = document.querySelectorAll('.sidebar a');
                sidebarLinks.forEach(link => {
                     if (this.systemSettings.preferLongTerm) {
                        if (link.textContent.includes('Room Management')) link.parentElement.style.display = 'none';
                        if (link.textContent.includes('Long-term Stays')) link.parentElement.style.display = 'block';
                    } else {
                        if (link.textContent.includes('Room Management')) link.parentElement.style.display = 'block';
                        if (link.textContent.includes('Long-term Stays')) link.parentElement.style.display = 'none';
                    }
                });
                console.log('Sidebar updated.');

                this.showSuccessAlert('Settings saved successfully');
                this.settingsModified = false; 
                console.log('Save successful, settingsModified=', this.settingsModified);

                await this.logSettingsChange('Updated system settings');

            } catch (error) {
                console.error('Error saving settings:', error);
                this.showErrorAlert('Error saving settings: ' + error.message);
                this.settingsModified = true; 
            } finally {
                // Directly reset loading state without $nextTick
                console.log('Entering finally block. Current loading state:', this.loading);
                this.loading = false;
                console.log('Exiting finally block. New loading state:', this.loading);
            }
        },
        
        async saveProfileSettings() {
            console.log('Attempting to save profile...');
            this.loading = true; 
            console.log('Save Profile Started: loading=', this.loading);
            try {
                const user = auth.currentUser;
                if (!user) {
                    this.showErrorAlert('You must be logged in to update profile');
                    return; 
                }

                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, {
                    fullname: this.userProfile.fullname,
                    username: this.userProfile.username,
                    phoneNumber: this.userProfile.phoneNumber,
                    updatedAt: new Date()
                });

                this.showSuccessAlert('Profile updated successfully');
                await this.logSettingsChange('Updated user profile');
            } catch (error) {
                console.error('Error updating profile:', error);
                this.showErrorAlert('Error updating profile: ' + error.message);
            } finally {
                 // Directly reset loading state without $nextTick
                 console.log('Entering profile finally block. Current loading state:', this.loading);
                 this.loading = false;
                 console.log('Exiting profile finally block. New loading state:', this.loading);
            }
        },
        
        async handleLogout() {
            try {
                await signOut(auth);
                window.location.href = '../Login/index.html';
            } catch (error) {
                console.error('Error signing out:', error);
                this.showErrorAlert('Error signing out: ' + error.message);
            }
        },

        showSuccessAlert(message = 'Operation completed successfully') {
            this.successMessage = message;
            this.showSuccessMessage = true;
            setTimeout(() => {
                this.showSuccessMessage = false;
                this.successMessage = '';
            }, 3000);
        },

        showErrorAlert(message = 'An error occurred. Please try again.') {
            this.errorMessage = message;
            setTimeout(() => {
                this.errorMessage = '';
            }, 5000);
        },



        async changePassword() {
            console.log('Attempting to change password...');
            this.loading = true; 
            console.log('Change Password Started: loading=', this.loading);
            this.passwordError = '';
            try {
                if (!this.isPasswordValid) {
                    this.passwordError = 'Please check your password inputs';
                    return; 
                }
                const user = auth.currentUser;
                if (!user) {
                    this.showErrorAlert('You must be logged in to change password');
                    return; 
                }

                const credential = EmailAuthProvider.credential(user.email, this.passwords.current);
                try {
                    await reauthenticateWithCredential(user, credential);
                } catch (error) {
                    this.passwordError = 'Current password is incorrect';
                    return; 
                }

                await updatePassword(user, this.passwords.new);

                this.passwords.current = '';
                this.passwords.new = '';
                this.passwords.confirm = '';
                this.showSuccessAlert('Password changed successfully');
                await this.logSettingsChange('Changed password');
            } catch (error) {
                console.error('Error changing password:', error);
                this.passwordError = error.message;
            } finally {
                 // Directly reset loading state without $nextTick
                 console.log('Entering password finally block. Current loading state:', this.loading);
                 this.loading = false;
                 console.log('Exiting password finally block. New loading state:', this.loading);
            }
        },

        async loadUserProfile() {
            try {
                const user = auth.currentUser;
                if (!user) {
                    console.log('No user signed in');
                    return;
                }

                // Create a proper reference using the string-based path
                const userDocRef = doc(db, 'users', user.uid);
                const userSnapshot = await getDoc(userDocRef);

                if (userSnapshot.exists()) {
                    const userData = userSnapshot.data();
                    this.userProfile = {
                        fullname: userData.fullname || userData.displayName || 'User',
                        email: userData.email || user.email,
                        username: userData.username || user.displayName || 'user',
                        role: userData.role || 'Admin',
                        photoURL: userData.photoURL || user.photoURL,
                        phoneNumber: userData.phoneNumber || '',
                        lastLogin: userData.lastLogin ? new Date(userData.lastLogin.seconds * 1000).toLocaleString() : 'Unknown'
                    };
                    
                    console.log('User profile loaded:', this.userProfile);
                } else {
                    console.log('No user data found');
                    this.userProfile = {
                        fullname: user.displayName || 'User',
                        email: user.email,
                        username: user.displayName || 'user',
                        role: 'Admin',
                        photoURL: user.photoURL,
                        phoneNumber: '',
                        lastLogin: 'Unknown'
                    };
                }
                
            } catch (error) {
                console.error('Error loading user profile:', error);
                this.showErrorAlert('Error loading profile: ' + error.message);
            }
        },

        async loadSettings() {
            try {
                // Try to load from Firestore first
                const settingsRef = doc(db, 'settings', 'global');
                const settingsSnapshot = await getDoc(settingsRef);

                let loadedSettings = null;

                if (settingsSnapshot.exists()) {
                    loadedSettings = settingsSnapshot.data();
                    console.log('Settings loaded from Firestore');
                } else {
                    // Fall back to localStorage if Firestore doc doesn't exist
                    const storedSettings = localStorage.getItem('lodgeEaseSettings');
                    if (storedSettings) {
                        loadedSettings = JSON.parse(storedSettings);
                        console.log('Settings loaded from localStorage');
                    } else {
                        console.log('No settings found in Firestore or localStorage. Using defaults.');
                        // If nothing is loaded, the defaults from data() will be used.
                    }
                }

                // Apply loaded settings over defaults if they exist
                if (loadedSettings) {
                    // Use Object.assign or spread syntax for safer merging if needed,
                    // but direct assignment is fine if structure is consistent.
                    this.hotelInfo = loadedSettings.hotelInfo || this.hotelInfo;
                    this.systemSettings = loadedSettings.systemSettings || this.systemSettings;
                    this.notifications = loadedSettings.notifications || this.notifications;
                    this.security = loadedSettings.security || this.security;

                    // Explicitly ensure preferLongTerm defaults to false if not present in loaded data
                    if (this.systemSettings.preferLongTerm === undefined) {
                        this.$set(this.systemSettings, 'preferLongTerm', false);
                    }
                } else {
                     // Ensure default is set even if no settings were loaded
                     if (this.systemSettings.preferLongTerm === undefined) {
                        this.$set(this.systemSettings, 'preferLongTerm', false);
                    }
                }


                // Reset modified flag after loading initial settings
                // Use $nextTick to ensure Vue updates DOM before resetting
                this.$nextTick(() => {
                    this.settingsModified = false;
                    console.log('Settings loaded/initialized, settingsModified reset to false.');
                });

                 // Update sidebar visibility after loading settings
                 const sidebarLinks = document.querySelectorAll('.sidebar a');
                 sidebarLinks.forEach(link => {
                     const linkText = link.textContent.trim();
                     const parentLi = link.parentElement;
                     if (this.systemSettings.preferLongTerm) {
                         if (linkText === 'Room Management') parentLi.style.display = 'none';
                         if (linkText === 'Long-term Stays') parentLi.style.display = 'block';
                     } else {
                         if (linkText === 'Room Management') parentLi.style.display = 'block';
                         if (linkText === 'Long-term Stays') parentLi.style.display = 'none';
                     }
                 });


            } catch (error) {
                console.error('Error loading settings:', error);
                this.showErrorAlert('Error loading settings: ' + error.message);
                 // Ensure default is set even if loading failed
                 if (this.systemSettings.preferLongTerm === undefined) {
                    this.$set(this.systemSettings, 'preferLongTerm', false);
                }
                 this.$nextTick(() => {
                    this.settingsModified = false; // Reset flag even on error
                 });
            }
        },
        
        async logSettingsChange(action) {
            try {
                const user = auth.currentUser;
                if (!user) return;
                
                // In a real app, you would log this to your activity log collection
                console.log('Settings change logged:', {
                    userId: user.uid,
                    action,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error('Error logging settings change:', error);
            }
        },

        async sendNotificationEmail(type) {
            // Simulate sending an email notification (replace with actual backend call in production)
            try {
                const user = auth.currentUser;
                if (!user) {
                    this.showErrorAlert('You must be logged in to send notifications');
                    return;
                }
                // Simulate sending email
                // In production, call a backend endpoint or Firebase Cloud Function here
                let message = '';
                switch (type) {
                    case 'emailAlerts':
                        message = 'Test: Email Alerts notification sent to ' + this.userProfile.email;
                        break;
                    case 'bookingConfirmations':
                        message = 'Test: Booking Confirmation notification sent to ' + this.userProfile.email;
                        break;
                    case 'paymentAlerts':
                        message = 'Test: Payment Alert notification sent to ' + this.userProfile.email;
                        break;
                    default:
                        message = 'Test: Notification sent to ' + this.userProfile.email;
                }
                this.showSuccessAlert(message);
                // Optionally, log this action
                await this.logSettingsChange(`Sent test notification for ${type}`);
            } catch (error) {
                this.showErrorAlert('Failed to send notification: ' + error.message);
            }
        },
        setupTwoFactorAuth() {
            // Simulate sending a 2FA code to the user's email
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            this.pending2FACode = code;
            this.showSuccessAlert('2FA enabled. Next login will require a code sent to your email.');
            // In real implementation, send code to user's email here
            // For demo, show code in alert (remove in production)
            setTimeout(() => {
                alert('2FA code for demo: ' + code);
            }, 500);
        },
        disableTwoFactorAuth() {
            this.pending2FACode = null;
            this.is2FAVerified = false;
            this.showSuccessAlert('Two-factor authentication disabled.');
        },
        async verify2FACode() {
            if (this.input2FACode === this.pending2FACode) {
                this.is2FAVerified = true;
                this.show2FAModal = false;
                this.input2FACode = '';
                this.showSuccessAlert('2FA verification successful.');
            } else {
                this.showErrorAlert('Invalid 2FA code.');
            }
        },
        // --- Session Timeout Logic ---
        resetSessionTimeout() {
            if (this.sessionTimeoutTimer) {
                clearTimeout(this.sessionTimeoutTimer);
            }
            if (!this.security.sessionTimeout || this.security.sessionTimeout < 5) return;
            const timeoutMs = this.security.sessionTimeout * 60 * 1000;
            this.sessionTimeoutTimer = setTimeout(() => {
                this.handleSessionTimeout();
            }, timeoutMs);
            this.lastActivityTimestamp = Date.now();
        },
        handleSessionTimeout() {
            this.showErrorAlert('Session timed out due to inactivity.');
            setTimeout(() => {
                this.handleLogout();
            }, 1500);
        },
        activityListener() {
            this.lastActivityTimestamp = Date.now();
            this.resetSessionTimeout();
        }
    },
    mounted() {
        // Setup authentication state observer
        onAuthStateChanged(auth, async (user) => {
            this.isAuthenticated = !!user;
            if (user) {
                await this.loadUserProfile();
                await this.loadSettings(); // Ensure settingsModified is reset here
            } else {
                // Not signed in, redirect to login
                window.location.href = '../Login/index.html';
            }
        });
        // Setup session timeout listeners
        window.addEventListener('mousemove', this.activityListener);
        window.addEventListener('keydown', this.activityListener);
        window.addEventListener('click', this.activityListener);
        this.$nextTick(() => {
            this.resetSessionTimeout();
        });
    },
    beforeDestroy() {
        window.removeEventListener('mousemove', this.activityListener);
        window.removeEventListener('keydown', this.activityListener);
        window.removeEventListener('click', this.activityListener);
        if (this.sessionTimeoutTimer) clearTimeout(this.sessionTimeoutTimer);
    }
});