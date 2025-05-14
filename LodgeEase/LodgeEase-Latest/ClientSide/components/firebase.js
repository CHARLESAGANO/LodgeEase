// Firebase bridge module for components directory
// This version directly accesses the global Firebase object instead of importing
// This is more reliable for web deployment

// Import V10 Firebase services from AdminSide as the primary source
let adminAuth, adminDb, adminFirestoreFunctions = {};
let v10ImportFailed = false;

try {
    // Dynamically import to handle potential errors gracefully if AdminSide/firebase.js isn't found or has issues
    const adminFirebaseModule = await import('../../../AdminSide/firebase.js');
    adminAuth = adminFirebaseModule.auth;
    adminDb = adminFirebaseModule.db;
    // Selectively get necessary functions to avoid exporting everything if not needed
    adminFirestoreFunctions = {
        collection: adminFirebaseModule.collection,
        getDocs: adminFirebaseModule.getDocs,
        addDoc: adminFirebaseModule.addDoc,
        updateDoc: adminFirebaseModule.updateDoc,
        deleteDoc: adminFirebaseModule.deleteDoc,
        doc: adminFirebaseModule.doc,
        getDoc: adminFirebaseModule.getDoc,
        setDoc: adminFirebaseModule.setDoc,
        query: adminFirebaseModule.query,
        where: adminFirebaseModule.where,
        Timestamp: adminFirebaseModule.Timestamp,
        orderBy: adminFirebaseModule.orderBy,
        limit: adminFirebaseModule.limit,
        onSnapshot: adminFirebaseModule.onSnapshot
    };
    console.log('ClientSide/components/firebase.js: Successfully imported V10 auth and db from AdminSide/firebase.js');
    if (adminDb && typeof adminDb.collection === 'function') {
        console.log('ClientSide/components/firebase.js: V10 db from AdminSide is VALID.');
    } else {
        console.error('ClientSide/components/firebase.js: V10 db from AdminSide is INVALID after import.');
        v10ImportFailed = true; // Mark as failed to trigger fallbacks
    }
} catch (e) {
    console.warn('ClientSide/components/firebase.js: Failed to import from AdminSide/firebase.js, will try fallbacks. Error:', e);
    v10ImportFailed = true;
}

// Variables to store Firebase instances from fallback
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let firestoreFunctions = {};

const setupFirebase = () => {
    if (!v10ImportFailed && adminAuth && adminDb) {
        console.log('ClientSide/components/firebase.js: Using V10 auth and db from AdminSide/firebase.js.');
        firebaseAuth = adminAuth;
        firebaseDb = adminDb;
        firestoreFunctions = adminFirestoreFunctions;
        firebaseApp = null; // V10 app instance isn't typically exposed this way, auth/db are key

        return {
            app: firebaseApp, // May be null or a placeholder if needed
            auth: firebaseAuth,
            db: firebaseDb,
            ...firestoreFunctions
        };
    }

    console.log('ClientSide/components/firebase.js: V10 import failed or instances invalid. Attempting V8 global or stubs.');
    // Check if Firebase is already loaded globally (from script tags - V8)
    if (window.firebase && window.firebase.firestore) {
        console.log('ClientSide/components/firebase.js: Using global V8 firebase from script tags.');
        firebaseApp = window.firebase.apps[0] || null;
        firebaseAuth = window.firebase.auth();
        firebaseDb = window.firebase.firestore();
        
        firestoreFunctions = {
            collection: firebaseDb.collection.bind(firebaseDb),
            getDocs: (query) => query.get(), // V8 style
            addDoc: (collectionRef, data) => collectionRef.add(data),
            updateDoc: (docRef, data) => docRef.update(data),
            deleteDoc: (docRef) => docRef.delete(),
            doc: firebaseDb.doc.bind(firebaseDb),
            getDoc: (docRef) => docRef.get(),
            setDoc: (docRef, data) => docRef.set(data),
            query: (collectionRef, ...constraints) => {
                let q = collectionRef;
                constraints.forEach(constraint => { q = q[constraint.type](...constraint.args); });
                return q;
            },
            where: (...args) => ({ type: 'where', args }), // Placeholder for V8 query chaining
            Timestamp: window.firebase.firestore.Timestamp,
            orderBy: (...args) => ({ type: 'orderBy', args }),
            limit: (...args) => ({ type: 'limit', args }),
            onSnapshot: (ref, callback) => ref.onSnapshot(callback)
        };

        return {
            app: firebaseApp,
            auth: firebaseAuth,
            db: firebaseDb,
            ...firestoreFunctions
        };
    }
  
    console.warn('ClientSide/components/firebase.js: Firebase V10 and V8 global not available, creating stubs.');
    const stubs = createFirebaseStubs();
    firebaseAuth = stubs.auth;
    firebaseDb = stubs.db;
    firestoreFunctions = { ...stubs }; // a bit different here, take all stub functions
    delete firestoreFunctions.auth;
    delete firestoreFunctions.db;
    delete firestoreFunctions.app;

    return stubs;
};

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

// Execute setup and export
const firebaseServices = setupFirebase(); // Renamed from firebase to avoid conflict

// Export directly and as default
export default firebaseServices;
export const { 
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
  onSnapshot
} = firebaseServices; // Use the new name

// Also expose standard functions used in the application (ensure they use the resolved auth/db)
export const signIn = async (email, password) => {
  if (firebaseAuth) { // Use the resolved firebaseAuth
    try {
      return await firebaseAuth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }
  throw new Error('Firebase auth not available');
};

export const signOut = async () => {
  if (firebaseAuth) { // Use the resolved firebaseAuth
    try {
      return await firebaseAuth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }
  throw new Error('Firebase auth not available');
};

export const checkAuth = async () => {
  return new Promise((resolve) => {
    if (!firebaseAuth) { // Use the resolved firebaseAuth
      resolve(null);
      return;
    }
    
    const unsubscribe = firebaseAuth.onAuthStateChanged(user => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const addBooking = async (bookingData) => {
  if (!firebaseDb || !firestoreFunctions.collection || !firestoreFunctions.addDoc || !firestoreFunctions.Timestamp) {
    throw new Error('Firebase db or required Firestore functions not available');
  }
  
  try {
    const bookingsRef = firestoreFunctions.collection(firebaseDb, 'everlodgebookings');
    return await firestoreFunctions.addDoc(bookingsRef, {
      ...bookingData,
      createdAt: firestoreFunctions.Timestamp.now()
    });
  } catch (error) {
    console.error('Error adding booking:', error);
    throw error;
  }
};

console.log('ClientSide/components/firebase.js: Firebase components bridge module loaded successfully'); 