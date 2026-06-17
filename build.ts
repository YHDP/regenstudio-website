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
  updated?: string;
  categories: string[];
  tags: string[];
  featuredImage: string;
  featuredImageAlt: string;
  excerpt: string;
  published: boolean;
  review?: { text: "draft" | "approved"; assets: "draft" | "approved" };
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
  footerNavigate: string;
  footerConnect: string;
  footerLocations: string;
  footerNetherlands: string;
  footerBrazil: string;
  footerAllRights: string;
  footerPrivacy: string;
  footerTerms: string;
  footerAbout: string;
  footerTagline: string;
}> = {
  en: {
    backToBlog: "Back to Blog", minRead: "min read", home: "Home", blog: "Blog",
    footerNavigate: "Navigate", footerConnect: "Connect", footerLocations: "Locations",
    footerNetherlands: "The Netherlands", footerBrazil: "Brazil",
    footerAllRights: "All rights reserved.",
    footerPrivacy: "Privacy Policy", footerTerms: "Terms of Use", footerAbout: "About",
    footerTagline: "Pioneering innovations in the regeneration of our natural, human, and urban ecosystems.",
  },
  nl: {
    backToBlog: "Terug naar Blog", minRead: "min leestijd", home: "Startpagina", blog: "Blog",
    footerNavigate: "Navigatie", footerConnect: "Contact", footerLocations: "Locaties",
    footerNetherlands: "Nederland", footerBrazil: "Brazili\u00EB",
    footerAllRights: "Alle rechten voorbehouden.",
    footerPrivacy: "Privacybeleid", footerTerms: "Gebruiksvoorwaarden", footerAbout: "Over Ons",
    footerTagline: "Baanbrekende innovaties voor het herstel van onze natuur, steden en menselijke ecosystemen.",
  },
  pt: {
    backToBlog: "Voltar ao Blog", minRead: "min de leitura", home: "In\u00EDcio", blog: "Blog",
    footerNavigate: "Navega\u00E7\u00E3o", footerConnect: "Contato", footerLocations: "Localiza\u00E7\u00F5es",
    footerNetherlands: "Holanda", footerBrazil: "Brasil",
    footerAllRights: "Todos os direitos reservados.",
    footerPrivacy: "Pol\u00EDtica de Privacidade", footerTerms: "Termos de Uso", footerAbout: "Sobre",
    footerTagline: "Inova\u00E7\u00F5es pioneiras para a regenera\u00E7\u00E3o dos nossos ecossistemas naturais, urbanos e humanos.",
  },
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
 * Adjust content paths for the page depth.
 * Blog content.html files use paths relative to the site root (no leading slash):
 *   "Blogs/slug/image.webp", "Images/file.svg", "assets/css/embed-consent.css",
 *   "privacy.html", "index.html".
 * These need a prefix to resolve correctly from the generated page at
 * /blog/<slug>/index.html (depth ../../) or /<lang>/blog/<slug>/index.html
 * (depth ../../../).
 *
 * Skips: absolute URLs (https://, http://, //), root-relative paths (/...),
 * anchors (#), data: URIs, mailto:, javascript:, and already-prefixed paths (../).
 */
function adjustContentPaths(content: string, prefix: string): string {
  // Match src="..." and href="..." (double quotes) where the value is a relative path.
  // Negative lookahead excludes absolute URLs, root-relative, anchors, data/mailto/javascript URIs,
  // and already-prefixed relative paths (../).
  const relativePathRe = /((?:src|href)=")(?!https?:\/\/|\/\/|\/|#|data:|mailto:|javascript:|\.\.\/)([^"]+)(")/g;

  // Same pattern for single-quoted attributes
  const relativePathReSingle = /((?:src|href)=')(?!https?:\/\/|\/\/|\/|#|data:|mailto:|javascript:|\.\.\/)([^']+)(')/g;

  return content
    .replace(relativePathRe, `$1${prefix}$2$3`)
    .replace(relativePathReSingle, `$1${prefix}$2$3`);
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
      if (meta.review?.text !== "approved" || meta.review?.assets !== "approved") {
        console.warn(`[skip] ${slug}: review incomplete (text=${meta.review?.text}, assets=${meta.review?.assets})`);
        continue;
      }

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
      if (meta.review?.text !== "approved" || meta.review?.assets !== "approved") {
        console.warn(`[skip] ${enPost.slug} (${lang}): review incomplete (text=${meta.review?.text}, assets=${meta.review?.assets})`);
        continue;
      }

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
  const wordCount = post.content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || post.subtitle,
    image: imageUrl,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    inLanguage: lang === "pt" ? "pt-BR" : lang,
    wordCount,
    timeRequired: `PT${post.readingTime}M`,
    author: post.author.name === "Regen Studio"
      ? {
          "@type": "Organization",
          "@id": `${SITE_URL}/#organization`,
          name: post.author.name,
          url: SITE_URL,
        }
      : {
          "@type": "Person",
          "@id": `${SITE_URL}/#founder`,
          name: post.author.name,
          url: `${SITE_URL}/about.html`,
        },
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/Images/Logo-Text-on-the-sideAtivo 2.svg`,
      },
    },
    keywords: post.categories.join(", "),
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
  const title = `${post.title} | ${SITE_NAME}`;
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://uemspezaqxmkhenimwuf.supabase.co; frame-src 'self' https://player.vimeo.com https://w.soundcloud.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self' https://uemspezaqxmkhenimwuf.supabase.co">
  <meta http-equiv="X-Content-Type-Options" content="nosniff">
  <meta http-equiv="X-Frame-Options" content="SAMEORIGIN">
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
  <meta property="og:locale" content="${lang === "nl" ? "nl_NL" : lang === "pt" ? "pt_BR" : "en_GB"}">
  <meta property="article:published_time" content="${post.date}">
  <meta property="article:modified_time" content="${post.updated || post.date}">
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
  <link rel="stylesheet" href="${ap}blog.css">
  <link rel="stylesheet" href="${ap}assets/css/antibot.css">`;
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

const FAQ_FOOTNOTE_RE = /<!--FAQ-FOOTNOTE-->([\s\S]*?)<!--\/FAQ-FOOTNOTE-->/;

/** Pull an optional FAQ block (wrapped in <!--FAQ-FOOTNOTE-->\u2026<!--/FAQ-FOOTNOTE--> markers)
 *  out of the body so generatePage can render it at the very end of the post \u2014
 *  after related posts + CTA \u2014 as a footnote. Posts without the marker are untouched. */
function splitFaqFootnote(content: string): { body: string; faq: string } {
  const m = content.match(FAQ_FOOTNOTE_RE);
  if (!m) return { body: content, faq: "" };
  return { body: content.replace(FAQ_FOOTNOTE_RE, ""), faq: m[1].trim() };
}

function buildPreRenderedContent(post: BlogPost, lang: Lang = "en"): string {
  // Answer capsule: visible excerpt summary at top of content for AI citation
  const capsule = post.excerpt
    ? `<p class="post-answer-capsule"><strong>${escapeHtml(stripHtml(post.excerpt).replace(/&mdash;/g, "\u2014").replace(/&rsquo;/g, "\u2019").replace(/&amp;/g, "&"))}</strong></p>`
    : "";

  // Adjust content image paths for the page depth; the FAQ footnote (if present) is
  // rendered separately at the very end of the post, after related posts.
  const ap = assetPrefix(lang);
  const { body } = splitFaqFootnote(post.content);
  const adjustedContent = adjustContentPaths(body, ap);

  return `
      <div class="post-content__inner">
        ${capsule}
        <div class="post-content__body" id="post-content">${adjustedContent}</div>
      </div>`;
}

/** FAQ rendered as a footnote at the very end of the post (after related posts + CTA). */
function buildFaqFootnote(post: BlogPost, lang: Lang = "en"): string {
  const { faq } = splitFaqFootnote(post.content);
  if (!faq) return "";
  const ap = assetPrefix(lang);
  return `
      <div class="container">
        <div class="post-faq__inner">${adjustContentPaths(faq, ap)}</div>
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
  // Note: terms.html is excluded — no NL/PT terms pages exist, so terms links always go to EN
  const pages = ["index.html", "blog.html", "about.html", "faq.html",
    "client-projects.html", "innovation-services.html", "vision.html",
    "privacy.html", "thank-you.html"];
  let result = html;
  for (const page of pages) {
    // Match href="<ap><page>" (with optional #fragment or ?query)
    result = result.replaceAll(`href="${ap}${page}`, `href="${ap}${lang}/${page}`);
  }
  // Also localize root-relative fragment links like ../..//#contact-form → ../../nl/#contact-form
  result = result.replaceAll(`href="${ap}/#`, `href="${ap}${lang}/#`);
  // Translate sr-only accessibility text
  const srOnlyText: Record<string, string> = {
    nl: "(opent in een nieuw tabblad)",
    pt: "(abre em nova aba)",
  };
  if (srOnlyText[lang]) {
    result = result.replaceAll("(opens in new tab)", srOnlyText[lang]);
  }
  return result;
}

// --- Translate footer text for non-English pages ---

function translateFooter(html: string, lang: Lang): string {
  if (lang === "en") return html;
  const ui = UI[lang];
  const en = UI["en"];
  return html
    // Section headings
    .replace(`<h2>${en.footerNavigate}</h2>`, `<h2>${ui.footerNavigate}</h2>`)
    .replace(`<h2>${en.footerConnect}</h2>`, `<h2>${ui.footerConnect}</h2>`)
    .replace(`<h2>${en.footerLocations}</h2>`, `<h2>${ui.footerLocations}</h2>`)
    // Country names
    .replace(`>${en.footerNetherlands}</p>`, `>${ui.footerNetherlands}</p>`)
    .replace(`>${en.footerBrazil}</p>`, `>${ui.footerBrazil}</p>`)
    // Tagline
    .replace(`>${en.footerTagline}</p>`, `>${ui.footerTagline}</p>`)
    // Bottom bar: "All rights reserved." + link labels
    .replace(en.footerAllRights, ui.footerAllRights)
    .replace(`>${en.footerPrivacy}</a>`, `>${ui.footerPrivacy}</a>`)
    .replace(`>${en.footerTerms}</a>`, `>${ui.footerTerms}</a>`)
    .replaceAll(`>${en.footerAbout}</a>`, `>${ui.footerAbout}</a>`);
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
  const faqFootnote = buildFaqFootnote(post, lang);

  const adjustedNav = localizePageLinks(adjustTemplatePaths(nav, ap), lang, ap);
  const adjustedFooter = adjustTemplatePaths(footer, ap);

  // Fix the Organization schema URL in footer (it gets wrongly prefixed)
  const fixedFooter = translateFooter(
    localizePageLinks(
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
    ),
    lang,
  );

  return `<!DOCTYPE html>
<html lang="${lang === "pt" ? "pt-BR" : lang}">
<head>
${buildHead(post, lang, availableLangs)}
</head>
<body>
  ${adjustedNav}

  <main id="main-content">
    <!-- Post Header (pre-rendered, JS hydrates) -->
    <section class="post-header" id="postHeader">${buildPreRenderedHeader(post, lang)}</section>

    <!-- Featured Image (pre-rendered) -->
    <section class="post-featured-image" id="postFeaturedImage">${buildPreRenderedFeaturedImage(post, lang)}</section>

    <!-- Post Content (pre-rendered, JS hydrates for share buttons etc.) -->
    <section class="post-content" id="postContent">${buildPreRenderedContent(post, lang)}</section>

    <!-- Related Posts (rendered by JS) -->
    <section class="related-posts" id="relatedPosts"></section>

    <!-- FAQ footnote: after related posts + CTA, at the very end of the post -->
    ${faqFootnote ? `<section class="post-faq" id="postFaq">${faqFootnote}</section>` : ""}
  </main>

  ${fixedFooter}

  <script src="${ap}assets/js/nav.js" defer></script>
  <script src="${ap}assets/js/i18n.js" defer></script>
  <script src="${ap}assets/js/antibot.js" defer></script>
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
    "/vision.html", "/privacy.html", "/thank-you.html",
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
      loc: `${SITE_URL}/vision.html`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.6",
      alternates: staticAlternates("/vision.html"),
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
        priority: Math.max(0.5, Number(page.priority) - 0.1).toFixed(1),
        alternates: alts,
      });
    }
  }

  // English blog entries with language alternates
  const blogEntries: SitemapEntry[] = posts.map((p) => {
    const entry: SitemapEntry = {
      loc: `${SITE_URL}/blog/${encodeURIComponent(p.slug)}/`,
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
        entry.alternates[hreflang] = `${SITE_URL}${prefix}/blog/${encodeURIComponent(p.slug)}/`;
      }
      entry.alternates["x-default"] = `${SITE_URL}/blog/${encodeURIComponent(p.slug)}/`;
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
        loc: `${SITE_URL}${prefix}/blog/${encodeURIComponent(slug)}/`,
        lastmod: enPost.date,
        changefreq: "monthly",
        priority: "0.6",
      };
      if (langs.size > 1) {
        entry.alternates = {};
        for (const altLang of langs) {
          const hreflang = altLang === "pt" ? "pt-BR" : altLang;
          const altPrefix = langPrefix(altLang);
          entry.alternates[hreflang] = `${SITE_URL}${altPrefix}/blog/${encodeURIComponent(slug)}/`;
        }
        entry.alternates["x-default"] = `${SITE_URL}/blog/${encodeURIComponent(slug)}/`;
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

/** Resolve image path to a local file path for stat() */
function resolveImageLocalPath(baseDir: string, slug: string, featuredImage: string): string {
  if (!featuredImage) return `${baseDir}/Images/og-image.png`;
  if (featuredImage.startsWith("../../")) {
    return `${baseDir}/${featuredImage.replace("../../", "")}`;
  }
  return `${baseDir}/Blogs/${slug}/${featuredImage}`;
}

/** URL-encode path segments while preserving slashes */
function encodeUrlPath(url: string): string {
  // Split on protocol+host, encode only the path part
  const match = url.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
  if (!match) return url;
  const [, origin, path] = match;
  if (!path) return origin;
  return origin + path.split("/").map(s => encodeURIComponent(s)).join("/");
}

async function generateRssFeed(baseDir: string, posts: BlogPost[]): Promise<string> {
  const newest = posts.slice(0, 20);
  const pubDate = newest.length > 0 ? new Date(newest[0].date + "T00:00:00Z").toUTCString() : new Date().toUTCString();

  const items: string[] = [];
  for (const p of newest) {
    const url = `${SITE_URL}/blog/${p.slug}/`;
    const rawImageUrl = resolveImageUrl(p.slug, p.featuredImage);
    const imageUrl = encodeUrlPath(rawImageUrl);
    const desc = stripHtml(p.excerpt || p.subtitle || "");
    const itemDate = new Date(p.date + "T00:00:00Z").toUTCString();
    const categories = p.categories
      .map((c) => `      <category>${escapeXml(c)}</category>`)
      .join("\n");

    // Get file size for enclosure length attribute
    let fileSize = 0;
    try {
      const localPath = resolveImageLocalPath(baseDir, p.slug, p.featuredImage);
      const stat = await Deno.stat(localPath);
      fileSize = stat.size;
    } catch {
      // File not found — use 0
    }

    // RSS 2.0 <author> requires "email (Name)" format
    const authorName = p.author.name;
    const authorEmail = `noreply@regenstudio.world (${authorName})`;

    items.push(`    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${itemDate}</pubDate>
      <description>${escapeXml(desc)}</description>
      <author>${escapeXml(authorEmail)}</author>
${categories}
      <enclosure url="${escapeXml(imageUrl)}" type="${imageMimeType(rawImageUrl)}" length="${fileSize}" />
    </item>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} Blog</title>
    <link>${SITE_URL}/blog.html</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <pubDate>${pubDate}</pubDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items.join("\n")}
  </channel>
</rss>
`;
}

// --- Comment stage (draft render + review widget, isolated, never published) ---

/** Load ONE post by slug WITHOUT the published/review filter. Draft-capable. */
async function loadDraftPost(baseDir: string, slug: string, lang: Lang): Promise<BlogPost> {
  const sfx = lang === "en" ? "" : `.${lang}`;
  const meta: BlogMeta = JSON.parse(
    await Deno.readTextFile(`${baseDir}/Blogs/${slug}/meta${sfx}.json`)
  );
  const content = await Deno.readTextFile(`${baseDir}/Blogs/${slug}/content${sfx}.html`);
  return { ...meta, slug, content, readingTime: calcReadingTime(content) };
}

/** Hex-encode crypto material (salt/iv/ct). Hex is [0-9a-f] only, so the
 *  ciphertext can never contain the pre-push readable-leak tokens
 *  (the hook readable-leak tokens: sector acronyms, Dutch dates, placeholders) — fixes the false-positive
 *  at our source, leaving the security hook fully intact. */
function hex(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) s += u[i].toString(16).padStart(2, "0");
  return s;
}
function b64(u: Uint8Array): string {
  let s = "";
  const C = 0x8000;
  for (let i = 0; i < u.length; i += C) s += String.fromCharCode(...u.subarray(i, i + C));
  return btoa(s);
}

/** Password-encrypt (PBKDF2 → AES-GCM, WebCrypto) so the deployed artifact is
 *  ciphertext, not a readable draft. Password never persisted; only salt/iv/ct ship. */
const MIME: Record<string, string> = {
  webp: "image/webp", png: "image/png", svg: "image/svg+xml",
  jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
};
async function dataUri(path: string): Promise<string | null> {
  try {
    const bytes = await Deno.readFile(path);
    const ext = (path.split(".").pop() || "").toLowerCase();
    const m = MIME[ext];
    return m ? `data:${m};base64,${b64(bytes)}` : null;
  } catch { return null; }
}

/** Inline the confidential/not-yet-live assets into the HTML as data URIs so
 *  the encrypted artifact is fully self-contained: the draft's own images
 *  (Blogs/<slug>/*) and the two new client logos that aren't on the live site
 *  yet. Public, already-deployed site assets (CSS/JS, existing carousel logos)
 *  stay as live-site refs — they are not confidential and reduce blob size. */
async function inlineAssets(html: string, baseDir: string, slug: string, lang: Lang): Promise<string> {
  const prefix = assetPrefix(lang);
  const targets: string[] = ["Images/client-logos/coe-dpp.svg", "Images/client-logos/rvo.png"];
  try {
    for await (const e of Deno.readDir(`${baseDir}/Blogs/${slug}`)) {
      if (e.isFile && /\.(webp|png|jpe?g|svg|gif)$/i.test(e.name)) targets.push(`Blogs/${slug}/${e.name}`);
    }
  } catch { /* no post dir */ }
  let out = html;
  for (const rel of targets) {
    const uri = await dataUri(`${baseDir}/${rel}`);
    if (uri) out = out.split(`${prefix}${rel}`).join(uri);
  }
  return out;
}

async function encryptHtml(html: string, password: string) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(html)));
  return { salt: hex(salt), iv: hex(iv), ct: hex(ct) };
}

function decryptorShell(d: { salt: string; iv: string; ct: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protected review</title>
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;background:#1a1a2e;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.c{background:#fff;color:#1a1a2e;max-width:400px;width:90%;padding:30px;border-radius:14px}h1{font-size:18px;margin:0 0 6px}p{font-size:14px;color:#4a5568}input{width:100%;padding:11px;border:1px solid #ccc;border-radius:8px;font:inherit;margin:14px 0}button{width:100%;padding:11px;border:0;border-radius:999px;background:#008545;color:#fff;font:700 15px/1 inherit;cursor:pointer}.e{color:#93093F;font-size:13px;min-height:18px;margin-top:8px}</style></head>
<body><div class="c"><h1>Protected review</h1><p>This is a confidential pre-publication draft. Enter the review password to continue.</p><input id="pw" type="password" placeholder="Review password" autocomplete="off"><button id="go">Unlock</button><div class="e" id="err"></div></div>
<script>
var D={salt:"${d.salt}",iv:"${d.iv}",ct:"${d.ct}"};
function u8(h){var a=new Uint8Array(h.length/2);for(var i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a;}
async function go(){var pw=document.getElementById('pw').value;if(!pw)return;document.getElementById('err').textContent='Decrypting…';
try{var enc=new TextEncoder();var km=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);
var key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:u8(D.salt),iterations:250000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:u8(D.iv)},key,u8(D.ct));
var html=new TextDecoder().decode(pt);document.open();document.write(html);document.close();
}catch(e){document.getElementById('err').textContent='Wrong password. Try again.';}}
document.getElementById('go').addEventListener('click',go);
document.getElementById('pw').addEventListener('keydown',function(e){if(e.key==='Enter')go();});
</script></body></html>
`;
}

async function buildCommentStage(
  baseDir: string, slug: string, langArg: Lang | null, password: string | null,
): Promise<void> {
  // Detect available languages for this slug (EN always; nl/pt if present).
  let langs: Lang[] = ["en"];
  for (const lng of SUPPORTED_LANGS) {
    if (lng === "en") continue;
    try {
      await Deno.stat(`${baseDir}/Blogs/${slug}/meta.${lng}.json`);
      await Deno.stat(`${baseDir}/Blogs/${slug}/content.${lng}.html`);
      langs.push(lng);
    } catch { /* no translation */ }
  }
  if (langArg) langs = langs.filter((l) => l === langArg);
  if (langs.length === 0) { console.error(`No ${langArg} draft for ${slug}.`); Deno.exit(2); }

  const template = await readTemplate(baseDir);
  const widget = await Deno.readTextFile(`${baseDir}/scripts/comment-stage-widget.html`);
  const cut = (a: string, b?: string) => {
    const i = widget.indexOf(a) + a.length;
    const j = b ? widget.indexOf(b) : widget.length;
    return widget.slice(i, j).trim();
  };
  const wHead = cut("<!-- ==WIDGET-HEAD== -->", "<!-- ==WIDGET-BODY== -->");
  const wBody = cut("<!-- ==WIDGET-BODY== -->", "<!-- ==WIDGET-SCRIPT== -->");
  const wScript = cut("<!-- ==WIDGET-SCRIPT== -->");

  // Stable per-slug path (no random suffix) so a shared partner URL stays
  // durable across re-deploys; confidentiality rests on the password, not path
  // obscurity (artifact is encrypted + noindex + robots-disallowed).
  for (const lang of langs) {
    const post = await loadDraftPost(baseDir, slug, lang);
    let html = generatePage(post, template, lang, langs);
    // Strip first-party analytics from a confidential review artifact (privacy minimisation).
    html = html.replace(/\s*<script src="[^"]*assets\/js\/tracker\.js" defer><\/script>/, "");
    // Overlay the review widget (Stage-2 unified pattern: @media screen only).
    html = html.replace("</head>", `${wHead}\n</head>`)
               .replace("<body>", `<body>\n${wBody}`)
               .replace("</body>", `${wScript}\n</body>`);

    const sub = lang === "en" ? "" : `/${lang}`;
    const localDir = `${baseDir}/_comment-stage/${slug}${sub}`;
    await Deno.mkdir(localDir, { recursive: true });
    await Deno.writeTextFile(`${localDir}/index.html`, html);
    console.log(`  _comment-stage/${slug}${sub}/index.html`);

    if (password) {
      const deployDir = `${baseDir}/_review/${slug}${sub}`;
      await Deno.mkdir(deployDir, { recursive: true });
      const enc = await encryptHtml(await inlineAssets(html, baseDir, slug, lang), password);
      await Deno.writeTextFile(`${deployDir}/index.html`, decryptorShell(enc));
      console.log(`  _review/${slug}${sub}/index.html  (encrypted)`);
    }
  }

  console.log(`\nComment stage built for "${slug}" (${langs.join(", ")}).`);
  console.log(`Local preview: serve repo root, open http://localhost:8000/_comment-stage/${slug}/`);
  if (password) {
    console.log(`Encrypted deploy artifact: /_review/${slug}/  (password set at build time, not stored)`);
    console.log(`Deploying it is a git push = explicit per-push authorisation.`);
  } else {
    console.log(`No --password given: only the local plaintext was written (gitignored, never push).`);
  }
}

// --- Main ---

async function main() {
  const baseDir = ".";

  // Comment-stage mode: render a DRAFT through the real pipeline + overlay the
  // review widget. Isolated; returns BEFORE any blog/sitemap/feed write.
  const args = Deno.args;
  const csIdx = args.indexOf("--comment-stage");
  if (csIdx !== -1) {
    const slug = args[csIdx + 1];
    if (!slug || slug.startsWith("--")) { console.error("--comment-stage requires a <slug>"); Deno.exit(2); }
    const lIdx = args.indexOf("--lang");
    const langArg = (lIdx !== -1 ? args[lIdx + 1] : null) as Lang | null;
    let password: string | null = null;
    const pIdx = args.indexOf("--password");
    if (pIdx !== -1) password = args[pIdx + 1];
    else { try { password = Deno.env.get("COMMENT_STAGE_PW") || null; } catch { /* --allow-env not granted */ } }
    await buildCommentStage(baseDir, slug, langArg, password);
    return;
  }

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
  const feed = await generateRssFeed(baseDir, posts);
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

  // --- JSON-LD lint: warn if HTML entities appear in structured data ---
  const HTML_ENTITIES = [
    { entity: "&mdash;", unicode: "\u2014" },
    { entity: "&ndash;", unicode: "\u2013" },
    { entity: "&rsquo;", unicode: "\u2019" },
    { entity: "&lsquo;", unicode: "\u2018" },
    { entity: "&rdquo;", unicode: "\u201D" },
    { entity: "&ldquo;", unicode: "\u201C" },
    { entity: "&hellip;", unicode: "\u2026" },
    { entity: "&amp;", unicode: "&" },
    { entity: "&nbsp;", unicode: " " },
  ];
  const jsonLdPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let lintWarnings = 0;

  // Lint source meta.json files
  for (const post of posts) {
    for (const lang of SUPPORTED_LANGS) {
      const suffix = lang === "en" ? "" : `.${lang}`;
      const metaPath = `${baseDir}/Blogs/${post.slug}/meta${suffix}.json`;
      try {
        const metaText = await Deno.readTextFile(metaPath);
        for (const { entity } of HTML_ENTITIES) {
          if (metaText.includes(entity)) {
            console.warn(`  LINT: ${metaPath} contains "${entity}" — use Unicode instead`);
            lintWarnings++;
          }
        }
      } catch { /* file doesn't exist */ }
    }
  }

  // Lint generated JSON-LD blocks
  const generatedDirs = [
    ...posts.map((p) => `${baseDir}/blog/${p.slug}/index.html`),
    ...Array.from(translatedPosts.entries()).flatMap(([lang, langPosts]) =>
      langPosts.map((p) => `${baseDir}/${lang}/blog/${p.slug}/index.html`)
    ),
  ];
  for (const filePath of generatedDirs) {
    try {
      const html = await Deno.readTextFile(filePath);
      let match;
      while ((match = jsonLdPattern.exec(html)) !== null) {
        const jsonLd = match[1];
        for (const { entity } of HTML_ENTITIES) {
          if (jsonLd.includes(entity)) {
            console.warn(`  LINT: ${filePath} JSON-LD contains "${entity}"`);
            lintWarnings++;
          }
        }
      }
    } catch { /* file doesn't exist */ }
  }

  if (lintWarnings > 0) {
    console.warn(`\n${lintWarnings} JSON-LD lint warning(s) — fix HTML entities in source meta.json files.`);
  } else {
    console.log("JSON-LD lint: clean.");
  }
}

main();
