// ========================================
// Regen Studio — Blog Logic
// ========================================

(function () {
  'use strict';

  // --- i18n helper: translate dynamic strings ---
  // Uses window.__i18n.t(key, fallback) from i18n.js. Falls back to English if i18n.js
  // hasn't loaded yet or if no translation exists for the key.
  var _i18n = window.__i18n || { t: function (k, f) { return f || k; }, lang: 'en' };
  function t(key, fallback) { return _i18n.t(key, fallback); }

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

    // Nav contact popover
    const navContactBtn = document.getElementById('navContactBtn');
    const navContactPopover = document.getElementById('navContactPopover');
    if (navContactBtn && navContactPopover) {
      navContactBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        navContactPopover.classList.toggle('open');
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav__contact-wrap')) {
          navContactPopover.classList.remove('open');
        }
      });
    }

    if (navToggle && navLinks) {
      let savedScrollY = 0;

      function openNav() {
        savedScrollY = window.scrollY;
        document.body.classList.add('nav-open');
        document.body.style.top = -savedScrollY + 'px';
        navToggle.classList.add('active');
        navLinks.classList.add('open');
      }

      function closeNav() {
        document.body.classList.remove('nav-open');
        document.body.style.top = '';
        window.scrollTo(0, savedScrollY);
        navToggle.classList.remove('active');
        navLinks.classList.remove('open');
      }

      navToggle.addEventListener('click', () => {
        if (navLinks.classList.contains('open')) {
          closeNav();
        } else {
          openNav();
        }
      });

      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          closeNav();
        });
      });

      // Close menu on orientation change
      window.addEventListener('orientationchange', () => {
        if (navLinks.classList.contains('open')) {
          closeNav();
        }
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
    var dateLocale = langCode === 'nl' ? 'nl-NL' : langCode === 'pt' ? 'pt-BR' : 'en-US';
    return d.toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // --- Locale detection ---
  var pageLang = document.documentElement.lang || 'en';
  var langCode = pageLang === 'nl' ? 'nl' : pageLang === 'pt-BR' ? 'pt' : 'en';
  var localePrefix = langCode === 'en' ? '' : '/' + langCode;

  // --- Path helper: detect depth from root, accounting for locale prefix ---
  var basePath = (function () {
    var path = window.location.pathname;
    var slugMeta = document.querySelector('meta[name="blog-post-slug"]');
    // Static blog post: /<lang>/blog/<slug>/ → ../../../
    if (slugMeta && /^\/(nl|pt)\/blog\//.test(path)) return '../../../';
    // Static blog post: /blog/<slug>/ → ../../
    if (slugMeta && /^\/blog\//.test(path)) return '../../';
    // Locale listing page: /nl/*.html or /pt/*.html → ../
    if (/^\/(nl|pt)\//.test(path)) return '../';
    return '';
  })();

  // --- Data loading ---
  // Language suffix for locale-specific files (e.g., .nl or .pt)
  var langSuffix = langCode !== 'en' ? '.' + langCode : '';

  async function loadBlogs() {
    const resp = await fetch(basePath + 'Blogs/blogs.json');
    const folders = await resp.json();

    const blogs = await Promise.all(folders.map(async (folder) => {
      const base = basePath + 'Blogs/' + folder + '/';

      // Fetch locale-specific meta/content, fall back to English
      const [metaResp, contentResp] = await Promise.all([
        langSuffix
          ? fetch(base + 'meta' + langSuffix + '.json').then(function (r) { return r.ok ? r : fetch(base + 'meta.json'); })
          : fetch(base + 'meta.json'),
        langSuffix
          ? fetch(base + 'content' + langSuffix + '.html').then(function (r) { return r.ok ? r : fetch(base + 'content.html'); })
          : fetch(base + 'content.html')
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

  // --- Centralized social profiles & company info (shared with hero) ---
  const COMPANY = {
    name: 'Regen Studio',
    url: 'https://www.regenstudio.world',
    tagline: 'Designing innovations that regenerate humans, cities and nature.',
    email: 'info@regenstudio.world',
    profiles: {
      linkedin: 'https://www.linkedin.com/company/regen-studio-world/',
      bluesky: 'https://bsky.app/profile/regen-studio.bsky.social',
      mastodon: 'https://mastodon.social/@regen_studio',
    }
  };

  const blueskyHandle = '@regen-studio.bsky.social';

  function buildShareMessages(postTitle, pageUrl) {
    return {
      bluesky: postTitle + '\n\nBy ' + blueskyHandle + ' — ' + COMPANY.tagline + '\n\n' + pageUrl,
      linkedin: postTitle + '\n\nBy ' + COMPANY.name + ' — ' + COMPANY.tagline + '\n\nRead it here: ' + pageUrl + '\n\nFollow ' + COMPANY.name + ': ' + COMPANY.profiles.linkedin,
      mastodon: postTitle + '\n\nBy @regen_studio@mastodon.social — ' + COMPANY.tagline + '\n\n' + pageUrl + '\n\n#RegenerativeDesign #Innovation',
      reddit: postTitle + ' — ' + COMPANY.name,
      whatsapp: postTitle + ' — ' + COMPANY.tagline + ' ' + pageUrl,
      native: postTitle + ' — by ' + COMPANY.name + '. ' + COMPANY.tagline,
      email: {
        subject: postTitle + ' — ' + COMPANY.name,
        body: postTitle + '\n\nBy ' + COMPANY.name + ' — ' + COMPANY.tagline + '\n\nRead it here: ' + pageUrl + '\n\nLearn more: ' + COMPANY.profiles.linkedin
      }
    };
  }

  // --- SVG icons ---
  const icons = {
    calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    image: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    search: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    bluesky: '<svg width="16" height="16" viewBox="0 0 600 530" fill="currentColor"><path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/></svg>',
    linkedin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    mastodon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.547c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054 19.648 19.648 0 0 0 4.581.536h.353c1.578 0 3.168-.091 4.718-.39.038-.007.077-.013.112-.026 2.437-.503 4.756-2.075 4.992-6.048.009-.155.043-1.625.043-1.784 0-.544.199-3.858-.077-5.89zM19.44 12.666h-3.126v5.083c0 1.07-.449 1.614-1.347 1.614-.994 0-1.493-.648-1.493-1.929V14.27h-3.104v3.164c0 1.281-.5 1.929-1.494 1.929-.897 0-1.346-.544-1.346-1.614v-5.083H4.404c0 1.176-.025 2.354.1 3.518.19 1.747 1.427 2.246 2.735 2.372 1.414.135 2.783-.184 2.783-.184s-.027.784.015 1.228c.003.029.02.055.046.065.023.009.049.003.065-.015.545-.608 1.182-.584 1.852-.584.67 0 1.307-.024 1.852.584a.057.057 0 0 0 .065.015.056.056 0 0 0 .046-.065c.042-.444.015-1.228.015-1.228s1.369.319 2.783.184c1.308-.126 2.545-.625 2.735-2.372.125-1.164.1-2.342.1-3.518zM8.52 8.322c-.866 0-1.569.835-1.569 1.864 0 1.03.703 1.865 1.569 1.865.866 0 1.569-.835 1.569-1.865 0-1.029-.703-1.864-1.569-1.864zm6.96 0c-.867 0-1.569.835-1.569 1.864 0 1.03.702 1.865 1.569 1.865.866 0 1.569-.835 1.569-1.865 0-1.029-.703-1.864-1.569-1.864z"/></svg>',
    reddit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>',
    whatsapp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
    email: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
  };

  // --- Share helpers (matching hero logic) ---
  function showToast(msg) {
    const existing = document.querySelector('.share-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'share-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // --- Category color lookup (matching index.html focus section colors) ---
  const CATEGORY_COLORS = {
    'Circular Economy': 'emerald', 'Digital Product Passport': 'emerald', 'Circular Business Models': 'emerald',
    'Energy Transition': 'orange', 'Smart Grids': 'orange', 'Energy Communities': 'orange', 'Energy Justice': 'orange',
    'Liveable Cities': 'teal', 'Living Labs': 'teal', 'Digital Participation': 'teal', 'Urban Greening': 'teal',
    'Digital Society': 'magenta', 'Digital Identity': 'magenta', 'Privacy-by-Design': 'magenta', 'AI': 'magenta',
    'Resilient Nature': 'green', 'Reforestation': 'green', 'Biodiversity': 'green', 'Regenerative Agriculture': 'green',
    'Innovation Services': 'gray', 'Out-of-the-Box Ideas': 'gray', 'Vision & Strategy': 'gray', 'Visual Storytelling': 'gray',
    'Client Projects': 'gold',
  };

  // --- Resolve image paths from static pages ---
  function resolveImagePath(slug, featuredImage) {
    if (!featuredImage) return '';
    // Images with ../../ prefix are already relative to blog/<slug>/
    if (basePath && !featuredImage.startsWith('../../')) {
      return basePath + 'Blogs/' + slug + '/' + featuredImage;
    }
    return 'Blogs/' + slug + '/' + featuredImage;
  }

  // --- Locale-aware page URL helper (e.g., blog.html → ../nl/blog.html from a post page) ---
  function pageUrl(page) {
    if (langCode === 'en') return basePath + page;
    return basePath + langCode + '/' + page;
  }

  // --- Blog post URL helper ---
  function blogPostUrl(slug) {
    return localePrefix + '/blog/' + encodeURIComponent(slug) + '/';
  }

  // --- Card renderer ---
  function renderCard(post) {
    var imgSrc = post.featuredImage
      ? (basePath + 'Blogs/' + post.slug + '/' + post.featuredImage)
      : '';
    const imageHtml = post.featuredImage
      ? `<div class="blog-card__image"><img src="${imgSrc}" alt="${post.featuredImageAlt || ''}" loading="lazy"></div>`
      : `<div class="blog-card__image"><div class="blog-card__image-placeholder">${icons.image}</div></div>`;

    const cats = post.categories.map(c => {
      const color = CATEGORY_COLORS[c] || 'gray';
      return `<span class="blog-card__category blog-card__category--${color}">${c}</span>`;
    }).join('');

    return `
      <article class="blog-card">
        <a href="${blogPostUrl(post.slug)}">
          ${imageHtml}
        </a>
        <div class="blog-card__body">
          <h3 class="blog-card__title">
            <a href="${blogPostUrl(post.slug)}">${post.title}</a>
          </h3>
          <p class="blog-card__excerpt">${post.excerpt}</p>
          <div class="blog-card__categories">${cats}</div>
          <div class="blog-card__meta">
            <span>${icons.user} ${post.author.name}</span>
            <span>${icons.calendar} ${formatDate(post.date)}</span>
            <span>${icons.clock} ${post.readingTime} ${t("blog.min_read", "min read")}</span>
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
    const columnsContainer = document.getElementById('categoryColumns');

    if (!grid) return;

    const blogs = await loadBlogs();

    // Collect all tags with counts
    const tagCounts = {};
    blogs.forEach(b => {
      b.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });

    // Category columns with sub-categories and color mapping (matching index.html focus section)
    const categoryColumns = [
      { name: 'Circular Economy', color: 'emerald', subs: ['Digital Product Passport', 'Circular Business Models'] },
      { name: 'Energy Transition', color: 'orange', subs: ['Smart Grids', 'Energy Communities', 'Energy Justice'] },
      { name: 'Liveable Cities', color: 'teal', subs: ['Living Labs', 'Digital Participation', 'Urban Greening'] },
      { name: 'Digital Society', color: 'magenta', subs: ['Digital Identity', 'Privacy-by-Design', 'AI'] },
      { name: 'Resilient Nature', color: 'green', subs: ['Reforestation', 'Biodiversity', 'Regenerative Agriculture'] },
      { name: 'Services', color: 'gray', subs: ['Innovation Services', 'Out-of-the-Box Ideas', 'Vision & Strategy', 'Visual Storytelling'] },
      { name: 'Client Projects', color: 'gold', subs: [] },
    ];

    // Build sub→parent lookup so sub-categories auto-inherit parent
    const subToParent = {};
    categoryColumns.forEach(col => {
      col.subs.forEach(sub => { subToParent[sub] = col.name; });
    });

    // Expand blog categories: sub-categories inherit their parent
    function expandCategories(cats) {
      const expanded = new Set(cats);
      cats.forEach(c => {
        if (subToParent[c]) expanded.add(subToParent[c]);
      });
      return [...expanded];
    }

    // Expand each blog's categories for filtering and counting
    blogs.forEach(b => {
      b._expandedCategories = expandCategories(b.categories);
    });

    // Recount with expanded categories
    const expandedCatCounts = {};
    blogs.forEach(b => {
      b._expandedCategories.forEach(c => { expandedCatCounts[c] = (expandedCatCounts[c] || 0) + 1; });
    });

    // Render columns
    columnsContainer.innerHTML = categoryColumns.map(col => {
      const mainCount = expandedCatCounts[col.name] || 0;
      const subsHtml = col.subs.map(sub => {
        const count = expandedCatCounts[sub] || 0;
        return `<button class="filter-pill filter-pill--sub filter-pill--${col.color}" data-type="category" data-value="${sub}" data-color="${col.color}">${sub}${count ? ` <span class="filter-pill__count">${count}</span>` : ''}</button>`;
      }).join('');

      return `
        <div class="blog-filters__column blog-filters__column--${col.color}">
          <button class="filter-pill filter-pill--main filter-pill--${col.color}" data-type="category" data-value="${col.name}" data-color="${col.color}">
            ${col.name}${mainCount ? ` <span class="filter-pill__count">${mainCount}</span>` : ''}
          </button>
          <div class="blog-filters__subs">${subsHtml}</div>
        </div>
      `;
    }).join('');

    // --- Tag search dropdown ---
    function initTagSearch(tagCounts) {
      const searchInput = document.getElementById('tagSearchInput');
      const dropdown = document.getElementById('tagSearchDropdown');
      const activeContainer = document.getElementById('tagSearchActive');
      const countBadge = document.getElementById('tagSearchCount');

      const sortedTags = Object.entries(tagCounts).sort((a, b) => a[0].localeCompare(b[0]));

      function renderDropdown(filter) {
        const query = (filter || '').toLowerCase();
        const items = sortedTags.filter(([name]) => !query || name.toLowerCase().includes(query));
        dropdown.innerHTML = items.map(([name, count]) =>
          `<label class="tag-search__item">
            <input type="checkbox" value="${name}" ${activeTags.has(name) ? 'checked' : ''}>
            <span class="tag-search__item-label">${name}</span>
            <span class="tag-search__item-count">${count}</span>
          </label>`
        ).join('');
        if (items.length === 0) {
          dropdown.innerHTML = `<div class="tag-search__empty">${t("blog.no_tags", "No tags found")}</div>`;
        }
      }

      function renderActivePills() {
        activeContainer.innerHTML = [...activeTags].map(tag =>
          `<span class="tag-search__pill" data-tag="${tag}">${tag}<button class="tag-search__pill-remove" data-tag="${tag}">&times;</button></span>`
        ).join('');
        countBadge.textContent = activeTags.size > 0 ? activeTags.size : '';
        countBadge.style.display = activeTags.size > 0 ? 'inline-flex' : 'none';
      }

      searchInput.addEventListener('focus', () => {
        renderDropdown(searchInput.value);
        dropdown.classList.add('open');
      });

      searchInput.addEventListener('input', () => {
        renderDropdown(searchInput.value);
        if (!dropdown.classList.contains('open')) {
          dropdown.classList.add('open');
        }
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#tagSearch')) {
          dropdown.classList.remove('open');
        }
      });

      dropdown.addEventListener('change', (e) => {
        if (e.target.type !== 'checkbox') return;
        const tag = e.target.value;
        if (e.target.checked) {
          activeTags.add(tag);
        } else {
          activeTags.delete(tag);
        }
        renderActivePills();
        writeHashState();
        filterAndRender();
      });

      activeContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.tag-search__pill-remove');
        if (!removeBtn) return;
        const tag = removeBtn.dataset.tag;
        activeTags.delete(tag);
        renderActivePills();
        renderDropdown(searchInput.value);
        writeHashState();
        filterAndRender();
      });

      // Expose for external state updates (hash change)
      return { renderActivePills, renderDropdown };
    }

    const tagSearch = initTagSearch(tagCounts);

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
      tagSearch.renderActivePills();
      tagSearch.renderDropdown(document.getElementById('tagSearchInput').value);
    }

    function filterAndRender() {
      const filtered = blogs.filter(b => {
        const catMatch = activeCategories.size === 0 || [...activeCategories].every(c => b._expandedCategories.includes(c));
        const tagMatch = activeTags.size === 0 || [...activeTags].every(t => b.tags.includes(t));
        return catMatch && tagMatch;
      });

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="blog-no-results">
            <div class="blog-no-results__icon">${icons.search}</div>
            <h3 class="blog-no-results__title">${t("blog.no_posts_title", "No posts found")}</h3>
            <p class="blog-no-results__text">${t("blog.no_posts_text", "Try adjusting your filters to find what you're looking for.")}</p>
            <button class="btn btn--outline btn--small" id="clearFilters">${t("blog.clear_filters", "Clear all filters")}</button>
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
  // Client Projects Page
  // ========================================
  async function initClientProjectsListing() {
    const grid = document.getElementById('clientProjectsGrid');
    if (!grid) return;

    const blogs = await loadBlogs();
    const clientBlogs = blogs.filter(b => b.categories && b.categories.includes('Client Projects'));

    if (clientBlogs.length === 0) {
      grid.innerHTML = `<div class="blog-no-results"><h3 class="blog-no-results__title">No client projects found</h3></div>`;
      return;
    }

    grid.innerHTML = clientBlogs.map(renderCard).join('');
  }

  // ========================================
  // Blog Post Page
  // ========================================
  async function initBlogPost() {
    const postContainer = document.getElementById('postContent');
    if (!postContainer) return;

    // Detect slug: meta tag (static page) → query param (legacy) → redirect
    var slugMeta = document.querySelector('meta[name="blog-post-slug"]');
    const slug = slugMeta ? slugMeta.getAttribute('content') : new URLSearchParams(window.location.search).get('post');
    if (!slug) {
      window.location.href = pageUrl('blog.html');
      return;
    }

    const blogs = await loadBlogs();
    const post = blogs.find(b => b.slug === slug);
    if (!post) {
      window.location.href = pageUrl('blog.html');
      return;
    }

    // Set page title
    document.title = `${post.title} | Regen Studio Blog`;

    // Update meta description + OG + Twitter tags for social sharing & tab title
    var postTitle = post.title + ' | Regen Studio Blog';
    var postDesc = post.excerpt || post.subtitle || 'Read insights on regenerative innovation from Regen Studio.';
    var postUrl = COMPANY.url + localePrefix + '/blog/' + encodeURIComponent(post.slug) + '/';
    var postImage = post.featuredImage
      ? (post.featuredImage.startsWith('../../')
        ? COMPANY.url + '/' + post.featuredImage.replace('../../', '')
        : COMPANY.url + '/Blogs/' + post.slug + '/' + post.featuredImage)
      : COMPANY.url + '/Images/og-image.png';

    var metaUpdates = [
      ['meta[name="description"]', 'content', postDesc],
      ['meta[property="og:title"]', 'content', postTitle],
      ['meta[property="og:description"]', 'content', postDesc],
      ['meta[property="og:url"]', 'content', postUrl],
      ['meta[property="og:image"]', 'content', postImage],
      ['meta[name="twitter:title"]', 'content', postTitle],
      ['meta[name="twitter:description"]', 'content', postDesc],
      ['meta[name="twitter:image"]', 'content', postImage],
    ];
    metaUpdates.forEach(function (u) {
      var el = document.querySelector(u[0]);
      if (el) el.setAttribute(u[1], u[2]);
    });

    // Render header
    const headerEl = document.getElementById('postHeader');
    headerEl.innerHTML = `
      <div class="container">
        <a href="${pageUrl('blog.html')}" class="post-header__back">${icons.arrow} ${t("blog.back", "Back to Blog")}</a>
        <div class="post-header__categories">
          ${post.categories.map(c => `<span class="post-header__category post-header__category--${CATEGORY_COLORS[c] || 'gray'}">${c}</span>`).join('')}
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
          <div class="post-header__meta-item">${icons.clock} ${post.readingTime} ${t("blog.min_read", "min read")}</div>
        </div>
      </div>
    `;

    // Render featured image
    const featuredEl = document.getElementById('postFeaturedImage');
    if (post.featuredImage) {
      var featImgSrc = resolveImagePath(post.slug, post.featuredImage);
      featuredEl.innerHTML = `
        <div class="container">
          <img src="${featImgSrc}" alt="${post.featuredImageAlt || ''}">
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
          ${post.tags.map(t => `<a href="${pageUrl('blog.html')}#${encodeURIComponent('tag=' + t)}" class="post-tag">#${t}</a>`).join('')}
        </div>
        <div class="post-share">
          <div class="post-share__card">
            <p class="post-share__label">${t("blog.share_label", "Share this article")}</p>
            <div class="post-share__buttons post-share__buttons--primary">
              <button class="share-btn share-btn--native share-btn--lg" id="shareNative" title="Share via apps on your device">${icons.share} Share</button>
              <button class="share-btn share-btn--copy share-btn--lg" id="shareCopy" title="Copy link">${icons.link} ${t("blog.share_copy", "Copy link")}</button>
              <button class="share-btn share-btn--email share-btn--lg" id="shareEmail" title="Share via Email">${icons.email} Email</button>
            </div>
            <div class="post-share__divider">
              <span>${t("blog.share_or", "or share on")}</span>
            </div>
            <div class="post-share__buttons post-share__buttons--social">
              <button class="share-btn share-btn--bluesky" id="shareBluesky" title="Share on Bluesky">${icons.bluesky} Bluesky</button>
              <button class="share-btn share-btn--linkedin" id="shareLinkedIn" title="Share on LinkedIn">${icons.linkedin} LinkedIn</button>
              <button class="share-btn share-btn--mastodon" id="shareMastodon" title="Share on Mastodon">${icons.mastodon} Mastodon</button>
              <button class="share-btn share-btn--reddit" id="shareReddit" title="Share on Reddit">${icons.reddit} Reddit</button>
              <button class="share-btn share-btn--whatsapp" id="shareWhatsApp" title="Share on WhatsApp">${icons.whatsapp} WhatsApp</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Execute deferred scripts in blog content (innerHTML doesn't run scripts)
    postContainer.querySelectorAll('script').forEach(function(old) {
      var s = document.createElement('script');
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });

    // Share button handlers (matching hero social sharing logic)
    // Always use canonical blog URL in share messages
    const pageUrl = COMPANY.url + '/blog/' + encodeURIComponent(post.slug) + '/';
    const pageTitle = post.title;
    const msgs = buildShareMessages(pageTitle, pageUrl);

    // Native Web Share — uses device share sheet (hidden if unsupported)
    const shareNativeBtn = document.getElementById('shareNative');
    if (!navigator.share) {
      shareNativeBtn.style.display = 'none';
    } else {
      shareNativeBtn.addEventListener('click', () => {
        navigator.share({
          title: pageTitle + ' — ' + COMPANY.name,
          text: msgs.native,
          url: pageUrl
        }).catch(() => {});
      });
    }

    // Bluesky — open compose intent with pre-filled message
    document.getElementById('shareBluesky').addEventListener('click', () => {
      window.open('https://bsky.app/intent/compose?text=' + encodeURIComponent(msgs.bluesky), '_blank', 'width=600,height=500');
    });

    // LinkedIn — pre-fill text in composer, prompt user to @tag
    document.getElementById('shareLinkedIn').addEventListener('click', () => {
      window.open('https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(msgs.linkedin), '_blank', 'width=600,height=600');
      showToast('Type @Regen Studio in the post to tag us!');
    });

    // Mastodon — via Share2Fedi (handles instance selection)
    document.getElementById('shareMastodon').addEventListener('click', () => {
      window.open('https://s2f.kytta.dev/?text=' + encodeURIComponent(msgs.mastodon), '_blank', 'width=600,height=500');
    });

    // Reddit — open submit page with pre-filled title and URL
    document.getElementById('shareReddit').addEventListener('click', () => {
      window.open('https://reddit.com/submit?url=' + encodeURIComponent(pageUrl) + '&title=' + encodeURIComponent(msgs.reddit), '_blank', 'width=600,height=500');
    });

    // WhatsApp — native share with text
    document.getElementById('shareWhatsApp').addEventListener('click', () => {
      window.open('https://wa.me/?text=' + encodeURIComponent(msgs.whatsapp), '_blank');
    });

    // Email — mailto with formatted subject and body
    document.getElementById('shareEmail').addEventListener('click', () => {
      window.location.href = 'mailto:?subject=' + encodeURIComponent(msgs.email.subject) + '&body=' + encodeURIComponent(msgs.email.body);
    });

    // Copy link
    document.getElementById('shareCopy').addEventListener('click', function () {
      navigator.clipboard.writeText(pageUrl).then(() => {
        this.classList.add('share-btn--copied');
        this.innerHTML = `${icons.link} ${t("blog.share_copied", "Copied!")}`;
        showToast('Link copied to clipboard!');
        setTimeout(() => {
          this.classList.remove('share-btn--copied');
          this.innerHTML = `${icons.link} ${t("blog.share_copy", "Copy link")}`;
        }, 2000);
      });
    });

    // CTA banner after article content
    const ctaBanner = document.createElement('div');
    ctaBanner.className = 'post-cta-banner';
    ctaBanner.id = 'post-cta-banner';
    ctaBanner.innerHTML = `
      <p class="post-cta-banner__label">${t("cta.get_in_touch", "Get in Touch")}</p>
      <p class="post-cta-banner__text">${t("blog.cta_text", "Interested in working together on regenerative innovation?")}</p>
      <form id="post-contact-form" class="regen-form regen-form--compact">
        <div class="regen-form__row">
          <input type="text" name="name" placeholder="Your name" class="regen-form__input" required>
          <input type="email" name="email" placeholder="Email address" class="regen-form__input" required>
        </div>
        <textarea name="message" placeholder="What's on your mind?" class="regen-form__input regen-form__textarea" rows="2"></textarea>
        <label class="regen-form__checkbox">
          <input type="checkbox" name="newsletter_opt_in" value="1" checked>
          <span>Also subscribe me to the Regen Studio newsletter</span>
        </label>
        <button type="submit" class="btn btn--primary regen-form__submit">Send Message</button>
        <p class="regen-form__disclaimer">Your data is stored in the EU and not shared with third parties. <a href="${basePath}privacy.html">Privacy Policy</a></p>
      </form>
      <div id="post-contact-success" class="regen-form__success" style="display:none">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 10"/></svg>
        <h3>Message sent!</h3>
        <p>We will be in touch soon.</p>
      </div>
      <div class="regen-form__divider"><span>${t("blog.cta_or_email", "or email us directly")}</span></div>
      <div class="copyable-email copyable-email--compact">
        <span class="copyable-email__address">${COMPANY.email}</span>
        <button class="copyable-email__btn" data-email="${COMPANY.email}" aria-label="Copy email address">
          <svg class="copyable-email__icon copyable-email__icon--copy" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <svg class="copyable-email__icon copyable-email__icon--check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <span class="copyable-email__label">Copy</span>
        </button>
      </div>
    `;
    const postInner = postContainer.querySelector('.post-content__inner');
    if (postInner) postInner.appendChild(ctaBanner);

    // Social follow card
    const followCard = document.createElement('div');
    followCard.className = 'follow-card';
    followCard.innerHTML = `
      <p class="follow-card__heading">${t("follow.heading", "Follow us")}</p>
      <div class="follow-card__links">
        <a href="${COMPANY.profiles.linkedin}" target="_blank" rel="noopener" class="follow-card__link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>
          LinkedIn
        </a>
        <a href="${COMPANY.profiles.bluesky}" target="_blank" rel="noopener" class="follow-card__link">
          <svg width="18" height="18" viewBox="0 0 600 530" fill="currentColor"><path d="m136 33c66 49 136 149 164 202 28-53 98-153 164-202 47-35 123-76 123-21 0 11-7 94-11 107-14 47-63 59-108 52 78 14 98 58 55 103-82 86-177-22-191-99-14 77-109 185-191 99-43-45-23-89 55-103-45 7-94-5-108-52-4-13-11-96-11-107 0-55 76-14 123 21z"/></svg>
          Bluesky
        </a>
        <a href="${COMPANY.profiles.mastodon}" target="_blank" rel="noopener me" class="follow-card__link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.26 13.12c-.31 1.58-2.76 3.31-5.58 3.65-1.47.17-2.91.33-4.45.26-2.52-.11-4.51-.58-4.51-.58 0 .24.01.47.04.69.3 2.25 2.22 2.38 4.05 2.44 1.84.07 3.48-.45 3.48-.45l.08 1.68s-1.29.69-3.59.82c-1.27.07-2.84-.03-4.67-.52C2.79 20.17 2.15 16.59 2.03 12.96c-.04-1.07-.01-2.08-.01-2.92 0-3.69 2.42-4.77 2.42-4.77C5.66 4.62 7.56 4.17 9.53 4.15h.05c1.97.02 3.87.47 5.09 1.12 0 0 2.42 1.08 2.42 4.77 0 0 .03 2.72-.37 4.08z"/><path d="M18.19 9.04v4.66h-1.85V9.18c0-.95-.4-1.44-1.2-1.44-.88 0-1.33.57-1.33 1.71v2.48h-1.84v-2.48c0-1.14-.44-1.71-1.33-1.71-.8 0-1.2.49-1.2 1.44v4.52H7.59V9.04c0-.95.24-1.71.73-2.27.5-.56 1.16-.85 1.97-.85.95 0 1.67.36 2.14 1.09l.46.77.46-.77c.47-.73 1.19-1.09 2.14-1.09.81 0 1.46.29 1.97.85.49.56.73 1.32.73 2.27z" fill="var(--color-bg)"/></svg>
          Mastodon
        </a>
      </div>
    `;
    if (postInner) postInner.appendChild(followCard);

    // Scroll-triggered floating CTA
    initScrollCTA();

    // Related posts
    const related = getRelatedPosts(post, blogs, 3);
    const relatedSection = document.getElementById('relatedPosts');

    if (related.length > 0) {
      const primaryCategory = post.categories && post.categories[0]
        ? `#${encodeURIComponent('cat=' + post.categories[0])}`
        : '';
      relatedSection.innerHTML = `
        <div class="container">
          <h2 class="related-posts__title">${t("blog.related", "Related Articles")}</h2>
          <div class="related-posts__grid">
            ${related.map(renderCard).join('')}
          </div>
          <div class="related-posts__cta">
            <a href="${pageUrl('blog.html')}${primaryCategory}" class="related-posts__cta-btn">${t("blog.view_related", "View all related blogs")}</a>
          </div>
        </div>
      `;
    } else {
      relatedSection.style.display = 'none';
    }
  }

  // ========================================
  // Scroll-triggered floating CTA (blog post)
  // ========================================
  function initScrollCTA() {
    const postContent = document.getElementById('postContent');
    if (!postContent) return;

    let dismissed = false;
    let visible = false;

    // Create the floating CTA element
    const floatingCTA = document.createElement('div');
    floatingCTA.className = 'scroll-cta';
    floatingCTA.innerHTML = `
      <button class="scroll-cta__close" aria-label="Dismiss">&times;</button>
      <p class="scroll-cta__label">${t("cta.get_in_touch", "Get in Touch")}</p>
      <p class="scroll-cta__text">${t("blog.cta_floating_text", "Like what you're reading?")}</p>
      <div class="scroll-cta__email-row">
        <span class="scroll-cta__address">${COMPANY.email}</span>
        <button class="copyable-email__btn copyable-email__btn--small" data-email="${COMPANY.email}" aria-label="Copy email">
          <svg class="copyable-email__icon copyable-email__icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <svg class="copyable-email__icon copyable-email__icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
      <a href="#post-cta-banner" class="scroll-cta__form-link">${t("blog.cta_floating_link", "or send us a message")} &darr;</a>
    `;
    document.body.appendChild(floatingCTA);

    // Dismiss handler
    floatingCTA.querySelector('.scroll-cta__close').addEventListener('click', () => {
      dismissed = true;
      floatingCTA.classList.remove('scroll-cta--visible');
    });

    // Scroll handler — show after 40% of article (rAF-batched)
    let ctaScrollRafPending = false;
    function onScroll() {
      if (dismissed) return;
      if (ctaScrollRafPending) return;
      ctaScrollRafPending = true;
      requestAnimationFrame(() => {
        ctaScrollRafPending = false;
        if (dismissed) return;

        const rect = postContent.getBoundingClientRect();
        const contentHeight = postContent.offsetHeight;
        const scrolledInto = -rect.top;
        const progress = scrolledInto / contentHeight;

        if (progress > 0.4 && progress < 0.95 && !visible) {
          visible = true;
          floatingCTA.classList.add('scroll-cta--visible');
        } else if ((progress <= 0.35 || progress >= 0.95) && visible) {
          visible = false;
          floatingCTA.classList.remove('scroll-cta--visible');
        }
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ========================================
  // Init
  // ========================================
  // --- Copy-to-clipboard delegated handler for blog pages ---
  function initCopyButtons() {
    document.addEventListener('click', (e) => {
      // CTA / inline copyable email button
      const copyBtn = e.target.closest('.copyable-email__btn');
      if (copyBtn) {
        const email = copyBtn.getAttribute('data-email');
        navigator.clipboard.writeText(email).then(() => {
          const label = copyBtn.querySelector('.copyable-email__label');
          copyBtn.classList.add('copied');
          if (label) label.textContent = t("nav.copied", "Copied!");
          showToast('Email copied to clipboard!');
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            if (label) label.textContent = 'Copy';
          }, 2000);
        });
        return;
      }

      // Footer copy button
      const footerBtn = e.target.closest('.footer__copy-btn');
      if (footerBtn) {
        const email = footerBtn.getAttribute('data-email');
        navigator.clipboard.writeText(email).then(() => {
          footerBtn.classList.add('copied');
          showToast('Email copied to clipboard!');
          setTimeout(() => {
            footerBtn.classList.remove('copied');
          }, 2000);
        });
        return;
      }
    });
  }

  // ========================================
  // Contact Form Handlers (blog pages)
  // ========================================
  const EDGE_FUNCTION_URL = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/contact-form';

  function initBlogContactForms() {
    // Blog listing page form
    setupForm('blog-contact-form', 'blog-contact-success', 'blog_contact');
    // Blog post CTA form
    setupForm('post-contact-form', 'post-contact-success', 'blog_post_contact');

    // Smooth scroll for scroll-cta form link
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.scroll-cta__form-link');
      if (link) {
        e.preventDefault();
        const target = document.getElementById('post-cta-banner');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Dismiss the floating CTA
          const floatingCTA = document.querySelector('.scroll-cta');
          if (floatingCTA) floatingCTA.classList.remove('scroll-cta--visible');
        }
      }
    });
  }

  function setupForm(formId, successId, source) {
    // Use event delegation since forms may be JS-rendered
    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('#' + formId);
      if (!form) return;
      e.preventDefault();

      const submitBtn = form.querySelector('.regen-form__submit');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      // Clear previous errors
      const existingError = form.querySelector('.regen-form__error');
      if (existingError) existingError.remove();

      const formData = new FormData(form);
      const newsletterCheckbox = form.querySelector('input[name="newsletter_opt_in"]');
      const payload = {
        name: formData.get('name') || '',
        email: formData.get('email') || '',
        message: formData.get('message') || '',
        source: source,
        page_url: window.location.href,
        newsletter_opt_in: newsletterCheckbox ? newsletterCheckbox.checked : false,
      };

      try {
        const res = await fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Something went wrong');
        }

        // Success — redirect to thank-you page
        const langPrefix = document.documentElement.lang === 'nl' ? '/nl' : document.documentElement.lang === 'pt-BR' ? '/pt' : '';
        window.location.href = langPrefix + '/thank-you.html';
        // Fallback if redirect blocked
        form.style.display = 'none';
        const successEl = document.getElementById(successId);
        if (successEl) successEl.style.display = 'flex';
      } catch (err) {
        const errorEl = document.createElement('p');
        errorEl.className = 'regen-form__error';
        errorEl.textContent = err.message || 'Failed to send. Please try again.';
        submitBtn.parentNode.insertBefore(errorEl, submitBtn.nextSibling);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initCopyButtons();
    initBlogListing();
    initClientProjectsListing();
    initBlogPost();
    initBlogContactForms();
  });
})();
