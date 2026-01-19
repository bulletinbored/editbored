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
            regex: /instagram\.com\/(p|reel)\/([a-zA-Z0-9_-]+)/,
            type: 'instagram',
            getEmbedUrl: (match) => `https://www.instagram.com/${match[1]}/${match[2]}/embed`
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
    async function handleInput() {
        updateWordCount();
        updateSourceCode();

        if (options.enableLinkPreviews) {
            await convertUrlsToEmbeds();
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
    async function convertUrlsToEmbeds() {
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
                            // Create a temporary anchor element
                            const linkElement = document.createElement("a");
                            linkElement.href = url;
                            linkElement.textContent = url;
                            linkElement.target = "_blank";
                            
                            if (node.parentNode) {
                                node.parentNode.replaceChild(linkElement, node);
                                // Use createLinkPreview to create the preview
                                await createLinkPreview(linkElement, url, previewType);
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    // Create link preview
    window.createLinkPreview = async function(linkElement, url, previewType) {
        const previewContent = window.generateEmbedHTML(url, previewType);
        if (!previewContent) return;

        const previewId = 'preview-' + Date.now();
        
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-wrapper';
        wrapper.setAttribute('data-preview-id', previewId);
        
        const preview = document.createElement('div');
        preview.id = previewId;
        preview.className = `link-preview link-preview--${previewType.type}`;
        preview.innerHTML = previewContent;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'preview-remove-btn';
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        removeBtn.title = 'Rimuovi link';
        removeBtn.setAttribute('aria-label', 'Rimuovi link');
        removeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const editor = document.getElementById('editor');
            
            // Create a text node to hold cursor position
            const cursorNode = document.createTextNode('\u200B'); // Zero-width space
            wrapper.parentNode.insertBefore(cursorNode, wrapper.nextSibling);
            
            // Remove the wrapper
            wrapper.remove();
            
            // Focus editor and position cursor
            if (editor) {
                editor.focus();
            }
            
            // Position cursor after the wrapper
            const range = document.createRange();
            range.setStart(cursorNode, 0);
            range.collapse(true);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Remove the zero-width space and keep cursor there
            setTimeout(() => {
                if (cursorNode.parentNode && cursorNode.textContent === '\u200B') {
                    cursorNode.remove();
                    // Re-position cursor where the text node was
                    if (editor) {
                        const newRange = document.createRange();
                        newRange.setStartAfter(cursorNode.previousSibling || editor);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    }
                }
            }, 10);
            
            if (editor) {
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (typeof window.showToast === 'function') {
                window.showToast('Link rimosso');
            }
        });
        
        wrapper.appendChild(preview);
        wrapper.appendChild(removeBtn);

        if (linkElement.parentNode) {
            linkElement.parentNode.replaceChild(wrapper, linkElement);
        }

        if (previewType.type === 'instagram') {
            setTimeout(() => {
                if (window.instgrm && window.instgrm.Embeds) {
                    window.instgrm.Embeds.process();
                } else if (typeof instgrm !== 'undefined') {
                    instgrm.Embeds.process();
                }
            }, 100);
        }

        window.linkPreviewCache = window.linkPreviewCache || new Map();
        window.linkPreviewCache.set(previewId, { url, type: previewType.type });
    };

    // Generate embed HTML
    window.generateEmbedHTML = function(url, previewType) {
        const domain = new URL(url).hostname;
        if (previewType.type === 'youtube') {
            const embedUrl = previewType.getEmbedUrl(url.match(previewType.regex));
            return `<div class="link-preview link-preview--youtube"><a href="${url}" target="_blank"><iframe src="${embedUrl}" frameborder="0" allowfullscreen></iframe></a></div>`;
        }
        if (previewType.type === 'twitter') {
            const match = url.match(/(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/);
            const tweetId = match ? match[1] : '';
            return `<div class="link-preview link-preview--twitter"><a href="${url}" target="_blank"><iframe src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}" style="border:none;width:100%;height:350px;"></iframe></a></div>`;
        }
        if (previewType.type === 'instagram') {
            // Check if it's a reel (reel/) or post (p/)
            const isReel = url.includes('/reel/');
            return `<div class="link-preview link-preview--${isReel ? 'instagram-reels' : 'instagram'}"><blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="${url}" data-instgrm-version="14"></blockquote></div>`;
        }
        if (previewType.type === 'facebook') {
            // Facebook posts and videos
            const isVideo = url.includes('/videos/') || url.includes('/reel/');
            return `<div class="link-preview link-preview--facebook"><iframe src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&width=500&show_text=false" style="border:none;width:100%;height:400px;overflow:hidden;" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe></div>`;
        }
        if (previewType.type === 'facebook-reels') {
            return `<div class="link-preview link-preview--facebook-reels"><iframe src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&width=500&show_text=false" style="border:none;width:100%;height:600px;overflow:hidden;" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe></div>`;
        }
        if (previewType.type === 'tiktok') {
            const match = url.match(/(?:tiktok\.com\/@[\w.]+\/video\/|vm\.tiktok\.com\/)([0-9]+)/);
            const videoId = match ? match[1] : '';
            return `<div class="link-preview link-preview--tiktok"><a href="${url}" target="_blank"><iframe src="https://www.tiktok.com/embed/${videoId}" style="border:none;width:100%;height:600px;"></iframe></a></div>`;
        }
        if (previewType.type === 'image') {
            return `<a href="${url}" target="_blank" style="display:block;"><img src="${url}" alt="Image" style="max-width:100%;"></a>`;
        }
        if (previewType.type === 'generic') {
            try {
                const urlObj = new URL(url);
                return `<div class="link-preview link-preview--generic"><a href="${url}" target="_blank">${urlObj.hostname}</a></div>`;
            } catch (e) {
                return `<div class="link-preview"><a href="${url}" target="_blank">${url}</a></div>`;
            }
        }
        return null;
    };

    // Preview type detection
    window.previewTypes = {
        youtube: { regex: /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/, type: 'youtube', getEmbedUrl: (m) => `https://www.youtube.com/embed/${m[1]}` },
        youtube_shorts: { regex: /youtu\.be\/([a-zA-Z0-9_-]+)/, type: 'youtube-shorts', getEmbedUrl: (m) => `https://www.youtube.com/embed/${m[1]}` },
        twitter: { regex: /(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/, type: 'twitter', getEmbedUrl: (m) => `https://platform.twitter.com/widgets/tweet?id=${m[1]}` },
        x: { regex: /x\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/, type: 'twitter', getEmbedUrl: (m) => `https://platform.twitter.com/widgets/tweet?id=${m[1]}` },
        instagram_post: { regex: /instagram\.com\/p\/([a-zA-Z0-9_-]+)/, type: 'instagram', getEmbedUrl: (m) => `https://www.instagram.com/p/${m[1]}/embed` },
        instagram_reel: { regex: /instagram\.com\/reel\/([a-zA-Z0-9_-]+)/, type: 'instagram', getEmbedUrl: (m) => `https://www.instagram.com/reel/${m[1]}/embed` },
        facebook_post: { regex: /facebook\.com\/[a-zA-Z0-9_]+\/posts\/([a-zA-Z0-9_-]+)/, type: 'facebook', getEmbedUrl: (m) => null },
        facebook_video: { regex: /facebook\.com\/[a-zA-Z0-9_]+\/videos\/([a-zA-Z0-9_-]+)/, type: 'facebook', getEmbedUrl: (m) => null },
        facebook_reel: { regex: /facebook\.com\/reel\/([a-zA-Z0-9_-]+)/, type: 'facebook-reels', getEmbedUrl: (m) => null },
        tiktok: { regex: /(?:tiktok\.com\/@[\w.]+\/video\/|vm\.tiktok\.com\/)([0-9]+)/, type: 'tiktok', getEmbedUrl: (m) => `https://www.tiktok.com/embed/${m[1]}` },
        image: { regex: /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i, type: 'image' },
        generic: { regex: /^https?:\/\/[^\s]+$/, type: 'generic' }
    };

    window.detectPreviewType = function(url) {
        // Check each preview type in order of specificity
        const checks = [
            { key: 'instagram_reel', pattern: /instagram\.com\/reel\/([a-zA-Z0-9_-]+)/, type: 'instagram' },
            { key: 'instagram_post', pattern: /instagram\.com\/p\/([a-zA-Z0-9_-]+)/, type: 'instagram' },
            { key: 'facebook_reel', pattern: /facebook\.com\/reel\/([a-zA-Z0-9_-]+)/, type: 'facebook-reels' },
            { key: 'facebook_video', pattern: /facebook\.com\/[a-zA-Z0-9_]+\/videos\/([a-zA-Z0-9_-]+)/, type: 'facebook' },
            { key: 'facebook_post', pattern: /facebook\.com\/[a-zA-Z0-9_]+\/posts\/([a-zA-Z0-9_-]+)/, type: 'facebook' },
            { key: 'youtube', pattern: /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/, type: 'youtube' },
            { key: 'youtube_shorts', pattern: /youtu\.be\/([a-zA-Z0-9_-]+)/, type: 'youtube-shorts' },
            { key: 'twitter', pattern: /(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/, type: 'twitter' },
            { key: 'tiktok', pattern: /(?:tiktok\.com\/@[\w.]+\/video\/|vm\.tiktok\.com\/)([0-9]+)/, type: 'tiktok' },
            { key: 'image', pattern: /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i, type: 'image' },
            { key: 'generic', pattern: /^https?:\/\/[^\s]+$/, type: 'generic' }
        ];
        
        for (const check of checks) {
            if (check.pattern.test(url)) {
                return window.previewTypes[check.key] || { type: check.type };
            }
        }
        return null;
    };

    window.getTextNodes = function(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (!node.parentElement.closest('a') && !node.parentElement.closest('.link-preview')) {
                textNodes.push(node);
            }
        }
        return textNodes;
    };

    console.log('Link preview system initialized');

    // Handle keydown events
    function handleKeydown(e) {
        // Tab handling
        if (e.key === 'Tab') {
            e.preventDefault();
            
            // Check if we're in a code block (pre > code)
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const codeEl = range.startContainer.parentElement.closest('code');
                const preEl = range.startContainer.parentElement.closest('pre');
                
                if (codeEl && preEl) {
                    // Inside code block - insert spaces
                    document.execCommand('insertText', false, '    ');
                } else {
                    // Outside code block - insert tab or spaces
                    document.execCommand('insertText', false, '    ');
                }
            }
            return;
        }
        
        // Handle Enter in blockquote
        if (e.key === 'Enter' && !e.shiftKey) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const blockquote = range.startContainer.parentElement.closest('blockquote');
                
                if (blockquote) {
                    // Check if we're at the end of the blockquote
                    const blockquoteRange = document.createRange();
                    blockquoteRange.selectNodeContents(blockquote);
                    blockquoteRange.collapse(false);
                    
                    if (range.collapsed && range.startContainer.textContent.length === range.startOffset) {
                        e.preventDefault();
                        
                        // Exit blockquote
                        const p = document.createElement('p');
                        p.innerHTML = '<br>';
                        
                        if (blockquote.parentNode) {
                            blockquote.parentNode.insertBefore(p, blockquote.nextSibling);
                            
                            // Move cursor to new paragraph
                            const newRange = document.createRange();
                            newRange.setStart(p, 0);
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        }
                    }
                }
            }
        }
        
        // Handle Enter in lists
        if (e.key === 'Enter' && !e.shiftKey) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const li = range.startContainer.parentElement.closest('li');
                
                if (li) {
                    // Check if the list item is empty or just has a <br>
                    const textContent = li.textContent.trim();
                    
                    if (textContent === '' || textContent === '\n') {
                        e.preventDefault();
                        
                        // Remove the list item
                        const ul = li.closest('ul, ol');
                        
                        if (ul && ul.parentNode) {
                            if (ul.children.length === 1) {
                                // Remove the entire list
                                const p = document.createElement('p');
                                p.innerHTML = '<br>';
                                ul.parentNode.replaceChild(p, ul);
                            } else {
                                // Just remove this list item
                                li.remove();
                            }
                            
                            // Move cursor
                            const newRange = document.createRange();
                            newRange.setStart(ul.parentNode, ul.parentNode.childNodes.length === 0 ? 0 : Array.from(ul.parentNode.childNodes).indexOf(ul) + (ul.children.length > 0 ? 0 : 1));
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        }
                    }
                }
            }
        }
    }

    // Handle paste events
    function handlePaste(e) {
        e.preventDefault();
        const text = (e.originalEvent || e).clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }

    // Handle blur
    function handleBlur() {
        // Save when leaving editor
        if (options.autoSave) {
            scheduleAutoSave();
        }
    }

    // Schedule auto-save
    function scheduleAutoSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        
        saveTimeout = setTimeout(() => {
            saveToStorage();
            
            if (options.onSave) {
                options.onSave(getContent());
            }
        }, options.autoSaveDelay);
    }

    // Save to localStorage
    function saveToStorage() {
        const content = getContent();
        localStorage.setItem('editbored_content', content);
        localStorage.setItem('editbored_title', titleInput ? titleInput.value : '');
        
        if (statusText) {
            statusText.textContent = 'Salvato';
        }
        
        if (statusDot) {
            statusDot.classList.remove('unsaved');
            statusDot.classList.add('saved');
        }
    }

    // Load from localStorage
    function loadFromStorage() {
        const content = localStorage.getItem('editbored_content');
        const title = localStorage.getItem('editbored_title');
        
        if (content) {
            editor.innerHTML = content;
        }
        
        if (title && titleInput) {
            titleInput.value = title;
        }
        
        updateWordCount();
        updateSourceCode();
    }

    // Update word count
    function updateWordCount() {
        if (!wordCountEl) return;
        
        const text = editor.innerText || '';
        const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        const chars = text.length;
        
        wordCountEl.textContent = `${words} parole, ${chars} caratteri`;
    }

    // Update source code view
    function updateSourceCode() {
        if (!sourceCodeEl) return;
        sourceCodeEl.value = getMarkdown();
    }

    // Check if node has strikethrough formatting
    function hasStrikethrough(node) {
        let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        
        while (current && current !== editor && current !== document.body) {
            if (['DEL', 'S', 'STRIKE'].includes(current.tagName)) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    // Format text with given command
    function formatText(command, value = null) {
        // First, try using queryCommandState to check current state
        const states = ['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript'];
        
        if (states.includes(command)) {
            // Check if already active
            if (document.queryCommandState(command)) {
                // Toggle it off
                document.execCommand(command, false, null);
            } else {
                // Toggle it on
                document.execCommand(command, false, null);
            }
            updateToolbarState();
            handleInput();
            return;
        }
        
        // For other commands (headers, lists, etc.)
        document.execCommand(command, false, value);
        updateToolbarState();
        handleInput();
    }

    // Insert link
    function insertLink(url, text) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        
        // Delete selected content
        range.deleteContents();
        
        // Create link
        const link = document.createElement('a');
        link.href = url;
        link.textContent = text || url;
        link.target = '_blank';
        
        range.insertNode(link);
        
        // Move cursor after link
        const newRange = document.createRange();
        newRange.setStartAfter(link);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        handleInput();
    }

    // Insert mention
    function insertMention(name) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        
        // Delete selected content (the '@' and partial name)
        range.deleteContents();
        
        // Create mention span
        const mention = document.createElement('span');
        mention.className = 'mention';
        mention.textContent = '@' + name;
        mention.setAttribute('data-mention', name);
        
        range.insertNode(mention);
        
        // Move cursor after mention
        const newRange = document.createRange();
        newRange.setStartAfter(mention);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        handleInput();
    }

    // Get HTML content
    function getContent() {
        return editor.innerHTML;
    }

    // Set HTML content
    function setContent(html) {
        editor.innerHTML = html;
        updateWordCount();
        updateSourceCode();
    }

    // Get Markdown content
    function getMarkdown() {
        return editor.innerText || '';
    }

    // Clear content
    function clearContent() {
        editor.innerHTML = '';
        if (titleInput) titleInput.value = '';
        updateWordCount();
        updateSourceCode();
        localStorage.removeItem('editbored_content');
        localStorage.removeItem('editbored_title');
    }

    // Destroy editor
    function destroy() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        
        editor.removeEventListener('input', handleInput);
        editor.removeEventListener('keydown', handleKeydown);
        editor.removeEventListener('paste', handlePaste);
        editor.removeEventListener('blur', handleBlur);
        editor.removeEventListener('keyup', handleSelectionChange);
        editor.removeEventListener('mouseup', handleSelectionChange);
        editor.removeEventListener('click', handleSelectionChange);
        editor.removeEventListener('focus', handleSelectionChange);
        window.removeEventListener('selectionchange', handleSelectionChange);
        
        if (titleInput) {
            titleInput.removeEventListener('input', scheduleAutoSave);
        }
    }

    // Expose public methods
    return {
        init: init,
        getContent: () => getContent(),
        setContent: (html) => setContent(html),
        formatText: (cmd, val) => formatText(cmd, val),
        insertLink: (url, text) => insertLink(url, text),
        insertMention: (name) => insertMention(name),
        getMarkdown: () => getMarkdown(),
        clear: () => clearContent(),
        destroy: () => destroy()
    };
})();

// Expose functions globally for onclick handlers
window.showToast = function(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
};

window.resetDocument = function() {
    const editor = document.getElementById('editor');
    if (editor) {
        editor.innerHTML = '';
        localStorage.removeItem('editbored_content');
        localStorage.removeItem('editbored_title');
        window.showToast('Documento ripristinato');
    }
};

// Image upload handler
window.handleImageUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.startsWith('image/')) {
        window.showToast('Per favore seleziona un\' immagine');
        return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        window.showToast('L\' immagine deve essere inferiore a 5MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageUrl = e.target.result;
        
        // Insert image into editor
        const editor = document.getElementById('editor');
        const selection = window.getSelection();
        let range;
        
        if (selection.rangeCount > 0) {
            range = selection.getRangeAt(0);
        } else {
            range = document.createRange();
            range.setStart(editor, editor.childNodes.length);
            range.collapse(true);
            selection.addRange(range);
        }
        
        // Create image element
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = file.name;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '10px 0';
        
        // Insert at cursor or at end
        range.insertNode(img);
        
        // Add a paragraph after the image if needed
        if (!img.nextSibling || img.nextSibling.nodeType !== Node.ELEMENT_NODE || img.nextSibling.tagName !== 'P') {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            img.parentNode.insertBefore(p, img.nextSibling);
            
            // Move cursor to new paragraph
            range = document.createRange();
            range.setStart(p, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        // Trigger input event
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.showToast('Immagine caricata');
    };
    reader.readAsDataURL(file);
    
    // Reset input
    event.target.value = '';
};

// File upload handler for other file types
window.handleFileUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const fileUrl = e.target.result;
        
        // Create link element
        const editor = document.getElementById('editor');
        const selection = window.getSelection();
        let range;
        
        if (selection.rangeCount > 0) {
            range = selection.getRangeAt(0);
        } else {
            range = document.createRange();
            range.setStart(editor, editor.childNodes.length);
            range.collapse(true);
            selection.addRange(range);
        }
        
        // Create link element
        const link = document.createElement('a');
        link.href = fileUrl;
        link.textContent = file.name;
        link.download = file.name;
        
        range.insertNode(link);
        
        // Trigger input event
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.showToast('File caricato');
    };
    reader.readAsDataURL(file);
    
    // Reset input
    event.target.value = '';
};

// Toolbar button handler
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the editor
    const editor = editbored.init({
        elementId: 'editor',
        titleElementId: 'titleInput',
        autoSave: true,
        autoSaveDelay: 1000,
        enableLinkPreviews: true,
        onSave: function(content) {
            console.log('Content saved');
        },
        onChange: function(content) {
            console.log('Content changed');
        },
        placeholder: 'Scrivi qui il tuo articolo...'
    });
    
    // Initialize mentions system
    if (typeof window.mentionsSystem !== 'undefined') {
        window.mentionsSystem.init();
    }
    
    // Toolbar button handlers
    document.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const format = this.getAttribute('data-format');
            
            if (format === 'mention') {
                // Trigger mention popup
                if (typeof window.mentionsSystem !== 'undefined') {
                    window.mentionsSystem.triggerMention();
                }
            } else {
                // Handle other formats
                editbored.formatText(format);
            }
            
            // Update active state
            document.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Refocus editor
            const editorEl = document.getElementById('editor');
            if (editorEl) {
                editorEl.focus();
            }
        });
    });
    
    // Source code toggle
    const sourceCodeToggle = document.getElementById('sourceCodeToggle');
    const sourceCode = document.getElementById('sourceCode');
    const editorEl = document.getElementById('editor');
    let sourceCodeMode = false;
    
    if (sourceCodeToggle && sourceCode && editorEl) {
        sourceCodeToggle.addEventListener('click', function() {
            sourceCodeMode = !sourceCodeMode;
            
            if (sourceCodeMode) {
                sourceCode.value = editbored.getMarkdown();
                sourceCode.style.display = 'block';
                editorEl.style.display = 'none';
                sourceCodeToggle.classList.add('active');
            } else {
                editorEl.innerHTML = marked(sourceCode.value);
                sourceCode.style.display = 'none';
                editorEl.style.display = 'block';
                sourceCodeToggle.classList.remove('active');
                
                // Trigger input event to update previews
                editorEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }
    
    // Status indicator
    editorEl.addEventListener('input', function() {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        
        if (statusText) {
            statusText.textContent = 'Salvataggio...';
        }
        
        if (statusDot) {
            statusDot.classList.remove('saved');
            statusDot.classList.add('unsaved');
        }
        
        // Schedule auto-save
        setTimeout(() => {
            if (statusText) {
                statusText.textContent = 'Salvato';
            }
            
            if (statusDot) {
                statusDot.classList.remove('unsaved');
                statusDot.classList.add('saved');
            }
        }, 1000);
    });
});

console.log('editbored initialized');
