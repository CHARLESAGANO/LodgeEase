document.addEventListener('DOMContentLoaded', () => {
    // Retrieve and display rental details
    const rentalApplication = JSON.parse(localStorage.getItem('rentalApplication') || '{}');
    
    document.getElementById('summaryMoveInDate').textContent = rentalApplication.moveInDate || 'Not specified';
    document.getElementById('summaryLeaseDuration').textContent = rentalApplication.leaseDuration || 'Not specified';
    document.getElementById('summaryOccupants').textContent = rentalApplication.occupants || 'Not specified';
    document.getElementById('summaryMonthlyRent').textContent = rentalApplication.monthlyRent || 'Not specified';

    // Back button functionality
    document.getElementById('backButton').addEventListener('click', () => {
        window.location.href = '../Homepage/rooms.html'; // Updated path
    });

    // Form submission
    document.getElementById('rentalApplicationForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Collect form data
        const formData = new FormData(e.target);
        const applicationData = Object.fromEntries(formData.entries());
        
        // Validate file size
        const fileInput = document.getElementById('validId');
        if (fileInput.files[0]) {
            const fileSize = fileInput.files[0].size / 1024 / 1024; // in MB
            if (fileSize > 10) {
                alert('File must be less than 10 MB');
                return;
            }
        }
        
        // Merge with rental details
        const completeApplication = {
            ...rentalApplication,
            ...applicationData
        };

        // Here you would typically send the data to a server
        // For now, we'll just log it and show a success message
        console.log('Complete Application:', completeApplication);
        
        // Show success modal or redirect
        alert('Application submitted successfully! We will contact you soon.');
        
        // Optional: Clear local storage
        localStorage.removeItem('rentalApplication');
        
        // Redirect to rooms page with correct path
        window.location.href = '../Homepage/rooms.html'; // Updated path
    });
});

// Function to update file name display
function updateFileName(input) {
    const fileName = document.getElementById('fileName');
    if (input.files && input.files[0]) {
        fileName.textContent = `Selected file: ${input.files[0].name}`;
    } else {
        fileName.textContent = '';
    }
}