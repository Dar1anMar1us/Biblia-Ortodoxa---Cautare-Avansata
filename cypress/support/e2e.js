// Handle uncaught exceptions from app code (SPA navigation, 404s, etc.)
Cypress.on('uncaught:exception', () => {
  return false;
});
