import { JSONParser } from '@streamparser/json';
import { zodTextFormat } from 'openai/helpers/zod.mjs';
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
	const input = [
		{
			role: 'system' as const,
			content: `Please generate mock data based on requirements.`
		},
		{ role: 'user' as const, content: request }
	];
	const textFormat = zodTextFormat(zQueryTableData, 'table');
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
		let partialData: TableData = { data: [], summary: '' };
		jsonParser.onValue = (p) => {
			const { key, parent, value } = p;
			if (key === 'summary') {
				partialData = parent as TableData;
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
			table: response.output_parsed
		};
	} else {
		const response = await client.responses.parse({
			...commonParams,
			input,
			text: { format: textFormat }
		});
		return {
			price: calculatePromptCost(response.usage as any),
			table: response.output_parsed
		};
	}
}
