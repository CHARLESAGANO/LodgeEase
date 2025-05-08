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

// Initialize Firebase - make sure this happens before auth and db
let app;
let auth;
let db;

try {
    // First initialize the app
    if (getApps().length === 0) {
        app = initializeApp(firebaseConfig);
        console.log('Firebase initialized in ClientSide bridge');
    } else {
        app = getApp();
        console.log('Using existing Firebase app in ClientSide bridge');
    }
    
    // Then initialize auth and db services
    auth = getAuth(app);
    db = getFirestore(app);
    
    console.log('Firebase services initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase in ClientSide bridge:', error);
    throw new Error('Firebase initialization failed: ' + error.message);
}

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

// Function to save a draft booking
async function saveDraftBooking(bookingData) {
    try {
        // Validate the booking data
        if (!bookingData.userId || !bookingData.checkIn || !bookingData.checkOut) {
            throw new Error('Invalid booking data: missing required fields');
        }
        
        // Ensure dates are properly formatted
        const formattedBooking = {
            ...bookingData,
            checkIn: bookingData.checkIn instanceof Date ? 
                    Timestamp.fromDate(bookingData.checkIn) : 
                    (typeof bookingData.checkIn === 'string' ? 
                     Timestamp.fromDate(new Date(bookingData.checkIn)) : 
                     bookingData.checkIn),
            checkOut: bookingData.checkOut instanceof Date ? 
                     Timestamp.fromDate(bookingData.checkOut) : 
                     (typeof bookingData.checkOut === 'string' ? 
                      Timestamp.fromDate(new Date(bookingData.checkOut)) : 
                      bookingData.checkOut),
            createdAt: Timestamp.now()
        };
        
        // Create a reference to the draft bookings collection
        const draftBookingsRef = collection(db, 'draftBookings');
        
        // Add the booking document to Firestore
        const docRef = await addDoc(draftBookingsRef, formattedBooking);
        
        console.log('Draft booking added with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error adding draft booking:', error);
        throw error;
    }
}

// Function to fetch a draft booking
async function getDraftBooking(bookingId) {
    try {
        const bookingRef = doc(db, "draftBookings", bookingId);
        const bookingDoc = await getDoc(bookingRef);
        
        if (bookingDoc.exists()) {
            return { id: bookingDoc.id, ...bookingDoc.data() };
        } else {
            console.log("No draft booking found with ID:", bookingId);
            return null;
        }
    } catch (error) {
        console.error("Error getting draft booking:", error);
        throw error;
    }
}

// Function to delete a draft booking after it's confirmed
async function deleteDraftBooking(bookingId) {
    try {
        const bookingRef = doc(db, "draftBookings", bookingId);
        await deleteDoc(bookingRef);
        console.log("Draft booking deleted with ID:", bookingId);
        return true;
    } catch (error) {
        console.error("Error deleting draft booking:", error);
        throw error;
    }
}

// Function to convert a draft booking to a confirmed booking
async function confirmDraftBooking(bookingId) {
    try {
        // Get the draft booking
        const draftBookingRef = doc(db, "draftBookings", bookingId);
        const draftBookingDoc = await getDoc(draftBookingRef);
        
        if (!draftBookingDoc.exists()) {
            throw new Error("Draft booking not found");
        }
        
        const draftBookingData = draftBookingDoc.data();
        
        // Add to everlodgebookings collection
        const bookingsRef = collection(db, "everlodgebookings");
        const confirmedBookingRef = await addDoc(bookingsRef, {
            ...draftBookingData,
            status: "confirmed",
            paymentStatus: "paid",
            confirmedAt: Timestamp.now()
        });
        
        // Delete the draft booking
        await deleteDoc(draftBookingRef);
        
        console.log("Draft booking confirmed with ID:", confirmedBookingRef.id);
        return confirmedBookingRef.id;
    } catch (error) {
        console.error("Error confirming draft booking:", error);
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
    addBooking,
    saveDraftBooking,
    getDraftBooking,
    deleteDraftBooking,
    confirmDraftBooking
}; 