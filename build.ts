/**
 * build.ts — Static blog page generator for Regen Studio
 *
 * Generates one static HTML file per published blog post at blog/<slug>/index.html
 * with baked-in OG tags, JSON-LD schema, and pre-rendered content for SEO.
 * Also generates translated versions at <lang>/blog/<slug>/index.html when
 * meta.<lang>.json + content.<lang>.html exist.
 * Also generates sitemap.xml and feed.xml (RSS 2.0).
 *
 * Run: deno run --allow-read --allow-write build.ts
 */

const SITE_URL = "https://www.regenstudio.world";
const SITE_NAME = "Regen Studio";
const SITE_DESCRIPTION = "Innovations that regenerate Humans, Cities and Nature.";

// --- Types ---

type Lang = "en" | "nl" | "pt";

interface BlogMeta {
  title: string;
  slug: string;
  subtitle: string;
  author: { name: string; role: string };
  date: string;
  categories: string[];
  tags: string[];
  featuredImage: string;
  featuredImageAlt: string;
  excerpt: string;
  published: boolean;
}

interface BlogPost extends BlogMeta {
  content: string;
  readingTime: number;
}

// --- Language support ---

const SUPPORTED_LANGS: Lang[] = ["en", "nl", "pt"];

const UI: Record<Lang, {
  backToBlog: string;
  minRead: string;
  home: string;
  blog: string;
}> = {
  en: { backToBlog: "Back to Blog", minRead: "min read", home: "Home", blog: "Blog" },
  nl: { backToBlog: "Terug naar Blog", minRead: "min leestijd", home: "Startpagina", blog: "Blog" },
  pt: { backToBlog: "Voltar ao Blog", minRead: "min de leitura", home: "Início", blog: "Blog" },
};

/** Get the URL prefix for a language (empty for English, "/nl" or "/pt" for others) */
function langPrefix(lang: Lang): string {
  return lang === "en" ? "" : `/${lang}`;
}

/** Get the asset prefix (relative path back to root) based on page depth */
function assetPrefix(lang: Lang): string {
  // English: /blog/slug/ → ../../ (2 levels)
  // NL/PT: /nl/blog/slug/ → ../../../ (3 levels)
  return lang === "en" ? "../../" : "../../../";
}

// --- Category colors (mirrors blog.js) ---

const CATEGORY_COLORS: Record<string, string> = {
  "Circular Economy": "emerald",
  "Digital Product Passport": "emerald",
  "Circular Business Models": "emerald",
  "Energy Transition": "orange",
  "Smart Grids": "orange",
  "Energy Communities": "orange",
  "Energy Justice": "orange",
  "Liveable Cities": "teal",
  "Living Labs": "teal",
  "Digital Participation": "teal",
  "Urban Greening": "teal",
  "Digital Society": "magenta",
  "Digital Identity": "magenta",
  "Privacy-by-Design": "magenta",
  AI: "magenta",
  "Resilient Nature": "green",
  Reforestation: "green",
  Biodiversity: "green",
  "Regenerative Agriculture": "green",
  "Innovation Services": "gray",
  "Out-of-the-Box Ideas": "gray",
  "Vision & Strategy": "gray",
  "Visual Storytelling": "gray",
  "Client Projects": "gold",
};

// --- Utility ---

function calcReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, "");
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 230));
}

function formatDate(dateStr: string, lang: Lang = "en"): string {
  const d = new Date(dateStr + "T00:00:00");
  const locale = lang === "nl" ? "nl-NL" : lang === "pt" ? "pt-BR" : "en-GB";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** Detect MIME type from image URL file extension */
function imageMimeType(url: string): string {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0] || "";
  switch (ext) {
    case "webp": return "image/webp";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "svg": return "image/svg+xml";
    case "gif": return "image/gif";
    case "png":
    default: return "image/png";
  }
}

/** Resolve featured image to an absolute URL for OG tags */
function resolveImageUrl(slug: string, featuredImage: string): string {
  if (!featuredImage) return `${SITE_URL}/Images/og-image.png`;
  // Some posts use ../../Images/file.svg relative paths
  if (featuredImage.startsWith("../../")) {
    return `${SITE_URL}/${featuredImage.replace("../../", "")}`;
  }
  return `${SITE_URL}/Blogs/${slug}/${featuredImage}`;
}

/** Resolve featured image to a relative path for <img> tag */
function resolveImageSrc(slug: string, featuredImage: string, prefix: string): string {
  if (!featuredImage) return "";
  if (featuredImage.startsWith("../../")) {
    // ../../Images/foo.svg → adjust for depth
    return prefix + featuredImage.replace("../../", "");
  }
  return `${prefix}Blogs/${slug}/${featuredImage}`;
}

/**
 * Adjust content image paths for the page depth.
 * Blog content.html files use root-relative paths like "Blogs/slug/image.webp"
 * and "Images/file.svg" (no leading slash). These need a prefix to resolve
 * correctly from the generated page location.
 */
function adjustContentPaths(content: string, prefix: string): string {
  return content
    .replace(/src="(Blogs\/[^"]+)"/g, `src="${prefix}$1"`)
    .replace(/src="(Images\/[^"]+)"/g, `src="${prefix}$1"`)
    .replace(/href="(Blogs\/[^"]+)"/g, `href="${prefix}$1"`);
}

// --- Load all blog posts ---

async function loadPosts(baseDir: string): Promise<BlogPost[]> {
  const slugsJson = await Deno.readTextFile(`${baseDir}/Blogs/blogs.json`);
  const slugs: string[] = JSON.parse(slugsJson);

  const posts: BlogPost[] = [];
  for (const slug of slugs) {
    try {
      const metaJson = await Deno.readTextFile(
        `${baseDir}/Blogs/${slug}/meta.json`
      );
      const meta: BlogMeta = JSON.parse(metaJson);
      if (!meta.published) continue;

      const content = await Deno.readTextFile(
        `${baseDir}/Blogs/${slug}/content.html`
      );
      const readingTime = calcReadingTime(content);
      posts.push({ ...meta, content, readingTime });
    } catch (e) {
      console.warn(`Skipping ${slug}: ${(e as Error).message}`);
    }
  }

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/** Load translated posts for a given language. Returns only posts that have both meta and content. */
async function loadTranslatedPosts(baseDir: string, lang: Lang, enPosts: BlogPost[]): Promise<BlogPost[]> {
  if (lang === "en") return enPosts;

  const posts: BlogPost[] = [];
  for (const enPost of enPosts) {
    try {
      const metaJson = await Deno.readTextFile(
        `${baseDir}/Blogs/${enPost.slug}/meta.${lang}.json`
      );
      const meta: BlogMeta = JSON.parse(metaJson);
      if (!meta.published) continue;

      const content = await Deno.readTextFile(
        `${baseDir}/Blogs/${enPost.slug}/content.${lang}.html`
      );
      const readingTime = calcReadingTime(content);
      // Use slug from English post (URL slugs stay in English)
      posts.push({ ...meta, slug: enPost.slug, content, readingTime });
    } catch {
      // Translation doesn't exist for this post — skip silently
    }
  }

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

// --- Read template ---

async function readTemplate(baseDir: string): Promise<string> {
  return await Deno.readTextFile(`${baseDir}/blog-post.html`);
}

// --- Build JSON-LD Article schema ---

function buildJsonLd(post: BlogPost, lang: Lang = "en"): string {
  const prefix = langPrefix(lang);
  const imageUrl = resolveImageUrl(post.slug, post.featuredImage);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || post.subtitle,
    image: imageUrl,
    datePublished: post.date,
    inLanguage: lang === "pt" ? "pt-BR" : lang,
    author: {
      "@type": post.author.name === "Regen Studio" ? "Organization" : "Person",
      name: post.author.name,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/Images/Logo-Text-on-the-sideAtivo 2.svg`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}${prefix}/blog/${post.slug}/`,
    },
  };
  return JSON.stringify(schema);
}

// --- Build JSON-LD BreadcrumbList schema ---

function buildBreadcrumbJsonLd(post: BlogPost, lang: Lang = "en"): string {
  const prefix = langPrefix(lang);
  const ui = UI[lang];
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: ui.home,
        item: `${SITE_URL}${prefix}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: ui.blog,
        item: `${SITE_URL}${prefix}/blog.html`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `${SITE_URL}${prefix}/blog/${post.slug}/`,
      },
    ],
  };
  return JSON.stringify(schema);
}

// --- Build hreflang link tags ---

function buildHreflangTags(slug: string, availableLangs: Lang[]): string {
  const tags: string[] = [];
  for (const lang of availableLangs) {
    const prefix = langPrefix(lang);
    const hreflang = lang === "pt" ? "pt-BR" : lang;
    tags.push(`  <link rel="alternate" hreflang="${hreflang}" href="${SITE_URL}${prefix}/blog/${slug}/">`);
  }
  // x-default points to English version
  tags.push(`  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/blog/${slug}/">`);
  return tags.join("\n");
}

// --- Build <head> for a static blog page ---

function buildHead(post: BlogPost, lang: Lang = "en", availableLangs: Lang[] = ["en"]): string {
  const prefix = langPrefix(lang);
  const ap = assetPrefix(lang);
  const canonicalUrl = `${SITE_URL}${prefix}/blog/${post.slug}/`;
  const imageUrl = resolveImageUrl(post.slug, post.featuredImage);
  const title = `${post.title} | ${SITE_NAME} Blog`;
  const description = post.excerpt || post.subtitle || SITE_DESCRIPTION;
  // Strip HTML entities and tags from description for meta tags
  const cleanDesc = stripHtml(description)
    .replace(/&mdash;/g, "\u2014")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");

  const hreflangSection = availableLangs.length > 1
    ? `\n  <!-- Hreflang alternates -->\n${buildHreflangTags(post.slug, availableLangs)}\n`
    : "";

  return `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://uemspezaqxmkhenimwuf.supabase.co; frame-src https://player.vimeo.com https://w.soundcloud.com; object-src 'none'; base-uri 'self'; form-action 'self' https://uemspezaqxmkhenimwuf.supabase.co">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(cleanDesc)}">

  <!-- Canonical -->
  <link rel="canonical" href="${canonicalUrl}">
${hreflangSection}
  <!-- Open Graph / Social -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(cleanDesc)}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:alt" content="${escapeHtml(post.featuredImageAlt || post.title)}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="${lang === "nl" ? "nl_NL" : lang === "pt" ? "pt_BR" : "en_US"}">
  <meta property="article:published_time" content="${post.date}">
  <meta property="article:modified_time" content="${post.date}">
  <meta property="article:author" content="${escapeHtml(post.author.name)}">

  <!-- Twitter/X Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(cleanDesc)}">
  <meta name="twitter:image" content="${imageUrl}">

  <!-- JSON-LD Article Schema -->
  <script type="application/ld+json">${buildJsonLd(post, lang)}</script>

  <!-- JSON-LD Breadcrumb Schema -->
  <script type="application/ld+json">${buildBreadcrumbJsonLd(post, lang)}</script>

  <!-- RSS Discovery -->
  <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} Blog" href="${SITE_URL}/feed.xml">

  <!-- Slug marker for blog.js hydration -->
  <meta name="blog-post-slug" content="${escapeHtml(post.slug)}">

  <link rel="icon" type="image/png" href="${ap}Images/favicon.png">
  <link rel="stylesheet" href="${ap}assets/fonts/fonts.css">
  <link rel="stylesheet" href="${ap}style.css">
  <link rel="stylesheet" href="${ap}blog.css">`;
}

// --- Build pre-rendered body sections ---

function buildPreRenderedHeader(post: BlogPost, lang: Lang = "en"): string {
  const ap = assetPrefix(lang);
  const prefix = langPrefix(lang);
  const ui = UI[lang];
  const cats = post.categories
    .map(
      (c) =>
        `<span class="post-header__category post-header__category--${CATEGORY_COLORS[c] || "gray"}">${escapeHtml(c)}</span>`
    )
    .join("");

  // Blog listing link: for translated pages, link to /<lang>/blog.html if it exists,
  // otherwise fall back to /blog.html (i18n.js will adjust at runtime)
  const blogHref = lang === "en" ? `${ap}blog.html` : `${ap}${lang}/blog.html`;

  return `
      <div class="container">
        <a href="${blogHref}" class="post-header__back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> ${escapeHtml(ui.backToBlog)}</a>
        <div class="post-header__categories">${cats}</div>
        <h1 class="post-header__title">${post.title}</h1>
        ${post.subtitle ? `<p class="post-header__subtitle">${post.subtitle}</p>` : ""}
        <div class="post-header__meta">
          <div class="post-header__author">
            <span class="post-header__author-name">${escapeHtml(post.author.name)}</span>
            ${post.author.role ? `<span class="post-header__author-role">${escapeHtml(post.author.role)}</span>` : ""}
          </div>
          <div class="post-header__meta-divider"></div>
          <div class="post-header__meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> <time datetime="${post.date}">${formatDate(post.date, lang)}</time></div>
          <div class="post-header__meta-divider"></div>
          <div class="post-header__meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${post.readingTime} ${escapeHtml(ui.minRead)}</div>
        </div>
      </div>`;
}

function buildPreRenderedFeaturedImage(post: BlogPost, lang: Lang = "en"): string {
  if (!post.featuredImage) return "";
  const ap = assetPrefix(lang);
  const src = resolveImageSrc(post.slug, post.featuredImage, ap);
  return `
      <div class="container">
        <img src="${src}" alt="${escapeHtml(post.featuredImageAlt || "")}">
      </div>`;
}

function buildPreRenderedContent(post: BlogPost, lang: Lang = "en"): string {
  // Answer capsule: visible excerpt summary at top of content for AI citation
  const capsule = post.excerpt
    ? `<p class="post-answer-capsule"><strong>${escapeHtml(stripHtml(post.excerpt).replace(/&mdash;/g, "\u2014").replace(/&rsquo;/g, "\u2019").replace(/&amp;/g, "&"))}</strong></p>`
    : "";

  // Adjust content image paths for the page depth
  const ap = assetPrefix(lang);
  const adjustedContent = adjustContentPaths(post.content, ap);

  return `
      <div class="post-content__inner">
        ${capsule}
        <div class="post-content__body" id="post-content">${adjustedContent}</div>
      </div>`;
}

// --- Adjust asset paths in nav/footer ---

function adjustTemplatePaths(html: string, prefix: string = "../../"): string {
  // Adjust href and src paths that are root-relative (not absolute, not #, not javascript:)
  // These are paths like "index.html", "Images/foo.svg", "blog.html", "assets/..."
  return html
    .replace(
      /href="((?!https?:\/\/|\/\/|#|mailto:|javascript:|\/blog\/)[^"]+)"/g,
      `href="${prefix}$1"`
    )
    .replace(
      /src="((?!https?:\/\/|\/\/|data:)[^"]+)"/g,
      `src="${prefix}$1"`
    );
}

// --- Extract nav and footer from template ---

function extractNav(template: string): string {
  const navMatch = template.match(
    /(<a href="#main-content"[\s\S]*?<\/a>\s*)?<!-- Navigation -->[\s\S]*?<\/nav>/
  );
  if (!navMatch) throw new Error("Could not extract nav from template");
  // Include skip link if present
  const skipLink = template.match(/<a href="#main-content"[^>]*>.*?<\/a>/);
  const nav = template.match(/<!-- Navigation -->[\s\S]*?<\/nav>/);
  return (skipLink ? skipLink[0] + "\n\n  " : "") + (nav ? nav[0] : "");
}

function extractFooter(template: string): string {
  const match = template.match(/<!-- Footer -->[\s\S]*?<\/footer>/);
  if (!match) throw new Error("Could not extract footer from template");
  return match[0];
}

// --- Localize internal page links for non-English blog posts ---

/** For non-EN langs, rewrite internal page links to locale-specific versions.
 *  e.g. "../../../index.html" → "../../../nl/index.html" */
function localizePageLinks(html: string, lang: Lang, ap: string): string {
  if (lang === "en") return html;
  const pages = ["index.html", "blog.html", "about.html", "faq.html",
    "client-projects.html", "innovation-services.html", "vision.html",
    "privacy.html", "terms.html", "thank-you.html"];
  let result = html;
  for (const page of pages) {
    // Match href="<ap><page>" (with optional #fragment or ?query)
    result = result.replaceAll(`href="${ap}${page}`, `href="${ap}${lang}/${page}`);
  }
  // Also localize root-relative fragment links like ../..//#contact-form → ../../nl/#contact-form
  result = result.replaceAll(`href="${ap}/#`, `href="${ap}${lang}/#`);
  return result;
}

// --- Generate a static HTML page for one blog post ---

function generatePage(
  post: BlogPost,
  template: string,
  lang: Lang = "en",
  availableLangs: Lang[] = ["en"],
): string {
  const ap = assetPrefix(lang);
  const nav = extractNav(template);
  const footer = extractFooter(template);

  const adjustedNav = localizePageLinks(adjustTemplatePaths(nav, ap), lang, ap);
  const adjustedFooter = adjustTemplatePaths(footer, ap);

  // Fix the Organization schema URL in footer (it gets wrongly prefixed)
  const fixedFooter = localizePageLinks(
    adjustedFooter
      .replace(
        `href="${ap}https://www.regenstudio.world"`,
        `href="${SITE_URL}"`
      )
      .replace(
        `href="${ap}https://www.regenstudio.world/Images/Logo-Text-on-the-sideAtivo 2.svg"`,
        `href="${SITE_URL}/Images/Logo-Text-on-the-sideAtivo 2.svg"`
      ),
    lang,
    ap,
  );

  return `<!DOCTYPE html>
<html lang="${lang === "pt" ? "pt-BR" : lang}">
<head>
${buildHead(post, lang, availableLangs)}
</head>
<body>
  ${adjustedNav}

  <!-- Post Header (pre-rendered, JS hydrates) -->
  <div id="main-content"></div>
  <section class="post-header" id="postHeader">${buildPreRenderedHeader(post, lang)}</section>

  <!-- Featured Image (pre-rendered) -->
  <section class="post-featured-image" id="postFeaturedImage">${buildPreRenderedFeaturedImage(post, lang)}</section>

  <!-- Post Content (pre-rendered, JS hydrates for share buttons etc.) -->
  <section class="post-content" id="postContent">${buildPreRenderedContent(post, lang)}</section>

  <!-- Related Posts (rendered by JS) -->
  <section class="related-posts" id="relatedPosts"></section>

  ${fixedFooter}

  <script src="${ap}assets/js/nav.js" defer></script>
  <script src="${ap}assets/js/i18n.js" defer></script>
  <script src="${ap}blog.js" defer></script>
  <script src="${ap}assets/js/tracker.js" defer></script>
</body>
</html>
`;
}

// --- Generate sitemap.xml ---

interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: string;
  priority: string;
  /** Map of hreflang → URL for language alternates */
  alternates?: Record<string, string>;
}

function generateSitemap(
  posts: BlogPost[],
  translationMap: Map<string, Set<Lang>> = new Map(),
): string {
  const today = new Date().toISOString().slice(0, 10);
  const hasAlternates = translationMap.size > 0 || translatedPages.size > 0;

  // Pages that have NL/PT translations (path relative to site root)
  const translatedPages = new Set([
    "/", "/about.html", "/blog.html", "/faq.html",
    "/client-projects.html", "/innovation-services.html",
    "/what-is-a-digital-product-passport/", "/what-is-espr/",
  ]);

  /** Build hreflang alternates for a translated static page */
  function staticAlternates(path: string): Record<string, string> {
    return {
      en: `${SITE_URL}${path}`,
      nl: `${SITE_URL}/nl${path === "/" ? "/" : path}`,
      "pt-BR": `${SITE_URL}/pt${path === "/" ? "/" : path}`,
      "x-default": `${SITE_URL}${path}`,
    };
  }

  const staticPages: SitemapEntry[] = [
    { loc: `${SITE_URL}/`, lastmod: today, changefreq: "monthly", priority: "1.0", alternates: staticAlternates("/") },
    {
      loc: `${SITE_URL}/about.html`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.8",
      alternates: staticAlternates("/about.html"),
    },
    {
      loc: `${SITE_URL}/blog.html`,
      lastmod: today,
      changefreq: "weekly",
      priority: "0.9",
      alternates: staticAlternates("/blog.html"),
    },
    { loc: `${SITE_URL}/faq.html`, lastmod: today, changefreq: "monthly", priority: "0.8", alternates: staticAlternates("/faq.html") },
    {
      loc: `${SITE_URL}/privacy.html`,
      lastmod: today,
      changefreq: "yearly",
      priority: "0.3",
    },
    {
      loc: `${SITE_URL}/terms.html`,
      lastmod: today,
      changefreq: "yearly",
      priority: "0.3",
    },
    {
      loc: `${SITE_URL}/client-projects.html`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.6",
      alternates: staticAlternates("/client-projects.html"),
    },
    {
      loc: `${SITE_URL}/innovation-services.html`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.8",
      alternates: staticAlternates("/innovation-services.html"),
    },
    {
      loc: `${SITE_URL}/llms.txt`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.3",
    },
    {
      loc: `${SITE_URL}/llms-full.txt`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.3",
    },
    {
      loc: `${SITE_URL}/carbon.txt`,
      lastmod: today,
      changefreq: "yearly",
      priority: "0.1",
    },
    {
      loc: `${SITE_URL}/digital-product-passports/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.9",
    },
    {
      loc: `${SITE_URL}/digital-identities/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    },
    {
      loc: `${SITE_URL}/problem-analysis/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.6",
    },
    {
      loc: `${SITE_URL}/what-is-a-digital-product-passport/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.8",
      alternates: staticAlternates("/what-is-a-digital-product-passport/"),
    },
    {
      loc: `${SITE_URL}/what-is-espr/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.8",
      alternates: staticAlternates("/what-is-espr/"),
    },
    {
      loc: `${SITE_URL}/what-is-the-construction-products-regulation/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.8",
    },
    {
      loc: `${SITE_URL}/what-is-eidas/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    },
    {
      loc: `${SITE_URL}/what-is-the-edi-wallet/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    },
    {
      loc: `${SITE_URL}/what-is-innovation-design/`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    },
  ];

  // Add NL and PT entries for translated static pages
  const translatedStaticEntries: SitemapEntry[] = [];
  for (const page of staticPages) {
    const path = page.loc.replace(SITE_URL, "");
    if (!translatedPages.has(path)) continue;
    const alts = staticAlternates(path);
    for (const lang of ["nl", "pt"] as const) {
      const hreflang = lang === "pt" ? "pt-BR" : lang;
      translatedStaticEntries.push({
        loc: alts[hreflang],
        lastmod: today,
        changefreq: page.changefreq,
        priority: String(Math.max(0.5, Number(page.priority) - 0.1)),
        alternates: alts,
      });
    }
  }

  // English blog entries with language alternates
  const blogEntries: SitemapEntry[] = posts.map((p) => {
    const entry: SitemapEntry = {
      loc: `${SITE_URL}/blog/${p.slug}/`,
      lastmod: p.date,
      changefreq: "monthly",
      priority: "0.7",
    };
    const langs = translationMap.get(p.slug);
    if (langs && langs.size > 1) {
      entry.alternates = {};
      for (const lang of langs) {
        const hreflang = lang === "pt" ? "pt-BR" : lang;
        const prefix = langPrefix(lang);
        entry.alternates[hreflang] = `${SITE_URL}${prefix}/blog/${p.slug}/`;
      }
      entry.alternates["x-default"] = `${SITE_URL}/blog/${p.slug}/`;
    }
    return entry;
  });

  // Translated blog entries
  const translatedBlogEntries: SitemapEntry[] = [];
  for (const [slug, langs] of translationMap) {
    for (const lang of langs) {
      if (lang === "en") continue;
      const enPost = posts.find((p) => p.slug === slug);
      if (!enPost) continue;
      const prefix = langPrefix(lang);
      const entry: SitemapEntry = {
        loc: `${SITE_URL}${prefix}/blog/${slug}/`,
        lastmod: enPost.date,
        changefreq: "monthly",
        priority: "0.6",
      };
      if (langs.size > 1) {
        entry.alternates = {};
        for (const altLang of langs) {
          const hreflang = altLang === "pt" ? "pt-BR" : altLang;
          const altPrefix = langPrefix(altLang);
          entry.alternates[hreflang] = `${SITE_URL}${altPrefix}/blog/${slug}/`;
        }
        entry.alternates["x-default"] = `${SITE_URL}/blog/${slug}/`;
      }
      translatedBlogEntries.push(entry);
    }
  }

  const allEntries = [...staticPages, ...translatedStaticEntries, ...blogEntries, ...translatedBlogEntries];

  const urls = allEntries
    .map((e) => {
      let alternateLinks = "";
      if (e.alternates) {
        for (const [hreflang, href] of Object.entries(e.alternates)) {
          alternateLinks += `\n    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(href)}" />`;
        }
      }
      return `  <url>
    <loc>${escapeXml(e.loc)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>${alternateLinks}
  </url>`;
    })
    .join("\n");

  // Add xhtml namespace if we have alternates
  const xmlns = hasAlternates
    ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"'
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlns}>
${urls}
</urlset>
`;
}

// --- Generate feed.xml (RSS 2.0) ---

function generateRssFeed(posts: BlogPost[]): string {
  const newest = posts.slice(0, 20);
  const pubDate = newest.length > 0 ? new Date(newest[0].date + "T00:00:00Z").toUTCString() : new Date().toUTCString();

  const items = newest
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}/`;
      const imageUrl = resolveImageUrl(p.slug, p.featuredImage);
      const desc = stripHtml(p.excerpt || p.subtitle || "");
      const itemDate = new Date(p.date + "T00:00:00Z").toUTCString();
      const categories = p.categories
        .map((c) => `      <category>${escapeXml(c)}</category>`)
        .join("\n");

      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${itemDate}</pubDate>
      <description>${escapeXml(desc)}</description>
      <author>${escapeXml(p.author.name)}</author>
${categories}
      <enclosure url="${escapeXml(imageUrl)}" type="${imageMimeType(imageUrl)}" />
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} Blog</title>
    <link>${SITE_URL}/blog.html</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <pubDate>${pubDate}</pubDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

// --- Main ---

async function main() {
  const baseDir = ".";
  console.log("Loading blog posts...");

  const posts = await loadPosts(baseDir);
  console.log(`Found ${posts.length} published posts.`);

  const template = await readTemplate(baseDir);

  // --- Build translation map (which slugs have which languages) ---
  const translationMap = new Map<string, Set<Lang>>();
  for (const post of posts) {
    const langs = new Set<Lang>(["en" as Lang]);
    for (const lang of SUPPORTED_LANGS) {
      if (lang === "en") continue;
      try {
        await Deno.stat(`${baseDir}/Blogs/${post.slug}/meta.${lang}.json`);
        await Deno.stat(`${baseDir}/Blogs/${post.slug}/content.${lang}.html`);
        langs.add(lang);
      } catch {
        // Translation not available
      }
    }
    translationMap.set(post.slug, langs);
  }

  // --- Load translated posts ---
  const translatedPosts: Map<Lang, BlogPost[]> = new Map();
  for (const lang of SUPPORTED_LANGS) {
    if (lang === "en") continue;
    const langPosts = await loadTranslatedPosts(baseDir, lang, posts);
    if (langPosts.length > 0) {
      translatedPosts.set(lang, langPosts);
      console.log(`Found ${langPosts.length} ${lang.toUpperCase()} translated posts.`);
    }
  }

  // Ensure blog/ directory exists
  try {
    await Deno.mkdir(`${baseDir}/blog`, { recursive: true });
  } catch { /* exists */ }

  // --- Generate English static pages ---
  let generated = 0;
  for (const post of posts) {
    const dir = `${baseDir}/blog/${post.slug}`;
    try {
      await Deno.mkdir(dir, { recursive: true });
    } catch { /* exists */ }

    const availableLangs = Array.from(translationMap.get(post.slug) || ["en"]) as Lang[];
    const html = generatePage(post, template, "en", availableLangs);
    await Deno.writeTextFile(`${dir}/index.html`, html);
    generated++;
    console.log(`  blog/${post.slug}/index.html`);
  }

  // --- Generate translated static pages ---
  let translatedGenerated = 0;
  for (const [lang, langPosts] of translatedPosts) {
    for (const post of langPosts) {
      const dir = `${baseDir}/${lang}/blog/${post.slug}`;
      try {
        await Deno.mkdir(dir, { recursive: true });
      } catch { /* exists */ }

      const availableLangs = Array.from(translationMap.get(post.slug) || ["en"]) as Lang[];
      const html = generatePage(post, template, lang, availableLangs);
      await Deno.writeTextFile(`${dir}/index.html`, html);
      translatedGenerated++;
      console.log(`  ${lang}/blog/${post.slug}/index.html`);
    }
  }

  // Generate sitemap.xml
  const sitemap = generateSitemap(posts, translationMap);
  await Deno.writeTextFile(`${baseDir}/sitemap.xml`, sitemap);
  console.log("  sitemap.xml");

  // Generate feed.xml (English only)
  const feed = generateRssFeed(posts);
  await Deno.writeTextFile(`${baseDir}/feed.xml`, feed);
  console.log("  feed.xml");

  // Verification
  const totalGenerated = generated + translatedGenerated;
  console.log(`\nDone! Generated ${generated} EN + ${translatedGenerated} translated blog pages + sitemap.xml + feed.xml`);

  // Verify all expected files exist
  let missing = 0;
  for (const post of posts) {
    try {
      await Deno.stat(`${baseDir}/blog/${post.slug}/index.html`);
    } catch {
      console.error(`  MISSING: blog/${post.slug}/index.html`);
      missing++;
    }
  }
  for (const [lang, langPosts] of translatedPosts) {
    for (const post of langPosts) {
      try {
        await Deno.stat(`${baseDir}/${lang}/blog/${post.slug}/index.html`);
      } catch {
        console.error(`  MISSING: ${lang}/blog/${post.slug}/index.html`);
        missing++;
      }
    }
  }
  try {
    await Deno.stat(`${baseDir}/sitemap.xml`);
  } catch {
    console.error("  MISSING: sitemap.xml");
    missing++;
  }
  try {
    await Deno.stat(`${baseDir}/feed.xml`);
  } catch {
    console.error("  MISSING: feed.xml");
    missing++;
  }

  if (missing > 0) {
    console.error(`\n${missing} file(s) missing!`);
    Deno.exit(1);
  }
  console.log("All files verified.");
}

main();
