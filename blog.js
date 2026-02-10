// ========================================
// Regen Studio — Blog Logic
// ========================================

(function () {
  'use strict';

  // --- Shared: Navbar scroll & mobile toggle ---
  function initNav() {
    const nav = document.getElementById('nav');
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    if (!nav) return;

    const onScroll = () => {
      nav.classList.toggle('nav--scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (navToggle && navLinks) {
      navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navLinks.classList.toggle('open');
        document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
      });

      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          navToggle.classList.remove('active');
          navLinks.classList.remove('open');
          document.body.style.overflow = '';
        });
      });
    }
  }

  // --- Utility: Reading time ---
  function calcReadingTime(html) {
    const text = html.replace(/<[^>]*>/g, '');
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 230));
  }

  // --- Utility: Format date ---
  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // --- Data loading ---
  async function loadBlogs() {
    const resp = await fetch('Blogs/blogs.json');
    const folders = await resp.json();

    const blogs = await Promise.all(folders.map(async (folder) => {
      const [metaResp, contentResp] = await Promise.all([
        fetch(`Blogs/${folder}/meta.json`),
        fetch(`Blogs/${folder}/content.html`)
      ]);
      const meta = await metaResp.json();
      const content = await contentResp.text();
      return { ...meta, content, readingTime: calcReadingTime(content) };
    }));

    return blogs.filter(b => b.published).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // --- Related posts (weighted scoring) ---
  function getRelatedPosts(current, allPosts, max) {
    max = max || 3;
    const scored = allPosts
      .filter(p => p.slug !== current.slug)
      .map(p => {
        let score = 0;
        current.categories.forEach(c => {
          if (p.categories.includes(c)) score += 3;
        });
        current.tags.forEach(t => {
          if (p.tags.includes(t)) score += 1;
        });
        return { post: p, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, max).map(s => s.post);
  }

  // --- SVG icons ---
  const icons = {
    calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    image: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    search: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    linkedin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l7.07 8.51L4 20h2.18l5.48-5.81L16 20h4l-7.45-8.96L19.67 4H17.5l-5.09 5.4L8 4H4z"/></svg>',
    link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
  };

  // --- Card renderer ---
  function renderCard(post) {
    const imageHtml = post.featuredImage
      ? `<div class="blog-card__image"><img src="Blogs/${post.slug}/${post.featuredImage}" alt="${post.featuredImageAlt || ''}" loading="lazy"></div>`
      : `<div class="blog-card__image"><div class="blog-card__image-placeholder">${icons.image}</div></div>`;

    const cats = post.categories.map(c => `<span class="blog-card__category">${c}</span>`).join('');

    return `
      <article class="blog-card">
        <a href="blog-post.html?post=${encodeURIComponent(post.slug)}">
          ${imageHtml}
        </a>
        <div class="blog-card__body">
          <div class="blog-card__categories">${cats}</div>
          <h3 class="blog-card__title">
            <a href="blog-post.html?post=${encodeURIComponent(post.slug)}">${post.title}</a>
          </h3>
          <p class="blog-card__excerpt">${post.excerpt}</p>
          <div class="blog-card__meta">
            <span>${icons.user} ${post.author.name}</span>
            <span>${icons.calendar} ${formatDate(post.date)}</span>
            <span>${icons.clock} ${post.readingTime} min read</span>
          </div>
        </div>
      </article>
    `;
  }

  // ========================================
  // Blog Listing Page
  // ========================================
  async function initBlogListing() {
    const grid = document.getElementById('blogGrid');
    const catContainer = document.getElementById('categoryFilters');
    const tagContainer = document.getElementById('tagFilters');

    if (!grid) return;

    const blogs = await loadBlogs();

    // Collect all categories and tags with counts
    const catCounts = {};
    const tagCounts = {};
    blogs.forEach(b => {
      b.categories.forEach(c => { catCounts[c] = (catCounts[c] || 0) + 1; });
      b.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });

    // Render filter pills
    function renderPills(container, counts, type) {
      container.innerHTML = Object.entries(counts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) =>
          `<button class="filter-pill" data-type="${type}" data-value="${name}">${name} <span class="filter-pill__count">${count}</span></button>`
        ).join('');
    }

    renderPills(catContainer, catCounts, 'category');
    renderPills(tagContainer, tagCounts, 'tag');

    // Filter state
    let activeCategories = new Set();
    let activeTags = new Set();

    function readHashState() {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      activeCategories.clear();
      activeTags.clear();

      if (!hash) return;
      const params = new URLSearchParams(hash);
      (params.get('cat') || '').split(',').filter(Boolean).forEach(c => activeCategories.add(c));
      (params.get('tag') || '').split(',').filter(Boolean).forEach(t => activeTags.add(t));
    }

    function writeHashState() {
      const parts = [];
      if (activeCategories.size) parts.push('cat=' + [...activeCategories].join(','));
      if (activeTags.size) parts.push('tag=' + [...activeTags].join(','));
      window.location.hash = parts.length ? encodeURIComponent(parts.join('&')) : '';
    }

    function updatePillStates() {
      document.querySelectorAll('.filter-pill[data-type="category"]').forEach(btn => {
        btn.classList.toggle('active', activeCategories.has(btn.dataset.value));
      });
      document.querySelectorAll('.filter-pill[data-type="tag"]').forEach(btn => {
        btn.classList.toggle('active', activeTags.has(btn.dataset.value));
      });
    }

    function filterAndRender() {
      const filtered = blogs.filter(b => {
        const catMatch = activeCategories.size === 0 || [...activeCategories].every(c => b.categories.includes(c));
        const tagMatch = activeTags.size === 0 || [...activeTags].every(t => b.tags.includes(t));
        return catMatch && tagMatch;
      });

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="blog-no-results">
            <div class="blog-no-results__icon">${icons.search}</div>
            <h3 class="blog-no-results__title">No posts found</h3>
            <p class="blog-no-results__text">Try adjusting your filters to find what you're looking for.</p>
            <button class="btn btn--outline btn--small" id="clearFilters">Clear all filters</button>
          </div>
        `;
        document.getElementById('clearFilters').addEventListener('click', () => {
          activeCategories.clear();
          activeTags.clear();
          writeHashState();
          updatePillStates();
          filterAndRender();
        });
      } else {
        grid.innerHTML = filtered.map(renderCard).join('');
      }
    }

    // Pill click handler (delegated)
    document.querySelector('.blog-filters').addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;

      const type = pill.dataset.type;
      const value = pill.dataset.value;
      const set = type === 'category' ? activeCategories : activeTags;

      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }

      writeHashState();
      updatePillStates();
      filterAndRender();
    });

    // Init from hash
    readHashState();
    updatePillStates();
    filterAndRender();

    // Hash change
    window.addEventListener('hashchange', () => {
      readHashState();
      updatePillStates();
      filterAndRender();
    });
  }

  // ========================================
  // Blog Post Page
  // ========================================
  async function initBlogPost() {
    const postContainer = document.getElementById('postContent');
    if (!postContainer) return;

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('post');
    if (!slug) {
      window.location.href = 'blog.html';
      return;
    }

    const blogs = await loadBlogs();
    const post = blogs.find(b => b.slug === slug);
    if (!post) {
      window.location.href = 'blog.html';
      return;
    }

    // Set page title
    document.title = `${post.title} | Regen Studio Blog`;

    // Render header
    const headerEl = document.getElementById('postHeader');
    headerEl.innerHTML = `
      <div class="container">
        <a href="blog.html" class="post-header__back">${icons.arrow} Back to Blog</a>
        <div class="post-header__categories">
          ${post.categories.map(c => `<span class="post-header__category">${c}</span>`).join('')}
        </div>
        <h1 class="post-header__title">${post.title}</h1>
        ${post.subtitle ? `<p class="post-header__subtitle">${post.subtitle}</p>` : ''}
        <div class="post-header__meta">
          <div class="post-header__author">
            <span class="post-header__author-name">${post.author.name}</span>
            ${post.author.role ? `<span class="post-header__author-role">${post.author.role}</span>` : ''}
          </div>
          <div class="post-header__meta-divider"></div>
          <div class="post-header__meta-item">${icons.calendar} ${formatDate(post.date)}</div>
          <div class="post-header__meta-divider"></div>
          <div class="post-header__meta-item">${icons.clock} ${post.readingTime} min read</div>
        </div>
      </div>
    `;

    // Render featured image
    const featuredEl = document.getElementById('postFeaturedImage');
    if (post.featuredImage) {
      featuredEl.innerHTML = `
        <div class="container">
          <img src="Blogs/${post.slug}/${post.featuredImage}" alt="${post.featuredImageAlt || ''}">
        </div>
      `;
    } else {
      featuredEl.style.display = 'none';
    }

    // Render content
    postContainer.innerHTML = `
      <div class="post-content__inner">
        <div class="post-content__body">${post.content}</div>
        <div class="post-tags" id="postTags">
          ${post.tags.map(t => `<a href="blog.html#${encodeURIComponent('tag=' + t)}" class="post-tag">#${t}</a>`).join('')}
        </div>
        <div class="post-share">
          <p class="post-share__label">Share this article</p>
          <div class="post-share__buttons">
            <button class="share-btn" id="shareLinkedIn">${icons.linkedin} LinkedIn</button>
            <button class="share-btn" id="shareX">${icons.x} X</button>
            <button class="share-btn" id="shareCopy">${icons.link} Copy link</button>
          </div>
        </div>
      </div>
    `;

    // Share button handlers
    const pageUrl = window.location.href;
    const pageTitle = post.title;

    document.getElementById('shareLinkedIn').addEventListener('click', () => {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`, '_blank', 'width=600,height=500');
    });

    document.getElementById('shareX').addEventListener('click', () => {
      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(pageTitle)}&url=${encodeURIComponent(pageUrl)}`, '_blank', 'width=600,height=500');
    });

    document.getElementById('shareCopy').addEventListener('click', function () {
      navigator.clipboard.writeText(pageUrl).then(() => {
        this.classList.add('share-btn--copied');
        this.innerHTML = `${icons.link} Copied!`;
        setTimeout(() => {
          this.classList.remove('share-btn--copied');
          this.innerHTML = `${icons.link} Copy link`;
        }, 2000);
      });
    });

    // Related posts
    const related = getRelatedPosts(post, blogs, 3);
    const relatedSection = document.getElementById('relatedPosts');

    if (related.length > 0) {
      relatedSection.innerHTML = `
        <div class="container">
          <h2 class="related-posts__title">Related Articles</h2>
          <div class="related-posts__grid">
            ${related.map(renderCard).join('')}
          </div>
        </div>
      `;
    } else {
      relatedSection.style.display = 'none';
    }
  }

  // ========================================
  // Init
  // ========================================
  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initBlogListing();
    initBlogPost();
  });
})();
