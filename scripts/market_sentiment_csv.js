#!/usr/bin/env node
import fs from "node:fs/promises";
import { open as fsOpen } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 800);
const MAX_TEXT_CHARS = Number(process.env.MAX_TEXT_CHARS || 3000);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 600);

function parseLine(line) {
	const cells = [];
	let cur = '';
	let inq = false;
	for (let j = 0; j < line.length; j++) {
		const ch = line[j];
		if (ch === '"') {
			if (inq && line[j+1] === '"') { cur += '"'; j++; }
			else { inq = !inq; }
		} else if (ch === ',' && !inq) { cells.push(cur); cur = ''; }
		else { cur += ch; }
	}
	cells.push(cur);
	return cells;
}

function parseCSV(text) {
	const lines = text.split(/\r?\n/).filter(Boolean);
	if (!lines.length) return [];
	const header = parseLine(lines[0]).map(h => h.trim().toLowerCase());
	const urlIdx = Math.max(0, header.indexOf('url'));
	const titleIdx = header.indexOf('title') !== -1 ? header.indexOf('title') : (header.indexOf('headline') !== -1 ? header.indexOf('headline') : 1);
	// Prefer `text`, but if not present, use `summary` (from previously scored CSVs)
	const textIdx = header.indexOf('text') !== -1 ? header.indexOf('text') : (header.indexOf('summary') !== -1 ? header.indexOf('summary') : 2);
	const out = [];
	for (let i = 1; i < lines.length; i++) {
		const cells = parseLine(lines[i]);
		const url = cells[urlIdx] ?? '';
		const title = cells[titleIdx] ?? '';
		const textCell = cells[textIdx] ?? '';
		out.push({ url, title, text: textCell });
	}
	return out;
}

function buildMarketPrompt(text) {
	// Avoid slicing off the first two characters; trim and cap length instead
	const clipped = String(text || '').trim().slice(0, MAX_TEXT_CHARS);
	return `Rate the overall stock market mood expressed by the following text. Also extract any specific stock tickers mentioned and, for each, assign a score (-1..1) and a short explanation. Return STRICT JSON ONLY with keys: label (VeryBearish|Bearish|Neutral|Bullish|VeryBullish), score (-1..1), summary (1-2 sentences), tickers (object mapping TICKER-> { score, explanation }). Use double quotes for all keys and strings. If no tickers, return an empty object for tickers. Return exactly one JSON object and nothing else.\n\nTEXT:\n${clipped}`;
}

function safeParseJson(s) {
	try { return JSON.parse(s); } catch { return null; }
}

function cleanJsonString(raw) {
	if (!raw) return '';
	let s = String(raw).trim();
	// strip common code fences
	s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
	// replace smart quotes
	s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
	return s;
}

function tryRepairs(s) {
	let t = s;
	// remove trailing commas before } or ]
	t = t.replace(/,(\s*[}\]])/g, '$1');
	// if it looks like single-quoted JSON, try converting to double quotes cautiously
	if (!t.includes('"') && t.includes("'")) {
		const maybe = t.replace(/'([^']*)'/g, '"$1"');
		return maybe;
	}
	return t;
}

function normalizeLabel(label) {
	if (!label) return null;
	const k = String(label).toLowerCase().replace(/\s+|_/g, '');
	const map = {
		'verybearish': 'VeryBearish',
		'bearish': 'Bearish',
		'negative': 'Bearish',
		'downbeat': 'Bearish',
		'neutral': 'Neutral',
		'mixed': 'Neutral',
		'balanced': 'Neutral',
		'bullish': 'Bullish',
		'positive': 'Bullish',
		'upbeat': 'Bullish',
		'slightlybullish': 'Bullish',
		'somewhatbullish': 'Bullish',
		'verybullish': 'VeryBullish',
		'verypositive': 'VeryBullish',
		'verynegative': 'VeryBearish'
	};
	return map[k] || null;
}

function normalizeTickerKey(k) {
	if (typeof k !== 'string') return null;
	const up = k.trim().toUpperCase();
	// basic guard: 1-6 alphanumerics, common for tickers
	if (!up || up.length > 6 || !/^[A-Z0-9]+$/.test(up)) return null;
	return up;
}

function parseScore(val) {
	if (typeof val === 'number') return val;
	if (typeof val === 'string') {
		let s = val.trim();
		const percent = s.endsWith('%');
		if (percent) s = s.slice(0, -1);
		const n = Number(s);
		if (Number.isNaN(n)) return undefined;
		if (percent) return Math.max(-1, Math.min(1, n / 100));
		// if provided as 0..100 or -100..0, scale
		if (n > 1 && n <= 100) return n / 100;
		if (n < -1 && n >= -100) return n / 100;
		return n;
	}
	return undefined;
}

function coerceSentimentShape(obj) {
	if (!obj || typeof obj !== 'object') return null;
	let labelNorm = normalizeLabel(obj.label);
	let scoreNum = parseScore(obj.score);
	let summaryStr = typeof obj.summary === 'string' ? obj.summary : (typeof obj.reason === 'string' ? obj.reason : (typeof obj.explanation === 'string' ? obj.explanation : undefined));
	let tickers = {};
	// accept object or array for tickers
	if (obj.tickers && typeof obj.tickers === 'object' && !Array.isArray(obj.tickers)) {
		for (const [rawKey, rawVal] of Object.entries(obj.tickers)) {
			const key = normalizeTickerKey(rawKey);
			if (!key) continue;
			if (rawVal == null) { tickers[key] = { score: 0, explanation: '' }; continue; }
			if (typeof rawVal === 'number' || typeof rawVal === 'string') {
				const tScore = parseScore(rawVal);
				if (tScore == null || Number.isNaN(tScore)) continue;
				tickers[key] = { score: tScore, explanation: '' };
				continue;
			}
			if (typeof rawVal === 'object') {
				const tScore = parseScore(rawVal.score);
				const explanation = typeof rawVal.explanation === 'string' ? rawVal.explanation : '';
				if (tScore == null || Number.isNaN(tScore)) continue;
				tickers[key] = { score: tScore, explanation };
			}
		}
	} else if (Array.isArray(obj.tickers)) {
		for (const entry of obj.tickers) {
			if (!entry || typeof entry !== 'object') continue;
			const key = normalizeTickerKey(entry.ticker || entry.symbol || entry.code);
			const tScore = parseScore(entry.score);
			const explanation = typeof entry.explanation === 'string' ? entry.explanation : '';
			if (key && tScore != null && !Number.isNaN(tScore)) {
				tickers[key] = { score: tScore, explanation };
			}
		}
	}
	// If label missing but score present, infer from score
	if (!labelNorm && typeof scoreNum === 'number' && !Number.isNaN(scoreNum)) {
		if (scoreNum <= -0.6) labelNorm = 'VeryBearish';
		else if (scoreNum < -0.2) labelNorm = 'Bearish';
		else if (scoreNum <= 0.2) labelNorm = 'Neutral';
		else if (scoreNum < 0.6) labelNorm = 'Bullish';
		else labelNorm = 'VeryBullish';
	}
	if (summaryStr == null) summaryStr = '';
	if (labelNorm == null || scoreNum == null || Number.isNaN(scoreNum)) return null;
	return { label: labelNorm, score: scoreNum, summary: summaryStr, tickers };
}

async function scoreMarket(text) {
	const prompt = buildMarketPrompt(text);
	if (process.env.DEBUG_PROMPT === "1") {
		console.log("\n--- PROMPT START ---\n" + prompt + "\n--- PROMPT END ---\n");
	}
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			const msg = await anthropic.messages.create({
				model: MODEL,
				max_tokens: MAX_TOKENS,
				system: "You are a function that returns strict JSON only. Output exactly one JSON object matching the requested schema. Do not include code fences or any extra text.",
				messages: [{ role: "user", content: prompt }]
			});
			// Anthropic returns an array of content blocks; take the first text block
			const block = msg.content?.find?.(b => b && b.type === 'text') || msg.content?.[0];
			const raw = block && block.type === 'text' ? block.text : (typeof block?.text === 'string' ? block.text : '');

			let cleaned = cleanJsonString(raw);
			let parsed = safeParseJson(cleaned);
			let result = coerceSentimentShape(parsed);

			// If parsing failed, try to salvage JSON substring then repairs
			if (!result) {
				const match = cleaned.match(/\{[\s\S]*\}/);
				if (match) {
					cleaned = match[0];
				}
				const repaired = tryRepairs(cleaned);
				parsed = safeParseJson(repaired);
				result = coerceSentimentShape(parsed);
			}

			if (result) return result;
			throw new Error("Model did not return valid JSON sentiment");
		} catch (e) {
			if (process.env.DEBUG_PROMPT === "1") {
				console.error("RAW MODEL OUTPUT (cleaned):", cleanJsonString(e?.raw || ''));
			}
			const msg = e?.error?.type || e?.message || String(e);
			if (msg.includes("rate_limit") || e?.status === 429) {
				const retryAfterMs = Number(e?.response?.headers?.get?.("retry-after")) * 1000 || (2000 * (attempt + 1));
				await sleep(retryAfterMs);
				continue;
			}
			return { label: "Error", score: 0, summary: msg, tickers: {} };
		}
	}
	return { label: "Error", score: 0, summary: "rate limit retries exhausted", tickers: {} };
}

function csvRow(cells) {
	return cells.map(v => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",");
}

async function main() {
	if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
	// Default to repo CSVs; allow overriding via argv
	const inCsv = process.argv[2] || "/Users/nhathan/Desktop/hackmit/py_news.csv";
	const outCsv = process.argv[3] || "/Users/nhathan/Desktop/hackmit/market_sentiment.csv";
	const extraTextsPath = process.argv[4];
	const csv = await fs.readFile(inCsv, "utf8");
	const rows = parseCSV(csv);
	let extraRows = [];
	if (extraTextsPath) {
		try {
			const body = await fs.readFile(extraTextsPath, "utf8");
			extraRows = body.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(t => ({ url: "", title: "", text: t }));
		} catch (_) {}
	}
	const allRows = [...extraRows, ...rows];

	const fh = await fsOpen(outCsv, 'w');
	await fh.writeFile(csvRow(["url","title","label","score","summary","tickers"]) + "\n");

	let processed = 0;
	for (const row of allRows) {
		try {
			const r = await scoreMarket(row.text || "");
			const line = csvRow([row.url, row.title, r.label, r.score, r.summary, JSON.stringify(r.tickers || {})]) + "\n";
			await fh.writeFile(line);
			processed++;
			console.log(`${processed}/${allRows.length} ${r.label} ${typeof r.score === 'number' ? r.score.toFixed(2) : ''} :: ${row.title || row.url}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			const line = csvRow([row.url, row.title, "Error", "", msg, "{}"]) + "\n";
			await fh.writeFile(line);
			processed++;
			console.log(`${processed}/${allRows.length} Error :: ${row.title || row.url} :: ${msg}`);
		}
		await sleep(REQUEST_DELAY_MS);
	}
	await fh.close();
	console.log(`Wrote ${processed} rows to ${outCsv}`);
}

main().catch(e => { console.error(e); process.exit(1); });
