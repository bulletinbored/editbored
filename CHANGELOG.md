# Changelog

Tutti i cambiamenti significativi a editbored sono documentati in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
e questo progetto aderisce a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-20

### Aggiunto

- Editor WYSIWYG con parsing Markdown in tempo reale
- Anteprime automatiche per link:
  - YouTube (video e Shorts)
  - Twitter/X
  - Facebook (post, video e Reels)
  - Instagram (post)
  - Immagini (URL diretti)
  - Link generici (con favicon)
- Sistema di salvataggio automatico su localStorage
- Esportazione documenti in formato .md
- Toolbar con formattazione rapida (bold, italic, strikethrough, liste, codice, citazioni)
- Supporto @mentions con autocompletamento
- Sintassi evidenziata per blocchi di codice
- Tasti rapidi (Ctrl+B, Ctrl+I, Ctrl+S)
- Design responsive

### Modificato

- Migliorata la gestione del cursore dopo le anteprime link
- Ottimizzata l'esperienza utente per l'inserimento immagini
- Aggiornato stile UI per una migliore leggibilità

### Risolto

- Problemi di posizionamento del cursore
- Bug nel salvataggio automatico
- Errori di rendering per alcuni tipi di link

## [0.9.0] - 2025-12-01

### Aggiunto

- Prima versione pubblica
- Editor Markdown base
- Supporto YouTube embed
