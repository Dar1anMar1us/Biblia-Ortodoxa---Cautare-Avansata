/// <reference types="cypress" />

describe('🧪 Biblia Ortodoxă — Test Plan nightly', () => {
  // ──────────────────────────────────
  // 1. Homepage
  // ──────────────────────────────────
  describe('1. Homepage — încărcare și layout', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('afișează titlul și header-ul', () => {
      cy.contains('BibliaOrtodoxă').should('be.visible');
      cy.get('header').should('be.visible');
    });

    it('afișează secțiunile de testamente (VT, NT, DC)', () => {
      cy.contains('Vechiul Testament').should('be.visible');
      cy.contains('Noul Testament').should('be.visible');
      cy.contains('Deuterocanonice').should('be.visible');
    });

    it('afișează cărți în grid', () => {
      cy.get('.book-card').should('have.length.at.least', 5);
      cy.get('.book-card').first().should('contain.text', 'Facerea');
    });

    it('afișează search bar-ul', () => {
      cy.get('#searchInput').should('be.visible');
      cy.get('#searchForm button').should('contain.text', 'Caută');
    });

    it('afișează stats (număr cărți/versete)', () => {
      cy.get('.stats').should('be.visible');
      cy.get('.stats').should('contain.text', 'cărți');
    });

    it('afișează footer-ul', () => {
      cy.get('footer').should('be.visible');
      cy.contains('Darian Marius Chircă').should('be.visible');
    });
  });

  // ──────────────────────────────────
  // 2. Navigatorare prin cărți
  // ──────────────────────────────────
  describe('2. Navigare — carte → capitol', () => {
    it('click pe o carte duce la capitolul 1', () => {
      cy.visit('/');
      cy.contains('.book-card', 'Facerea').click();
      cy.url().should('include', '/carte/Facerea');
      cy.contains('Facerea — Capitolul 1', { timeout: 12000 }).should('be.visible');
    });

    it('afișează versetele pentru Facerea 1', () => {
      cy.visit('/carte/Facerea/capitol/1');
      cy.get('.verse').should('have.length.at.least', 20);
      cy.get('.verse').first().find('.num').should('contain.text', '1.');
      cy.get('.verse').first().find('.text').should('not.be.empty');
    });

    it('navigare la capitolul următor', () => {
      cy.visit('/carte/Facerea/capitol/1');
      cy.get('.chapter-nav a[title*="Capitolul 2"]').click();
      cy.url().should('include', '/capitol/2');
    });

    it('selectorul de capitole funcționează', () => {
      cy.visit('/carte/Facerea/capitol/1');
      cy.get('#chapterSelect').select('5');
      cy.url().should('include', '/capitol/5');
    });

    it('linkul înapoi la cărți funcționează', () => {
      cy.visit('/carte/Facerea/capitol/5');
      cy.get('.chapter-nav a[title="Înapoi la cărți"]').click();
      cy.url().should('include', '/');
      cy.contains('Vechiul Testament', { timeout: 12000 }).should('be.visible');
    });
  });

  // ──────────────────────────────────
  // 3. Căutare text
  // ──────────────────────────────────
  describe('3. Căutare — full-text search', () => {
    it('căutare simplă — găsește rezultate', () => {
      cy.visit('/');
      cy.get('#searchInput').type('iubire');
      cy.get('#searchForm').submit();
      cy.url().should('include', '/search?q=iubire');
      cy.get('.result').should('have.length.at.least', 1);
      cy.get('.results-count').should('contain.text', 'rezultate');
    });

    it('căutare cu frază exactă (prin formular)', () => {
      cy.visit('/');
      cy.get('#searchInput').type('la început');
      cy.get('#searchForm').submit();
      cy.get('.result', { timeout: 12000 }).should('have.length.at.least', 1);
      cy.get('.results-count').should('be.visible');
    });

    it('căutare care nu găsește nimic arată empty state', () => {
      cy.visit('/search?q=zzzzznonexistent123&failOnStatusCode=false');
      cy.contains('Niciun rezultat').should('be.visible');
    });

    it('highlight text în rezultate', () => {
      cy.visit('/search?q=iubire&failOnStatusCode=false');
      cy.get('.result .text mark').should('have.length.at.least', 1);
    });

    it('filtrele pe cărți apar', () => {
      cy.visit('/search?q=iubire&failOnStatusCode=false');
      cy.get('.facets').should('be.visible');
      cy.get('.facet').should('have.length.at.least', 1);
    });

    it('click pe rezultat navighează la capitol + verset', () => {
      cy.visit('/search?q=iubire&failOnStatusCode=false');
      cy.get('.result .ref').first().click();
      cy.url().should('match', /\/carte\/.+\/capitol\/\d+#\d+/);
      cy.get('.verse').should('be.visible');
    });

    it('căutare cu referință (ex: Ioan 1:1) navighează direct', () => {
      cy.visit('/');
      cy.get('#searchInput').type('Ioan 1:1');
      cy.get('#searchForm').submit();
      cy.url().should('include', '/carte/Ioan/capitol/1');
      cy.url().should('include', '#1');
      cy.contains('Ioan — Capitolul 1').should('be.visible');
    });
  });

  // ──────────────────────────────────
  // 4. Sugestii (autocomplete)
  // ──────────────────────────────────
  describe('4. Sugestii — autocomplete', () => {
    it('sugestiile apar după 2+ caractere', () => {
      cy.visit('/');
      cy.get('#searchInput').type('ab');
      cy.get('#suggestions').should('be.visible');
    });

    it('click pe sugestie navighează la verset', () => {
      cy.visit('/');
      cy.get('#searchInput').type('iubire');
      cy.get('#suggestions div', { timeout: 8000 }).should('have.length.at.least', 1);
      cy.get('#suggestions div').first().click();
      cy.url().should('match', /\/carte\/.+\/capitol\/\d+#\d+/);
      cy.get('.verse').should('be.visible');
    });

    it('sugestiile dispar la Enter', () => {
      cy.visit('/');
      cy.get('#searchInput').type('ab');
      cy.get('#suggestions').should('be.visible');
      cy.get('#searchInput').type('{enter}');
      cy.get('#suggestions').should('not.be.visible');
    });

    it('sugestiile dispar la click în afara', () => {
      cy.visit('/');
      cy.get('#searchInput').type('ab');
      cy.get('#suggestions').should('be.visible');
      cy.get('.logo').first().click({ force: true });
      cy.get('#suggestions').should('not.be.visible');
    });
  });

  // ──────────────────────────────────
  // 5. Highlight pulse la navigare cu hash
  // ──────────────────────────────────
  describe('5. Pulse highlight — verset la care s-a navigat', () => {
    it('adaugă clasa pulse la navigare cu hash', () => {
      cy.visit('/carte/Facerea/capitol/1#1');
      cy.get('.verse#1', { timeout: 12000 }).should('be.visible');
      cy.get('.verse#1').should('have.class', 'pulse');
    });

    it('clasa pulse dispare după animație', () => {
      cy.visit('/carte/Facerea/capitol/1#1');
      cy.get('.verse#1', { timeout: 12000 }).should('be.visible');
      cy.wait(5000);
      cy.get('.verse#1').should('not.have.class', 'pulse');
    });
  });

  // ──────────────────────────────────
  // 6. API endpoints
  // ──────────────────────────────────
  describe('6. API — răspunsuri corecte', () => {
    it('GET /api/books returnează lista de cărți', () => {
      cy.request('/api/books').then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.books).to.have.length.gte(70);
      });
    });

    it('GET /api/books/:id returnează o carte', () => {
      cy.request('/api/books/25').then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.nume).to.eq('Facerea');
        expect(res.body.capitole).to.have.length(50);
      });
    });

    it('GET /api/books/:bookId/chapters/:chapter returnează versete', () => {
      cy.request('/api/books/25/chapters/1').then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.versete).to.have.length(31);
        expect(res.body.book.nume).to.eq('Facerea');
      });
    });

    it('GET /api/search?q=... returnează rezultate', () => {
      cy.request('/api/search?q=iubire').then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.total).to.be.gt(0);
      });
    });

    it('GET /api/search/suggest?q=... returnează sugestii', () => {
      cy.request('/api/search/suggest?q=ab').then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.suggestions).to.have.length.gte(1);
      });
    });

    it('GET /api/reference?q=... rezolvă referința', () => {
      cy.request('/api/reference?q=Ioan+1:1').then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.found).to.be.true;
        expect(res.body.book.nume).to.eq('Ioan');
      });
    });

    it('API returnează 404 pentru carte inexistentă', () => {
      cy.request({ url: '/api/books/9999', failOnStatusCode: false }).then(res => {
        expect(res.status).to.eq(404);
      });
    });
  });

  // ──────────────────────────────────
  // 7. Verificare caractere Românești
  // ──────────────────────────────────
  describe('7. Encoding — caractere diacritice', () => {
    it('Facerea 11:1 — text corect (fără ÃŽn)', () => {
      cy.visit('/carte/Facerea/capitol/11#1');
      cy.get('.verse#1 .text', { timeout: 12000 }).should('contain.text', 'În vremea aceea');
      cy.get('.verse#1 .text').should('not.contain.text', 'ÃŽn');
    });

    it('toate diacriticele românești sunt prezente (ă, î, ș, ț, â)', () => {
      cy.visit('/carte/Facerea/capitol/1');
      cy.get('.verse .text').first().invoke('text').should('match', /[ăîșțâ]/);
    });

    it('Facerea 11:1 searchabil în FTS', () => {
      cy.request('/api/search?q=vremea&carte=25&capitol=11').then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.total).to.eq(1);
        expect(res.body.results[0].text).to.contain('În vremea');
      });
    });
  });
});
