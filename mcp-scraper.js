#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetch } from "undici";
import { load } from "cheerio";
import Parser from "rss-parser";
import { extract as extractArticle } from "@extractus/article-extractor";
import dayjs from "dayjs";
import fs from "node:fs/promises";

const server = new McpServer({
	name: "mcp-scraper",
	version: "1.0.0"
});

const scrapeInput = {
	url: z.string().url().describe("Absolute URL to fetch"),
	selector: z
		.string()
		.optional()
		.describe("CSS selector to extract; defaults to full text content")
};

server.registerTool(
	"scrape",
	{
		title: "Web Scraper",
		description: "Fetch a URL and extract content (optionally via CSS selector)",
		inputSchema: scrapeInput
	},
	async ({ url, selector }) => {
		try {
			const res = await fetch(url, {
				headers: {
					"user-agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
				}
			});
			if (!res.ok) {
				return {
					isError: true,
					content: [{ type: "text", text: `HTTP ${res.status} ${res.statusText}` }]
				};
			}

			const html = await res.text();
			const $ = load(html);
			let text;
			if (selector && selector.trim()) {
				const nodes = $(selector);
				if (nodes.length === 0) {
					return {
						isError: true,
						content: [{ type: "text", text: `No elements match selector: ${selector}` }]
					};
				}
				text = nodes
					.map((_, el) => $(el).text())
					.get()
					.join("\n\n")
					.trim();
			} else {
				text = $("body").text().replace(/\s+/g, " ").trim();
			}

			return {
				content: [
					{ type: "text", text: text || "" }
				]
			};
		} catch (err) {
			return {
				isError: true,
				content: [
					{ type: "text", text: `Scrape error: ${err instanceof Error ? err.message : String(err)}` }
				]
			};
		}
	}
);

// Additional tools for your MVP
const rss = new Parser();

const rssFetchInput = {
	feedUrl: z.string().url().describe("RSS/Atom feed URL"),
	limit: z.number().int().positive().optional(),
	sinceDays: z.number().int().positive().optional()
};

server.registerTool(
	"rss_fetch",
	{
		title: "RSS Fetch",
		description: "Fetch and parse an RSS/Atom feed",
		inputSchema: rssFetchInput
	},
	async ({ feedUrl, limit, sinceDays }) => {
		const feed = await rss.parseURL(feedUrl);
		const cutoff = sinceDays ? dayjs().subtract(sinceDays, "day") : null;
		let items = (feed.items || []).map((it) => ({
			title: it.title || "",
			link: it.link || "",
			pubDate: it.isoDate || it.pubDate || "",
			source: (feed.title || "").trim()
		}));
		if (cutoff) {
			items = items.filter((it) => {
				const d = dayjs(it.pubDate);
				return d.isValid() ? d.isAfter(cutoff) : true;
			});
		}
		if (limit) items = items.slice(0, limit);
		return { content: [{ type: "text", text: JSON.stringify({ title: feed.title || "", items }, null, 2) }] };
	}
);

const newsSearchInput = {
	query: z.string().describe("Search query (e.g., 'AAPL' or 'NVIDIA earnings')"),
	site: z.string().optional().describe("Restrict to site (e.g., cnbc.com)"),
	limit: z.number().int().positive().optional()
};

server.registerTool(
	"news_search",
	{
		title: "News Search (Google News RSS)",
		description: "Search Google News via RSS and return articles",
		inputSchema: newsSearchInput
	},
	async ({ query, site, limit }) => {
		const q = site ? `${query} site:${site}` : query;
		const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
		const feed = await rss.parseURL(url);
		let items = (feed.items || []).map((it) => ({
			title: it.title || "",
			link: it.link || "",
			pubDate: it.isoDate || it.pubDate || "",
			source: (it.creator || it.author || "").toString()
		}));
		if (limit) items = items.slice(0, limit);
		return { content: [{ type: "text", text: JSON.stringify({ query, items }, null, 2) }] };
	}
);

const extractInput = {
	url: z.string().url().describe("Article URL")
};

server.registerTool(
	"extract_article",
	{
		title: "Extract Article",
		description: "Extract main text from a news article URL",
		inputSchema: extractInput
	},
	async ({ url }) => {
		try {
			const result = await extractArticle(url);
			if (!result) {
				return { isError: true, content: [{ type: "text", text: "Failed to extract" }] };
			}
			const { title, content, author, published, source } = result;
			let text = "";
			if (content) {
				const $ = load(content);
				text = $("body").text().replace(/\s+/g, " ").trim();
			}
			const out = { title: title || "", author: author || "", published: published || "", source: source || "", url, text };
			return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
		} catch (err) {
			return { isError: true, content: [{ type: "text", text: `Extract error: ${err instanceof Error ? err.message : String(err)}` }] };
		}
	}
);

const analyzeInput = {
	text: z.string().min(1).describe("Text to analyze"),
	focus: z.string().optional().describe("Optional focus, e.g., 'sentiment for energy sector'")
};

server.registerTool(
	"analyze_text",
	{
		title: "Analyze Text",
		description: "Use the connected model to analyze tone, emotion, and signals",
		inputSchema: analyzeInput
	},
	async ({ text, focus }) => {
		const prompt = `You are a financial media analyst. Analyze the following text for market-relevant emotional tone and narrative signals. Output strict JSON with keys: sentiment (-1..1), emotions (array), sarcasmProbability (0..1), sectorMentions (array of {sector,count}), narratives (array of strings), keyPhrases (array), summary, focusNotes.

TEXT:\n${text}\n\nFOCUS: ${focus || "general"}`;
		const response = await server.server.createMessage({
			messages: [
				{ role: "user", content: { type: "text", text: prompt } }
			],
			maxTokens: 800
		});
		return { content: [{ type: "text", text: response.content.type === "text" ? response.content.text : String(response.content) }] };
	}
);

const coverageInput = {
	ticker: z.string().describe("Stock ticker, e.g., AAPL"),
	windowDays: z.number().int().positive().optional().describe("Lookback window in days (default 7)")
};

server.registerTool(
	"coverage_for_ticker",
	{
		title: "Coverage For Ticker",
		description: "Estimate recent news coverage volume for a ticker via Google News",
		inputSchema: coverageInput
	},
	async ({ ticker, windowDays }) => {
		const days = windowDays || 7;
		const q = `${ticker}`;
		const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
		const feed = await rss.parseURL(url);
		const cutoff = dayjs().subtract(days, "day");
		const items = (feed.items || []).map((it) => ({
			title: it.title || "",
			link: it.link || "",
			pubDate: it.isoDate || it.pubDate || "",
			source: (it.creator || it.author || "").toString()
		})).filter((it) => {
			const d = dayjs(it.pubDate);
			return d.isValid() ? d.isAfter(cutoff) : true;
		});
		const byDay = {};
		const bySource = {};
		for (const it of items) {
			const d = dayjs(it.pubDate).isValid() ? dayjs(it.pubDate).format("YYYY-MM-DD") : "unknown";
			byDay[d] = (byDay[d] || 0) + 1;
			const s = it.source || "unknown";
			bySource[s] = (bySource[s] || 0) + 1;
		}
		return {
			content: [{
				type: "text",
				text: JSON.stringify({ ticker, windowDays: days, total: items.length, byDay, topSources: Object.entries(bySource).sort((a,b)=>b[1]-a[1]).slice(0,10) }, null, 2)
			}]
		};
	}
);

// New tool: read a local file of URLs and output CSV with extracted text snippet
const scrapeListInput = {
	filePath: z.string().describe("Absolute path to a text file with one URL per line"),
	selector: z.string().optional().describe("Optional CSS selector to narrow extraction")
};

server.registerTool(
	"scrape_list_to_csv",
	{
		title: "Scrape List To CSV",
		description: "Read URLs from a file, scrape each, and return CSV text (url,title,snippet)",
		inputSchema: scrapeListInput
	},
	async ({ filePath, selector }) => {
		try {
			const raw = await fs.readFile(filePath, "utf8");
			const urls = raw
				.split(/\r?\n/)
				.map((s) => s.trim())
				.filter((s) => s && !s.startsWith("#"));
			const rows = [["url", "title", "snippet"]];
			for (const url of urls) {
				try {
					const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
					if (!res.ok) { rows.push([url, "", `HTTP ${res.status}`]); continue; }
					const html = await res.text();
					const $ = load(html);
					const title = ($("title").first().text() || "").trim();
					let text;
					if (selector && selector.trim()) {
						const nodes = $(selector);
						text = nodes.map((_, el) => $(el).text()).get().join(" ").replace(/\s+/g, " ").trim();
					} else {
						text = $("body").text().replace(/\s+/g, " ").trim();
					}
					rows.push([url, title, text.slice(0, 500)]);
				} catch (e) {
					rows.push([url, "", `error: ${e instanceof Error ? e.message : String(e)}`]);
				}
			}
			const csv = rows
				.map((r) => r.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(","))
				.join("\n");
			return { content: [{ type: "text", text: csv }] };
		} catch (err) {
			return { isError: true, content: [{ type: "text", text: `File error: ${err instanceof Error ? err.message : String(err)}` }] };
		}
	}
);

// New tool: write CSV directly to a file
const scrapeListToCsvFileInput = {
	filePath: z.string().describe("Absolute path to a text file with one URL per line"),
	outputPath: z.string().describe("Absolute path to write the CSV file"),
	selector: z.string().optional().describe("Optional CSS selector to narrow extraction")
};

server.registerTool(
	"scrape_list_to_csv_file",
	{
		title: "Scrape List To CSV File",
		description: "Read URLs from a file, scrape each, and save CSV to outputPath",
		inputSchema: scrapeListToCsvFileInput
	},
	async ({ filePath, outputPath, selector }) => {
		const res = await server.callTool("scrape_list_to_csv", { filePath, selector });
		const csvText = res?.content?.[0]?.type === "text" ? res.content[0].text : "";
		await fs.writeFile(outputPath, csvText, "utf8");
		return { content: [{ type: "text", text: `Wrote CSV: ${outputPath}` }] };
	}
);

// LLM-assisted extraction: fetch HTML then ask the connected model to extract readable article text
const llmListInput = {
	filePath: z.string().describe("Absolute path to a text file with one URL per line"),
	outputPath: z.string().optional().describe("If provided, write CSV here (url,title,text)")
};

server.registerTool(
	"llm_extract_list_to_csv",
	{
		title: "LLM Extract List To CSV",
		description: "Fetch each URL and have the connected model extract clean text; returns CSV",
		inputSchema: llmListInput
	},
	async ({ filePath, outputPath }) => {
		const raw = await fs.readFile(filePath, "utf8");
		const urls = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
		const rows = [["url","title","text"]];
		for (const url of urls) {
			try {
				const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
				if (!res.ok) { rows.push([url, "", `HTTP ${res.status}`]); continue; }
				const html = await res.text();
				const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
				const title = titleMatch ? titleMatch[1].trim() : "";
				const prompt = `Extract the primary readable article text from the following HTML. Return ONLY the plain text, no explanations or JSON. If it's not an article, return the most informative main text available.\n\nURL: ${url}\n\nHTML START\n${html.slice(0, 500000)}\nHTML END`;
				const response = await server.server.createMessage({
					messages: [ { role: "user", content: { type: "text", text: prompt } } ],
					maxTokens: 4000
				});
				const text = response.content.type === "text" ? response.content.text : String(response.content);
				rows.push([url, title, text.replace(/\s+/g, " ").trim().slice(0, 5000)]);
			} catch (e) {
				rows.push([url, "", `error: ${e instanceof Error ? e.message : String(e)}`]);
			}
		}
		const csv = rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\n");
		if (outputPath) { await fs.writeFile(outputPath, csv, "utf8"); return { content: [{ type: "text", text: `Wrote CSV: ${outputPath}` }] }; }
		return { content: [{ type: "text", text: csv }] };
	}
);

server.registerTool(
	"llm_extract_list_to_csv_file",
	{
		title: "LLM Extract List To CSV File",
		description: "Same as llm_extract_list_to_csv but always writes to outputPath",
		inputSchema: {
			filePath: z.string(),
			outputPath: z.string()
		}
	},
	async ({ filePath, outputPath }) => {
		const res = await server.callTool("llm_extract_list_to_csv", { filePath, outputPath });
		return res;
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("mcp-scraper running on stdio");
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
