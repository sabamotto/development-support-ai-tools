import { JSONParser } from '@streamparser/json';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
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
	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: sysPrompt },
		{ role: 'user', content: sourceText }
	];
	const response_format = zodResponseFormat(zTranslateData, 'translated');

	if (onStream) {
		const stream = await client.chat.completions.stream({
			...commonParams,
			messages,
			response_format,
			stream: true,
			stream_options: { include_usage: true }
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
		for await (const chunk of stream) {
			jsonParser.write(chunk.choices[0]?.delta.content ?? '');
		}
		const completion = await stream.finalChatCompletion();
		return {
			price: calculatePromptCost(completion.usage),
			translated: completion.choices[0].message.parsed
		};
	} else {
		const completion = await client.chat.completions.parse({
			...commonParams,
			messages,
			response_format
		});
		return {
			price: calculatePromptCost(completion.usage),
			translated: completion.choices[0].message.parsed
		};
	}
}
