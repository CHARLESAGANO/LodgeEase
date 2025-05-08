// Bridge module for firebase.js
// This file re-exports everything from the global firebase object or imports from AdminSide/firebase.js

// Initialize variables for exports
let app, auth, db, analytics;
let collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, query, where, Timestamp, orderBy, limit, onSnapshot;
let signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, fetchSignInMethodsForEmail;

// Helper function to check if global Firebase is available and set up exports
function initializeFromGlobalFirebase() {
  if (typeof window !== 'undefined' && window.firebase) {
    console.log('Using global firebase object from window in ClientSide/firebase.js');
    
    // Get Firebase instances
    app = window.firebase.apps[0] || null;
    auth = window.firebase.auth();
    db = window.firebase.firestore();
    
    // Set up Firestore functions
    collection = db.collection.bind(db);
    getDocs = (query) => query.get();
    addDoc = (collectionRef, data) => collectionRef.add(data);
    updateDoc = (docRef, data) => docRef.update(data);
    deleteDoc = (docRef) => docRef.delete();
    doc = db.doc.bind(db);
    getDoc = (docRef) => docRef.get();
    setDoc = (docRef, data) => docRef.set(data);
    query = (collectionRef) => collectionRef;
    where = db.collection('dummy').where;
    Timestamp = window.firebase.firestore.Timestamp;
    orderBy = db.collection('dummy').orderBy;
    limit = db.collection('dummy').limit;
    onSnapshot = (ref, callback) => ref.onSnapshot(callback);
    
    // Set up Auth functions
    signInWithEmailAndPassword = auth.signInWithEmailAndPassword.bind(auth);
    createUserWithEmailAndPassword = auth.createUserWithEmailAndPassword.bind(auth);
    sendPasswordResetEmail = auth.sendPasswordResetEmail.bind(auth);
    fetchSignInMethodsForEmail = auth.fetchSignInMethodsForEmail.bind(auth);
    
    console.log('Firebase bridge module initialized using global Firebase');
    return true;
  }
  return false;
}

// Try to initialize from global Firebase first
let useGlobalFirebase = initializeFromGlobalFirebase();

// If global Firebase isn't available, import from the module
if (!useGlobalFirebase) {
  console.log('Global firebase not available, importing from AdminSide/firebase.js');
  // We'll handle this through the import * statement below
}

// Import all exports from the original module
import * as firebaseModule from '../AdminSide/firebase.js';

// Create the default export object that will combine both sources
const firebase = useGlobalFirebase ? 
  { app, auth, db } : 
  firebaseModule;

// Export custom functions that work with either Firebase source
export const register = async (email, password, username, fullname) => {
  if (useGlobalFirebase) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      return userCredential;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  } else {
    return firebaseModule.register(email, password, username, fullname);
  }
};

export const signIn = async (email, password) => {
  if (useGlobalFirebase) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  } else {
    return firebaseModule.signIn(email, password);
  }
};

export const signOut = async () => {
  if (useGlobalFirebase) {
    try {
      await auth.signOut();
      return true;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  } else {
    return firebaseModule.signOut();
  }
};

export const checkAuth = async () => {
  if (useGlobalFirebase) {
    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged(user => {
        unsubscribe();
        resolve(user);
      });
    });
  } else {
    return firebaseModule.checkAuth();
  }
};

export const checkAdminAuth = async () => {
  if (useGlobalFirebase) {
    const user = await checkAuth();
    return user;
  } else {
    return firebaseModule.checkAdminAuth();
  }
};

export const addBooking = async (bookingData) => {
  if (useGlobalFirebase) {
    try {
      const bookingsRef = collection(db, 'everlodgebookings');
      const docRef = await addDoc(bookingsRef, {
        ...bookingData,
        createdAt: Timestamp.now()
      });
      
      console.log("Booking added with ID: ", docRef.id);
      return docRef.id;
    } catch (error) {
      console.error("Error adding booking: ", error);
      throw error;
    }
  } else {
    return firebaseModule.addBooking(bookingData);
  }
};

// Export all the variables
export { 
  app,
  auth, 
  db,
  analytics,
  // Firestore functions
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
  // Auth functions
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail
};

// Default export
export default firebase;

// Make sure we expose all needed exports from the module if we're not using global Firebase
if (!useGlobalFirebase) {
  // Import specific exports from the module to re-export
  Object.assign(exports, firebaseModule);
}

console.log('Firebase bridge module loaded successfully'); 