import { auth } from '../firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export class Sidebar {
    constructor() {
        this.currentPath = window.location.pathname;
    }

    /**
     * Initializes the sidebar functionality.
     * Sets the active link based on the current path.
     * Adds logout functionality to the logout button.
     * Adjusts link visibility based on the preferLongTerm setting.
     * @param {boolean} preferLongTerm - The value of the preferLongTerm setting.
     */
    init(preferLongTerm = false) { // Default to false if not provided
        // Set active link
        this.setActiveLink();
        
        // Add logout functionality
        const logoutBtn = document.querySelector('.sidebar .logout-btn'); // Be more specific
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.handleLogout);
        }

        // Adjust visibility based on preferLongTerm setting
        this.updateLinkVisibility(preferLongTerm);
    }

    setActiveLink() {
        // Remove 'active' class from all links
        const links = document.querySelectorAll('.sidebar a');
        links.forEach(link => link.classList.remove('active'));

        // Add 'active' class to current page link
        links.forEach(link => {
            const href = link.getAttribute('href');
            // More robust check for active link
            if (href && this.currentPath.endsWith(href.substring(href.lastIndexOf('/')))) {
                link.classList.add('active');
            }
        });
    }

    updateLinkVisibility(preferLongTerm) {
        const roomManagementLink = document.querySelector('.sidebar a[href*="Room Management"]');
        const longTermLink = document.querySelector('.sidebar a[href*="LongTerm"]');

        if (roomManagementLink && roomManagementLink.parentElement) {
            roomManagementLink.parentElement.style.display = preferLongTerm ? 'none' : 'block';
            console.log(`Room Management link display set to: ${roomManagementLink.parentElement.style.display}`);
        }
        if (longTermLink && longTermLink.parentElement) {
            longTermLink.parentElement.style.display = preferLongTerm ? 'block' : 'none';
            console.log(`Long-term Stays link display set to: ${longTermLink.parentElement.style.display}`);
        }
    }

    async handleLogout() {
        try {
            await signOut(auth);
            window.location.href = '../Login/index.html';
        } catch (error) {
            console.error('Error signing out:', error);
            alert('Error signing out. Please try again.');
        }
    }

    generateSidebar() {
        // Keep the generated HTML the same, visibility is handled in init()
        return `
        <aside class="sidebar">
            <div class="logo-container">
                <img src="../images/LodgeEaseLogo.png" alt="Lodge Ease Logo" class="logo">
                <h2>Lodge Ease</h2>
            </div>
            <ul>
                <li><a href="../Dashboard/Dashboard.html"><i class="fas fa-tachometer-alt"></i> <span>Dashboard</span></a></li>
                <li><a href="../Room Management/room_management.html"><i class="fas fa-bed"></i> <span>Room Management</span></a></li>
                <li><a href="../Requests/booking_requests.html"><i class="fas fa-clock"></i> <span>Booking Requests</span></a></li>
                <li><a href="../Billing/billing.html"><i class="fas fa-money-bill-wave"></i> <span>Billing</span></a></li>
                <li><a href="../Reports/reports.html"><i class="fas fa-chart-line"></i> <span>Reports</span></a></li>
                <li><a href="../BusinessAnalytics/business_analytics.html"><i class="fas fa-chart-pie"></i> <span>Business Analytics</span></a></li>
                <li><a href="../ActivityLog/activity_log.html"><i class="fas fa-history"></i> <span>Activity Log</span></a></li>
                <li><a href="../Settings/settings.html"><i class="fas fa-cog"></i> <span>Settings</span></a></li>
                <li><a href="../LongTerm/longterm_management.html"><i class="fas fa-home"></i> <span>Long-term Stays</span></a></li>
                <li><a href="../AInalysis/AInalysis.html"><i class="fas fa-robot"></i> <span>ChatBot</span></a></li>
            </ul>
            
            <div class="auth-buttons">
                <button class="logout-btn">
                    <i class="fas fa-sign-out-alt"></i> 
                    <span>Logout</span>
                </button>
            </div>
        </aside>
        `;
    }
}
