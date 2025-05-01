import { signIn, register, auth } from '../firebase.js'; // Import Firebase Authentication functions
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const db = getFirestore();

new Vue({
    el: '#app',
    data() {
        return {
            email: '',
            password: '',
            fullname: '',
            username: '',
            confirmPassword: '',
            remember: false,
            loading: false,
            isLoading: false,  // For the full-screen loading overlay
            loadingMessage: '', // Custom message for the loading overlay
            errorMessage: '',
            successMessage: '',
            isLoginForm: true, // Toggle between login and registration forms
            isAdmin: true, // Set default to true since this is admin registration
            retryCount: 0,
            maxRetries: 3,
            showModal: false,
            modalMessage: '',
            isError: false
        };
    },
    methods: {
        // Toggle between login and registration forms
        toggleForm() {
            this.isLoginForm = !this.isLoginForm;
            this.resetForm();
        },

        // Reset form and messages
        resetForm() {
            this.email = '';
            this.password = '';
            this.fullname = '';
            this.username = '';
            this.confirmPassword = '';
            this.errorMessage = '';
            this.successMessage = '';
            this.loading = false;
            this.isLoading = false;
            this.loadingMessage = '';
        },

        validateEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },

        validateUsername(username) {
            const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
            return usernameRegex.test(username);
        },

        validatePassword(password) {
            // At least 6 characters, 1 uppercase, 1 lowercase, 1 number
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
            return passwordRegex.test(password);
        },

        // Handle login
        async handleLogin() {
            if (this.loading) return;
            
            this.loading = true;
            this.isLoading = true; // Show the loading overlay
            this.loadingMessage = 'Logging in...';
            this.errorMessage = '';
            this.successMessage = '';

            try {
                // First try to find user by username
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where('username', '==', this.email.toLowerCase()));
                const querySnapshot = await getDocs(q);
                
                let userEmail = this.email;
                if (!this.validateEmail(this.email) && querySnapshot.size > 0) {
                    userEmail = querySnapshot.docs[0].data().email;
                }

                const userCredential = await signIn(this.email, this.password);
                
                // Check if user is admin
                const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
                const userData = userDoc.data();
                
                if (!userData || !userData.isAdmin) {
                    await auth.signOut();
                    throw new Error('Unauthorized access. Admin privileges required.');
                }

                if (this.remember) {
                    localStorage.setItem('userEmail', this.email);
                    const token = await userCredential.user.getIdToken();
                    localStorage.setItem('authToken', token);
                } else {
                    localStorage.removeItem('userEmail');
                }

                this.loadingMessage = 'Login successful! Redirecting...';
                setTimeout(() => {
                    window.location.href = '../Dashboard/Dashboard.html';
                }, 1500);
            } catch (error) {
                this.isLoading = false; // Hide the loading overlay
                this.handleAuthError(error);
                
                // Implement retry logic for connection issues
                if (error.code === 'auth/network-request-failed' && this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    setTimeout(() => {
                        this.handleLogin();
                    }, 1000 * this.retryCount); // Exponential backoff
                    return;
                }
            } finally {
                this.loading = false;
            }
        },

        // Handle registration
        async handleRegister() {
            this.errorMessage = '';
            this.successMessage = '';

            // Individual field validation with specific messages
            if (!this.fullname) {
                this.errorMessage = 'Please enter your full name';
                return;
            }

            if (!this.username) {
                this.errorMessage = 'Please enter a username';
                return;
            }

            if (!this.email) {
                this.errorMessage = 'Please enter your email address';
                return;
            }

            if (!this.password) {
                this.errorMessage = 'Please enter a password';
                return;
            }

            if (!this.confirmPassword) {
                this.errorMessage = 'Please confirm your password';
                return;
            }

            // Validate fullname
            if (this.fullname.length < 2) {
                this.errorMessage = 'Full name must be at least 2 characters long';
                return;
            }

            // Validate username
            if (!this.validateUsername(this.username)) {
                this.errorMessage = 'Username must be 3-20 characters long and can only contain letters, numbers, and underscores';
                return;
            }

            // Validate email
            if (!this.validateEmail(this.email)) {
                this.errorMessage = 'Please enter a valid email address';
                return;
            }

            // Validate password
            if (!this.validatePassword(this.password)) {
                this.errorMessage = 'Password must be at least 6 characters long and contain at least one uppercase letter, one lowercase letter, and one number';
                return;
            }

            // Validate password confirmation
            if (this.password !== this.confirmPassword) {
                this.showMessage('Passwords do not match!', true);
                return;
            }

            this.loading = true;
            this.isLoading = true; // Show the loading overlay
            this.loadingMessage = 'Creating your admin account...';

            try {
                // Normalize username to lowercase before checking
                const normalizedUsername = this.username.toLowerCase();
                const isUsernameAvailable = await this.checkUsernameAvailability(normalizedUsername);
                
                if (!isUsernameAvailable) {
                    this.loading = false;
                    this.isLoading = false; // Hide the loading overlay
                    this.errorMessage = 'This username is already taken';
                    return;
                }

                // Use normalized username in registration
                const result = await register(this.email, this.password, normalizedUsername, this.fullname);
                
                if (result && result.user) {
                    // Create user document
                    await setDoc(doc(db, 'users', result.user.uid), {
                        email: this.email,
                        username: normalizedUsername,
                        fullname: this.fullname,
                        role: 'admin',
                        isAdmin: true,
                        createdAt: new Date()
                    });

                    this.loadingMessage = 'Account created successfully!';
                    setTimeout(() => {
                        this.isLoading = false; // Hide the loading overlay
                        this.showMessage('Admin account created successfully! Please log in.', false);
                        setTimeout(() => {
                            this.isLoginForm = true;
                            this.resetForm();
                        }, 1500);
                    }, 1000);
                }
            } catch (error) {
                console.error('Registration error:', error);
                this.isLoading = false; // Hide the loading overlay
                this.showMessage('Error creating account: ' + error.message, true);
            } finally {
                this.loading = false;
            }
        },

        // Handle forgot password
        async handleForgotPassword() {
            if (!this.email) {
                this.errorMessage = 'Please enter your email address';
                return;
            }

            this.loading = true;
            this.errorMessage = '';
            this.successMessage = '';

            try {
                await sendPasswordResetEmail(auth, this.email);
                this.successMessage = 'Password reset email sent. Please check your inbox.';
            } catch (error) {
                console.error('Password reset error:', error);
                this.handleAuthError(error);
            } finally {
                this.loading = false;
            }
        },

        // Handle authentication errors
        handleAuthError(error) {
            console.error('Authentication error:', error);
            
            switch (error.code) {
                case 'auth/insufficient-permissions':
                    this.errorMessage = 'Access denied. This portal is for administrators only.';
                    break;
                case 'permission-denied':
                    this.errorMessage = 'You do not have permission to perform this action.';
                    break;
                case 'resource-exhausted':
                    this.errorMessage = 'Too many requests. Please try again later.';
                    break;
                case 'This email is already registered':
                    this.errorMessage = 'This email address is already registered. Please use a different email or try logging in.';
                    break;
                case 'This username is already taken':
                    this.errorMessage = 'This username is already taken. Please choose a different username.';
                    break;
                case 'auth/invalid-email':
                    this.errorMessage = 'Please enter a valid email address.';
                    break;
                case 'auth/weak-password':
                    this.errorMessage = 'Password must be at least 6 characters long with at least one uppercase letter, one lowercase letter, and one number.';
                    break;
                case 'auth/network-request-failed':
                    this.errorMessage = 'Network error. Please check your internet connection and try again.';
                    break;
                case 'Server error. Please try again later.':
                    this.errorMessage = 'Server error. Please try again later.';
                    break;
                case 'access-denied':
                    this.errorMessage = 'Access denied. This portal is for administrators only.';
                    break;
                default:
                    if (error.message?.includes('Missing or insufficient permissions')) {
                        this.errorMessage = 'Access denied. Please verify your admin credentials.';
                    } else {
                        this.errorMessage = 'An error occurred. Please try again.';
                    }
                    console.error('Detailed error:', error);
            }
        },

        async checkUsernameAvailability(username) {
            try {
                const usersRef = collection(db, 'users');
                const normalizedUsername = username.toLowerCase().trim();
                
                // Use a simple query
                const q = query(usersRef, where("username", "==", normalizedUsername));
                const querySnapshot = await getDocs(q);
                
                // Debug logs
                console.log('Username check for:', normalizedUsername);
                console.log('Query snapshot empty:', querySnapshot.empty);
                
                return querySnapshot.empty;
            } catch (error) {
                console.error('Error in checkUsernameAvailability:', error);
                // On error, assume username is available to allow registration attempt
                return true;
            }
        },

        showMessage(message, isError = false) {
            this.modalMessage = message;
            this.isError = isError;
            this.showModal = true;
            
            // Auto close success messages after 3 seconds
            if (!isError) {
                setTimeout(() => {
                    this.closeModal();
                }, 3000);
            }
        },
        closeModal() {
            this.showModal = false;
            this.modalMessage = '';
        }
    },
    created() {
        // Check for remembered email
        const savedEmail = localStorage.getItem('userEmail');
        if (savedEmail) {
            this.email = savedEmail;
            this.remember = true;
        }
    }
});
