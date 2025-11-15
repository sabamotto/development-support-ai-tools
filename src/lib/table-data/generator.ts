import { JSONParser } from '@streamparser/json';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import z from 'zod';

import { calculatePromptCost, client, commonParams } from '$lib/gpt';

import { convert } from './convertToZod';
import type { ColumnDefinition, ColumnValue } from './types';

export type TableDataRow = { [key: string]: ColumnValue };
export type TableData = { summary: string; data: TableDataRow[] };
export type TableDataResult = {
	price: number;
	table: null | TableData;
};

export async function generateTableData(
	definitions: ColumnDefinition[],
	request: string,
	onStream?: (table: TableData) => void
): Promise<TableDataResult> {
	const zQueryTableData = z.object({
		summary: z.string({ description: 'Summarize data info in Japanese' }),
		data: z.array(convert(definitions))
	});
	if (onStream) {
		const stream = await client.chat.completions.stream({
			...commonParams,
			messages: [
				{
					role: 'system',
					content: `Please generate mock data based on requirements.`
				},
				{ role: 'user', content: request }
			],
			response_format: zodResponseFormat(zQueryTableData, 'table'),
			stream: true,
			stream_options: { include_usage: true }
		});
		const jsonParser = new JSONParser({
			emitPartialTokens: true,
			emitPartialValues: true,
			paths: ['$.summary', '$.data.*']
		});
		let partialData: TableData = { data: [], summary: '' };
		jsonParser.onValue = (p) => {
			const { key, parent, value } = p;
			if (key === 'summary') {
				partialData = parent as TableData;
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
			table: completion.choices[0].message.parsed
		};
	} else {
		const completion = await client.chat.completions.parse({
			...commonParams,
			messages: [
				{
					content: `Please generate mock data based on requirements.`,
					role: 'system'
				},
				{ content: request, role: 'user' }
			],
			response_format: zodResponseFormat(zQueryTableData, 'table')
		});
		return {
			price: calculatePromptCost(completion.usage),
			table: completion.choices[0].message.parsed
		};
	}
}
