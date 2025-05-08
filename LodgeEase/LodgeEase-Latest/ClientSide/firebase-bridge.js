// firebase-bridge.js - Provides Firebase functionality to ClientSide while avoiding circular dependencies

// Import Firebase modules directly from CDN
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    fetchSignInMethodsForEmail,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    Timestamp,
    orderBy,
    limit,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBAJr0JQgWRfGTmSXTK6P7Yn8fkHXG2YeE",
    authDomain: "lms-app-2b903.firebaseapp.com",
    projectId: "lms-app-2b903",
    storageBucket: "lms-app-2b903.appspot.com",
    messagingSenderId: "1046108373013",
    appId: "1:1046108373013:web:fc366db1d92b9c4b860e1c",
    measurementId: "G-WRMW9Z8867"
};

// Initialize Firebase
let app;
try {
    if (getApps().length === 0) {
        app = initializeApp(firebaseConfig);
        console.log('Firebase initialized in ClientSide bridge');
    } else {
        app = getApp();
        console.log('Using existing Firebase app in ClientSide bridge');
    }
} catch (error) {
    console.error('Error initializing Firebase in ClientSide bridge:', error);
}

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);

// Helper function to add a booking that works directly with Firestore
async function addBooking(bookingData) {
    try {
        // Validate the booking data
        if (!bookingData.userId || !bookingData.checkIn || !bookingData.checkOut) {
            throw new Error('Invalid booking data: missing required fields');
        }
        
        // Create a reference to the bookings collection
        const bookingsRef = collection(db, 'everlodgebookings');
        
        // Add the booking document to Firestore
        const docRef = await addDoc(bookingsRef, bookingData);
        
        console.log('Booking added with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error adding booking:', error);
        throw error;
    }
}

// Export all the Firebase services and functions
export {
    app,
    auth,
    db,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    Timestamp,
    orderBy,
    limit,
    onSnapshot,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    fetchSignInMethodsForEmail,
    onAuthStateChanged,
    addBooking
}; 