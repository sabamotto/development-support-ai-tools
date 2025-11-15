import { JSONParser } from '@streamparser/json';
import { zodTextFormat } from 'openai/helpers/zod.mjs';
import z from 'zod';

import { calculatePromptCost, client, commonParams } from '$lib/gpt';

import type { WordDefinition } from './types';

const zTranslatePattern = z.object({
	translated: z.string({ description: 'Translated text' }),
	nuance: z.string({
		description: 'Explanation in Japanese of the nuances of sentences'
	})
});
const zTranslateData = z.object({
	summary: z.string({ description: 'Summarize in Japanese the main points of the translation.' }),
	data: z.array(zTranslatePattern)
});

export type TranslationPattern = z.infer<typeof zTranslatePattern>;
export type TranslationData = z.infer<typeof zTranslateData>;
export type TranslationResult = {
	price: number;
	translated: null | TranslationData;
};

export async function translate(
	wordDefinitions: WordDefinition[],
	instruction: string,
	sourceText: string,
	sourceLang: string,
	destinationLang: string,
	onStream?: (result: TranslationData) => void
): Promise<TranslationResult> {
	const fromAndInto = (sourceLang ? `from ${sourceLang} ` : '') + `into ${destinationLang}`;
	const sysPrompt =
		'You are a professional translator. ' +
		(wordDefinitions.length > 0
			? 'Below is a list of TSV format terms to consider for translation:\n\n' +
				`Category\t${sourceLang ? sourceLang : 'Name'}\t${destinationLang}\n` +
				wordDefinitions.map((w) => `${w.category}\t${w.src}\t${w.dest}`).join('\n') +
				'\n\n'
			: '') +
		(instruction
			? `Please follow the instructions below to translate user message ${fromAndInto}:\n${instruction}`
			: `Please translate the user message ${fromAndInto}.`);
	const input = [
		{ role: 'system' as const, content: sysPrompt },
		{ role: 'user' as const, content: sourceText }
	];
	const textFormat = zodTextFormat(zTranslateData, 'translated');

	if (onStream) {
		const stream = await client.responses.stream({
			...commonParams,
			input,
			text: { format: textFormat }
		});
		const jsonParser = new JSONParser({
			emitPartialTokens: true,
			emitPartialValues: true,
			paths: ['$.summary', '$.data.*']
		});
		let partialData: TranslationData = { data: [], summary: '' };
		jsonParser.onValue = (p) => {
			const { key, parent, value } = p;
			if (key === 'summary') {
				partialData = parent as TranslationData;
				partialData.summary = value as string;
			}
			onStream(partialData);
		};
		stream.on('response.output_text.delta', (event) => {
			jsonParser.write(event.delta);
		});
		const response = await stream.finalResponse();
		return {
			price: calculatePromptCost(response.usage as any),
			translated: response.output_parsed
		};
	} else {
		const response = await client.responses.parse({
			...commonParams,
			input,
			text: { format: textFormat }
		});
		return {
			price: calculatePromptCost(response.usage as any),
			translated: response.output_parsed
		};
	}
}
