#!/usr/bin/env python3
import sys
import csv
import time
import re
import argparse
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}

# Default sites (you can also pass --sites-file with one URL per line)
SITES = [
    "https://www.marketwatch.com/",
    "https://www.reuters.com/markets/",
    "https://www.cnbc.com/markets/",
    "https://www.barrons.com/",
    "https://www.bloomberg.com/markets",
    "https://www.ft.com/markets",
    "https://www.forbes.com/markets/",
    "https://www.thestreet.com/markets",
    "https://seekingalpha.com/market-news",
    "https://www.moneyweek.com/",
]

EXTRACTORS = {
    "marketwatch.com": {
        "article": ["div.article__content", "div.article__body"],
        "headline": ["h1.article__headline"],
        "links": ["a.element--article", "a.link"],
        "date": ["time[datetime]", "span.timestamp__date"]
    },
    "reuters.com": {
        "article": ["div.article-body__content", "div.article-body__container"],
        "headline": ["h1[data-testid='Heading']", "h1.headline_2zdFM"],
        "links": ["a[data-testid='Heading']", "a.story-card-link", "a.text__text__1FZLe"],
        "date": ["time[data-testid='Timestamp']", "time[datetime]"]
    },
    "cnbc.com": {
        "article": ["div.ArticleBody-articleBody", "div.group"],
        "headline": ["h1.ArticleHeader-headline"],
        "links": ["a.Card-title", "a.LatestNews-headline", "a.HeroLedeHero-hed"],
        "date": ["time[datetime]", "span.ArticleHeader-time"]
    },
    "barrons.com": {
        "article": ["div.articleBody"],
        "headline": ["h1"],
        "links": ["a[href*='/articles/']"],
        "date": ["time[datetime]", "span.ttdateline__time"]
    },
    "bloomberg.com": {
        "article": ["section[data-component='story-body']", "div.body-copy"],
        "headline": ["h1"],
        "links": ["a[href*='/news/']", "a[href*='/articles/']"],
        "date": ["time[datetime]"]
    },
    "ft.com": {
        "article": ["div.article__content", "div.o-typography-wrapper"],
        "headline": ["h1"],
        "links": ["a.js-teaser-heading-link", "a.o-teaser__heading"],
        "date": ["time[datetime]"]
    },
    "forbes.com": {
        "article": ["div.f-article-body"],
        "headline": ["h1"] ,
        "links": ["a[href*='/sites/'][href*='/202']", "a.card__headline"],
        "date": ["time[datetime]", "div.date"]
    },
    "thestreet.com": {
        "article": ["div#article-content", "div.body"],
        "headline": ["h1"],
        "links": ["a[href*='/markets/']", "a[href*='/investing/']"],
        "date": ["time[datetime]"]
    },
    "seekingalpha.com": {
        "article": ["div[data-test-id='content-container']"],
        "headline": ["h1[data-test-id='quote-header']", "h1"],
        "links": ["a[href*='/news/']", "a[href*='/news/stock-market-news']"],
        "date": ["time[datetime]"]
    },
    "moneyweek.com": {
        "article": ["div.article__content"],
        "headline": ["h1"],
        "links": ["a.card__title", "a[href*='/news/']"],
        "date": ["time[datetime]"]
    }
}

ARTICLE_PATTERNS = re.compile(r"/(news|article|articles|markets|story|stories)/", re.I)


def parse_date(soup, selectors):
    # try common selectors/meta
    for sel in selectors or []:
        node = soup.select_one(sel)
        if node:
            val = node.get("datetime") or node.get_text(" ", strip=True)
            if val:
                try:
                    # attempt ISO or flexible parse
                    return datetime.fromisoformat(val.replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
                except Exception:
                    pass
    # meta tags
    for name in ["article:published_time", "og:updated_time", "date", "pubdate"]:
        m = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if m and m.get("content"):
            val = m["content"]
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
            except Exception:
                continue
    return None


def get_text(soup, selectors):
    for sel in selectors:
        node = soup.select_one(sel)
        if node:
            text = re.sub(r"\s+", " ", node.get_text(strip=True))
            if text:
                return text
    return ""


def extract_links(base_url, soup, selectors, max_per_site):
    urls = []
    for sel in selectors:
        for a in soup.select(sel):
            href = a.get("href")
            if not href:
                continue
            full = urljoin(base_url, href)
            if not full.startswith("http"):
                continue
            path = urlparse(full).path
            if ARTICLE_PATTERNS.search(path):
                urls.append(full)
            else:
                urls.append(full)
            if len(urls) >= max_per_site * 2:
                break
        if len(urls) >= max_per_site * 2:
            break
    seen = set()
    out = []
    for u in urls:
        if u not in seen:
            out.append(u)
            seen.add(u)
        if len(out) >= max_per_site:
            break
    return out


def fetch(url):
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.text


def scrape_article(url, cutoff):
    html = fetch(url)
    soup = BeautifulSoup(html, "html.parser")
    host = re.sub(r"^www\.", "", urlparse(url).netloc)
    conf = None
    for k in EXTRACTORS:
        if k in host:
            conf = EXTRACTORS[k]
            break
    # date filter
    dt = parse_date(soup, (conf or {}).get("date"))
    if cutoff and dt and dt < cutoff:
        return None, None, dt
    headline = get_text(soup, (conf or {}).get("headline", ["h1", "title"]))
    body = get_text(soup, (conf or {}).get("article", ["article", "main", "body"]))
    return headline, body, dt


def scrape_sites(sites, max_per_site, since_days):
    rows = []
    cutoff = None
    if since_days is not None:
        cutoff = datetime.now() - timedelta(days=since_days)
    for site in sites:
        try:
            html = fetch(site)
            soup = BeautifulSoup(html, "html.parser")
            host = re.sub(r"^www\.", "", urlparse(site).netloc)
            conf = None
            for k in EXTRACTORS:
                if k in host:
                    conf = EXTRACTORS[k]
                    break
            link_sels = (conf or {}).get("links", ["a"])
            links = extract_links(site, soup, link_sels, max_per_site)
            for link in links:
                try:
                    h, b, dt = scrape_article(link, cutoff)
                    if h or b:
                        rows.append((link, h, b, dt.isoformat() if dt else ""))
                        time.sleep(0.5)
                except Exception:
                    continue
        except Exception:
            continue
    return rows


def main():
    parser = argparse.ArgumentParser(description="Scrape stock news from multiple sites to CSV")
    parser.add_argument("out_csv", nargs="?", default="/Users/nhathan/Desktop/py_news.csv")
    parser.add_argument("--max-per-site", type=int, default=50)
    parser.add_argument("--sites-file", type=str, help="Path to file with site URLs (one per line)")
    parser.add_argument("--since-days", type=int, help="Only include articles published within the last N days")
    args = parser.parse_args()

    sites = SITES
    if args.sites_file:
        try:
            with open(args.sites_file, "r", encoding="utf-8") as f:
                sites = [l.strip() for l in f if l.strip()]
        except Exception:
            pass

    rows = scrape_sites(sites, args.max_per_site, args.since_days)
    with open(args.out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["url", "headline", "text", "published_iso"])
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {args.out_csv}")


if __name__ == "__main__":
    main()
