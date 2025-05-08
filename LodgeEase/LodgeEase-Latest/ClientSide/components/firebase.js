// Firebase bridge module for components directory
// This version directly accesses the global Firebase object instead of importing
// This is more reliable for web deployment

// Variables to store Firebase instances
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

// Set up exports for the Firebase instances
const setupFirebase = () => {
  console.log('Setting up Firebase from components bridge module');
  
  // Check if Firebase is already loaded globally (from script tags)
  if (window.firebase) {
    console.log('Using global firebase from script tags');
    
    // Get Firebase instances
    firebaseApp = window.firebase.apps[0] || null;
    firebaseAuth = window.firebase.auth();
    firebaseDb = window.firebase.firestore();
    
    return {
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
      where: firebaseDb.collection('dummy').where,
      Timestamp: window.firebase.firestore.Timestamp,
      orderBy: firebaseDb.collection('dummy').orderBy,
      limit: firebaseDb.collection('dummy').limit,
      onSnapshot: (ref, callback) => ref.onSnapshot(callback)
    };
  }
  
  // If Firebase is not available globally, create stub implementations
  console.warn('Firebase not available globally, creating stubs');
  return createFirebaseStubs();
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
const firebase = setupFirebase();

// Export directly and as default
export default firebase;
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
} = firebase;

// Also expose standard functions used in the application
export const signIn = async (email, password) => {
  if (auth) {
    try {
      return await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }
  throw new Error('Firebase auth not available');
};

export const signOut = async () => {
  if (auth) {
    try {
      return await auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }
  throw new Error('Firebase auth not available');
};

export const checkAuth = async () => {
  return new Promise((resolve) => {
    if (!auth) {
      resolve(null);
      return;
    }
    
    const unsubscribe = auth.onAuthStateChanged(user => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const addBooking = async (bookingData) => {
  if (!db) throw new Error('Firebase db not available');
  
  try {
    const bookingsRef = collection(db, 'everlodgebookings');
    return await addDoc(bookingsRef, {
      ...bookingData,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error adding booking:', error);
    throw error;
  }
};

console.log('Firebase components bridge module loaded successfully'); 