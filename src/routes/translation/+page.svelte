<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Checkbox,
		Textarea,
		Button,
		Heading,
		Alert,
		Label,
		Card,
		P,
		Spinner,
		Input,
		Toggle
	} from 'flowbite-svelte';

	import Presets from '$lib/components/Presets.svelte';
	import { translate, type TranslationResult } from '$lib/translation/translator';
	import type { WordDefinition, Config } from '$lib/translation/types';
	import WordTable from '$lib/translation/WordTable.svelte';

	type RequestData = {
		srcLang: string;
		destLang: string;
		defs: WordDefinition[];
		enableDefs: boolean;
		properties: Config;
		prompt: string;
	};
	const initialRequestData: RequestData = {
		srcLang: '',
		destLang: '',
		defs: [
			{
				category: '当社名',
				src: 'サンプル株式会社',
				dest: 'Example Inc.'
			},
			{
				category: 'ユーザーの職業',
				src: 'Webエンジニア',
				dest: 'SE(Web)'
			}
		],
		enableDefs: false,
		properties: {},
		prompt: 'Translate in 3 nuances: direct, polite, businesslike'
	};

	let requestData: RequestData = {
		srcLang: '',
		destLang: '',
		defs: [],
		enableDefs: false,
		properties: { dateOrder: 'YMD', dateSeparator: '-', timeSeparator: ':' },
		prompt: ''
	};
	let processedRequestData: RequestData = initialRequestData;
	let sourceText = 'XXXのinputを空欄にするとエラーが出るため修正してください';

	let result: TranslationResult = {
		translated: {
			summary: 'ここに翻訳観点の要点が示され、この下に翻訳結果が出力されます。',
			data: []
		},
		price: 0
	};

	let streaming = false;
	let processing = false;
	let error = '';

	async function generate() {
		if (processing) return;
		processing = true;
		error = '';
		try {
			result = { translated: { summary: '', data: [] }, price: 0 };
			const newResult = await translate(
				requestData.enableDefs ? requestData.defs : [],
				requestData.prompt,
				sourceText,
				requestData.srcLang,
				requestData.destLang || 'English',
				// ストリーミングはMSWのmockなし
				streaming ? (table) => (result.translated = table) : undefined
			);
			if (!newResult) {
				processing = false;
				error = 'AIの推論処理に失敗しました。APIキーなど設定を確認ください。';
				return;
			}
			processedRequestData = JSON.parse(JSON.stringify(requestData));
			result = newResult;
		} catch (e: unknown) {
			error = (e as Error).toString();
		} finally {
			processing = false;
		}
	}

	onMount(() => {
		if (!window.__msw) streaming = true;
	});
</script>

<div class="container m-auto flex max-w-5xl flex-col gap-8 py-6">
	<Heading tag="h2" class="print:text-gray-800">カスタム翻訳AI</Heading>
	<Card size="xl" class="gap-4 print:border-gray-300 print:bg-white">
		<Presets
			storageKey="TranslationPreset-v2"
			bind:data={requestData}
			initPresetData={initialRequestData}
			initPresetName="デフォルト"
		/>
		<form on:submit|preventDefault={generate} class="flex flex-col gap-4 print:hidden">
			<Label>翻訳元と翻訳先の言語</Label>
			<div class="flex flex-row items-center gap-4">
				<Input type="text" placeholder="Any" bind:value={requestData.srcLang} list="languages" />
				<div class="text-md">➡</div>
				<Input
					type="text"
					placeholder="English"
					bind:value={requestData.destLang}
					list="languages"
				/>
			</div>
			<datalist id="languages">
				<option value="Japanese">日本語</option>
				<option value="English">英語</option>
				<option value="BritishEnglish">イギリス英語</option>
				<option value="SimplifiedChinese">中国語（簡体字、主に中国本土やシンガポール）</option>
				<option value="TraditionalChinese">中国語（繁体字、主に香港や台湾）</option>
				<option value="Hindi">ヒンディー語（主にインドとフィジー）</option>
				<option value="Spanish">スペイン語（主にスペインと中南米）</option>
				<option value="French">フランス語（主に欧州、他にカナダやコンゴ共和国）</option>
				<option value="Arabic">アラビア語（主に中東、他に北アフリカの一部）</option>
				<option value="Vietnamese">ベトナム語</option>
				<option value="BahasaMelayu">マレー語・インドネシア語</option>
			</datalist>

			<div class="flex flex-row items-center justify-between">
				<Label>ドメイン用語やコンテキストの定義（任意）</Label>
				<Toggle bind:checked={requestData.enableDefs}>有効化</Toggle>
			</div>
			<WordTable
				bind:data={requestData.defs}
				bind:properties={requestData.properties}
				bind:enable={requestData.enableDefs}
			/>

			<Label for="instruction">翻訳指示文（任意）</Label>
			<Textarea bind:value={requestData.prompt} id="instruction" />
			<hr class="border-gray-700" />
			<Label for="sourceText">原文（プリセット対象外）</Label>
			<Textarea bind:value={sourceText} id="sourceText" rows={4}>
				<div slot="footer" class="flex items-center justify-between">
					<div class="flex flex-row items-center gap-4">
						<Button type="submit" disabled={processing}>翻訳</Button>
						{#if result.price > 0}
							<P size="sm" italic>Charged ${result.price.toFixed(4)}</P>
						{/if}
					</div>
					<P size="sm">※項目数により、多くの場合は1件あたり1秒以上かかります。</P>
				</div>
			</Textarea>
			<Checkbox bind:checked={streaming}>翻訳結果をストリーミング表示する</Checkbox>
			{#if error}
				<Alert>{error}</Alert>
			{/if}
		</form>
		<div class="hidden flex-col gap-6 print:flex">
			<div class="flex flex-col gap-4">
				<Heading tag="h5" color="text-neutral-700">翻訳指示文とテキスト</Heading>
				<P color="text-black">{requestData.prompt}</P>
			</div>
		</div>
	</Card>

	<Heading tag="h3" class="break-after-avoid-page print:text-gray-800">出力結果</Heading>
	<Card size="xl" class="break-inside-avoid-page gap-4 print:border-gray-300 print:bg-white">
		<P class="print:text-black">
			<div class="font-bold">翻訳要点：</div>
			{#each (result.translated?.summary ?? '出力結果がありません').split('\n') as line}
				{line}<br />
			{/each}
		</P>
		{#each result.translated?.data ?? [] as pattern, i}
			<P
				class="overflow-hidden rounded border border-gray-300 bg-gray-50 dark:bg-gray-900 print:border-gray-300 print:bg-white print:text-black"
			>
				<div class="w-32 rounded-br bg-gray-700 p-1 text-center text-xs text-gray-300">
					TRANSLATION #{i + 1}
				</div>
				<div class="px-2 py-4 text-blue-900 dark:text-blue-200">
					{#each pattern.translated.split('\n') as line}
						{line}<br />
					{/each}
				</div>
				<hr class="border-gray-700 dark:border-gray-700" />
				{#if pattern.nuance}
					<hr class="border-gray-700 dark:border-gray-700" />
					<div class="p-2 text-xs text-gray-800 dark:text-gray-300">
						{#each pattern.nuance.split('\n') as line}
							{line}<br />
						{/each}
					</div>
				{/if}
			</P>
		{/each}
		{#if processing}
			<Alert color="yellow">
				<Spinner />
				データを生成中です。しばらくお待ちください..
			</Alert>
		{/if}
	</Card>
</div>
