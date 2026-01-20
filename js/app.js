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
                            // Check if it's an image - insert directly as img tag
                            if (previewType.type === 'image') {
                                const img = document.createElement('img');
                                img.src = url;
                                img.alt = url.split('/').pop();
                                img.style.maxWidth = '100%';
                                img.style.height = 'auto';
                                img.style.display = 'block';
                                img.style.margin = '10px 0';
                                img.contentEditable = 'false';
                                
                                if (node.parentNode) {
                                    const pBefore = document.createElement('p');
                                    pBefore.innerHTML = '<br>';
                                    const pAfter = document.createElement('p');
                                    pAfter.innerHTML = '<br>';
                                    
                                    const fragment = document.createDocumentFragment();
                                    fragment.appendChild(pBefore);
                                    fragment.appendChild(img);
                                    fragment.appendChild(pAfter);
                                    
                                    node.parentNode.replaceChild(fragment, node);
                                    
                                    // Position cursor after image
                                    const range = document.createRange();
                                    range.setStart(pAfter, 0);
                                    range.collapse(true);
                                    const selection = window.getSelection();
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                }
                            } else {
                                // Create a temporary anchor element for other previews
                                const linkElement = document.createElement("a");
                                linkElement.href = url;
                                linkElement.textContent = url;
                                linkElement.target = "_blank";
                                
                                if (node.parentNode) {
                                    node.parentNode.replaceChild(linkElement, node);
                                    // Use createLinkPreview to create the preview
                                    await createLinkPreview(linkElement, url, previewType);
                                }
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
        
        const isInstagram = previewType.type === 'instagram';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-wrapper';
        wrapper.setAttribute('data-preview-id', previewId);
        
        // For Instagram, we need contentEditable=true so that Instagram's embed.js can process the blockquote
        // The blockquote itself will have contentEditable=false to prevent cursor issues
        if (!isInstagram) {
            wrapper.contentEditable = 'false'; // CRITICAL: prevents cursor from entering wrapper
        }
        
        const preview = document.createElement('div');
        preview.id = previewId;
        preview.className = `link-preview link-preview--${previewType.type}`;
        preview.innerHTML = previewContent;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'preview-remove-btn';
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        removeBtn.title = 'Rimuovi link';
        removeBtn.setAttribute('aria-label', 'Rimuovi link');
        removeBtn.contentEditable = 'false'; // Prevent button from capturing focus
        removeBtn.addEventListener('mousedown', function(e) {
            e.preventDefault(); // Prevent focus capture
        });
        removeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const editor = document.getElementById('editor');
            
            // Find the paragraph after wrapper for cursor position
            const nextSibling = wrapper.nextSibling;
            
            // Remove the wrapper
            wrapper.remove();
            
            // If there's a paragraph after, focus it
            if (nextSibling && (nextSibling.tagName === 'P' || nextSibling.tagName === 'DIV')) {
                nextSibling.focus();
                
                // Position cursor at start of paragraph
                const range = document.createRange();
                range.setStart(nextSibling, 0);
                range.collapse(true);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                // Create new paragraph if none exists
                if (editor) {
                    const p = document.createElement('p');
                    p.innerHTML = '<br>';
                    editor.appendChild(p);
                    p.focus();
                    
                    const range = document.createRange();
                    range.setStart(p, 0);
                    range.collapse(true);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
            
            if (editor) {
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (typeof window.showToast === 'function') {
                window.showToast('Link rimosso');
            }
        });
        
        wrapper.appendChild(preview);
        
        // For Instagram, add remove button inside the preview (since wrapper is editable)
        if (isInstagram) {
            removeBtn.style.position = 'absolute';
            removeBtn.style.top = '4px';
            removeBtn.style.right = '4px';
            removeBtn.style.zIndex = '1000';
            removeBtn.style.background = 'rgba(255,255,255,0.9)';
            removeBtn.style.border = '1px solid #ccc';
            removeBtn.style.borderRadius = '4px';
            removeBtn.style.padding = '4px';
            removeBtn.style.cursor = 'pointer';
            wrapper.style.position = 'relative';
            wrapper.style.maxWidth = '540px';
            wrapper.style.margin = '10px 0';
            preview.style.position = 'relative';
            preview.appendChild(removeBtn);
        } else {
            wrapper.appendChild(removeBtn);
        }

        if (linkElement.parentNode) {
            // Create guard paragraphs for cursor management
            const pBefore = document.createElement('p');
            pBefore.innerHTML = '<br>';
            const pAfter = document.createElement('p');
            pAfter.innerHTML = '<br>';
            
            // Create a fragment with guard rails
            const fragment = document.createDocumentFragment();
            fragment.appendChild(pBefore);
            fragment.appendChild(wrapper);
            fragment.appendChild(pAfter);
            
            // Insert the fragment
            linkElement.parentNode.replaceChild(fragment, linkElement);
            
            // Position cursor in the paragraph AFTER the wrapper
            setTimeout(() => {
                pAfter.focus();
                const range = document.createRange();
                range.setStart(pAfter, 0);
                range.collapse(true);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            }, 10);
        }

        if (isInstagram) {
            // For Instagram, trigger the embed script after insertion with a longer delay
            // to ensure the DOM is ready
            setTimeout(() => {
                if (window.instgrm && window.instgrm.Embeds) {
                    window.instgrm.Embeds.process();
                    console.log('Instagram embed processed');
                } else if (typeof instgrm !== 'undefined') {
                    instgrm.Embeds.process();
                    console.log('Instagram embed processed (fallback)');
                } else {
                    console.log('Instagram embed script not loaded yet');
                }
            }, 300);
        }

        window.linkPreviewCache = window.linkPreviewCache || new Map();
        window.linkPreviewCache.set(previewId, { url, type: previewType.type });
    };

    // Generate embed HTML
    window.generateEmbedHTML = function(url, previewType) {
        const domain = new URL(url).hostname;
        
        if (previewType.type === 'youtube') {
            // Extract video ID from various YouTube URL formats
            let videoId = null;
            let isShorts = false;
            
            if (url.includes('youtu.be/')) {
                const match = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
                if (match) {
                    videoId = match[1];
                    isShorts = true;
                }
            } else if (url.includes('/shorts/')) {
                const match = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
                if (match) {
                    videoId = match[1];
                    isShorts = true;
                }
            } else {
                const match = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
                if (match) {
                    videoId = match[1];
                }
            }
            
            if (videoId) {
                const aspectRatio = isShorts ? '177.78%' : '56.25%';
                return `<div class="link-preview link-preview--${isShorts ? 'youtube-shorts' : 'youtube'}" style="position:relative;padding-top:${aspectRatio};">
                    <iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
                </div>`;
            }
        }
        if (previewType.type === 'twitter') {
            const match = url.match(/(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/);
            const tweetId = match ? match[1] : '';
            return `<div class="link-preview link-preview--twitter"><a href="${url}" target="_blank"><iframe src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}" style="border:none;width:100%;height:350px;"></iframe></a></div>`;
        }
        if (previewType.type === 'instagram') {
            const isReel = url.includes('/reel/');
            let instaId = null;
            
            if (isReel) {
                const match = url.match(/instagram\.com\/reel\/([a-zA-Z0-9_-]+)/);
                if (match) instaId = match[1];
            } else {
                const match = url.match(/instagram\.com\/p\/([a-zA-Z0-9_-]+)/);
                if (match) instaId = match[1];
            }
            
            if (instaId) {
                // Use official Instagram blockquote format
                return `<blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="${url}" data-instgrm-version="14" style=" background:#FFF; border:0; border-radius:3px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:540px; min-width:326px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);"><div style="padding:16px;"><a href="${url}" style=" background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%;" target="_blank"><div style="display: flex; flex-direction: row; align-items: center;"><div style="background-color: #F4F4F4; border-radius: 50%; flex-grow: 0; height: 40px; margin-right: 14px; width: 40px;"></div><div style="display: flex; flex-direction: column; flex-grow: 1; justify-content: center;"><div style=" background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; margin-bottom: 6px; width: 100px;"></div><div style=" background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; width: 60px;"></div></div></div><div style="padding: 19% 0;"></div><div style="display:block; height:50px; margin:0 auto 12px; width:50px;"><svg width="50px" height="50px" viewBox="0 0 60 60" version="1.1" xmlns="https://www.w3.org/2000/svg"><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><g transform="translate(-511.000000, -20.000000)" fill="#000000"><g><path d="M556.869,30.41 C554.814,30.41 553.148,32.076 553.148,34.131 C553.148,36.186 554.814,37.852 556.869,37.852 C558.924,37.852 560.59,36.186 560.59,34.131 C560.59,32.076 558.924,30.41 556.869,30.41 M541,60.657 C535.114,60.657 530.342,55.887 530.342,50 C530.342,44.114 535.114,39.342 541,39.342 C546.887,39.342 551.658,44.114 551.658,50 C551.658,55.887 546.887,60.657 541,60.657 M541,33.886 C532.1,33.886 524.886,41.1 524.886,50 C524.886,58.899 532.1,66.113 541,66.113 C549.9,66.113 557.115,58.899 557.115,50 C557.115,41.1 549.9,33.886 541,33.886 M565.378,62.101 C565.244,65.022 564.756,66.606 564.346,67.663 C563.803,69.06 563.154,70.057 562.106,71.106 C561.058,72.155 560.06,72.803 558.662,73.347 C557.607,73.757 556.021,74.244 553.102,74.378 C549.944,74.521 548.997,74.552 541,74.552 C533.003,74.552 532.056,74.521 528.898,74.378 C525.979,74.244 524.393,73.757 523.338,73.347 C521.94,72.803 520.942,72.155 519.894,71.106 C518.846,70.057 518.197,69.06 517.654,67.663 C517.244,66.606 516.755,65.022 516.623,62.101 C516.479,58.943 516.448,57.996 516.448,50 C516.448,42.003 516.479,41.056 516.623,37.899 C516.755,34.978 517.244,33.391 517.654,32.338 C518.197,30.938 518.846,29.942 519.894,28.894 C520.942,27.846 521.94,27.196 523.338,26.654 C524.393,26.244 525.979,25.756 528.898,25.623 C532.057,25.479 533.004,25.448 541,25.448 C548.997,25.448 549.943,25.479 553.102,25.623 C556.021,25.756 557.607,26.244 558.662,26.654 C560.06,27.196 561.058,27.846 562.106,28.894 C563.154,29.942 563.803,30.938 564.346,32.338 C564.756,33.391 565.244,34.978 565.378,37.899 C565.522,41.056 565.552,42.003 565.552,50 C565.552,57.996 565.522,58.943 565.378,62.101"></path></g></g></g></svg></div><div style="padding-top: 8px;"><div style=" color:#3897f0; font-family:Arial,sans-serif; font-size:14px; font-style:normal; font-weight:550; line-height:18px;">Visualizza questo post su Instagram</div></div><div style="padding: 12.5% 0;"></div></a></div></blockquote>`;
            }
            // Fallback
            return `<div class="link-preview"><a href="${url}" target="_blank">${url}</a></div>`;
        }
        if (previewType.type === 'facebook') {
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
            return `<img src="${url}" alt="Image" style="max-width:100%;display:block;margin:10px 0;">`;
        }
        if (previewType.type === 'generic') {
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                const title = pathParts.length > 0 ? 
                    (pathParts[pathParts.length - 1].replace(/[-_]/g, ' ') || domain) : 
                    domain;
                
                return `<div class="link-preview link-preview--generic">
                    <a href="${url}" target="_blank" style="display:flex;align-items:center;gap:12px;padding:12px;text-decoration:none;color:inherit;">
                        <img src="${faviconUrl}" alt="" style="width:32px;height:32px;border-radius:4px;flex-shrink:0;">
                        <div style="min-width:0;">
                            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
                            <div style="font-size:12px;color:#666;margin-top:2px;">${domain}</div>
                        </div>
                    </a>
                </div>`;
            } catch (e) {
                return `<div class="link-preview"><a href="${url}" target="_blank">${url}</a></div>`;
            }
        }
        return null;
    };

    // Preview type detection
    window.previewTypes = {
        youtube: { regex: /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/, type: 'youtube' },
        youtube_shorts: { regex: /(?:youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]+)/, type: 'youtube' },
        twitter: { regex: /(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/, type: 'twitter' },
        x: { regex: /x\.com\/[a-zA-Z0-9_]+\/status\/(\d+)/, type: 'twitter' },
        instagram_post: { regex: /instagram\.com\/p\/([a-zA-Z0-9_-]+)/, type: 'instagram' },
        instagram_reel: { regex: /instagram\.com\/reel\/([a-zA-Z0-9_-]+)/, type: 'instagram' },
        facebook_post: { regex: /facebook\.com\/[a-zA-Z0-9_]+\/posts\/([a-zA-Z0-9_-]+)/, type: 'facebook' },
        facebook_video: { regex: /facebook\.com\/[a-zA-Z0-9_]+\/videos\/([a-zA-Z0-9_-]+)/, type: 'facebook' },
        facebook_reel: { regex: /facebook\.com\/reel\/([a-zA-Z0-9_-]+)/, type: 'facebook-reels' },
        tiktok: { regex: /(?:tiktok\.com\/@[\w.]+\/video\/|vm\.tiktok\.com\/)([0-9]+)/, type: 'tiktok' },
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
            { key: 'youtube_shorts', pattern: /(?:youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]+)/, type: 'youtube' },
            { key: 'youtube', pattern: /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/, type: 'youtube' },
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
        
        // Handle Enter in code blocks (pre)
        if (e.key === 'Enter' && !e.shiftKey) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const preEl = range.startContainer.parentElement.closest('pre');
                
                if (preEl) {
                    e.preventDefault();
                    
                    // Get the text typed so far
                    const typedText = preEl.textContent;
                    
                    // Create a paragraph with the text in code block format
                    const currentP = document.createElement('p');
                    const preNewEl = document.createElement('pre');
                    preNewEl.style.backgroundColor = '#282c34';
                    preNewEl.style.color = '#abb2bf';
                    preNewEl.style.padding = '16px';
                    preNewEl.style.borderRadius = '8px';
                    preNewEl.style.margin = '0.8em 0';
                    preNewEl.style.overflowX = 'auto';
                    
                    const codeNewEl = document.createElement('code');
                    codeNewEl.style.backgroundColor = 'transparent';
                    codeNewEl.style.color = '#abb2bf';
                    codeNewEl.style.fontFamily = "'SF Mono', 'Fira Code', 'Consolas', monospace";
                    codeNewEl.style.fontSize = '14px';
                    codeNewEl.style.lineHeight = '1.6';
                    codeNewEl.textContent = typedText;
                    
                    preNewEl.appendChild(codeNewEl);
                    currentP.appendChild(preNewEl);
                    
                    // Create a new paragraph for the next line
                    const newP = document.createElement('p');
                    newP.innerHTML = '<br>';
                    
                    // Insert both paragraphs
                    if (preEl.parentNode) {
                        preEl.parentNode.insertBefore(currentP, preEl);
                        if (preEl.nextSibling) {
                            preEl.parentNode.insertBefore(newP, preEl.nextSibling);
                        } else {
                            preEl.parentNode.appendChild(newP);
                        }
                        preEl.remove();
                        
                        // Focus the new paragraph
                        newP.focus();
                        
                        // Position cursor at start
                        const newRange = document.createRange();
                        newRange.setStart(newP, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    }
                    
                    // Trigger input event
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
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
            // Toggle the format
            document.execCommand(command, false, null);
            updateToolbarState();
            handleInput();
            return;
        }
        
        // Map custom format names to execCommand commands
        const commandMap = {
            'ul': 'insertUnorderedList',
            'ol': 'insertOrderedList',
            'quote': 'formatBlock',
            'code': 'formatInline',
            'codeblock': 'formatBlock',
            'link': 'createLink',
            'h1': 'formatBlock',
            'h2': 'formatBlock',
            'h3': 'formatBlock'
        };
        
        // Map value for formatBlock commands
        const valueMap = {
            'quote': 'blockquote',
            'codeblock': 'pre',
            'h1': 'h1',
            'h2': 'h2',
            'h3': 'h3'
        };
        
        // Handle special cases
        if (command === 'link') {
            const url = prompt('Enter URL:', 'https://');
            if (url) {
                document.execCommand('createLink', false, url);
            }
        } else if (command === 'image') {
            // Image handling is done via modal, not execCommand
            const imageModal = document.getElementById('imageModal');
            if (imageModal) {
                imageModal.style.display = 'flex';
            }
        } else if (command === 'code') {
            // Inline code - toggle between wrapping selection or inserting placeholder
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            
            const range = selection.getRangeAt(0);
            const selectedText = range.toString();
            
            // Check if selection is already inside a code element
            let codeElement = range.commonAncestorContainer;
            // If it's a text node, start from its parent
            if (codeElement.nodeType === Node.TEXT_NODE) {
                codeElement = codeElement.parentNode;
            }
            while (codeElement && codeElement.nodeType !== Node.DOCUMENT_NODE) {
                if (codeElement.tagName === 'CODE') {
                    // Check if it's a placeholder
                    if (codeElement.dataset.placeholder === 'true') {
                        // Remove the placeholder
                        const parent = codeElement.parentNode;
                        parent.removeChild(codeElement);
                        // Move cursor to where the placeholder was
                        const newRange = document.createRange();
                        newRange.setStart(parent, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    } else if (codeElement.textContent === 'code' && codeElement.style.color === 'rgb(153, 153, 153)') {
                        // Legacy placeholder without data attribute
                        const parent = codeElement.parentNode;
                        parent.removeChild(codeElement);
                        const newRange = document.createRange();
                        newRange.setStart(parent, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    } else {
                        // Unwrap the code element
                        const parent = codeElement.parentNode;
                        const text = codeElement.textContent;
                        const textNode = document.createTextNode(text);
                        parent.replaceChild(textNode, codeElement);
                    }
                    updateToolbarState();
                    handleInput();
                    return;
                }
                codeElement = codeElement.parentNode;
            }
            
            if (selectedText) {
                // Wrap selection in code tags
                const codeEl = document.createElement('code');
                codeEl.style.backgroundColor = '#f4f4f4';
                codeEl.style.padding = '2px 4px';
                codeEl.style.borderRadius = '3px';
                codeEl.style.fontFamily = 'monospace';
                codeEl.textContent = selectedText;
                
                range.deleteContents();
                range.insertNode(codeEl);
                
                // Move cursor after the code element
                const newRange = document.createRange();
                newRange.setStartAfter(codeEl);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                // Insert placeholder
                const codeEl = document.createElement('code');
                codeEl.textContent = 'code';
                codeEl.dataset.placeholder = 'true';
                codeEl.style.backgroundColor = '#f4f4f4';
                codeEl.style.padding = '2px 4px';
                codeEl.style.borderRadius = '3px';
                codeEl.style.fontFamily = 'monospace';
                codeEl.style.color = '#999';
                
                range.insertNode(codeEl);
                
                // Move cursor inside the code element
                const newRange = document.createRange();
                newRange.setStart(codeEl.firstChild, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
        } else if (command === 'codeblock') {
            // Toggle code block or insert placeholder
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            
            const range = selection.getRangeAt(0);
            let currentBlock = range.commonAncestorContainer;
            // If it's a text node, start from its parent
            if (currentBlock.nodeType === Node.TEXT_NODE) {
                currentBlock = currentBlock.parentNode;
            }
            
            // Find if we're already inside a pre element
            while (currentBlock && currentBlock.nodeType !== Node.DOCUMENT_NODE) {
                if (currentBlock.tagName === 'PRE') {
                    // Check if it's a placeholder
                    if (currentBlock.dataset.placeholder === 'true') {
                        // Remove the placeholder
                        const parent = currentBlock.parentNode;
                        parent.removeChild(currentBlock);
                        // Move cursor to where the placeholder was
                        const newRange = document.createRange();
                        newRange.setStart(parent, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    } else if (currentBlock.textContent === 'code block') {
                        // Legacy placeholder without data attribute - treat as placeholder
                        const parent = currentBlock.parentNode;
                        parent.removeChild(currentBlock);
                        const newRange = document.createRange();
                        newRange.setStart(parent, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    } else {
                        // We're in a real code block, convert back to paragraph
                        const parent = currentBlock.parentNode;
                        const text = currentBlock.textContent;
                        const p = document.createElement('p');
                        p.textContent = text;
                        parent.replaceChild(p, currentBlock);
                    }
                    updateToolbarState();
                    handleInput();
                    return;
                }
                currentBlock = currentBlock.parentNode;
            }
            
            const selectedText = range.toString();
            
            if (selectedText) {
                // Wrap selection in pre > code
                const preEl = document.createElement('pre');
                preEl.style.backgroundColor = '#282c34';
                preEl.style.color = '#abb2bf';
                preEl.style.padding = '16px';
                preEl.style.borderRadius = '8px';
                preEl.style.margin = '0.8em 0';
                preEl.style.overflowX = 'auto';
                
                const codeEl = document.createElement('code');
                codeEl.style.backgroundColor = 'transparent';
                codeEl.style.color = '#abb2bf';
                codeEl.style.fontFamily = "'SF Mono', 'Fira Code', 'Consolas', monospace";
                codeEl.style.fontSize = '14px';
                codeEl.style.lineHeight = '1.6';
                codeEl.textContent = selectedText;
                
                preEl.appendChild(codeEl);
                range.deleteContents();
                range.insertNode(preEl);
                
                // Move cursor inside the pre
                const newRange = document.createRange();
                newRange.setStart(preEl, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                // Insert placeholder
                const preEl = document.createElement('pre');
                preEl.dataset.placeholder = 'true';
                preEl.textContent = 'code block';
                preEl.style.backgroundColor = '#282c34';
                preEl.style.color = '#abb2bf';
                preEl.style.padding = '16px';
                preEl.style.borderRadius = '8px';
                preEl.style.margin = '0.8em 0';
                preEl.style.overflowX = 'auto';
                
                range.insertNode(preEl);
                
                // Move cursor INSIDE the pre so clicking the button again detects it
                const newRange = document.createRange();
                newRange.setStart(preEl.firstChild, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
        } else {
            // Use mapped command
            const execCmd = commandMap[command] || command;
            const execValue = valueMap[command] || value;
            document.execCommand(execCmd, false, execValue);
        }
        
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
        placeholder: 'Start writing...'
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
    
    // Image modal event handlers
    const imageModal = document.getElementById('imageModal');
    const uploadFromComputer = document.getElementById('uploadFromComputer');
    const imageFileInput = document.getElementById('imageFileInput');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const insertFromUrlBtn = document.getElementById('insertFromUrlBtn');
    const imageUrlInput = document.getElementById('imageUrlInput');
    
    // Open file picker when clicking "upload from computer"
    if (uploadFromComputer && imageFileInput) {
        uploadFromComputer.addEventListener('click', function() {
            imageFileInput.click();
        });
    }
    
    // Handle file selection
    let pendingImageData = null;
    if (imageFileInput) {
        imageFileInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    pendingImageData = {
                        data: e.target.result,
                        name: file.name
                    };
                    // Show preview
                    const previewContainer = document.getElementById('imagePreview');
                    const previewImage = document.getElementById('previewImage');
                    if (previewContainer && previewImage) {
                        previewImage.src = pendingImageData.data;
                        previewContainer.style.display = 'block';
                        document.getElementById('imageUrlSection').style.display = 'none';
                    }
                };
                reader.readAsDataURL(file);
            }
            // Reset input
            event.target.value = '';
        });
    }
    
    // Confirm image insertion
    const confirmImageBtn = document.getElementById('confirmImageBtn');
    if (confirmImageBtn) {
        confirmImageBtn.addEventListener('click', function() {
            if (pendingImageData) {
                const editorEl = document.getElementById('editor');
                if (editorEl) {
                    editorEl.focus();
                    const imgHtml = `<img src="${pendingImageData.data}" alt="${pendingImageData.name}" style="max-width:100%;display:block;margin:10px 0;">`;
                    document.execCommand('insertHTML', false, imgHtml);
                    handleInput();
                }
            }
            // Reset modal
            pendingImageData = null;
            if (imageModal) imageModal.style.display = 'none';
            const previewContainer = document.getElementById('imagePreview');
            const imageUrlSection = document.getElementById('imageUrlSection');
            if (previewContainer) previewContainer.style.display = 'none';
            if (imageUrlSection) imageUrlSection.style.display = 'block';
        });
    }
    
    // Cancel image selection
    const cancelImageBtn = document.getElementById('cancelImageBtn');
    if (cancelImageBtn) {
        cancelImageBtn.addEventListener('click', function() {
            pendingImageData = null;
            const previewContainer = document.getElementById('imagePreview');
            const imageUrlSection = document.getElementById('imageUrlSection');
            if (previewContainer) previewContainer.style.display = 'none';
            if (imageUrlSection) imageUrlSection.style.display = 'block';
        });
    }
    
    // Close modal handlers
    if (modalCloseBtn && imageModal) {
        modalCloseBtn.addEventListener('click', function() {
            pendingImageData = null;
            const previewContainer = document.getElementById('imagePreview');
            const imageUrlSection = document.getElementById('imageUrlSection');
            if (previewContainer) previewContainer.style.display = 'none';
            if (imageUrlSection) imageUrlSection.style.display = 'block';
            imageModal.style.display = 'none';
        });
    }
    
    if (cancelModalBtn && imageModal) {
        cancelModalBtn.addEventListener('click', function() {
            pendingImageData = null;
            const previewContainer = document.getElementById('imagePreview');
            const imageUrlSection = document.getElementById('imageUrlSection');
            if (previewContainer) previewContainer.style.display = 'none';
            if (imageUrlSection) imageUrlSection.style.display = 'block';
            imageModal.style.display = 'none';
        });
    }
    
    // Close modal when clicking outside
    if (imageModal) {
        imageModal.addEventListener('click', function(event) {
            if (event.target === imageModal) {
                imageModal.style.display = 'none';
            }
        });
    }
    
    // Insert image from URL
    if (insertFromUrlBtn && imageUrlInput && imageModal) {
        insertFromUrlBtn.addEventListener('click', function() {
            const url = imageUrlInput.value.trim();
            if (url) {
                const imgHtml = `<img src="${url}" alt="Image" style="max-width:100%;display:block;margin:10px 0;">`;
                document.execCommand('insertHTML', false, imgHtml);
                handleInput();
                imageUrlInput.value = '';
                imageModal.style.display = 'none';
            }
        });
    }
    
    // Status indicator and placeholder removal
    const editorEl = document.getElementById('editor');
    
    // Use MutationObserver to detect changes and fix placeholders immediately
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'characterData') {
                const node = mutation.target;
                
                // Check if we're inside a code placeholder
                if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
                    const parent = node.parentNode;
                    
                    if (parent.tagName === 'CODE' && parent.dataset.placeholder === 'true') {
                        const text = node.textContent;
                        if (text.startsWith('code') && text.length > 4) {
                            // User typed before the placeholder text
                            const userText = text.substring(4);
                            parent.textContent = userText;
                            parent.removeAttribute('data-placeholder');
                            parent.style.color = '';
                            
                            // Move cursor to end
                            const selection = window.getSelection();
                            if (selection) {
                                const range = document.createRange();
                                range.setStart(node, node.length);
                                range.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(range);
                            }
                        }
                    }
                    
                    // Check if we're inside a pre placeholder
                    if (parent.tagName === 'PRE' && parent.dataset.placeholder === 'true') {
                        const text = node.textContent;
                        if (text.startsWith('code block') && text.length > 10) {
                            // User typed before the placeholder text
                            const userText = text.substring(10);
                            parent.textContent = userText;
                            parent.removeAttribute('data-placeholder');
                            
                            // Move cursor to end
                            const selection = window.getSelection();
                            if (selection) {
                                const range = document.createRange();
                                range.setStart(node, node.length);
                                range.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(range);
                            }
                        }
                    }
                }
            }
        });
    });
    
    observer.observe(editorEl, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true
    });
    
    // Also handle keydown to intercept typing in placeholders
    editorEl.addEventListener('keydown', function(e) {
        // Handle Enter key to exit inline code formatting
        if (e.key === 'Enter') {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            
            const range = selection.getRangeAt(0);
            let node = range.startContainer;
            
            // Check if we're inside an inline code element
            if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
                const parent = node.parentNode;
                
                if (parent.tagName === 'CODE') {
                    // Exit inline code formatting on Enter
                    e.preventDefault();
                    
                    // Get the text typed so far
                    const typedText = node.textContent;
                    
                    // Create a paragraph with the text in inline code
                    const currentP = document.createElement('p');
                    const codeEl = document.createElement('code');
                    codeEl.style.backgroundColor = '#f4f4f4';
                    codeEl.style.padding = '2px 4px';
                    codeEl.style.borderRadius = '3px';
                    codeEl.style.fontFamily = 'monospace';
                    codeEl.textContent = typedText;
                    currentP.appendChild(codeEl);
                    
                    // Create a new paragraph for the next line
                    const newP = document.createElement('p');
                    newP.innerHTML = '<br>';
                    
                    // Insert both paragraphs
                    if (parent.parentNode) {
                        parent.parentNode.insertBefore(currentP, parent);
                        if (parent.nextSibling) {
                            parent.parentNode.insertBefore(newP, parent.nextSibling);
                        } else {
                            parent.parentNode.appendChild(newP);
                        }
                        parent.remove();
                        
                        // Focus the new paragraph
                        newP.focus();
                        
                        // Position cursor at start
                        const newRange = document.createRange();
                        newRange.setStart(newP, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    }
                    
                    // Trigger input event
                    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
                    return;
                }
            }
        }
        
        // Only handle regular character keys (not special keys like Enter, Tab, etc.)
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            
            const range = selection.getRangeAt(0);
            let node = range.startContainer;
            
            // Check if we're in a code placeholder
            if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
                const parent = node.parentNode;
                
                if (parent.tagName === 'CODE' && parent.dataset.placeholder === 'true') {
                    // Prevent default insertion
                    e.preventDefault();
                    
                    // Clear placeholder and insert the typed character
                    parent.textContent = e.key;
                    parent.removeAttribute('data-placeholder');
                    parent.style.color = '';
                    
                    // Get reference to the NEW text node that was created
                    const newNode = parent.firstChild;
                    
                    // Position cursor at end
                    const newRange = document.createRange();
                    newRange.setStart(newNode, newNode.length);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    
                    // Trigger input event
                    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                // Check if we're in a pre placeholder
                if (parent.tagName === 'PRE' && parent.dataset.placeholder === 'true') {
                    // Prevent default insertion
                    e.preventDefault();
                    
                    // Clear placeholder and insert the typed character
                    parent.textContent = e.key;
                    parent.removeAttribute('data-placeholder');
                    
                    // Get reference to the NEW text node that was created
                    const newNode = parent.firstChild;
                    
                    // Position cursor at end
                    const newRange = document.createRange();
                    newRange.setStart(newNode, newNode.length);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    
                    // Trigger input event
                    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        }
    });
    
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
    
    // New document button handler
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to create a new document? All current content will be lost.')) {
                // Clear editor content
                const editor = document.getElementById('editor');
                if (editor) {
                    editor.innerHTML = '';
                }
                // Clear markdown textarea if in markdown mode
                const sourceCodeArea = document.getElementById('sourceCodeDisplay');
                if (sourceCodeArea) {
                    sourceCodeArea.value = '';
                }
                // If in markdown mode, switch back to rich text
                if (typeof markdownMode !== 'undefined' && markdownMode) {
                    markdownMode = false;
                    if (toolbar) toolbar.style.display = '';
                    if (editor) editor.style.display = 'block';
                    if (sourceCodeArea) sourceCodeArea.style.display = 'none';
                    const markdownToolbar = document.getElementById('markdownToolbar');
                    if (markdownToolbar) markdownToolbar.style.display = 'none';
                    if (markdownToggle) markdownToggle.classList.remove('active');
                }
                // Clear localStorage
                localStorage.removeItem('editbored_content');
                localStorage.removeItem('editbored_title');
                window.showToast('Documento ripristinato');
            }
        });
    }
    
    // Markdown toggle button handler
    const markdownToggle = document.getElementById('markdownToggle');
    const toolbar = document.getElementById('toolbar');
    const header = document.querySelector('header');
    const sourceCodeArea = document.getElementById('sourceCodeDisplay');
    let markdownMode = false;
    
    // Initialize Turndown service for HTML to Markdown conversion
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
    });
    
    // Back to Rich Text button handler
    const backToRichTextBtn = document.getElementById('backToRichText');
    
    if (markdownToggle) {
        markdownToggle.addEventListener('click', function() {
            markdownMode = !markdownMode;
            
            if (markdownMode) {
                // Switch to markdown mode
                // Hide toolbar and editor, show source code textarea
                if (toolbar) toolbar.style.display = 'none';
                editorEl.style.display = 'none';
                
                // Convert HTML content to Markdown using Turndown
                const editorContent = editorEl.innerHTML;
                const markdownContent = turndownService.turndown(editorContent);
                
                // Show and populate the source code textarea
                if (sourceCodeArea) {
                    sourceCodeArea.value = markdownContent;
                    sourceCodeArea.style.display = 'block';
                }
                
                // Show the markdown toolbar with back button
                if (markdownToolbar) {
                    markdownToolbar.style.display = 'flex';
                }
                
                markdownToggle.classList.add('active');
            } else {
                // Switch back to rich text mode
                if (toolbar) toolbar.style.display = '';
                editorEl.style.display = 'block';
                
                // Hide source code area and markdown toolbar
                if (sourceCodeArea) {
                    sourceCodeArea.style.display = 'none';
                }
                if (markdownToolbar) {
                    markdownToolbar.style.display = 'none';
                }
                
                // Convert Markdown back to HTML using marked
                if (sourceCodeArea) {
                    const markdownContent = sourceCodeArea.value;
                    const htmlContent = marked.parse(markdownContent);
                    editorEl.innerHTML = htmlContent;
                    
                    // Trigger input event to update any listeners and save functionality
                    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                markdownToggle.classList.remove('active');
            }
        });
    }
    
    // Handle back to rich text button click
    if (backToRichTextBtn) {
        backToRichTextBtn.addEventListener('click', function() {
            markdownMode = false;
            
            // Switch back to rich text mode
            if (toolbar) toolbar.style.display = '';
            editorEl.style.display = 'block';
            
            // Hide source code area and markdown toolbar
            if (sourceCodeArea) {
                sourceCodeArea.style.display = 'none';
            }
            if (markdownToolbar) {
                markdownToolbar.style.display = 'none';
            }
            
            // Convert Markdown back to HTML using marked
            if (sourceCodeArea) {
                const markdownContent = sourceCodeArea.value;
                const htmlContent = marked.parse(markdownContent);
                editorEl.innerHTML = htmlContent;
                
                // Trigger input event to update any listeners and save functionality
                editorEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // Update toggle button state
            if (markdownToggle) {
                markdownToggle.classList.remove('active');
            }
        });
    }
});

console.log('editbored initialized');
