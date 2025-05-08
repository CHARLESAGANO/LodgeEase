// Import firebase services from our local bridge to avoid circular dependencies
import * as FirebaseBridge from './firebase-bridge.js';

// Re-export all the Firebase functionality from the bridge
export const {
  // Core Firebase objects
  app,
  auth,
  db,
  
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
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  
  // Custom functions
  addBooking
} = FirebaseBridge;

// Use these simple implementations for other needed functions
// These implementations provide basic functionality for client-side
export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOut() {
  return auth.signOut();
}

export async function register(email, password, username, fullname) {
  // Create the user with email and password
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  
  // Add user details to the users collection
  await setDoc(doc(db, "users", userCredential.user.uid), {
    email,
    username: username.toLowerCase(),
    fullname,
    createdAt: new Date(),
    isAdmin: false
  });
  
  return userCredential;
}

export async function checkAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(!!user);
    });
  });
}

export async function getCurrentUser() {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      return { ...userDoc.data(), uid: user.uid };
    }
    return null;
  } catch (error) {
    console.error("Error getting current user data:", error);
    return null;
  }
}

console.log('Firebase bridge initialized - ClientSide module'); 