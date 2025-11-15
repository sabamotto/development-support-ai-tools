import { JSONParser } from '@streamparser/json';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import z from 'zod';

import { calculatePromptCost, client, commonParams } from '$lib/gpt';

const zRequestDefinitionType = z.enum(['functional', 'non-functional', 'note', 'example-code']);
const zRequestDefinitionItem = z.object({
	type: zRequestDefinitionType,
	en: z.string({ description: 'in english' }),
	ja: z.string({ description: 'in japanese' })
});
const zRequestDefinition = z.object({
	category: z.string(),
	items: z.array(zRequestDefinitionItem)
});
const zTranslatedRequestDefinitions = z.object({
	summary: z.string({ description: 'Summarize requirements analysis in japanese' }),
	requirementDefinitions: z.array(zRequestDefinition)
});
export type RequestDefinitionItem = z.infer<typeof zRequestDefinitionItem>;
export type RequestDefinition = z.infer<typeof zRequestDefinition>;
export type TranslatedRequestDefinitions = z.infer<typeof zTranslatedRequestDefinitions>;
export type TranslateResults = {
	definitions: null | TranslatedRequestDefinitions;
	price: number;
};

export async function translateRequirementsToDefinitions(
	systemDesc: string,
	request: string,
	onStream?: (result: TranslatedRequestDefinitions) => void
): Promise<TranslateResults> {
	const messages: ChatCompletionMessageParam[] = [
		{
			role: 'system',
			content: `以下システムに対して、要求に基づき要件定義してください。\nシステムの解説:\n${systemDesc}`
		},
		{ role: 'user', content: request }
	];
	const response_format = zodResponseFormat(zTranslatedRequestDefinitions, 'definitions');
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
		let partialData: TranslatedRequestDefinitions = { summary: '', requirementDefinitions: [] };
		jsonParser.onValue = (p) => {
			const { key, parent, value } = p;
			if (key === 'summary') {
				partialData = parent as TranslatedRequestDefinitions;
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
			definitions: completion.choices[0].message.parsed
		};
	} else {
		const completion = await client.chat.completions.parse({
			...commonParams,
			messages,
			response_format
		});
		return {
			price: calculatePromptCost(completion.usage),
			definitions: completion.choices[0].message.parsed
		};
	}
}
