#!/usr/bin/env node
import fs from "node:fs/promises";
import { fetch } from "undici";
import { load } from "cheerio";
import { extract as extractArticle } from "@extractus/article-extractor";

async function resolveGoogleNews(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return url;
    const html = await res.text();
    const $ = load(html);
    // Try common patterns: meta refresh
    const meta = $('meta[http-equiv="refresh"]').attr('content');
    if (meta && meta.toLowerCase().includes('url=')) {
      const target = meta.split('url=')[1].trim();
      if (target && !target.includes('news.google.')) return target;
    }
    // Try canonical
    const canonical = $('link[rel="canonical"]').attr('href');
    if (canonical && !canonical.includes('news.google.')) return canonical;
    // Try first external anchor
    const a = $('a[href^="http"]').toArray().map(el=>$(el).attr('href')).find(h => h && !h.includes('news.google.') && !h.includes('google.com'));
    if (a) return a;
  } catch (_) {}
  return url;
}

async function extractCleanText(url, selector) {
  try {
    const art = await extractArticle(url);
    if (art && art.content) {
      const $ = load(art.content);
      const txt = $("body").text().replace(/\s+/g, " ").trim();
      return { title: art.title || "", text: txt };
    }
  } catch (_) {}
  // Fallback to raw page scrape
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) return { title: "", text: `HTTP ${res.status}` };
  const html = await res.text();
  const $ = load(html);
  const title = ($("title").first().text() || "").trim();
  let text;
  if (selector) {
    const nodes = $(selector);
    text = nodes.map((_, el) => $(el).text()).get().join(" ").replace(/\s+/g, " ").trim();
  } else {
    text = $("body").text().replace(/\s+/g, " ").trim();
  }
  return { title, text };
}

async function main() {
  const inPath = process.argv[2] || "/Users/nhathan/Desktop/urls.txt";
  const outPath = process.argv[3] || "/Users/nhathan/Desktop/out.csv";
  const selector = process.argv[4];
  const raw = await fs.readFile(inPath, "utf8");
  const urls = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const rows = [["url","title","snippet"]];
  for (const url of urls) {
    try {
      const host = new URL(url).host;
      let finalUrl = url;
      if (host === "news.google.com") {
        finalUrl = await resolveGoogleNews(url);
      }
      const { title, text } = await extractCleanText(finalUrl, selector);
      rows.push([finalUrl, title, (text || "").slice(0, 500)]);
    } catch (e) {
      rows.push([url, "", `error: ${e instanceof Error ? e.message : String(e)}`]);
    }
  }
  const csv = rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\n");
  await fs.writeFile(outPath, csv, "utf8");
  console.log(`Wrote ${rows.length-1} rows to ${outPath}`);
}

main().catch(err=>{ console.error(err); process.exit(1); });
