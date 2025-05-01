import { db } from '../firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Fetches the 'preferLongTerm' setting from Firestore or localStorage.
 * Defaults to false if not found.
 * @returns {Promise<boolean>} The value of the preferLongTerm setting.
 */
export async function getPreferLongTermSetting() {
    let preferLongTerm = false; // Default value

    try {
        // Try Firestore first
        const settingsRef = doc(db, 'settings', 'global');
        const settingsSnapshot = await getDoc(settingsRef);

        if (settingsSnapshot.exists()) {
            const settingsData = settingsSnapshot.data();
            if (settingsData.systemSettings && typeof settingsData.systemSettings.preferLongTerm === 'boolean') {
                preferLongTerm = settingsData.systemSettings.preferLongTerm;
                console.log('PreferLongTerm setting loaded from Firestore:', preferLongTerm);
                return preferLongTerm;
            }
        }

        // Fallback to localStorage
        const storedSettings = localStorage.getItem('lodgeEaseSettings');
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            if (parsedSettings.systemSettings && typeof parsedSettings.systemSettings.preferLongTerm === 'boolean') {
                preferLongTerm = parsedSettings.systemSettings.preferLongTerm;
                console.log('PreferLongTerm setting loaded from localStorage:', preferLongTerm);
                return preferLongTerm;
            }
        }

    } catch (error) {
        console.error('Error loading preferLongTerm setting:', error);
        // Fallback to default value on error
    }

    console.log('PreferLongTerm setting not found, using default:', preferLongTerm);
    return preferLongTerm; // Return default if not found or error
} 