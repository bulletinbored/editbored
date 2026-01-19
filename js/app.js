/* ========================================
   Global function to update toolbar state
   ======================================== */
function updateToolbarState() {
    // Reset all format buttons first
    document.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
        btn.classList.remove('active');
    });

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    // Check for strikethrough using queryCommandState (most reliable)
    if (document.queryCommandState('strikeThrough')) {
        const strikeBtn = document.querySelector('.toolbar-btn[data-format="strikethrough"]');
        if (strikeBtn) strikeBtn.classList.add('active');
    }

    // Check other formats using native queryCommandState
    if (document.queryCommandState('bold')) {
        const btn = document.querySelector('.toolbar-btn[data-format="bold"]');
        if (btn) btn.classList.add('active');
    }
    
    if (document.queryCommandState('italic')) {
        const btn = document.querySelector('.toolbar-btn[data-format="italic"]');
        if (btn) btn.classList.add('active');
    }

    // Check for lists, blockquotes, headings
    const anchorNode = selection.anchorNode;
    if (anchorNode) {
        let current = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
        const editor = document.getElementById('editor');
        
        while (current && current !== editor && current !== document.body) {
            const tagName = current.tagName;
            
            if (tagName === 'UL') {
                const btn = document.querySelector('.toolbar-btn[data-format="ul"]');
                if (btn) btn.classList.add('active');
            }
            if (tagName === 'OL') {
                const btn = document.querySelector('.toolbar-btn[data-format="ol"]');
                if (btn) btn.classList.add('active');
            }
            if (tagName === 'BLOCKQUOTE') {
                const btn = document.querySelector('.toolbar-btn[data-format="quote"]');
                if (btn) btn.classList.add('active');
            }
            if (tagName === 'H1') {
                const btn = document.querySelector('.toolbar-btn[data-format="h1"]');
                if (btn) btn.classList.add('active');
            }
            if (tagName === 'H2') {
                const btn = document.querySelector('.toolbar-btn[data-format="h2"]');
                if (btn) btn.classList.add('active');
            }
            if (tagName === 'H3') {
                const btn = document.querySelector('.toolbar-btn[data-format="h3"]');
                if (btn) btn.classList.add('active');
            }
            if (tagName === 'CODE') {
                const btn = document.querySelector('.toolbar-btn[data-format="code"]');
                if (btn) btn.classList.add('active');
            }
            if (tagName === 'PRE') {
                const btn = document.querySelector('.toolbar-btn[data-format="codeblock"]');
                if (btn) btn.classList.add('active');
            }
            
            current = current.parentElement;
        }
    }
}

/* ========================================
   editbored - WYSIWYG Markdown Editor
   with Link Previews and Embed Support
   ======================================== */

const editbored = (function() {
    // Private state
    let editor = null;
    let titleInput = null;
    let wordCountEl = null;
    let statusText = null;
    let statusDot = null;
    let toastEl = null;
    let sourceCodeEl = null;
    let saveTimeout = null;
    let options = {};
    let linkPreviewCache = new Map();

    // URL patterns for link previews
    const URL_PATTERNS = {
        youtube: {
            regex: /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/,
            getEmbedUrl: (match) => `https://www.youtube.com/embed/${match[1]}`,
            type: 'youtube'
        },
        youtube_shorts: {
            regex: /(?:youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]+)/,
            getEmbedUrl: (match) => `https://www.youtube.com/embed/${match[1]}`,
            type: 'youtube-shorts'
        },
        vimeo: {
            regex: /vimeo\.com\/(\d+)/,
            getEmbedUrl: (match) => `https://player.vimeo.com/video/${match[1]}`,
            type: 'vimeo'
        },
        twitter: {
            regex: /twitter\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/,
            type: 'twitter',
            getEmbedUrl: (match) => `https://platform.twitter.com/widgets/tweet?id=${match[1]}`
        },
        x: {
            regex: /x\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/,
            type: 'twitter',
            getEmbedUrl: (match) => `https://platform.twitter.com/widgets/tweet?id=${match[1]}`
        },
        facebook: {
            regex: /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9_]+\/(posts|videos)\/([a-zA-Z0-9_-]+)/,
            type: 'facebook',
            getEmbedUrl: (match) => {
                const isVideo = match[1] === 'videos';
                const urlPath = match[0];
                if (isVideo) {
                    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(urlPath)}&width=500&height=280&show_text=false`;
                }
                return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(urlPath)}&width=500&height=400`;
            }
        },
        facebook_reels: {
            regex: /https?:\/\/(?:www\.)?facebook\.com\/reel\/([a-zA-Z0-9_-]+)/,
            type: 'facebook-reels',
            getEmbedUrl: (match) => `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(match[0])}&width=500&height=877&show_text=false`
        },
        instagram: {
            regex: /instagram\.com\/p\/([a-zA-Z0-9_-]+)/,
            type: 'instagram',
            getEmbedUrl: (match) => `https://www.instagram.com/p/${match[1]}/embed`
        },
        instagram_reels: {
            regex: /instagram\.com\/reel\/([a-zA-Z0-9_-]+)/,
            type: 'instagram-reels',
            getEmbedUrl: (match) => `https://www.instagram.com/reel/${match[1]}/embed`
        },
        tiktok: {
            regex: /(?:tiktok\.com\/@[\w.]+\/video\/|vm\.tiktok\.com\/)([0-9]+)/,
            type: 'tiktok',
            getEmbedUrl: (match) => `https://www.tiktok.com/embed/${match[1]}`
        },
        image: {
            regex: /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i,
            type: 'image'
        },
        generic: {
            regex: /^https?:\/\/[^\s]+$/,
            type: 'generic'
        }
    };

    // Default options
    const defaultOptions = {
        elementId: 'editor',
        titleElementId: 'titleInput',
        autoSave: true,
        autoSaveDelay: 1000,
        enableLinkPreviews: true,
        onSave: null,
        onChange: null,
        placeholder: 'Start writing...'
    };

    // Initialize the editor
    function init(userOptions = {}) {
        options = { ...defaultOptions, ...userOptions };

        // Get DOM elements
        editor = document.getElementById(options.elementId);
        titleInput = document.getElementById(options.titleElementId);
        wordCountEl = document.getElementById('wordCount');
        statusText = document.getElementById('statusText');
        statusDot = document.getElementById('statusDot');
        toastEl = document.getElementById('toast');
        sourceCodeEl = document.getElementById('sourceCode');

        if (!editor) {
            console.error('Editor element not found');
            return null;
        }

        // Set placeholder
        if (options.placeholder) {
            editor.setAttribute('data-placeholder', options.placeholder);
        }

        // Load saved content if autoSave enabled
        if (options.autoSave) {
            loadFromStorage();
        }

        // Setup event listeners
        setupEventListeners();

        // Configure marked
        marked.setOptions({
            highlight: function(code, lang) {
                if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code;
            },
            breaks: true,
            gfm: true
        });

        return {
            getContent: getContent,
            setContent: setContent,
            formatText: formatText,
            insertLink: insertLink,
            getMarkdown: getMarkdown,
            clear: clearContent,
            insertMention: insertMention,
            destroy: destroy,
            handleInput: handleInput
        };
    }

    // Setup event listeners
    function setupEventListeners() {
        editor.addEventListener('input', handleInput);
        editor.addEventListener('keydown', handleKeydown);
        editor.addEventListener('paste', handlePaste);
        editor.addEventListener('blur', handleBlur);
        editor.addEventListener('keyup', handleSelectionChange);
        editor.addEventListener('mouseup', handleSelectionChange);
        editor.addEventListener('click', handleSelectionChange);
        editor.addEventListener('focus', handleSelectionChange);

        // Global listener for selection changes
        window.addEventListener('selectionchange', handleSelectionChange);

        if (titleInput) {
            titleInput.addEventListener('input', scheduleAutoSave);
        }
    }

    // Handle keypress - IMPORTANT: This is where we fix the strikethrough issue
    function handleKeyPress(e) {
        // Handle SPACE key
        if (e.key === ' ') {
            const selection = window.getSelection();
            if (selection.rangeCount === 0) return;
            
            const range = selection.getRangeAt(0);
            if (!range.collapsed) return;
            
            const node = selection.anchorNode;
            const offset = selection.anchorOffset;
            
            if (!node) return;
            
            // Check if we're inside a strikethrough element
            if (hasStrikethrough(node)) {
                // Check if we're at the end of a text node
                if (node.nodeType === Node.TEXT_NODE && offset === node.length) {
                    e.preventDefault();
                    
                    // Use execCommand to toggle strikethrough OFF
                    // This is the key fix: toggling it off creates a clean exit
                    const prevState = document.queryCommandState('strikeThrough');
                    if (prevState) {
                        document.execCommand('strikeThrough', false, null);
                    }
                    
                    // Now insert the space character
                    // We need to insert it OUTSIDE the strikethrough element
                    const spaceNode = document.createTextNode(' ');
                    
                    // Find the strikethrough element
                    let strikethroughParent = node.parentElement;
                    while (strikethroughParent && strikethroughParent !== editor) {
                        const tagName = strikethroughParent.tagName;
                        if (['DEL', 'S', 'STRIKE'].includes(tagName)) {
                            break;
                        }
                        strikethroughParent = strikethroughParent.parentElement;
                    }
                    
                    if (strikethroughParent && strikethroughParent !== editor) {
                        // Insert space after the strikethrough element
                        if (strikethroughParent.nextSibling) {
                            strikethroughParent.parentNode.insertBefore(spaceNode, strikethroughParent.nextSibling);
                        } else {
                            strikethroughParent.parentNode.appendChild(spaceNode);
                        }
                        
                        // Create an empty text node to hold the cursor position
                        const cursorNode = document.createTextNode('');
                        if (strikethroughParent.nextSibling) {
                            strikethroughParent.parentNode.insertBefore(cursorNode, strikethroughParent.nextSibling.nextSibling || null);
                        } else {
                            strikethroughParent.parentNode.appendChild(cursorNode);
                        }
                        
                        // Position cursor in the empty node (outside strikethrough)
                        const newRange = document.createRange();
                        newRange.setStart(cursorNode, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                        
                        // Update toolbar state
                        updateToolbarState();
                    }
                }
            }
        }
        
        // Handle regular character keys when at end of strikethrough
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const selection = window.getSelection();
            if (selection.rangeCount === 0) return;
            
            const range = selection.getRangeAt(0);
            if (!range.collapsed) return;
            
            const node = selection.anchorNode;
            const offset = selection.anchorOffset;
            
            if (!node) return;
            
            // Check if we're inside a strikethrough element at the end
            if (node.nodeType === Node.TEXT_NODE && offset === node.length && hasStrikethrough(node)) {
                e.preventDefault();
                
                // Toggle strikethrough OFF
                const prevState = document.queryCommandState('strikeThrough');
                if (prevState) {
                    document.execCommand('strikeThrough', false, null);
                }
                
                // Insert the character outside the strikethrough
                const charNode = document.createTextNode(e.key);
                
                // Find the strikethrough element
                let strikethroughParent = node.parentElement;
                while (strikethroughParent && strikethroughParent !== editor) {
                    const tagName = strikethroughParent.tagName;
                    if (['DEL', 'S', 'STRIKE'].includes(tagName)) {
                        break;
                    }
                    strikethroughParent = strikethroughParent.parentElement;
                }
                
                if (strikethroughParent && strikethroughParent !== editor) {
                    // Insert character after the strikethrough element
                    if (strikethroughParent.nextSibling) {
                        strikethroughParent.parentNode.insertBefore(charNode, strikethroughParent.nextSibling);
                    } else {
                        strikethroughParent.parentNode.appendChild(charNode);
                    }
                    
                    // Create empty node for cursor position
                    const cursorNode = document.createTextNode('');
                    if (strikethroughParent.nextSibling) {
                        strikethroughParent.parentNode.insertBefore(cursorNode, strikethroughParent.nextSibling.nextSibling || null);
                    } else {
                        strikethroughParent.parentNode.appendChild(cursorNode);
                    }
                    
                    // Position cursor after the character
                    const newRange = document.createRange();
                    newRange.setStart(cursorNode, 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    
                    // Update toolbar state
                    updateToolbarState();
                }
            }
        }
    }

    // Handle input changes
    function handleInput() {
        updateWordCount();
        updateSourceCode();

        if (options.enableLinkPreviews) {
            convertUrlsToEmbeds();
        }

        if (options.onChange) {
            options.onChange(getContent());
        }

        scheduleAutoSave();
        
        // Update toolbar state after input
        setTimeout(updateToolbarState, 10);
    }

    // Handle selection change events
    function handleSelectionChange() {
        setTimeout(updateToolbarState, 50);
    }

    // Convert raw URLs to embed previews
    function convertUrlsToEmbeds() {
        const urlRegex = /https?:\/\/[^\s<>"']+/g;
        const textNodes = getTextNodes(editor);

        for (const node of textNodes) {
            const text = node.textContent;
            const urls = text.match(urlRegex);

            if (urls) {
                for (const url of urls) {
                    const trimmedText = text.trim();

                    if (trimmedText === url) {
                        const previewType = detectPreviewType(url);
                        if (previewType) {
                            const embedHtml = generateEmbedHTML(url, previewType);
                            if (embedHtml) {
                                const wrapper = document.createElement('div');
                                wrapper.innerHTML = embedHtml;
                                if (node.parentNode) {
                                    node.parentNode.replaceChild(wrapper, node);
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    // Get all text nodes in an element
    function getTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (!node.parentElement.closest('a') && !node.parentElement.closest('.link-preview')) {
                textNodes.push(node);
            }
        }

        return textNodes;
    }

    // Handle keydown - toggle off formats when pressing space
    function handleKeydown(e) {
        // SPACE key: toggle off active formats and insert plain space
        if (e.key === ' ') {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (range.collapsed) {
                    // Check which formats are active
                    const isBold = document.queryCommandState('bold');
                    const isItalic = document.queryCommandState('italic');
                    const isStrike = document.queryCommandState('strikeThrough');
                    
                    // If any format is active, toggle them all off and insert plain space
                    if (isBold || isItalic || isStrike) {
                        e.preventDefault();
                        
                        // Toggle off active formats
                        if (isBold) document.execCommand('bold', false, null);
                        if (isItalic) document.execCommand('italic', false, null);
                        if (isStrike) document.execCommand('strikeThrough', false, null);
                        
                        // Insert plain space
                        document.execCommand('insertText', false, ' ');
                        e.stopPropagation();
                        return;
                    }
                }
            }
        }
        
        // Ctrl/Cmd + B for bold
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            formatText('bold');
        }
        // Ctrl/Cmd + I for italic
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            formatText('italic');
        }
        // Ctrl/Cmd + S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveImmediately();
            showToast('Saved');
        }
    }

    // Handle paste
    function handlePaste(e) {
        const text = e.clipboardData.getData('text');
        const urlPattern = /https?:\/\/[^\s]+/g;

        if (urlPattern.test(text)) {
            e.preventDefault();
            document.execCommand('insertText', false, text);
        }
    }

    // Handle blur
    function handleBlur() {
        saveImmediately();
    }

    // Detect what type of preview to show
    function detectPreviewType(url) {
        const patternsInOrder = [
            'youtube_shorts',
            'youtube',
            'instagram_reels',
            'instagram',
            'facebook_reels',
            'facebook',
            'tiktok',
            'twitter',
            'x',
            'vimeo',
            'image',
            'generic'
        ];

        for (const key of patternsInOrder) {
            const pattern = URL_PATTERNS[key];
            if (pattern && pattern.regex.test(url)) {
                return pattern;
            }
        }
        return null;
    }

    // Create link preview
    async function createLinkPreview(linkElement, url, previewType) {
        const previewContent = generateEmbedHTML(url, previewType);
        if (!previewContent) return;

        const previewId = 'preview-' + Date.now();
        const preview = document.createElement('div');
        preview.id = previewId;
        preview.className = `link-preview link-preview--${previewType.type}`;
        preview.innerHTML = previewContent;

        if (linkElement.parentNode) {
            linkElement.parentNode.replaceChild(preview, linkElement);
        }

        if (previewType.type === 'instagram' || previewType.type === 'instagram-reels') {
            setTimeout(() => {
                if (window.instgrm && window.instgrm.Embeds) {
                    window.instgrm.Embeds.process();
                } else if (typeof instgrm !== 'undefined') {
                    instgrm.Embeds.process();
                }
            }, 100);
        }

        linkPreviewCache.set(previewId, {
            url: url,
            type: previewType.type
        });
    }

    // Generate embed HTML
    function generateEmbedHTML(url, previewType) {
        const domain = new URL(url).hostname;

        if (previewType.type === 'youtube') {
            const embedUrl = previewType.getEmbedUrl(url.match(previewType.regex));
            return `<div class="link-preview link-preview--youtube"><a href="${url}" target="_blank" rel="noopener noreferrer"><div class="link-preview__content"><div class="link-preview__media"><iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><div class="link-preview__info"><div class="link-preview__site">YouTube</div><div class="link-preview__url"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>${domain}</div></div></div></a></div>`;
        }

        if (previewType.type === 'youtube-shorts') {
            const match = url.match(previewType.regex);
            const videoId = match ? match[1] : '';
            const embedUrl = `https://www.youtube.com/embed/${videoId}`;
            return `<div class="link-preview link-preview--youtube-shorts"><a href="${url}" target="_blank" rel="noopener noreferrer"><div class="link-preview__content"><div class="link-preview__media"><iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe></div><div class="link-preview__info"><div class="link-preview__site">YouTube Shorts</div><div class="link-preview__title">YouTube Short</div><div class="link-preview__url"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>${domain}</div></div></div></a></div>`;
        }

        if (previewType.type === 'twitter') {
            const match = url.match(/(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/);
            const tweetId = match ? match[1] : '';
            return `<div class="link-preview link-preview--twitter" data-tweet-id="${tweetId}"><a href="${url}" target="_blank" rel="noopener noreferrer"><div class="link-preview__content"><div class="link-preview__media"><iframe id="tweet-${tweetId}" src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark&hide_thread=false" style="border:none;width:100%;height:350px;" scrolling="no" allowfullscreen="true"></iframe></div><div class="link-preview__info"><div class="link-preview__site">twitter / x</div><div class="link-preview__url"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>${domain}</div></div></div></a></div>`;
        }

        if (previewType.type === 'tiktok') {
            const match = url.match(/(?:tiktok\.com\/@[\w.]+\/video\/|vm\.tiktok\.com\/)([0-9]+)/);
            const videoId = match ? match[1] : '';
            return `<div class="link-preview link-preview--tiktok"><a href="${url}" target="_blank" rel="noopener noreferrer"><div class="link-preview__content"><div class="link-preview__media" style="padding-top:140%;"><iframe src="https://www.tiktok.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe></div><div class="link-preview__info"><div class="link-preview__site">TikTok</div><div class="link-preview__url"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>${domain}</div></div></div></a></div>`;
        }

        if (previewType.type === 'image') {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:block;margin:1em 0;"><img src="${url}" alt="Image" style="max-width:100%;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);"></a>`;
        }

        if (previewType.type === 'generic') {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname;
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
                return `<div class="link-preview link-preview--generic"><a href="${url}" target="_blank" rel="noopener noreferrer"><div class="link-preview__content"><div class="link-preview__icon"><img src="${faviconUrl}" alt="" onerror="this.style.display='none'"></div><div class="link-preview__details"><div class="link-preview__site"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>${hostname}</div><div class="link-preview__title">${hostname}</div><div class="link-preview__url"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>${url}</div></div></div></a></div>`;
            } catch (e) {
                return `<div class="link-preview"><a href="${url}" target="_blank" rel="noopener noreferrer"><div class="link-preview__content"><div class="link-preview__info"><div class="link-preview__site">Link</div><div class="link-preview__title">${url}</div><div class="link-preview__url"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>${domain}</div></div></div></a></div>`;
            }
        }
        
        return null;
    }

    // Format selected text
    function formatText(format) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const isActive = isFormatActive(format);
        
        if (isActive) {
            removeFormat(format);
            return;
        }

        switch (format) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'italic':
                document.execCommand('italic', false, null);
                break;
            case 'strikethrough':
                document.execCommand('strikeThrough', false, null);
                break;
            case 'ul':
                document.execCommand('insertUnorderedList', false, null);
                break;
            case 'ol':
                document.execCommand('insertOrderedList', false, null);
                break;
            case 'link':
                const url = prompt('Enter URL:', 'https://');
                if (url) {
                    document.execCommand('createLink', false, url);
                }
                break;
            case 'image':
                // Show the image insertion modal
                openImageModal();
                break;
            case 'code':
                const range = selection.getRangeAt(0);
                const selectedText = range.toString();
                if (selectedText) {
                    const code = document.createElement('code');
                    code.textContent = selectedText;
                    range.deleteContents();
                    range.insertNode(code);
                } else {
                    const code = document.createElement('code');
                    code.textContent = 'code';
                    range.insertNode(code);
                    const newRange = document.createRange();
                    newRange.setStart(code.firstChild, 4);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }
                break;
            case 'codeblock':
                const pre = document.createElement('pre');
                const codeBlock = document.createElement('code');
                const selectedCode = selection.toString();
                codeBlock.textContent = selectedCode || '// Your code here';
                pre.appendChild(codeBlock);
                if (selection.rangeCount) {
                    const range = selection.getRangeAt(0);
                    if (!range.collapsed) {
                        range.deleteContents();
                    }
                    range.insertNode(pre);
                    const newRange = document.createRange();
                    const textNode = codeBlock.firstChild || codeBlock;
                    newRange.setStart(textNode, selectedCode ? selectedCode.length : 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }
                break;
            case 'quote':
                document.execCommand('formatBlock', false, 'blockquote');
                break;
            case 'h1':
                document.execCommand('formatBlock', false, 'h1');
                break;
            case 'h2':
                document.execCommand('formatBlock', false, 'h2');
                break;
            case 'h3':
                document.execCommand('formatBlock', false, 'h3');
                break;
            case 'hr':
                document.execCommand('insertHorizontalRule', false, null);
                break;
        }

        handleInput();
        updateToolbarState();
        showToast(getFormatName(format));
    }

    // Check if a format is active
    function isFormatActive(format) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return false;

        switch (format) {
            case 'bold':
                return document.queryCommandState('bold');
            case 'italic':
                return document.queryCommandState('italic');
            case 'strikethrough':
                return document.queryCommandState('strikeThrough');
            case 'ul':
            case 'ol':
            case 'code':
            case 'codeblock':
            case 'quote':
            case 'h1':
            case 'h2':
            case 'h3':
                const node = selection.anchorNode;
                if (!node) return false;
                
                let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
                while (current && current !== editor && current !== document.body) {
                    const tagName = current.tagName;
                    if (format === 'ul' && tagName === 'UL') return true;
                    if (format === 'ol' && tagName === 'OL') return true;
                    if (format === 'code' && tagName === 'CODE') return true;
                    if (format === 'codeblock' && tagName === 'PRE') return true;
                    if (format === 'quote' && tagName === 'BLOCKQUOTE') return true;
                    if (format === 'h1' && tagName === 'H1') return true;
                    if (format === 'h2' && tagName === 'H2') return true;
                    if (format === 'h3' && tagName === 'H3') return true;
                    current = current.parentElement;
                }
                return false;
        }
        return false;
    }

    // Remove a format
    function removeFormat(format) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        switch (format) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'italic':
                document.execCommand('italic', false, null);
                break;
            case 'strikethrough':
                document.execCommand('strikeThrough', false, null);
                break;
            case 'ul':
            case 'ol':
                const listItems = editor.querySelectorAll('li');
                listItems.forEach(li => {
                    const parent = li.parentNode;
                    const textNode = document.createTextNode(li.textContent);
                    parent.parentNode.replaceChild(textNode, parent);
                });
                break;
            case 'code':
                const codeElements = editor.querySelectorAll('code');
                codeElements.forEach(code => {
                    if (selection.containsNode(code, true)) {
                        const text = code.textContent;
                        if (text !== 'code') {
                            const textNode = document.createTextNode(text);
                            code.parentNode.replaceChild(textNode, code);
                        } else {
                            code.parentNode.removeChild(code);
                        }
                    }
                });
                break;
            case 'codeblock':
                const preElements = editor.querySelectorAll('pre');
                preElements.forEach(pre => {
                    if (selection.containsNode(pre, true)) {
                        const code = pre.querySelector('code');
                        if (code) {
                            const text = code.textContent;
                            if (text !== '// Your code here') {
                                const textNode = document.createTextNode(text);
                                pre.parentNode.replaceChild(textNode, pre);
                            } else {
                                pre.parentNode.removeChild(pre);
                            }
                        }
                    }
                });
                break;
            case 'quote':
                const blockquotes = editor.querySelectorAll('blockquote');
                blockquotes.forEach(blockquote => {
                    const content = document.createDocumentFragment();
                    while (blockquote.firstChild) {
                        content.appendChild(blockquote.firstChild);
                    }
                    blockquote.parentNode.replaceChild(content, blockquote);
                });
                break;
            case 'h1':
            case 'h2':
            case 'h3':
                document.execCommand('formatBlock', false, 'p');
                break;
        }

        handleInput();
        updateToolbarState();
        showToast('Format removed');
    }

    // Insert link
    function insertLink(url, text = url) {
        const wrapper = document.createElement('a');
        wrapper.href = url;
        wrapper.textContent = text || url;

        const selection = window.getSelection();
        if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            if (!range.collapsed) {
                range.deleteContents();
            }
            range.insertNode(wrapper);
            range.setStartAfter(wrapper);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            editor.appendChild(wrapper);
        }

        handleInput();
    }

    // Get format name
    function getFormatName(format) {
        const names = {
            bold: 'Bold',
            italic: 'Italic',
            strikethrough: 'Strikethrough',
            h1: 'Heading 1',
            h2: 'Heading 2',
            h3: 'Heading 3',
            ul: 'Bullet List',
            ol: 'Numbered List',
            link: 'Link',
            image: 'Image',
            code: 'Inline Code',
            codeblock: 'Code Block',
            quote: 'Quote',
            hr: 'Horizontal Line'
        };
        return names[format] || 'Formatted';
    }

    // Insert mention
    function insertMention() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const textNode = document.createTextNode('@');
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        if (window.mentionsSystem) {
            window.mentionsSystem.onInput();
        }

        handleInput();
    }

    // Update word count
    function updateWordCount() {
        if (!wordCountEl) return;
        const text = editor.innerText || '';
        const trimmed = text.trim();
        const words = trimmed ? trimmed.split(/\s+/).length : 0;
        const chars = text.length;
        wordCountEl.textContent = `${words} words | ${chars} characters`;
    }

    // Update source code display
    function updateSourceCode() {
        if (!sourceCodeEl) return;
        const html = editor.innerHTML;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        sourceCodeEl.textContent = tempDiv.innerText;
    }

    // Get content as HTML
    function getContent() {
        return editor ? editor.innerHTML : '';
    }

    // Set content
    function setContent(html) {
        if (editor) {
            editor.innerHTML = html;
            updateWordCount();
            updateSourceCode();
        }
    }

    // Get content as markdown
    function getMarkdown() {
        return editor ? editor.innerText : '';
    }

    // Clear content
    function clearContent() {
        if (editor) {
            editor.innerHTML = '';
            updateWordCount();
            updateSourceCode();
            saveImmediately();
        }
    }

    // Destroy editor
    function destroy() {
        if (editor) {
            editor.removeEventListener('input', handleInput);
            editor.removeEventListener('keydown', handleKeydown);
            editor.removeEventListener('paste', handlePaste);
            editor.removeEventListener('blur', handleBlur);
            editor.removeEventListener('keyup', handleSelectionChange);
            editor.removeEventListener('mouseup', handleSelectionChange);
            editor.removeEventListener('click', handleSelectionChange);
            window.removeEventListener('selectionchange', handleSelectionChange);
        }
        clearTimeout(saveTimeout);
    }

    // Auto-save scheduling
    function scheduleAutoSave() {
        if (!options.autoSave) return;

        if (statusDot) {
            statusDot.classList.add('saving');
        }
        if (statusText) {
            statusText.textContent = 'Saving...';
        }

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveImmediately();
        }, options.autoSaveDelay);
    }

    // Immediate save
    function saveImmediately() {
        if (!options.autoSave) return;

        const content = {
            title: titleInput ? titleInput.value : '',
            content: getMarkdown(),
            updatedAt: new Date().toISOString()
        };

        localStorage.setItem('markdownEditor', JSON.stringify(content));

        if (statusDot) {
            statusDot.classList.remove('saving');
        }
        if (statusText) {
            statusText.textContent = 'Saved';
        }

        if (options.onSave) {
            options.onSave(content);
        }
    }

    // Load from storage
    function loadFromStorage() {
        const saved = localStorage.getItem('markdownEditor');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (titleInput && data.title) {
                    titleInput.value = data.title;
                }
                if (editor && data.content) {
                    const html = marked.parse(data.content);
                    editor.innerHTML = html;
                }
            } catch (e) {
                console.error('Error loading:', e);
            }
        }
    }

    // Show toast notification
    function showToast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        setTimeout(() => {
            toastEl.classList.remove('show');
        }, 2000);
    }

    // Reset document
    function resetDocument() {
        if (titleInput) {
            titleInput.value = 'untitled document';
        }
        editor.innerHTML = '';
        editor.focus();
        handleInput();
        updateWordCount();
        updateSourceCode();
        updateToolbarState();
        saveImmediately();
    }

    // Download as markdown
    function downloadMarkdown() {
        const title = (titleInput ? titleInput.value : 'document') || 'document';
        const safeTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const content = getMarkdown();

        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitle}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Download started');
    }

    // Public API
    return {
        init: init,
        formatText: formatText,
        insertLink: insertLink,
        insertMention: insertMention,
        getContent: getContent,
        setContent: setContent,
        getMarkdown: getMarkdown,
        clear: clearContent,
        reset: doResetDocument,
        download: doDownloadMarkdown,
        destroy: destroy,
        handleInput: handleInput
    };
})();

window.editbored = editbored;

// ========================================
// Global functions exposed to window
// These are required for inline event handlers in HTML
// ========================================

// Internal function for reset logic (avoids circular dependency)
function doResetDocument() {
    const titleInput = document.getElementById('titleInput');
    const editor = document.getElementById('editor');
    
    if (titleInput) {
        titleInput.value = 'untitled document';
    }
    if (editor) {
        editor.innerHTML = '';
        editor.focus();
        if (window.editorInstance) {
            window.editorInstance.handleInput();
        }
        window.updateWordCount();
        window.updateSourceCode();
        window.updateToolbarState();
        window.saveImmediately();
    }
}

// Internal function for download logic
function doDownloadMarkdown() {
    const titleInput = document.getElementById('titleInput');
    const editor = document.getElementById('editor');
    
    if (!editor) return;
    
    const title = (titleInput ? titleInput.value : 'document') || 'document';
    const safeTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const content = editor.innerText || '';

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    window.showToast('Download started');
}

// Expose functions to window
window.resetDocument = function() {
    doResetDocument();
};

window.downloadMarkdown = function() {
    doDownloadMarkdown();
};

// Image insertion functions
window.openImageModal = function() {
    const modal = document.getElementById('imageModal');
    const urlInput = document.getElementById('imageUrlInput');
    if (modal) {
        modal.classList.add('active');
    }
    if (urlInput) {
        urlInput.value = '';
        urlInput.focus();
    }
};

window.closeImageModal = function() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.showImageUpload = function() {
    const fileInput = document.getElementById('imageFileInput');
    if (fileInput) {
        fileInput.click();
    }
};

window.handleImageUpload = function(event) {
    const file = event.target.files[0];
    if (file) {
        // Check if it's an image
        if (!file.type.startsWith('image/')) {
            window.showToast('Please select an image file');
            return;
        }

        // Create a FileReader to read the image
        const reader = new FileReader();
        reader.onload = function(e) {
            const imageUrl = e.target.result;
            window.insertImageIntoEditor(imageUrl);
            window.closeImageModal();
            window.showToast('Image inserted');
        };
        reader.onerror = function() {
            window.showToast('Error reading file');
        };
        reader.readAsDataURL(file);
    }
    // Reset the input so the same file can be selected again
    event.target.value = '';
};

// Expose helper functions to window for debugging and external access
window.showToast = function(message) {
    const toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 2000);
};

window.updateWordCount = function() {
    const wordCountEl = document.getElementById('wordCount');
    const editor = document.getElementById('editor');
    if (wordCountEl && editor) {
        const text = editor.innerText || '';
        const trimmed = text.trim();
        const words = trimmed ? trimmed.split(/\s+/).length : 0;
        const chars = text.length;
        wordCountEl.textContent = `${words} words | ${chars} characters`;
    }
};

window.updateSourceCode = function() {
    const sourceCodeEl = document.getElementById('sourceCode');
    const editor = document.getElementById('editor');
    if (sourceCodeEl && editor) {
        const html = editor.innerHTML;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        sourceCodeEl.textContent = tempDiv.innerText;
    }
};

window.saveImmediately = function() {
    const titleInput = document.getElementById('titleInput');
    const editor = document.getElementById('editor');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    const content = {
        title: titleInput ? titleInput.value : '',
        content: editor ? editor.innerText : '',
        updatedAt: new Date().toISOString()
    };

    localStorage.setItem('markdownEditor', JSON.stringify(content));

    if (statusDot) {
        statusDot.classList.remove('saving');
    }
    if (statusText) {
        statusText.textContent = 'Saved';
    }
};

window.insertImageFromUrl = function() {
    const urlInput = document.getElementById('imageUrlInput');
    if (!urlInput) return;
    
    const url = urlInput.value.trim();
    
    if (url) {
        window.insertImageIntoEditor(url);
        window.closeImageModal();
        window.showToast('Image inserted');
    } else {
        urlInput.focus();
        urlInput.style.borderColor = '#ff3b30';
        setTimeout(() => {
            urlInput.style.borderColor = '#e0e0e0';
        }, 2000);
    }
};

window.insertImageIntoEditor = function(imageUrl) {
    const selection = window.getSelection();
    const editor = document.getElementById('editor');
    
    if (!editor) {
        console.error('Editor element not found');
        return;
    }
    
    console.log('Inserting image:', imageUrl.substring(0, 50) + '...');
    
    // Create image element
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Image';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '8px';
    img.style.margin = '0.6em 0';
    
    // Get range - try to use editor's range or create a new one at the end
    let range = null;
    if (selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
    }
    
    // If range is collapsed or invalid, insert at the end of editor
    if (!range || range.collapsed) {
        // Move cursor to the end of editor
        editor.focus();
        const newSelection = window.getSelection();
        const newRange = document.createRange();
        newRange.selectNodeContents(editor);
        newRange.collapse(false); // Collapse to the end
        newSelection.removeAllRanges();
        newSelection.addRange(newRange);
        range = newRange;
    }
    
    // Insert the image
    range.deleteContents();
    range.insertNode(img);
    
    // Move cursor after the image
    const newRange = document.createRange();
    newRange.setStartAfter(img);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
    
    // Trigger editor's input handler if available
    if (window.editorInstance && typeof window.editorInstance.handleInput === 'function') {
        window.editorInstance.handleInput();
    }
    
    // Also trigger native events
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log('Image inserted successfully');
};


// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the editor
    window.editorInstance = editbored.init({
        enableLinkPreviews: true,
        onSave: function(content) {
            console.log('Content saved:', content);
        },
        onChange: function(html) {
            // Custom change handler
        }
    });

    // Initialize the mentions system
    if (window.mentionsSystem) {
        window.mentionsSystem.init();
    }

    // Setup toolbar buttons
    document.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
        const format = btn.getAttribute('data-format');
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Special handling for image format
            if (format === 'image') {
                window.openImageModal();
            } else if (format === 'mention') {
                if (window.mentionsSystem && window.mentionsSystem.triggerMention) {
                    window.mentionsSystem.triggerMention();
                } else {
                    console.warn('Mentions system not initialized');
                }
            } else {
                editbored.formatText(format);
            }
            
            // Return focus to editor
            setTimeout(() => {
                document.getElementById('editor').focus();
                updateToolbarState();
            }, 10);
        });
    });

    // Setup event listeners for buttons and inputs
    setupEventListeners();
});

// ========================================
// Event Listener Setup
// ========================================
function setupEventListeners() {
    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            window.resetDocument();
        });
    }

    // Download button
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            window.downloadMarkdown();
        });
    }

    // Modal close button
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', function() {
            window.closeImageModal();
        });
    }

    // Upload from computer option
    const uploadFromComputer = document.getElementById('uploadFromComputer');
    if (uploadFromComputer) {
        uploadFromComputer.addEventListener('click', function() {
            window.showImageUpload();
        });
    }

    // Insert from URL button
    const insertFromUrlBtn = document.getElementById('insertFromUrlBtn');
    if (insertFromUrlBtn) {
        insertFromUrlBtn.addEventListener('click', function() {
            window.insertImageFromUrl();
        });
    }

    // Cancel button
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', function() {
            window.closeImageModal();
        });
    }

    // File input change event
    const imageFileInput = document.getElementById('imageFileInput');
    if (imageFileInput) {
        imageFileInput.addEventListener('change', function(event) {
            window.handleImageUpload(event);
        });
    }

    // Close modal when clicking outside
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('imageModal');
        if (modal && modal.classList.contains('active')) {
            if (e.target === modal) {
                window.closeImageModal();
            }
        }
    });

    // Handle Enter key in URL input
    const imageUrlInput = document.getElementById('imageUrlInput');
    if (imageUrlInput) {
        imageUrlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.insertImageFromUrl();
            }
        });
    }

    console.log('Event listeners setup complete');
}
