// login.js
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    browserPopupRedirectResolver,
    sendEmailVerification,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore, 
    doc, 
    setDoc,
    collection,
    query,
    where,
    getDocs,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBAJr0JQgWRfGTmSXTK6P7Yn8fkHXG2YeE",
    authDomain: "lms-app-2b903.firebaseapp.com",
    projectId: "lms-app-2b903",
    storageBucket: "lms-app-2b903.appspot.com",
    messagingSenderId: "1046108373013",
    appId: "1:1046108373013:web:fc366db1d92b9c4b860e1c",
    measurementId: "G-WRMW9Z8867"
};

// Initialize Firebase with CORS settings
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Configure Google Provider with more options for better compatibility
googleProvider.setCustomParameters({
    prompt: 'select_account',
    login_hint: localStorage.getItem('userEmail') || '',
    ux_mode: 'popup'
});

document.addEventListener('DOMContentLoaded', () => {
    new Vue({
        el: '#app',
        data() {
            return {
                email: '',
                password: '',
                remember: false,
                loading: false,
                errorMessage: '',
                successMessage: '',
                acceptedTerms: false,
                showTerms: false,
                showSignUpModal: false,
                signupForm: {
                    fullname: '',
                    username: '',
                    email: '',
                    password: '',
                    confirmPassword: '',
                    acceptedTerms: false
                },
                googleSignInAttempted: false,
                redirectInProgress: false,
                attemptingRedirectSignIn: false,
                popupBlocked: false,
                emailVerificationSent: false,
                showVerificationModal: false,
                verificationEmail: '',
                verificationExpired: false,
                verificationResent: false,
                savedPasswordForVerification: '', // Add this to store password temporarily for verification resending
                loginType: 'client', // Added for the client/admin switch
                isSwitchingPage: false // Added for page transition loading screen
            };
        },
        mounted() {
            this.checkRedirectResult();
            this.showSignUpModal = false;
        },
        methods: {
            setLoginType(type) {
                if (type === 'admin') {
                    this.isSwitchingPage = true; // Show loading screen
                    // Delay navigation for 1 second
                    setTimeout(() => {
                        window.location.href = '../../AdminSide/Login/index.html';
                    }, 1000); // 1000 milliseconds = 1 second
                } else {
                    this.loginType = 'client';
                }
            },
            async handleLogin() {
                this.errorMessage = '';
                this.successMessage = '';
                
                if (!this.acceptedTerms) {
                    this.errorMessage = 'Please accept the Terms and Conditions';
                    return;
                }

                if (!this.email) {
                    this.errorMessage = 'Please enter your email or username';
                    return;
                }
                
                if (!this.password) {
                    this.errorMessage = 'Please enter your password';
                    return;
                }

                this.loading = true;

                try {
                    let loginEmail = this.email;

                    if (!this.email.includes('@')) {
                        const usersRef = collection(db, 'users');
                        const q = query(usersRef, where('username', '==', this.email.toLowerCase()));
                        const querySnapshot = await getDocs(q);
                        
                        if (querySnapshot.empty) {
                            throw new Error('No account found with this username');
                        }
                        
                        loginEmail = querySnapshot.docs[0].data().email;
                    }

                    this.savedPasswordForVerification = this.password;

                    const userCredential = await signInWithEmailAndPassword(auth, loginEmail, this.password);
                    
                    if (!userCredential.user.emailVerified) {
                        await signOut(auth);
                        this.errorMessage = 'Email not verified. Please check your inbox for verification email.';
                        this.verificationEmail = loginEmail;
                        this.showVerificationModal = true;
                        return;
                    }
                    
                    if (this.remember) {
                        localStorage.setItem('userEmail', loginEmail);
                    } else {
                        localStorage.removeItem('userEmail');
                    }

                    this.successMessage = 'Login successful! Redirecting...';
                    
                    setTimeout(() => {
                        window.location.href = '../Homepage/rooms.html';
                    }, 1500);

                } catch (error) {
                    console.error('Login error:', error);
                    if (error.message === 'No account found with this username') {
                        this.errorMessage = error.message;
                    } else {
                        this.handleAuthError(error);
                    }
                } finally {
                    this.loading = false;
                }
            },

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
                    this.handleAuthError(error);
                } finally {
                    this.loading = false;
                }
            },

            acceptTerms() {
                this.acceptedTerms = true;
                this.showTerms = false;
            },

            handleAuthError(error) {
                console.error('Authentication error:', error);
                
                switch (error.code) {
                    case 'auth/user-not-found':
                        this.errorMessage = 'No account found with this email/username';
                        break;
                    case 'auth/wrong-password':
                        this.errorMessage = 'Invalid password';
                        break;
                    case 'auth/invalid-email':
                        this.errorMessage = 'Please enter a valid email address';
                        break;
                    case 'auth/network-request-failed':
                        this.errorMessage = 'Network error. Please check your connection';
                        break;
                    case 'auth/invalid-credential':
                        this.errorMessage = 'Invalid login credentials. Please check your email and password.';
                        break;
                    case 'auth/too-many-requests':
                        this.errorMessage = 'Too many failed login attempts. Please try again later or reset your password.';
                        break;
                    default:
                        this.errorMessage = `Login failed: ${error.message || 'Unknown error'}. Please try again.`;
                }
            },

            async handleSignUp() {
                if (this.loading) return;
                
                this.loading = true;
                this.errorMessage = '';
                
                try {
                    if (this.signupForm.password !== this.signupForm.confirmPassword) {
                        throw new Error('Passwords do not match');
                    }

                    if (!this.signupForm.acceptedTerms) {
                        throw new Error('Please accept the terms and conditions');
                    }

                    const userCredential = await createUserWithEmailAndPassword(
                        auth,
                        this.signupForm.email,
                        this.signupForm.password
                    );

                    this.savedPasswordForVerification = this.signupForm.password;

                    await sendEmailVerification(userCredential.user);
                    this.emailVerificationSent = true;

                    await setDoc(doc(db, "users", userCredential.user.uid), {
                        fullname: this.signupForm.fullname,
                        username: this.signupForm.username.toLowerCase(),
                        email: this.signupForm.email,
                        role: 'user',
                        createdAt: new Date(),
                        status: 'pending_verification',
                        emailVerified: false
                    });
                    
                    await signOut(auth);
                    
                    this.verificationEmail = this.signupForm.email;
                    this.showVerificationModal = true;
                    this.successMessage = 'Account created! Please verify your email before logging in.';
                    this.showSignUpModal = false;
                    this.resetSignupForm();

                    this.email = this.signupForm.email;
                    
                } catch (error) {
                    console.error('Registration error:', error);
                    if (error.code === 'auth/email-already-in-use') {
                        this.errorMessage = 'This email is already registered';
                    } else if (error.code === 'auth/invalid-email') {
                        this.errorMessage = 'Please enter a valid email address';
                    } else if (error.code === 'auth/weak-password') {
                        this.errorMessage = 'Password should be at least 6 characters';
                    } else {
                        this.errorMessage = error.message || 'An error occurred during registration';
                    }
                } finally {
                    this.loading = false;
                }
            },

            resetSignupForm() {
                this.signupForm = {
                    fullname: '',
                    username: '',
                    email: '',
                    password: '',
                    confirmPassword: '',
                    acceptedTerms: false
                };
            },

            async checkRedirectResult() {
                try {
                    const result = await getRedirectResult(auth);
                    if (result) {
                        this.handleGoogleSignInSuccess(result.user);
                    }
                } catch (error) {
                    console.error('Redirect result error:', error);
                    if (this.attemptingRedirectSignIn) {
                        this.errorMessage = 'Failed to sign in with Google. Please try again.';
                        this.attemptingRedirectSignIn = false;
                    }
                }
            },

            async handleGoogleSignIn() {
                if (this.loading) return;
                
                this.loading = true;
                this.errorMessage = '';
                this.googleSignInAttempted = true;
                this.popupBlocked = false;
                
                try {
                    const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
                    
                    if (!result.user.emailVerified) {
                        await sendEmailVerification(result.user);
                        await signOut(auth);
                        
                        this.verificationEmail = result.user.email;
                        this.showVerificationModal = true;
                        this.errorMessage = 'Please verify your email before logging in.';
                        return;
                    }
                    
                    await this.handleGoogleSignInSuccess(result.user);
                } catch (error) {
                    console.error('Google Sign In Error:', error);
                    
                    if (error.code === 'auth/popup-closed-by-user') {
                        this.errorMessage = 'Sign in was cancelled. Try again or use email login.';
                    } else if (error.code === 'auth/popup-blocked') {
                        this.popupBlocked = true;
                        this.errorMessage = 'Pop-up was blocked. Click "Continue with Redirect" below.';
                    } else if (error.code === 'auth/network-request-failed') {
                        this.errorMessage = 'Network error. Please check your connection and try again.';
                    } else {
                        this.errorMessage = 'An error occurred during Google sign in. Please try again or use email login.';
                    }
                } finally {
                    this.loading = false;
                }
            },

            async handleGoogleSignInWithRedirect() {
                this.errorMessage = '';
                this.loading = true;
                this.attemptingRedirectSignIn = true;
                
                try {
                    await signInWithRedirect(auth, googleProvider);
                    this.redirectInProgress = true;
                } catch (error) {
                    console.error('Google Redirect Error:', error);
                    this.errorMessage = 'Failed to start Google sign in. Please try again later or use email login.';
                    this.attemptingRedirectSignIn = false;
                    this.loading = false;
                }
            },
            
            async handleGoogleSignInSuccess(user) {
                try {
                    const userDocRef = doc(db, "users", user.uid);
                    const userDoc = await getDoc(userDocRef);
                    
                    if (!userDoc.exists()) {
                        const username = user.email
                            .split('@')[0]
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, '');

                        await setDoc(userDocRef, {
                            fullname: user.displayName || '',
                            email: user.email,
                            username: username,
                            role: 'user',
                            createdAt: new Date(),
                            status: 'active',
                            photoURL: user.photoURL || null,
                            lastLogin: new Date(),
                            emailVerified: true
                        });
                    } else {
                        await setDoc(userDocRef, {
                            lastLogin: new Date(),
                            emailVerified: true
                        }, { merge: true });
                    }

                    this.successMessage = 'Login successful! Redirecting...';
                    
                    localStorage.setItem('userEmail', user.email);
                    
                    setTimeout(() => {
                        window.location.href = '../Homepage/rooms.html';
                    }, 1500);
                } catch (error) {
                    console.error('Error processing user after Google sign-in:', error);
                    this.errorMessage = 'Error setting up your account. Please try again.';
                    throw error;
                }
            },
            
            async resendVerificationEmail() {
                if (!this.verificationEmail) {
                    this.errorMessage = 'Email address is required to resend verification';
                    return;
                }
                
                this.loading = true;
                this.verificationResent = false;
                this.errorMessage = '';
                
                try {
                    if (!this.savedPasswordForVerification) {
                        this.errorMessage = 'For security reasons, please log in again to resend the verification email';
                        return;
                    }
                    
                    const tempCredential = await signInWithEmailAndPassword(
                        auth, 
                        this.verificationEmail, 
                        this.savedPasswordForVerification
                    );
                    
                    await sendEmailVerification(tempCredential.user);
                    
                    await signOut(auth);
                    
                    this.successMessage = 'Verification email resent. Please check your inbox.';
                    this.verificationResent = true;
                } catch (error) {
                    console.error('Error resending verification:', error);
                    
                    if (error.code === 'auth/invalid-credential') {
                        this.errorMessage = 'Unable to resend verification email. Please try logging in again.';
                    } else if (error.code === 'auth/too-many-requests') {
                        this.errorMessage = 'Too many attempts. Please try again later.';
                    } else {
                        this.errorMessage = 'Failed to resend verification email. Please try again or contact support.';
                    }
                } finally {
                    this.loading = false;
                }
            },
            
            closeVerificationModal() {
                this.showVerificationModal = false;
                this.savedPasswordForVerification = '';
            },
            
            async checkEmailVerified() {
                this.loading = true;
                this.errorMessage = '';
                
                try {
                    if (!this.savedPasswordForVerification) {
                        this.errorMessage = 'Please log in again to verify your account status';
                        this.loading = false;
                        return false;
                    }
                    
                    const userCredential = await signInWithEmailAndPassword(
                        auth, 
                        this.verificationEmail, 
                        this.savedPasswordForVerification
                    );
                    
                    const currentUser = userCredential.user;
                    
                    await currentUser.reload();
                    
                    if (currentUser.emailVerified) {
                        await setDoc(doc(db, "users", currentUser.uid), {
                            emailVerified: true,
                            status: 'active'
                        }, { merge: true });
                        
                        this.successMessage = 'Email verified successfully! You can now log in.';
                        
                        if (this.remember) {
                            localStorage.setItem('userEmail', this.verificationEmail);
                        }
                        
                        setTimeout(() => {
                            this.showVerificationModal = false;
                            window.location.href = '../Homepage/rooms.html';
                        }, 1500);
                        
                        return true;
                    } else {
                        await signOut(auth);
                        this.errorMessage = 'Your email is not verified yet. Please check your inbox for the verification link.';
                        return false;
                    }
                } catch (error) {
                    console.error('Error checking verification status:', error);
                    
                    if (error.code === 'auth/invalid-credential') {
                        this.errorMessage = 'Unable to verify status. Please try logging in again.';
                    } else {
                        this.errorMessage = 'Error checking verification status. Please try again.';
                    }
                    
                    return false;
                } finally {
                    this.loading = false;
                }
            }
        },
        created() {
            const savedEmail = localStorage.getItem('userEmail');
            if (savedEmail) {
                this.email = savedEmail;
                this.remember = true;
            }
        }
    });
});

function handleLogin(event) {
  event.preventDefault();
  
  if (loginSuccessful) {
    localStorage.setItem('isLoggedIn', 'true');
    window.location.href = '../Homepage/rooms.html';
  }
}

function handleLogout() {
  localStorage.removeItem('isLoggedIn');
  window.location.href = '../Homepage/rooms.html';
}