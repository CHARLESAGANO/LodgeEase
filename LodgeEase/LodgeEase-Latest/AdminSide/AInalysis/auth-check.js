import { auth, db } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

console.log('Auth check module loaded');

// Check if user is authenticated
const checkAuth = () => {
    console.log('Running auth check function');
    
    return new Promise((resolve) => {
        // Check if we just came from login page
        const justLoggedIn = sessionStorage.getItem('justLoggedIn') === 'true';
        console.log('Just logged in flag:', justLoggedIn);
        
        if (justLoggedIn) {
            console.log('User just logged in, skipping auth redirect');
            // Remove the flag after checking it
            setTimeout(() => {
                sessionStorage.removeItem('justLoggedIn');
                console.log('Cleared just logged in flag');
            }, 1000);
            resolve(true);
            return;
        }
        
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe(); // Unsubscribe immediately after first check
            console.log('Auth state changed:', user ? 'user authenticated' : 'no user');
            
            if (!user) {
                // If not on login page, redirect to login
                if (!window.location.href.includes('Login/index.html')) {
                    console.log('No user found, redirecting to login');
                    window.location.href = '../Login/index.html';
                }
                resolve(false);
            } else {
                console.log('User authenticated:', user.email);
                resolve(user);
            }
        });
    });
};

// Log navigation if authenticated
const logNavigation = async (user) => {
    if (!user) return;
    
    try {
        const pageName = document.title || window.location.pathname;
        console.log('Logging navigation to:', pageName);
        
        const navigationRef = collection(db, 'pageNavigations');
        await addDoc(navigationRef, {
            userId: typeof user === 'object' ? user.uid : 'unknown',
            pageName: pageName,
            timestamp: serverTimestamp()
        });
        console.log('Navigation logged successfully');
    } catch (error) {
        console.error('Error logging navigation:', error);
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Auth check running on page load');
    
    try {
        // Always check auth, but if just logged in, don't redirect
        const user = await checkAuth();
        
        // Log navigation if authenticated
        if (user) {
            await logNavigation(user);
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
});

export { checkAuth };