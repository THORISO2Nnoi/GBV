// server.js - Root level file for Render
console.log('🚀 Starting GBV Support System from root server.js...');
console.log('📁 Current directory:', __dirname);

try {
  // Import and run the main server from server/index.js
  require('./server/index.js');
  console.log('✅ Server started successfully from server/index.js');
} catch (error) {
  console.error('❌ Error starting server:', error);
  process.exit(1);
}
