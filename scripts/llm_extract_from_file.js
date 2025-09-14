#!/usr/bin/env node
import fs from "node:fs/promises";
import { fetch } from "undici";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219";
const MAX_HTML_CHARS = Number(process.env.MAX_HTML_CHARS || 120000);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 60000);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function csvRow(cells) {
	return cells.map(c => '"' + String(c ?? "").replace(/"/g, '""') + '"').join(",");
}

async function extractTextWithClaude(url, html) {
	const prompt = `Extract the primary readable article text from the URL below. It's a valid date. Return ONLY plain text, no explanations, no JSON. If it's not an article, return the main informative text.\n\nURL: ${url}\n`;
	if (process.env.DEBUG_PROMPT === "1") {
		console.log("\n--- PROMPT START ---\n" + prompt + "\n--- PROMPT END ---\n");
	}
	const msg = await anthropic.messages.create({
		model: MODEL,
		max_tokens: 4000,
		messages: [ { role: "user", content: prompt } ]
	});
	const c = msg.content?.[0];
	return c && c.type === "text" ? c.text : "";
}

async function main() {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new Error("Missing ANTHROPIC_API_KEY env var");
	}
	const inPath = process.argv[2] || "/Users/nhathan/Desktop/hackmit/urls.txt";
	const outPath = process.argv[3] || "/Users/nhathan/Desktop/out_llm.csv";
	const raw = await fs.readFile(inPath, "utf8");
	const urls = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
	const rows = [["url", "title", "text"]];
	for (const url of urls) {
		try {
			const resp = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
			if (!resp.ok) { rows.push([url, "", `HTTP ${resp.status}`]); await sleep(REQUEST_DELAY_MS); continue; }
			const html = await resp.text();
			const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
			const title = titleMatch ? titleMatch[1].trim() : "";
			const text = await extractTextWithClaude(url, html);
			rows.push([url, title, text.replace(/\s+/g, " ").trim()]);
		} catch (e) {
			rows.push([url, "", `error: ${e instanceof Error ? e.message : String(e)}`]);
		}
		// throttle between requests
		await sleep(REQUEST_DELAY_MS);
	}
	const csv = rows.map(csvRow).join("\n");
	await fs.writeFile(outPath, csv, "utf8");
	console.log(`Wrote ${rows.length - 1} rows to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
