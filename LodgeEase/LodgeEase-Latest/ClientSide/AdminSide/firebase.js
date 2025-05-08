// Bridge module for firebase.js
// This file re-exports everything from the actual firebase.js file in the AdminSide directory

// Relative path to the actual firebase.js file
import * as firebase from '../../../AdminSide/firebase.js';

// Re-export everything from the original module
export default firebase;

// Also export all named exports for destructuring imports
export const {
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
    fetchSignInMethodsForEmail,
    // Custom functions
    register,
    signIn,
    signOut,
    checkAuth,
    checkAdminAuth,
    addBooking,
    updateBooking,
    fetchRoomsData,
    fetchRoomById,
    addRoom,
    updateRoom,
    deleteRoom,
    fetchAnalyticsData,
    fetchIntegratedAnalytics,
    fetchModuleAnalytics,
    fetchRoomAnalytics,
    verifyAdminPermissions,
    logAdminActivity,
    logPageNavigation,
    getCurrentUser,
    setAdminRole,
    safeTimestamp,
    createRequiredIndexes,
    validateBookingData,
    initializeFirebase,
    executeFirebaseOperation,
    fetchBillingData,
    addBillingRecord,
    updateBillingRecord,
    deleteBillingRecord,
    deleteBookingRecord,
    markBookingHiddenInBilling,
    updateBookingBilling,
    calculateBillingTotal
} = firebase;

console.log('Firebase bridge module loaded successfully'); 