/**
 * Mentions System for editbored Editor
 * This module handles @mention functionality
 */

(function() {
    'use strict';

    // Mentions configuration
    const MENTION_TRIGGER = '@';
    const SUGGESTIONS_CONTAINER_ID = 'mention-suggestions';

    // Sample users for mentions (in production, this would come from an API)
    const SAMPLE_USERS = [
        { id: 1, username: 'johndoe', name: 'John Doe' },
        { id: 2, username: 'janedoe', name: 'Jane Doe' },
        { id: 3, username: 'editor', name: 'Editor Bot' },
        { id: 4, username: 'admin', name: 'Administrator' },
        { id: 5, username: 'team', name: 'Team Lead' }
    ];

    // State
    let isActive = false;
    let currentQuery = '';
    let suggestions = [];
    let selectedIndex = 0;
    let currentRange = null;

    /**
     * Create the suggestions dropdown container
     */
    function createSuggestionsContainer() {
        // Remove existing container if present
        const existing = document.getElementById(SUGGESTIONS_CONTAINER_ID);
        if (existing) {
            existing.remove();
        }

        // Create new container
        const container = document.createElement('div');
        container.id = SUGGESTIONS_CONTAINER_ID;
        container.style.display = 'none';
        container.style.position = 'absolute';
        container.style.zIndex = '1000';
        document.body.appendChild(container);
    }

    /**
     * Handle input in the editor for mentions
     */
    function handleMentionInput() {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const textBefore = range.startContainer.textContent.substring(0, range.startOffset);

        // Check if we're typing a mention
        const atIndex = textBefore.lastIndexOf(MENTION_TRIGGER);
        
        if (atIndex !== -1) {
            const textAfterAt = textBefore.substring(atIndex + 1);
            
            // Check if we're in a valid mention context (at the end of @something)
            if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n') && textAfterAt.length > 0) {
                currentQuery = textAfterAt.toLowerCase();
                currentRange = range.cloneRange();
                // Set range to cover from @ to current cursor position
                currentRange.setStart(range.startContainer, atIndex);
                currentRange.setEnd(range.startContainer, range.startOffset);
                
                showSuggestions(currentQuery);
                return;
            }
        }

        hideSuggestions();
    }

    /**
     * Show mention suggestions
     */
    function showSuggestions(query) {
        const container = document.getElementById(SUGGESTIONS_CONTAINER_ID);
        if (!container) return;

        // Reset selected index
        selectedIndex = 0;

        // Filter users based on query
        suggestions = SAMPLE_USERS.filter(user => {
            return user.username.toLowerCase().includes(query) ||
                   user.name.toLowerCase().includes(query);
        });

        if (suggestions.length === 0) {
            hideSuggestions();
            return;
        }

        // Build suggestions HTML
        let html = '';
        suggestions.forEach((user, index) => {
            const isSelected = index === selectedIndex;
            html += `
                <button class="mention-suggestion ${isSelected ? 'selected' : ''}"
                        data-username="${user.username}"
                        data-index="${index}">
                    <strong>@${user.username}</strong> - ${user.name}
                </button>
            `;
        });

        container.innerHTML = html;

        // Position the suggestions container
        positionSuggestionsContainer();

        // Show the container
        container.style.display = 'block';
        isActive = true;

        // Add click handlers
        container.querySelectorAll('.mention-suggestion').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const username = this.getAttribute('data-username');
                selectSuggestion(username);
            });
        });
    }

    /**
     * Position the suggestions container near the cursor
     */
    function positionSuggestionsContainer() {
        const container = document.getElementById(SUGGESTIONS_CONTAINER_ID);
        if (!currentRange || !container) return;

        const rect = currentRange.getBoundingClientRect();
        
        container.style.top = (rect.bottom + window.scrollY + 5) + 'px';
        container.style.left = (rect.left + window.scrollX) + 'px';
        container.style.maxWidth = '300px';
    }

    /**
     * Hide mention suggestions
     */
    function hideSuggestions() {
        const container = document.getElementById(SUGGESTIONS_CONTAINER_ID);
        if (container) {
            container.style.display = 'none';
        }
        isActive = false;
        suggestions = [];
        selectedIndex = 0;
        currentQuery = '';
        currentRange = null;
    }

    /**
     * Select a suggestion and insert the mention
     */
    function selectSuggestion(username) {
        if (!currentRange) return;

        // Get the editor
        const editor = document.getElementById('editor');
        
        // Delete the @ and query text
        currentRange.deleteContents();

        // Create mention element
        const mention = document.createElement('span');
        mention.className = 'mention';
        mention.innerHTML = `<a href="/@${username}" class="mention-link">@${username}</a>`;

        // Insert mention
        currentRange.insertNode(mention);

        // Move cursor after mention
        const selection = window.getSelection();
        const newRange = document.createRange();
        newRange.setStartAfter(mention);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        // Hide suggestions
        hideSuggestions();

        // Trigger editor input handler
        if (editor) {
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * Navigate through suggestions with keyboard
     */
    function navigate(direction) {
        if (!isActive || suggestions.length === 0) return;

        selectedIndex += direction;

        if (selectedIndex < 0) {
            selectedIndex = suggestions.length - 1;
        } else if (selectedIndex >= suggestions.length) {
            selectedIndex = 0;
        }

        // Update UI
        showSuggestions(currentQuery);

        // Scroll selected item into view
        const container = document.getElementById(SUGGESTIONS_CONTAINER_ID);
        const selected = container.querySelector('.mention-suggestion.selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Navigate suggestions with keydown events
     */
    function handleKeydown(e) {
        if (!isActive) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                navigate(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                navigate(-1);
                break;
            case 'Enter':
            case 'Tab':
                if (suggestions[selectedIndex]) {
                    e.preventDefault();
                    selectSuggestion(suggestions[selectedIndex].username);
                }
                break;
            case 'Escape':
                hideSuggestions();
                break;
        }
    }

    /**
     * Trigger mention input (called when @ button is clicked)
     */
    function triggerMention() {
        const editor = document.getElementById('editor');
        if (!editor) return;

        // Focus the editor first
        editor.focus();

        // Insert @ character at cursor position
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const atNode = document.createTextNode('@');
            range.insertNode(atNode);
            
            // Move cursor after @
            range.setStartAfter(atNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // If no selection, just append @ to editor
            editor.textContent += '@';
        }

        // Now trigger the mention input
        handleMentionInput();
    }

    // Export functions to window
    window.mentionsSystem = {
        init: function() {
            // Create suggestions container
            createSuggestionsContainer();
            
            // Set up input listener on editor to detect @ mentions
            const editor = document.getElementById('editor');
            if (editor) {
                editor.addEventListener('input', function(e) {
                    handleMentionInput();
                });
                
                // Set up keydown listener for keyboard navigation
                editor.addEventListener('keydown', function(e) {
                    handleKeydown(e);
                });
            }
            
            console.log('Mentions system initialized');
        },
        onInput: handleMentionInput,
        showSuggestions: showSuggestions,
        hideSuggestions: hideSuggestions,
        selectSuggestion: selectSuggestion,
        navigate: navigate,
        handleKeydown: handleKeydown,
        triggerMention: triggerMention
    };

    console.log('Mentions system loaded');

})();
