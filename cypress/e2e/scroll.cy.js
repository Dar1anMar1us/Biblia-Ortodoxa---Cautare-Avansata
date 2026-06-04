describe('Scroll behavior on navigation', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('.book-card', { timeout: 10000 }).should('have.length.at.least', 70);
  });

  it('should scroll to top when clicking a book card from home page', () => {
    // Scroll down to find "Psalmi" (should be in OT section, later in the list)
    cy.contains('.book-card .name', 'Psalmi').then($card => {
      // Get the card's vertical position
      const cardY = $card[0].getBoundingClientRect().top;
      
      // Scroll to the card
      cy.window().then(win => {
        win.scrollTo(0, win.scrollY + cardY - 200);
      });
      
      // Wait a bit for scroll to settle
      cy.wait(300);
      
      // Record scroll position before click
      let scrollBefore = 0;
      cy.window().then(win => {
        scrollBefore = win.scrollY;
      });
      
      // Click on Psalmi
      cy.contains('.book-card .name', 'Psalmi').click();
      
      // Wait for chapter to render
      cy.get('.chapter-header', { timeout: 10000 }).should('contain', 'Psalmi');
      cy.get('.verse', { timeout: 10000 }).should('have.length.at.least', 1);
      
      // Check that we scrolled to top (window.scrollY should be 0 or very close)
      cy.window().then(win => {
        const scrollAfter = win.scrollY;
        cy.log(`Scroll before click: ${scrollBefore}, Scroll after navigation: ${scrollAfter}`);
        expect(scrollAfter).to.be.lessThan(50);
      });
    });
  });

  it('should scroll to verse when URL has hash fragment', () => {
    // Navigate to a verse with hash
    cy.visit('/carte/Facerea/capitol/1#5');
    cy.get('.verse', { timeout: 10000 }).should('have.length.at.least', 1);
    
    // Wait a bit for scroll to happen
    cy.wait(500);
    
    // Check that the target verse is visible in viewport
    cy.get('.verse#5').should('be.visible');
  });

  it('should not remember previous scroll when clicking book from search results', () => {
    // Do a search first
    cy.visit('/search?q=Domnul');
    cy.get('.result', { timeout: 10000 }).should('have.length.at.least', 1);
    
    // Scroll down a bit on search results
    cy.window().then(win => {
      win.scrollTo(0, 300);
    });
    cy.wait(300);
    
    // Click on first result
    cy.get('.result .ref').first().click();
    
    // Wait for chapter to render
    cy.get('.chapter-header', { timeout: 10000 }).should('exist');
    cy.get('.verse', { timeout: 10000 }).should('have.length.at.least', 1);
    
    // Should be at top
    cy.window().then(win => {
      expect(win.scrollY).to.be.lessThan(50);
    });
  });

  it('should scroll to psalm 1 from home page', () => {
    // Navigate directly to Psalmi chapter 1
    cy.visit('/carte/Psalmi/capitol/1');
    cy.get('.chapter-header', { timeout: 10000 }).should('contain', 'Psalmi');
    cy.get('.verse', { timeout: 10000 }).should('have.length.at.least', 1);
    
    // Verify we're at the top — first verse should be visible
    cy.window().then(win => {
      expect(win.scrollY).to.be.lessThan(100);
    });
    
    // Verify verse 1 is present
    cy.contains('.verse .num', '1.').should('be.visible');
  });
});
