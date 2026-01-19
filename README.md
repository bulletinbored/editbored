# editbored

A lightweight WYSIWYG Markdown editor with automatic link previews and embedded media support.

## Features

- **WYSIWYG Editing** - Write in Markdown and see formatted output in real-time
- **Automatic Link Previews** - Paste links and get rich preview cards for:
  - YouTube and Vimeo videos
  - Twitter/X posts
  - Facebook posts and videos
  - Instagram posts
  - TikTok videos
  - Direct image URLs
  - Generic URLs with favicons
- **Markdown Toolbar** - Quick formatting buttons for common elements
- **Keyboard Shortcuts** - Ctrl+B for bold, Ctrl+I for italic, Ctrl+S to save
- **Auto-save** - Content is automatically saved to local storage
- **Export** - Download your document as a .md file
- **Syntax Highlighting** - Code blocks with automatic language detection

## Getting Started

### Prerequisites

A modern web browser (Chrome, Firefox, Safari, Edge).

### Installation

Simply open `markdown-editor.html` in your browser. No server or build process required.

```
open markdown-editor.html
```

Or serve it with any static file server:

```bash
npx serve .
python -m http.server 8000
```

## Usage

### Writing Markdown

Type standard Markdown syntax in the editor. The content is rendered as formatted HTML as you type.

#### Text Formatting

| Markdown | Result |
|----------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `~~strikethrough~~` | ~~strikethrough~~ |
| `` `code` `` | `code` |

#### Headings

```
# Heading 1
## Heading 2
### Heading 3
```

#### Lists

```
- Bullet list item
- Another item

1. Numbered item
2. Another numbered item

- [ ] Task to complete
- [x] Completed task
```

#### Links and Images

```
[Link text](https://example.com)

![Image description](https://example.com/image.jpg)
```

#### Code Blocks

```markdown
```javascript
function greet(name) {
    return `Hello, ${name}!`;
}
```
```

#### Quotes

```
> "Simplicity is the ultimate sophistication."
> — Leonardo da Vinci
```

#### Tables

```
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
```

### Link Previews

Paste a URL on its own line to automatically generate a preview card:

- **YouTube**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- **Twitter/X**: `https://twitter.com/user/status/1234567890`
- **Vimeo**: `https://vimeo.com/123456789`
- **Facebook**: `https://www.facebook.com/user/posts/123456789`
- **Instagram**: `https://www.instagram.com/p/abc123/`
- **TikTok**: `https://www.tiktok.com/@user/video/1234567890`
- **Images**: `https://example.com/image.png`
- **Generic**: Any other URL becomes a card with favicon

### Toolbar Reference

| Button | Action | Shortcut |
|--------|--------|----------|
| **B** | Bold | Ctrl+B |
| *I* | Italic | Ctrl+I |
| • | Bullet List | - |
| 1. | Numbered List | 1. |
| 🔗 | Insert Link | |
| 🖼️ | Insert Image | |
| `<>` | Inline Code | |
| {} | Code Block | |
| ❝ | Quote | |

### Actions

- **New** - Clear the document and start fresh
- **Export .md** - Download the current document as a Markdown file

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + B | Bold |
| Ctrl/Cmd + I | Italic |
| Ctrl/Cmd + S | Save |

## Architecture

### Core Components

- **Editor** - Contenteditable div with custom Markdown parsing
- **Link Preview System** - Detects URLs and generates embed cards
- **Auto-save** - LocalStorage-based persistence
- **Syntax Highlighting** - Highlight.js integration

### File Structure

```
markdown-editor.html    # Main application (self-contained)
LICENSE                 # MIT License
README.md               # This file
```

### Technical Details

- No build step required - single HTML file with embedded CSS and JavaScript
- Uses browser native `contenteditable` for editing
- Marked.js for Markdown parsing
- Highlight.js for code syntax highlighting
- Twitter Widget Script for tweet embeds
- No external dependencies (CDN only)

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

MIT License

Copyright (c) 2026 Mario Grasso

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.