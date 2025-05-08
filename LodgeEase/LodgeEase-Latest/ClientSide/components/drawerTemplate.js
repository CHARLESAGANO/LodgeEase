export const drawerHTML = `
<script>
// Create correct Dashboard URL
const baseUrl = window.location.origin || 'https://lms-app-2b903.web.app';
// Fix the path - remove ClientSide prefix since Firebase hosting uses ClientSide as root
const dashboardUrl = baseUrl + '/Dashboard/Dashboard.html';
document.addEventListener('DOMContentLoaded', () => {
  const dashboardLink = document.querySelector('#userDrawer a[data-link="dashboard"]');
  if (dashboardLink) {
    dashboardLink.setAttribute('href', dashboardUrl);
  }
});
</script>
<div id="userDrawer" class="fixed top-0 right-0 w-80 h-full bg-white shadow-xl transform transition-transform duration-300 z-50 translate-x-full">
    <div class="p-6">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-bold text-gray-800">My Account</h2>
            <button id="closeDrawer" class="text-gray-500 hover:text-gray-700">
                <i class="ri-close-line text-2xl"></i>
            </button>
        </div>

        <div class="space-y-4">
            <div class="flex items-center space-x-4 bg-gray-100 p-4 rounded-lg">
                <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <i class="ri-user-line text-blue-600"></i>
                </div>
                <div>
                    <h3 class="font-semibold">Guest</h3>
                    <p class="text-sm text-gray-500">Not logged in</p>
                </div>
            </div>

            <div class="space-y-2">
                <a href="#" data-link="dashboard" class="flex items-center space-x-3 p-3 hover:bg-gray-100 rounded-lg transition">
                    <i class="ri-dashboard-3-line text-gray-600"></i>
                    <span>Dashboard</span>
                </a>
                <a href="#" class="flex items-center space-x-3 p-3 hover:bg-gray-100 rounded-lg transition">
                    <i class="ri-user-settings-line text-gray-600"></i>
                    <span>Profile Settings</span>
                </a>
                <a href="#" class="flex items-center space-x-3 p-3 hover:bg-gray-100 rounded-lg transition">
                    <i class="ri-heart-line text-gray-600"></i>
                    <span>Saved Lodges</span>
                </a>
                <a href="#" class="flex items-center space-x-3 p-3 hover:bg-gray-100 rounded-lg transition">
                    <i class="ri-book-line text-gray-600"></i>
                    <span>My Bookings</span>
                </a>
                <a href="../Bill/bill.html" class="flex items-center space-x-3 p-3 hover:bg-gray-100 rounded-lg transition">
                    <i class="ri-bill-line text-purple-600"></i>
                    <span>Bill Checkout</span>
                </a>
                <a href="#" class="flex items-center space-x-3 p-3 hover:bg-gray-100 rounded-lg transition">
                    <i class="ri-logout-box-r-line text-red-600"></i>
                    <span class="text-red-600">Logout</span>
                </a>
            </div>
        </div>
    </div>
</div>
<div id="drawerOverlay" class="fixed inset-0 bg-black bg-opacity-50 z-40 hidden"></div>
`; 