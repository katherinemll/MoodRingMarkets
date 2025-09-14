#!/usr/bin/env node
import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const SITES = [
	"Bloomberg",
	"Financial Times (FT)",
	"Reuters – Finance Section",
	"MarketWatch",
	"Forbes",
	"TheStreet",
	"Seeking Alpha",
	"The Banker",
	"MoneyWeek",
	"CNBC",
	"Barron’s"
];

function buildPrompt() {
	return `Goal: Produce exactly 11 direct publisher article URLs (no RSS, no Google News), each the newest stock-related article from these sites, one per site, in the same order:
${SITES.map((s,i)=>`${i+1}) ${s}`).join("\n")}.

Rules:
- Return only the 11 URLs, one per line, no bullets or extra text.
- Each URL must be a canonical publisher article page.
- Prefer latest publication time.
- If access blocked, pick the newest accessible article from that site.
- Do not include tracking parameters if possible.
`;
}

async function main() {
	if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
	const outPath = process.argv[2] || "/Users/nhathan/Desktop/hackmit/urls.txt";
	const prompt = buildPrompt();
	const msg = await anthropic.messages.create({
		model: MODEL,
		max_tokens: 1200,
		messages: [{ role: "user", content: prompt }]
	});
	const c = msg.content?.[0];
	const text = c && c.type === "text" ? c.text.trim() : "";
	const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0, 11);
	if (lines.length < 11) console.warn(`Warning: got ${lines.length} lines from Claude`);
	await fs.writeFile(outPath, lines.join("\n") + "\n", "utf8");
	console.log(`Wrote ${lines.length} URLs to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
