/// <reference types="cypress" />

describe('🧪 Calendar Ortodox — Test Plan', () => {
  // ──────────────────────────────────
  // 1. Încărcare calendar
  // ──────────────────────────────────
  describe('1. Calendar — încărcare și layout', () => {
    beforeEach(() => {
      cy.visit('/calendar');
    });

    it('afișează titlul paginii', () => {
      cy.get('header').should('be.visible');
      cy.get('.logo').should('contain.text', 'BibliaOrtodoxă');
    });

    it('afișează navigarea lunii și anului', () => {
      cy.get('.cal-nav').should('be.visible');
      cy.get('#calMonthSelect').should('be.visible');
      cy.get('#calYearSelect').should('be.visible');
    });

    it('afișează gridul cu zilele', () => {
      cy.get('.cal-grid').should('be.visible');
      cy.get('.cal-day').should('have.length.at.least', 28);
    });

    it('afișează antetele zilelor (Lun, Mar, Mie...)', () => {
      cy.get('.cal-header').should('have.length', 7);
      cy.contains('.cal-header', 'Lun').should('be.visible');
      cy.contains('.cal-header', 'Dum').should('be.visible');
    });

    it('afișează bannerul cu ziua curentă', () => {
      cy.get('.cal-today-banner').should('be.visible');
      cy.get('.cal-today-banner').should('contain.text', 'Astăzi');
    });

    it('afișează legenda (Sărbătoare / Post)', () => {
      cy.get('.cal-legend').should('be.visible');
      cy.contains('.cal-legend', 'Sărbătoare').should('be.visible');
      cy.contains('.cal-legend', 'Post').should('be.visible');
    });
  });

  // ──────────────────────────────────
  // 2. Navigare calendar
  // ──────────────────────────────────
  describe('2. Navigare — lună și an', () => {
    beforeEach(() => {
      cy.visit('/calendar');
    });

    it('schimbă luna la click pe butonul ▶', () => {
      cy.get('#calMonthSelect option:selected').invoke('val').then((lunaInitiala) => {
        cy.contains('button', '▶').click();
        cy.get('#calMonthSelect option:selected').invoke('val').should((lunaNoua) => {
          // Should be next month (or wrap to Jan next year)
          const init = parseInt(lunaInitiala);
          const nou = parseInt(lunaNoua);
          expect(nou).to.eq(init === 12 ? 1 : init + 1);
        });
      });
    });

    it('schimbă luna la click pe butonul ◀', () => {
      cy.get('#calMonthSelect option:selected').invoke('val').then((lunaInitiala) => {
        cy.contains('button', '◀').click();
        cy.get('#calMonthSelect option:selected').invoke('val').should((lunaNoua) => {
          const init = parseInt(lunaInitiala);
          const nou = parseInt(lunaNoua);
          expect(nou).to.eq(init === 1 ? 12 : init - 1);
        });
      });
    });

    it('schimbă luna din dropdown', () => {
      cy.get('#calMonthSelect').select('Aprilie');
      cy.get('#calMonthSelect option:selected').should('contain.text', 'Aprilie');
      cy.get('.cal-day').should('have.length.at.least', 30);
    });

    it('schimbă anul din dropdown', () => {
      cy.get('#calYearSelect').select('2027');
      cy.get('#calYearSelect option:selected').should('have.value', '2027');
    });

    it('navigare între ani funcționează (2025–2037)', () => {
      cy.get('#calYearSelect option').should('have.length', 13);
      cy.get('#calYearSelect option:first').should('have.value', '2025');
      cy.get('#calYearSelect option:last').should('have.value', '2037');
    });
  });

  // ──────────────────────────────────
  // 3. Selectare zi din calendar
  // ──────────────────────────────────
  describe('3. Selectare zi — detalii', () => {
    beforeEach(() => {
      cy.visit('/calendar');
    });

    it('click pe o zi arată detaliile în card', () => {
      cy.get('.cal-day').not('.empty').first().click();
      cy.get('#calDetail').should('be.visible');
      cy.get('.cal-detail').should('be.visible');
    });

    it('cardul detaliază conține numele sfinților', () => {
      cy.get('.cal-day').not('.empty').first().click();
      cy.get('.saint-name').should('be.visible');
      cy.get('.saint-name').should('not.be.empty');
    });

    it('ziua curentă are clasa today', () => {
      cy.get('.cal-day.today').should('have.length.at.least', 1);
    });

    it('ziua selectată primește clasa selected', () => {
      cy.get('.cal-day').not('.empty').first().click();
      cy.get('.cal-day.selected').should('have.length', 1);
    });
  });

  // ──────────────────────────────────
  // 4. Viața sfântului (sinaxar)
  // ──────────────────────────────────
  describe('4. Sinaxar — Viața sfântului', () => {
    beforeEach(() => {
      cy.visit('/calendar');
    });

    it('butonul "Viața sfântului" există în card', () => {
      cy.get('.cal-day').not('.empty').first().click();
      cy.get('.sinaxar-btn').should('be.visible');
      cy.get('.sinaxar-btn').should('contain.text', 'Viața sfântului');
    });

    it('click pe buton încarcă textul (pentru 2026)', () => {
      // Navigate to 2026 first (our data year)
      cy.get('#calYearSelect').select('2026');
      cy.get('#calMonthSelect').select('Iunie');
      cy.get('.cal-day').not('.empty').first().click();
      cy.get('.sinaxar-btn').click();
      cy.get('.sinaxar-text').should('be.visible');
      cy.get('.sinaxar-text').should('not.be.empty');
    });

    it('afișează imaginea icoanei dacă există', () => {
      cy.get('#calYearSelect').select('2026');
      cy.get('#calMonthSelect').select('Iunie');
      cy.get('.cal-day').not('.empty').first().click();
      cy.get('.sinaxar-btn').click();
      cy.get('.sinaxar-card').should('be.visible');
      cy.get('.sinaxar-img').should('be.visible');
    });

    it('butonul toggle între "Viața" și "Închide"', () => {
      cy.get('#calYearSelect').select('2026');
      cy.get('#calMonthSelect').select('Iunie');
      cy.get('.cal-day').not('.empty').first().click();
      cy.get('.sinaxar-btn').click();
      cy.get('.sinaxar-btn').should('contain.text', 'Închide');
      cy.get('.sinaxar-btn').click();
      cy.get('.sinaxar-btn').should('contain.text', 'Viața sfântului');
    });

    it('fallback la 2026 funcționează pentru alți ani', () => {
      cy.get('#calYearSelect').select('2030');
      cy.get('#calMonthSelect').select('Iunie');
      cy.get('.cal-day').not('.empty').first().click();
      cy.get('.sinaxar-btn').click();
      cy.get('.sinaxar-text').should('be.visible');
    });
  });

  // ──────────────────────────────────
  // 5. Search sfinți
  // ──────────────────────────────────
  describe('5. Search — căutare sfinți', () => {
    beforeEach(() => {
      cy.visit('/calendar');
    });

    it('afișează câmpul de search', () => {
      cy.get('#saintSearchInput').should('be.visible');
      cy.get('#saintSearchInput').should('have.attr', 'placeholder').should('include', 'Caută');
    });

    it('caută "Paisie" și arată rezultate', () => {
      cy.get('#saintSearchInput').type('Paisie', { delay: 50 });
      cy.wait(500);
      cy.get('#saintSearchResults').should('be.visible');
      cy.get('.cal-search-result-item').should('have.length.at.least', 3);
      cy.contains('.cal-search-result-item', 'Paisie').should('be.visible');
    });

    it('nu arată rezultate sub 2 caractere', () => {
      cy.get('#saintSearchInput').type('P');
      cy.wait(300);
      cy.get('#saintSearchResults').should('not.be.visible');
    });

    it('click pe un rezultat navighează la acea zi', () => {
      cy.get('#saintSearchInput').type('Paisie', { delay: 50 });
      cy.wait(500);
      cy.get('.cal-search-result-item').first().click();
      // After click, dropdown closes and calendar navigates
      cy.get('#saintSearchResults').should('not.be.visible');
      // The selected day's detail should show
      cy.get('.cal-detail').should('be.visible');
    });

    it('arată "Niciun sfânt" pentru căutări fără rezultat', () => {
      cy.get('#saintSearchInput').type('Xyzzy', { delay: 50 });
      cy.wait(500);
      cy.contains('.cal-search-no-results', 'Niciun sfânt').should('be.visible');
    });

    it('dropdownul se închide la click afară', () => {
      cy.get('#saintSearchInput').type('Paisie', { delay: 50 });
      cy.wait(500);
      cy.get('#saintSearchResults').should('be.visible');
      // Click on calendar grid (stays on same page, closes dropdown)
      cy.get('.cal-nav').click({ force: true });
      cy.get('#saintSearchResults').should('not.be.visible');
    });
  });

  // ──────────────────────────────────
  // 6. API endpointuri
  // ──────────────────────────────────
  describe('6. API — endpointuri calendar', () => {
    it('GET /api/calendar/:an/:luna returnează JSON valid', () => {
      cy.request('/api/calendar/2026/5').then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body).to.have.property('an', 2026);
        expect(resp.body).to.have.property('luna', 5);
        expect(resp.body).to.have.property('luna_nume');
        expect(resp.body).to.have.property('zile');
        expect(resp.body.zile.length).to.be.at.least(28);
        expect(resp.body).to.have.property('astazi');
      });
    });

    it('GET /api/sinaxar/:an/:luna/:zi returnează text', () => {
      cy.request('/api/sinaxar/2026/6/13').then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body).to.have.property('found', true);
        expect(resp.body).to.have.property('text');
        expect(resp.body.text.length).to.be.greaterThan(50);
      });
    });

    it('GET /api/sinaxar/search?q=... returnează rezultate', () => {
      cy.request('/api/sinaxar/search?q=Andrei').then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body).to.be.an('array');
        expect(resp.body.length).to.be.greaterThan(0);
        expect(resp.body[0]).to.have.keys('luna', 'zi', 'sfant');
      });
    });

    it('GET /api/sinaxar/search?q=... gol returnează []', () => {
      cy.request('/api/sinaxar/search?q=Xyzzy').then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body).to.be.an('array');
        expect(resp.body.length).to.eq(0);
      });
    });
  });
});
