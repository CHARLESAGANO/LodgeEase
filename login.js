function handleLogin(event) {
    event.preventDefault();
    
    // Get form elements
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const loading = document.getElementById('loading');
    const loginButton = document.querySelector('.btn');

    // Hide any existing messages
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
    
    // Show loading state
    loading.style.display = 'block';
    loginButton.disabled = true;

    // Simulate API call with setTimeout
    setTimeout(() => {
        // For demo purposes, check if username and password match predetermined values
        if (username === 'admin' && password === 'admin123') {
            successMessage.textContent = 'Login successful! Redirecting...';
            successMessage.style.display = 'block';
            
            // Simulate redirect
            setTimeout(() => {
                // In a real application, this would redirect to your dashboard
                alert('In a real application, this would redirect to the dashboard.');
            }, 1500);
        } else {
            errorMessage.textContent = 'Invalid username or password';
            errorMessage.style.display = 'block';
        }

        // Hide loading state
        loading.style.display = 'none';
        loginButton.disabled = false;
    }, 1500);
}