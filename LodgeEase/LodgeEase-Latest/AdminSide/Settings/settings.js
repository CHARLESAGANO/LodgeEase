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
        savingSection: '',
        activeSessions: [],
        showSuccessMessage: false,
        settingsModified: false,
        isAuthenticated: false,
        activeTab: 'system', // Default active tab
        fileInput: null,
        passwordError: '',
        saveSuccess: false,
        saveError: '',
        successMessage: '',
        errorMessage: ''
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
    methods: {
        setActiveTab(tab) {
            this.activeTab = tab;
        },
        togglePasswordVisibility(field) {
            this.showPassword[field] = !this.showPassword[field];
        },
        async saveSettings() {
            try {
                this.loading = true;
                this.savingSection = 'all';
                const user = auth.currentUser;
                
                if (!user) {
                    this.showErrorAlert('You must be logged in to save settings');
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

                // Save to Firestore
                const settingsRef = doc(db, 'settings', 'global');
                await setDoc(settingsRef, settingsData, { merge: true });

                // Also save to localStorage for faster access
                localStorage.setItem('lodgeEaseSettings', JSON.stringify(settingsData));

                // Update sidebar visibility based on preferLongTerm setting
                const sidebarLinks = document.querySelectorAll('.sidebar a');
                sidebarLinks.forEach(link => {
                    if (this.systemSettings.preferLongTerm) {
                        if (link.textContent.includes('Room Management')) {
                            link.parentElement.style.display = 'none';
                        }
                        if (link.textContent.includes('Long-term Stays')) {
                            link.parentElement.style.display = 'block';
                        }
                    } else {
                        if (link.textContent.includes('Room Management')) {
                            link.parentElement.style.display = 'block';
                        }
                        if (link.textContent.includes('Long-term Stays')) {
                            link.parentElement.style.display = 'none';
                        }
                    }
                });

                this.showSuccessAlert('Settings saved successfully');
                this.settingsModified = false;
                
                // Log activity
                await this.logSettingsChange('Updated system settings');
            } catch (error) {
                console.error('Error saving settings:', error);
                this.showErrorAlert('Error saving settings: ' + error.message);
            } finally {
                this.loading = false;
                this.savingSection = '';
            }
        },
        
        async saveProfileSettings() {
            try {
                this.loading = true;
                this.savingSection = 'profile';
                const user = auth.currentUser;
                
                if (!user) {
                    this.showErrorAlert('You must be logged in to update profile');
                    return;
                }
                
                // Update user document in Firestore
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, {
                    fullname: this.userProfile.fullname,
                    username: this.userProfile.username,
                    phoneNumber: this.userProfile.phoneNumber,
                    updatedAt: new Date()
                });
                
                this.showSuccessAlert('Profile updated successfully');
                
                // Log activity
                await this.logSettingsChange('Updated user profile');
            } catch (error) {
                console.error('Error updating profile:', error);
                this.showErrorAlert('Error updating profile: ' + error.message);
            } finally {
                this.loading = false;
                this.savingSection = '';
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

        async updateProfilePhoto() {
            // Create file input and trigger click
            this.fileInput = document.createElement('input');
            this.fileInput.type = 'file';
            this.fileInput.accept = 'image/*';
            this.fileInput.addEventListener('change', this.handleFileSelect);
            this.fileInput.click();
        },
        
        async handleFileSelect(event) {
            try {
                this.loading = true;
                this.savingSection = 'photo';
                const file = event.target.files[0];
                if (!file) return;
                
                const user = auth.currentUser;
                if (!user) {
                    this.showErrorAlert('You must be logged in to update profile photo');
                    return;
                }
                
                // Upload to Firebase Storage
                const storage = getStorage();
                const storageRef = ref(storage, `users/${user.uid}/profile_photo`);
                await uploadBytes(storageRef, file);
                
                // Get download URL
                const downloadURL = await getDownloadURL(storageRef);
                
                // Update user document in Firestore
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, {
                    photoURL: downloadURL,
                    updatedAt: new Date()
                });
                
                // Update local state
                this.userProfile.photoURL = downloadURL;
                
                this.showSuccessAlert('Profile photo updated successfully');
                
                // Log activity
                await this.logSettingsChange('Updated profile photo');
            } catch (error) {
                console.error('Error updating profile photo:', error);
                this.showErrorAlert('Error updating profile photo: ' + error.message);
            } finally {
                this.loading = false;
                this.savingSection = '';
            }
        },

        async changePassword() {
            try {
                this.loading = true;
                this.savingSection = 'password';
                this.passwordError = '';
                
                if (!this.isPasswordValid) {
                    this.passwordError = 'Please check your password inputs';
                    return;
                }
                
                const user = auth.currentUser;
                if (!user) {
                    this.showErrorAlert('You must be logged in to change password');
                    return;
                }
                
                // Reauthenticate user
                const credential = EmailAuthProvider.credential(
                    user.email, 
                    this.passwords.current
                );
                
                try {
                    await reauthenticateWithCredential(user, credential);
                } catch (error) {
                    this.passwordError = 'Current password is incorrect';
                    return;
                }
                
                // Change password
                await updatePassword(user, this.passwords.new);
                
                // Reset form
                this.passwords.current = '';
                this.passwords.new = '';
                this.passwords.confirm = '';
                
                this.showSuccessAlert('Password changed successfully');
                
                // Log activity
                await this.logSettingsChange('Changed password');
            } catch (error) {
                console.error('Error changing password:', error);
                this.passwordError = error.message;
            } finally {
                this.loading = false;
                this.savingSection = '';
            }
        },

        terminateSession(sessionId) {
            // Confirm before terminating
            if (!confirm('Are you sure you want to terminate this session?')) {
                return;
            }
            
            // Filter out the terminated session
            this.activeSessions = this.activeSessions.filter(session => session.id !== sessionId);
            this.showSuccessAlert('Session terminated successfully');
            
            // In a real app, you would call an API to invalidate the session token
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
                
                // Load mock active sessions
                this.loadMockSessions();
            } catch (error) {
                console.error('Error loading user profile:', error);
                this.showErrorAlert('Error loading profile: ' + error.message);
            }
        },

        loadMockSessions() {
            this.activeSessions = [
                {
                    id: 'current-session',
                    deviceName: 'Current Browser',
                    deviceIcon: 'fas fa-laptop',
                    location: 'Current Location',
                    lastActive: 'Now',
                    isCurrent: true
                },
                {
                    id: 'session-1',
                    deviceName: 'Mobile Device',
                    deviceIcon: 'fas fa-mobile-alt',
                    location: 'Manila, Philippines',
                    lastActive: '3 hours ago',
                    isCurrent: false
                },
                {
                    id: 'session-2',
                    deviceName: 'Tablet',
                    deviceIcon: 'fas fa-tablet-alt',
                    location: 'Cebu, Philippines',
                    lastActive: '1 day ago',
                    isCurrent: false
                }
            ];
        },

        async loadSettings() {
            try {
                // Try to load from Firestore first
                const settingsRef = doc(db, 'settings', 'global');
                const settingsSnapshot = await getDoc(settingsRef);
                
                if (settingsSnapshot.exists()) {
                    const data = settingsSnapshot.data();
                    this.hotelInfo = data.hotelInfo || this.hotelInfo;
                    this.systemSettings = data.systemSettings || this.systemSettings;
                    this.notifications = data.notifications || this.notifications;
                    this.security = data.security || this.security;
                    console.log('Settings loaded from Firestore');
                } else {
                    // Fall back to localStorage
                    const storedSettings = localStorage.getItem('lodgeEaseSettings');
                    if (storedSettings) {
                        const parsedSettings = JSON.parse(storedSettings);
                        this.hotelInfo = parsedSettings.hotelInfo || this.hotelInfo;
                        this.systemSettings = parsedSettings.systemSettings || this.systemSettings;
                        this.notifications = parsedSettings.notifications || this.notifications;
                        this.security = parsedSettings.security || this.security;
                        console.log('Settings loaded from localStorage');
                    }
                }
            } catch (error) {
                console.error('Error loading settings:', error);
                this.showErrorAlert('Error loading settings: ' + error.message);
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
        }
    },
    mounted() {
        // Setup authentication state observer
        onAuthStateChanged(auth, async (user) => {
            this.isAuthenticated = !!user;
            if (user) {
                await this.loadUserProfile();
                await this.loadSettings();
            } else {
                // Not signed in, redirect to login
                window.location.href = '../Login/index.html';
            }
        });
    }
});