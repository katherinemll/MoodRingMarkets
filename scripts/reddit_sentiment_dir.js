#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 800);
const MAX_TEXT_CHARS = Number(process.env.MAX_TEXT_CHARS || 20000);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 600);

function csvRow(cells) {
	return cells.map(v => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",");
}

async function listFilesRecursive(rootDir) {
	const out = [];
	async function walk(dir) {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch (_) { return; }
		for (const entry of entries) {
			const p = path.join(dir, entry.name);
			if (entry.isDirectory()) await walk(p);
			else if (entry.isFile()) out.push(p);
		}
	}
	await walk(rootDir);
	return out;
}

function buildMarketPrompt(text) {
	const clipped = String(text || '').trim().slice(0, MAX_TEXT_CHARS);
	return `Rate the overall stock market mood expressed by the following text. Also extract any specific stock tickers mentioned and, for each, assign a score (-1..1) and a short explanation. Return STRICT JSON ONLY with keys: label (VeryBearish|Bearish|Neutral|Bullish|VeryBullish), score (-1..1), summary (1-2 sentences), tickers (object mapping TICKER-> { score, explanation }). Use double quotes for all keys and strings. If no tickers, return an empty object for tickers. Return exactly one JSON object and nothing else.\n\nTEXT:\n${clipped}`;
}

function safeParseJson(s) {
	try { return JSON.parse(s); } catch { return null; }
}

function cleanJsonString(raw) {
	if (!raw) return '';
	let s = String(raw).trim();
	s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
	s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
	return s;
}

function tryRepairs(s) {
	let t = s;
	t = t.replace(/,(\s*[}\]])/g, '$1');
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

function parseScore(val) {
	if (typeof val === 'number') return val;
	if (typeof val === 'string') {
		let s = val.trim();
		const percent = s.endsWith('%');
		if (percent) s = s.slice(0, -1);
		const n = Number(s);
		if (Number.isNaN(n)) return undefined;
		if (percent) return Math.max(-1, Math.min(1, n / 100));
		if (n > 1 && n <= 100) return n / 100;
		if (n < -1 && n >= -100) return n / 100;
		return n;
	}
	return undefined;
}

function normalizeTickerKey(k) {
	if (typeof k !== 'string') return null;
	const up = k.trim().toUpperCase();
	if (!up || up.length > 6 || !/^[A-Z0-9]+$/.test(up)) return null;
	return up;
}

function coerceSentimentShape(obj) {
	if (!obj || typeof obj !== 'object') return null;
	let labelNorm = normalizeLabel(obj.label);
	let scoreNum = parseScore(obj.score);
	let summaryStr = typeof obj.summary === 'string' ? obj.summary : (typeof obj.reason === 'string' ? obj.reason : (typeof obj.explanation === 'string' ? obj.explanation : undefined));
	let tickers = {};
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
			let msg;
			try {
				msg = await anthropic.messages.create({
					model: MODEL,
					max_tokens: MAX_TOKENS,
					system: "You are a function that returns strict JSON only. Output exactly one JSON object matching the requested schema. Do not include code fences or any extra text.",
					response_format: { type: "json" },
					messages: [{ role: "user", content: prompt }]
				});
			} catch (compatErr) {
				const t = compatErr?.error?.type || compatErr?.name || '';
				const d = compatErr?.error?.message || compatErr?.message || '';
				const maybeIncompatible = String(t).includes('invalid') || String(d).toLowerCase().includes('response_format');
				if (maybeIncompatible) {
					msg = await anthropic.messages.create({
						model: MODEL,
						max_tokens: MAX_TOKENS,
						system: "You are a function that returns strict JSON only. Output exactly one JSON object matching the requested schema. Do not include code fences or any extra text.",
						messages: [{ role: "user", content: prompt }]
					});
				} else {
					throw compatErr;
				}
			}
			const block = msg.content?.find?.(b => b && b.type === 'text') || msg.content?.[0];
			const raw = block && block.type === 'text' ? block.text : (typeof block?.text === 'string' ? block.text : '');

			let cleaned = cleanJsonString(raw);
			let parsed = safeParseJson(cleaned);
			let result = coerceSentimentShape(parsed);

			if (!result) {
				const match = cleaned.match(/\{[\s\S]*\}/);
				if (match) cleaned = match[0];
				const repaired = tryRepairs(cleaned);
				parsed = safeParseJson(repaired);
				result = coerceSentimentShape(parsed);
			}

			if (result) return result;
			if (process.env.DEBUG_PROMPT === "1") {
				console.error("MODEL RAW (cleaned):", cleaned);
			}
			throw new Error("Model did not return valid JSON sentiment");
		} catch (e) {
			const type = e?.error?.type || e?.name || '';
			const detail = e?.error?.message || e?.message || String(e);
			const combined = [type, detail].filter(Boolean).join(': ');
			if (String(combined).includes("rate_limit") || e?.status === 429) {
				const retryAfterMs = Number(e?.response?.headers?.get?.("retry-after")) * 1000 || (2000 * (attempt + 1));
				await sleep(retryAfterMs);
				continue;
			}
			return { label: "Error", score: 0, summary: combined || "unknown error", tickers: {} };
		}
	}
	return { label: "Error", score: 0, summary: "rate limit retries exhausted", tickers: {} };
}

async function main() {
	if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
	const inDir = process.argv[2] || "/Users/nhathan/Desktop/hackmit/Reddit_Scrape";
	const outCsv = process.argv[3] || "/Users/nhathan/Desktop/hackmit/reddit_sentiment.csv";

	const files = await listFilesRecursive(inDir);
	const fh = await fs.open(outCsv, 'w');
	await fh.writeFile(csvRow(["path","file","label","score","summary","tickers"]) + "\n");

	let processed = 0;
	for (const filePath of files) {
		try {
			let body = '';
			try {
				body = await fs.readFile(filePath, 'utf8');
			} catch (e) {
				await fh.writeFile(csvRow([filePath, path.basename(filePath), "Error", "", `read error: ${e instanceof Error ? e.message : String(e)}`, "{}"]) + "\n");
				processed++;
				console.log(`${processed}/${files.length} Error read :: ${filePath}`);
				await sleep(REQUEST_DELAY_MS);
				continue;
			}
			const r = await scoreMarket(body || "");
			const line = csvRow([filePath, path.basename(filePath), r.label, r.score, r.summary, JSON.stringify(r.tickers || {})]) + "\n";
			await fh.writeFile(line);
			processed++;
			console.log(`${processed}/${files.length} ${r.label} ${typeof r.score === 'number' ? r.score.toFixed(2) : ''} :: ${filePath}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			const line = csvRow([filePath, path.basename(filePath), "Error", "", msg, "{}"]) + "\n";
			await fh.writeFile(line);
			processed++;
			console.log(`${processed}/${files.length} Error :: ${filePath} :: ${msg}`);
		}
		await sleep(REQUEST_DELAY_MS);
	}
	await fh.close();
	console.log(`Wrote ${processed} rows to ${outCsv}`);
}

main().catch(e => { console.error(e); process.exit(1); });
