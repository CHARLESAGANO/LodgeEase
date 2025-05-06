// Content-Type: application/javascript
// Fallback map-init.js in root directory
// This script will import the actual map-init.js from the Homepage directory

(function() {
  console.log('Loading map-init.js from root fallback');
  
  // Create a script element to load the actual map-init.js
  const script = document.createElement('script');
  script.type = 'application/javascript';
  script.src = '/Homepage/map-init.js?type=application/javascript';
  document.head.appendChild(script);
})(); 