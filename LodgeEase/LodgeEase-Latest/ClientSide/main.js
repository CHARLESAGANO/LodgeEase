// Content-Type: application/javascript
// Fallback main.js in root directory
// This script will import the actual main.js from the Homepage directory

(function() {
  console.log('Loading main.js from root fallback');
  
  // Create a script element to load the actual main.js
  const script = document.createElement('script');
  script.type = 'application/javascript';
  script.src = '/Homepage/main.js?type=application/javascript';
  document.head.appendChild(script);
})(); 