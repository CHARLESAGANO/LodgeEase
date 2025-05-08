/**
 * File Checker - Verifies files needed for Ever Lodge functionality
 * This helps diagnose problems when files are missing on deployment
 */

// Store results for reference in main scripts
let results = null;

// Promise to hold the check results
const fileCheckPromise = new Promise(async (resolve) => {
  try {
    console.log('Running file checker...');
    
    // Run all validation checks
    const checkResults = await checkRequiredFiles();
    results = checkResults;
    resolve(checkResults);
  } catch (error) {
    console.error('File checker error:', error);
    // Return a default error result
    const errorResult = {
      canProceed: false,
      report: 'Error running file checker: ' + error.message,
      availableCount: 0,
      missingCount: 5,
      criticalMissing: true,
      missing: ['Error checking files']
    };
    results = errorResult;
    resolve(errorResult);
  }
});

// Check if a module can be imported
async function checkModuleImport(path, description, isCritical = false) {
  try {
    console.log(`Checking ${description} (${path})...`);
    const module = await import(path);
    console.log(`✓ ${description} is available`);
    return { available: true, path, description, isCritical };
  } catch (error) {
    console.log(`✗ Failed to import module: ${path}`, error);
    return { available: false, path, description, isCritical, error: error.message };
  }
}

// Main function to check all required files
async function checkRequiredFiles() {
  const filesToCheck = [
    { path: './lodge13.js', description: 'Main Lodge Script', isCritical: true },
    { path: '../firebase.js', description: 'Firebase Connection', isCritical: true },
    { path: '../firebase-bridge.js', description: 'Firebase Bridge', isCritical: true },
    { path: '../components/reviewSystem.js', description: 'Review System Component', isCritical: false },
    { path: '../components/userDrawer.js', description: 'User Drawer Component', isCritical: false }
  ];
  
  const results = [];
  for (const file of filesToCheck) {
    const result = await checkModuleImport(file.path, file.description, file.isCritical);
    results.push(result);
    
    if (result.available) {
      console.log(`✓ ${file.description} is available`);
    } else {
      console.log(`✗ ${file.description} is missing or inaccessible`);
    }
  }
  
  // Analyze results
  const available = results.filter(r => r.available);
  const missing = results.filter(r => !r.available);
  const criticalMissing = missing.filter(r => r.isCritical).length > 0;
  
  // Format report
  const report = formatReport(available.length, missing);
  
  return {
    canProceed: !criticalMissing,
    report,
    availableCount: available.length,
    missingCount: missing.length,
    criticalMissing,
    missing: missing.map(m => m.description)
  };
}

// Format a human-readable report
function formatReport(availableCount, missing) {
  const missingCount = missing.length;
  let report = `File Check Results:\n- ${availableCount} files available\n- ${missingCount} files missing\n`;
  
  if (missingCount > 0) {
    report += '\nMissing files:\n';
    missing.forEach(file => {
      report += `- ${file.description} (${file.path})${file.isCritical ? ' [CRITICAL]' : ''}\n`;
    });
    
    const criticalCount = missing.filter(f => f.isCritical).length;
    if (criticalCount > 0) {
      report += `\n⚠️ ${criticalCount} critical files are missing. Reservation system may not work properly.\n`;
    }
  } else {
    report += '\n✅ All required files are available.\n';
  }
  
  return report;
}

// Export the results and promise
export const fileCheckResults = fileCheckPromise;
export const getResults = () => results; 