// Firebase bridge module for components directory
// This version directly accesses the global Firebase object instead of importing
// This is more reliable for web deployment

// Create and initialize Firebase before any exports
// This prevents the "Cannot access 'app' before initialization" error 
let _firebase = null;

// Create stub implementations for Firebase functionality
const createFirebaseStubs = () => {
  const emptyPromise = Promise.resolve({ docs: [], empty: true });
  const noopPromise = Promise.resolve();
  
  return {
    app: null,
    auth: { 
      currentUser: null,
      onAuthStateChanged: (callback) => { 
        setTimeout(() => callback(null), 0); 
        return () => {}; 
      },
      signOut: () => noopPromise
    },
    db: {
      collection: () => ({
        get: () => emptyPromise,
        where: () => ({
          get: () => emptyPromise
        })
      })
    },
    collection: () => ({
      get: () => emptyPromise,
      where: () => ({
        get: () => emptyPromise
      })
    }),
    getDocs: () => emptyPromise,
    addDoc: () => noopPromise,
    updateDoc: () => noopPromise,
    deleteDoc: () => noopPromise,
    doc: () => ({
      get: () => Promise.resolve({
        exists: () => false,
        data: () => null
      })
    }),
    getDoc: () => Promise.resolve({
      exists: () => false,
      data: () => null
    }),
    setDoc: () => noopPromise,
    query: () => ({}),
    where: () => ({}),
    Timestamp: {
      now: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }),
      fromDate: (date) => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 })
    },
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {}
  };
};

// Initialize Firebase module
function initFirebase() {
  if (_firebase !== null) {
    return _firebase; // Return cached instance if already initialized
  }

  console.log('Setting up Firebase from components bridge module');
  
  // Check if Firebase is already loaded globally (from script tags)
  if (window.firebase) {
    console.log('Using global firebase from script tags');
    
    try {
      // Initialize firebase app if not already initialized
      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        // Set up the firebase configuration
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
        window.firebase.initializeApp(firebaseConfig);
        console.log("Firebase initialized in components/firebase.js");
      }
      
      // Get Firebase instances
      const firebaseApp = window.firebase.apps[0] || null;
      const firebaseAuth = window.firebase.auth();
      const firebaseDb = window.firebase.firestore();
      
      _firebase = {
        app: firebaseApp,
        auth: firebaseAuth,
        db: firebaseDb,
        // Expose Firestore functions directly from firebase
        collection: firebaseDb.collection.bind(firebaseDb),
        getDocs: (query) => query.get(),
        addDoc: (collectionRef, data) => collectionRef.add(data),
        updateDoc: (docRef, data) => docRef.update(data),
        deleteDoc: (docRef) => docRef.delete(),
        doc: firebaseDb.doc.bind(firebaseDb),
        getDoc: (docRef) => docRef.get(),
        setDoc: (docRef, data) => docRef.set(data),
        query: (collectionRef) => collectionRef,
        where: window.firebase.firestore.FieldPath.documentId,
        Timestamp: window.firebase.firestore.Timestamp,
        orderBy: (field) => field,
        limit: (n) => n,
        onSnapshot: (ref, callback) => ref.onSnapshot(callback)
      };
      return _firebase;
    } catch (error) {
      console.error('Error initializing Firebase:', error);
    }
  }
  
  // If Firebase is not available globally, create stub implementations
  console.warn('Firebase not available globally, creating stubs');
  _firebase = createFirebaseStubs();
  return _firebase;
}

// Initialize Firebase immediately
try {
  initFirebase();
  console.log('Firebase components bridge module loaded successfully');
} catch (e) {
  console.error('Error during Firebase initialization:', e);
}

// Export all functions as callable functions to avoid initialization issues
export const app = function() { return initFirebase().app; };
export const auth = function() { return initFirebase().auth; };
export const db = function() { return initFirebase().db; };
export const collection = function(...args) { return initFirebase().collection(...args); };
export const getDocs = function(...args) { return initFirebase().getDocs(...args); };
export const addDoc = function(...args) { return initFirebase().addDoc(...args); };
export const updateDoc = function(...args) { return initFirebase().updateDoc(...args); };
export const deleteDoc = function(...args) { return initFirebase().deleteDoc(...args); };
export const doc = function(...args) { return initFirebase().doc(...args); };
export const getDoc = function(...args) { return initFirebase().getDoc(...args); };
export const setDoc = function(...args) { return initFirebase().setDoc(...args); };
export const query = function(...args) { return initFirebase().query(...args); };
export const where = function(...args) { return initFirebase().where(...args); };
export const Timestamp = {
  now: function() { return initFirebase().Timestamp.now(); },
  fromDate: function(date) { return initFirebase().Timestamp.fromDate(date); }
};
export const orderBy = function(...args) { return initFirebase().orderBy(...args); };
export const limit = function(...args) { return initFirebase().limit(...args); };
export const onSnapshot = function(...args) { return initFirebase().onSnapshot(...args); };

// Don't export default to avoid confusion
// Add specific application functions
export const signIn = async function(email, password) {
  const authInstance = initFirebase().auth;
  if (authInstance) {
    try {
      return await authInstance.signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }
  throw new Error('Firebase auth not available');
};

export const signOut = async function() {
  const authInstance = initFirebase().auth;
  if (authInstance) {
    try {
      return await authInstance.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }
  throw new Error('Firebase auth not available');
};

export const checkAuth = async function() {
  return new Promise((resolve) => {
    const authInstance = initFirebase().auth;
    if (!authInstance) {
      resolve(null);
      return;
    }
    
    const unsubscribe = authInstance.onAuthStateChanged(user => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const addBooking = async function(bookingData) {
  const dbInstance = initFirebase().db;
  if (!dbInstance) throw new Error('Firebase db not available');
  
  try {
    const bookingsRef = collection(dbInstance, 'everlodgebookings');
    return await addDoc(bookingsRef, {
      ...bookingData,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error adding booking:', error);
    throw error;
  }
}; 